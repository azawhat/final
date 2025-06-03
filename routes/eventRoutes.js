const express = require("express");
const Event = require("../models/Event");
const mongoose = require("mongoose");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");
const NotificationService = require("../services/notificationService");
const router = express.Router();

// Get all events
router.get("/", async (req, res) => {
  try {
    const events = await Event.find();
    res.status(200).json(events);
  } catch (error) {
    console.error("Error fetching events:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:eventId/attendances", async (req, res) => {
  try {
    const { eventId } = req.params;
    
    // Validate eventId
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ error: "Invalid eventId." });
    }

    // Check if event exists and get attendances
    const event = await Event.findById(eventId).select('attendance name startDate location');
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Get attendances from the event's attendance field
    const attendances = event.attendance || [];

    res.status(200).json({
      eventId: eventId,
      eventName: event.name,
      eventLocation: event.location,
      eventStartDate: event.startDate,
      totalAttendances: attendances.length,
      attendances: attendances.map(attendance => ({
        userId: attendance._id,
        name: attendance.name,
        surname: attendance.surname,
        username: attendance.username,
        checkedInAt: attendance.checkedInAt
      }))
    });

  } catch (error) {
    console.error("Error fetching event attendances:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/create", authMiddleware, async (req, res) => {
  try {
    const creatorId = req.user._id;
    const {
      name,
      description,
      category,
      eventTags,
      eventPicture,
      eventPosts,
      eventProgramme,
      isOpen,
      eventRating,
      location,
      maxParticipants,
      startDate
    } = req.body;

    // Validate required fields
    if (!name || !description || !location || !startDate) {
      return res.status(400).json({ message: "Required fields missing" });
    }

    // Parse dates
    const parsedStartDate = new Date(startDate);

    if (isNaN(parsedStartDate.getTime())) {
      return res.status(400).json({ message: "Invalid startDate format", receivedValue: startDate });
    }
    const user = await User.findById(creatorId);
    if (!user) return res.status(404).json({ message: "Creator not found" });

    // Create new event
    const event = new Event({
      name,
      description,
      category,
      eventTags,
      eventPicture,
      eventPosts,     
      eventProgramme,
      isOpen: isOpen !== undefined ? isOpen : true,
      eventRating,
      location,
      maxParticipants,
      startDate: parsedStartDate,
      participants: [],
      creator: {
        _id: user._id,
        name: user.name,
        surname: user.surname,
        username: user.username,
      }
    });

    await event.save();

    // Schedule event reminder notifications
    await NotificationService.scheduleEventReminders(event);

    res.status(201).json(event);
  } catch (error) {
    console.error("Error creating event:", error);
    res.status(400).json({ error: error.message });
  }
});

// Join event
router.post("/join/:eventId", authMiddleware, async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ error: "Invalid eventId" });
    }

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Check if user is already a participant
    if (event.participants.includes(userId)) {
      return res.status(400).json({ message: "Already joined this event" });
    }

    // Check if event has reached max participants
    if (event.maxParticipants && event.participants.length >= event.maxParticipants) {
      return res.status(400).json({ message: "Event has reached maximum participants" });
    }

    // Add user to participants
    event.participants.push(userId);
    await event.save();

    // Send notification to event creator
    const notification = {
      title: "New Event Participant",
      body: `${req.user.name} ${req.user.surname} joined your event "${event.name}"`
    };

    const data = {
      type: 'event_join',
      eventId: eventId,
      eventName: event.name,
      participantId: userId
    };

    await NotificationService.addNotificationJob('send-notification', {
      userId: event.creator._id.toString(),
      notification,
      data
    });

    res.json({ 
      success: true, 
      message: "Successfully joined the event" 
    });
  } catch (error) {
    console.error("Error joining event:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Leave event
router.post("/leave/:eventId", authMiddleware, async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ error: "Invalid eventId" });
    }

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Check if user is a participant
    if (!event.participants.includes(userId)) {
      return res.status(400).json({ message: "Not a participant of this event" });
    }

    // Remove user from participants
    event.participants = event.participants.filter(id => id.toString() !== userId);
    await event.save();

    res.json({ 
      success: true, 
      message: "Successfully left the event" 
    });
  } catch (error) {
    console.error("Error leaving event:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update event
router.put("/update/:eventId", authMiddleware, async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.id;
    const updates = req.body;

    // Check if event exists and get current event data
    const existingEvent = await Event.findById(eventId);
    if (!existingEvent) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Check if user is the creator of the event
    if (!existingEvent.creator || !existingEvent.creator._id) {
      return res.status(500).json({ message: "Event creator information missing" });
    }
    
    if (existingEvent.creator._id.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Only the event creator can update this event" });
    }

    // Remove fields that shouldn't be updated directly
    delete updates._id;
    delete updates.__v;
    delete updates.creator;
    delete updates.createdAt;
    delete updates.updatedAt;

    // Validate required fields if they exist in updates
    if (updates.hasOwnProperty('name') && !updates.name) {
      return res.status(400).json({ message: "Name is required" });
    }
    if (updates.hasOwnProperty('description') && !updates.description) {
      return res.status(400).json({ message: "Description is required" });
    }
    if (updates.hasOwnProperty('location') && !updates.location) {
      return res.status(400).json({ message: "Location is required" });
    }
    if (updates.hasOwnProperty('startDate') && !updates.startDate) {
      return res.status(400).json({ message: "Start date is required" });
    }

    // Parse and validate dates if they exist in updates
    if (updates.startDate) {
      const parsedStartDate = new Date(updates.startDate);
      if (isNaN(parsedStartDate.getTime())) {
        return res.status(400).json({ 
          message: "Invalid startDate format", 
          receivedValue: updates.startDate 
        });
      }
      updates.startDate = parsedStartDate;
    }
    // Set default value for isOpen if provided but undefined
    if (updates.hasOwnProperty('isOpen') && updates.isOpen === undefined) {
      updates.isOpen = true;
    }

    // Update the event with all provided fields
    const updatedEvent = await Event.findByIdAndUpdate(
      eventId,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!updatedEvent) {
      return res.status(404).json({ message: "Event not found" });
    }

    // If startDate was updated, reschedule reminders
    if (updates.startDate) {
      await NotificationService.cancelEventReminders(eventId);
      await NotificationService.scheduleEventReminders(updatedEvent);
    }

    // Send update notification to participants
    await NotificationService.addNotificationJob('send-event-update', {
      event: updatedEvent,
      updateType: 'updated'
    });

    res.json(updatedEvent);
  } catch (error) {
    console.error("Error updating event:", error);
    
    if (error.name === "ValidationError") {
      return res.status(400).json({ message: error.message });
    }
    
    res.status(500).json({ message: "Server error" });
  }
});

// Get specific event
router.get("/:eventId", async (req, res) => {
  try {
    const { eventId } = req.params;
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }
    res.json(event);
  } catch (error) {
    console.error("Error fetching event:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Delete event for the creator
router.delete("/delete-event/:eventId/:userId", async (req, res) => {
  const { eventId, userId } = req.params;
  try {
    if (!mongoose.Types.ObjectId.isValid(eventId) || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Invalid eventId or userId." });
    }
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ error: "Event not found." });
    }
    // Check if the requesting user is the creator of the event
    if (event.creator._id.toString() !== userId) {
      return res.status(403).json({ error: "Unauthorized: Only the creator can delete this event." });
    }

    // Cancel all scheduled reminders for this event
    await NotificationService.cancelEventReminders(eventId);

    // Send cancellation notification to participants
    if (event.participants.length > 0) {
      await NotificationService.addNotificationJob('send-event-update', {
        event: event,
        updateType: 'cancelled'
      });
    }

    await User.updateMany({}, { $pull: { registeredEvents: eventId } });
    await Event.findByIdAndDelete(eventId);
    
    res.json({ message: "Event deleted successfully." });
  } catch (error) {
    console.error("Error deleting event:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

module.exports = router;