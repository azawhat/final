const express = require("express");
const Event = require("../models/Event");
const mongoose = require("mongoose");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");
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

// Complete fixed event creation route handler
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
      participantId,
      maxParticipants,
      startDate,
      endDate
    } = req.body;

    // Validate required fields
    if (!name || !description || !location || !startDate) {
      return res.status(400).json({ message: "Required fields missing" });
    }

    // Parse dates
    const parsedStartDate = new Date(startDate);
    const parsedEndDate = endDate ? new Date(endDate) : undefined;

    if (isNaN(parsedStartDate.getTime())) {
      return res.status(400).json({ message: "Invalid startDate format", receivedValue: startDate });
    }

    if (endDate && isNaN(parsedEndDate.getTime())) {
      return res.status(400).json({ message: "Invalid endDate format", receivedValue: endDate });
    }

    // Find creator
    const user = await User.findById(creatorId);
    if (!user) return res.status(404).json({ message: "Creator not found" });

    // Handle participants
    let participants = [];
    if (Array.isArray(participantId)) {
      participants = await User.find({ _id: { $in: participantId } });
    } else if (participantId) {
      const participant = await User.findById(participantId);
      if (participant) participants.push(participant);
    }

    const participantData = participants.map(p => ({
      _id: p._id,
      name: p.name,
      surname: p.surname,
      username: p.username,
    }));

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
      endDate: parsedEndDate,
      participants: participantData,
      creator: {
        _id: user._id,
        name: user.name,
        surname: user.surname,
        username: user.username,
      }
    });

    await event.save();
    res.status(201).json(event);
  } catch (error) {
    console.error("Error creating event:", error);
    res.status(400).json({ error: error.message });
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

    if (updates.endDate) {
      const parsedEndDate = new Date(updates.endDate);
      if (isNaN(parsedEndDate.getTime())) {
        return res.status(400).json({ 
          message: "Invalid endDate format", 
          receivedValue: updates.endDate 
        });
      }
      updates.endDate = parsedEndDate;
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
    await User.updateMany({}, { $pull: { registeredEvents: eventId } });
    await Event.findByIdAndDelete(eventId);
    res.json({ message: "Event deleted successfully." });
  } catch (error) {
    console.error("Error deleting event:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});



module.exports = router;