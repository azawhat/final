const express = require("express");
const Event = require("../models/Event");
const mongoose = require("mongoose");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");
const NotificationService = require("../services/notificationService");
const router = express.Router();
const EventExpirationService = require('../services/eventExpirationService');
const { spawn } = require('child_process');
const path = require('path');

router.get("/", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Invalid userId" });
    }

    const pythonProcess = spawn('python', [
      path.join(__dirname, '../recommendation_api.py'),
      userId
    ]);

    let output = '';
    let errorOutput = '';

    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
      console.error(`Python stderr: ${data}`);
    });

    pythonProcess.on('close', async (code) => {
      if (code !== 0) {
        console.error(`Python script failed with code ${code}`);
        try {
          const fallbackEvents = await Event.find({ isActive: true });
          return res.status(200).json(fallbackEvents);
        } catch (fallbackError) {
          console.error("Fallback query failed:", fallbackError);
          return res.status(500).json({ 
            error: "Recommendation service error",
            details: errorOutput
          });
        }
      }
      
      try {
        const result = JSON.parse(output);
        
        if (result.error) {
          const fallbackEvents = await Event.find({ isActive: true });
          return res.status(200).json(fallbackEvents);
        }
        
        const recommendedEventIds = result.recommendations.map(rec => rec.event_id);
        
        if (recommendedEventIds.length === 0) {
          const fallbackEvents = await Event.find({ isActive: true });
          return res.status(200).json(fallbackEvents);
        }
        
        const recommendedEvents = await Event.find({
          _id: { $in: recommendedEventIds },
          isActive: true
        });
        
        const scoreMap = {};
        result.recommendations.forEach(rec => {
          scoreMap[rec.event_id] = {
            contentScore: rec.content_score || 0,
            collabScore: rec.collab_score || 0,
            hybridScore: rec.hybrid_score || rec.score || 0
          };
        });
        
        const eventsWithScores = recommendedEvents
          .map(event => {
            const scores = scoreMap[event._id.toString()] || {
              contentScore: 0,
              collabScore: 0,
              hybridScore: 0
            };
            return {
              ...event.toObject(),

              hybridScore: scores.hybridScore
            };
          })
          .sort((a, b) => b.hybridScore - a.hybridScore);
        
        res.status(200).json(eventsWithScores);
        
      } catch (e) {
        console.error("Error parsing recommendation output:", e);
        try {
          const fallbackEvents = await Event.find({ isActive: true });
          res.status(200).json(fallbackEvents);
        } catch (fallbackError) {
          console.error("Fallback query failed:", fallbackError);
          res.status(500).json({ 
            error: "Error processing recommendations",
            details: e.message
          });
        }
      }
    });

  } catch (error) {
    console.error("Recommendation endpoint error:", error);
    try {
      const fallbackEvents = await Event.find({ isActive: true });
      res.status(200).json(fallbackEvents);
    } catch (fallbackError) {
      console.error("Fallback query failed:", fallbackError);
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

router.get("/all", async (req, res) => {
  try {
    const events = await Event.find();
    res.status(200).json(events);
  } catch (error) {
    console.error("Error fetching events:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Переобучить модель (только для админов)

router.post("/create", authMiddleware, async (req, res) => {
  try {
    const creatorId = req.user._id;
    const {
      name,
      description,
      category,
      eventTags,
      eventPicture,
      isOpen,
      location,
      locationCoordinates,
      media,
      startDate
    } = req.body;

    // Validate required fields
    if (!name || !description || !location || !startDate) {
      return res.status(400).json({ message: "Required fields missing" });
    }
    
    const parsedStartDate = new Date(startDate);
    if (isNaN(parsedStartDate.getTime())) {
      return res.status(400).json({ message: "Invalid startDate format" });
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
      eventRating: user.rating || 5,
      isOpen: isOpen !== undefined ? isOpen : true,
      isActive: true, 
      location,
      locationCoordinates,
      startDate: startDate, 
      media,
      creator: {
        _id: user._id,
        name: user.name,
        surname: user.surname,
        username: user.username,
      }
    });

    await event.save();
    await onEventCreated(event);
    
    await NotificationService.scheduleEventReminders(event);
    await EventExpirationService.scheduleEventExpiration(event);

    // Trigger model retraining after successful event creation
    const pythonProcess = spawn('python', [
      path.join(__dirname, '../recommendation_api.py'),
      '--retrain'
    ]);

    let retrainOutput = '';
    let retrainError = '';

    pythonProcess.stdout.on('data', (data) => {
      retrainOutput += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      retrainError += data.toString();
      console.error(`Retrain stderr: ${data}`);
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`Model retraining failed with code ${code}`);
        console.error(`Retrain error: ${retrainError}`);
        // Note: We don't fail the event creation if retraining fails
      } else {
        console.log('Model retraining completed successfully');
        console.log(`Retrain output: ${retrainOutput}`);
      }
    });

    // Return the created event immediately, don't wait for retraining
    res.status(201).json(event);
    
  } catch (error) {
    console.error("Error creating event:", error);
    res.status(400).json({ error: error.message });
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
    const frontendUpdates = req.body;
    
    const existingEvent = await Event.findById(eventId);
    if (!existingEvent) {
      return res.status(404).json({ message: "Event not found" });
    }

    if (!existingEvent.creator || !existingEvent.creator._id) {
      return res.status(500).json({ message: "Event creator information missing" });
    }
    
    if (existingEvent.creator._id.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Only the event creator can update this event" });
    }

    const fieldMapping = {
      'newTitle': 'name',
      'newDescription': 'description', 
      'newLocation': 'location',
      'newPicture': 'eventPicture',
      'newCoordinates': 'locationCoordinates'
    };

    // Convert frontend field names to database field names
    const updates = {};
    const updatedFields = []; // Track which fields were updated for notifications
    
    for (const [frontendField, value] of Object.entries(frontendUpdates)) {
      const dbField = fieldMapping[frontendField] || frontendField;
      
      if (value !== null && value !== undefined && value !== '') {
        updates[dbField] = value;
        updatedFields.push(dbField);

      } else if (typeof value === 'boolean') {
        updates[dbField] = value;
        updatedFields.push(dbField);

      }
    }

    delete updates._id;
    delete updates.__v;
    delete updates.creator;
    delete updates.createdAt;
    delete updates.updatedAt;

    if (updates.hasOwnProperty('name') && !updates.name) {
      return res.status(400).json({ message: "Name is required" });
    }
    
    if (updates.hasOwnProperty('description') && !updates.description) {
      return res.status(400).json({ message: "Description is required" });
    }
    
    if (updates.hasOwnProperty('location') && !updates.location) {
      return res.status(400).json({ message: "Location is required" });
    }


    const updatedEvent = await Event.findByIdAndUpdate(
      eventId,
      { $set: updates },
      { new: true, runValidators: true }
    ).populate('creator', 'name surname')
     .populate('participants', 'name surname');

    if (!updatedEvent) {
      return res.status(404).json({ message: "Event not found after update" });
    }

    console.log('Event updated successfully:', updatedEvent.name);

    res.status(200).json();

  } catch (error) {
    console.error(" Error updating event:", error);
    console.error("Stack trace:", error.stack);
    
    if (error.name === "ValidationError") {
      return res.status(400).json({ 
        message: "Validation error", 
        details: error.message 
      });
    }
    
    if (error.name === "CastError") {
      return res.status(400).json({ 
        message: "Invalid data format", 
        details: error.message 
      });
    }
    
    res.status(500).json({ 
      message: "Server error",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
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
    
    // Cancel expiration job for this event
    await EventExpirationService.cancelEventExpiration(eventId);

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

// Hook for when an event is created
const onEventCreated = async (event) => {
  try {
    // Schedule automatic reminders for the new event
    await NotificationService.scheduleEventReminders(event);
    console.log(`Scheduled automatic reminders for new event: ${event.name}`);
  } catch (error) {
    console.error('Error setting up reminders for new event:', error);
  }
};

// Hook for when an event is updated
const onEventUpdated = async (oldEvent, newEvent) => {
  try {
    // Check if the start date changed
    if (oldEvent.startDate !== newEvent.startDate) {
      // Reschedule reminders with new time
      await NotificationService.rescheduleEventReminders(newEvent);
      console.log(`Rescheduled reminders for updated event: ${newEvent.name}`);
    }
  } catch (error) {
    console.error('Error rescheduling reminders for updated event:', error);
  }
};

router.post("/rate/:eventId", authMiddleware, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { rating } = req.body;
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ error: "Invalid eventId" });
    }

    if (!rating || typeof rating !== 'number' || rating < 1 || rating > 5) {
      return res.status(400).json({ 
        error: "Rating must be a number between 1 and 5" 
      });
    }

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    if (event.creator._id.toString() === userId.toString()) {
      return res.status(400).json({ 
        message: "You cannot rate your own event" 
      });
    }
    
    if (event.isActive !== false) {
      return res.status(400).json({
        message: "You can only rate events that have ended"
      });
    }

    if (!event.participants.includes(userId)) {
      return res.status(400).json({ 
        message: "You must be a participant to rate this event" 
      });
    }

    if (!event.participantsRating || !Array.isArray(event.participantsRating)) {
      event.participantsRating = [];
    } else {
      event.participantsRating = event.participantsRating.filter(
        ratingObj => ratingObj && ratingObj.userId && ratingObj.rating !== undefined
      );
    }

    const currentEventRating = event.eventRating || 0;
    const currentRatingCount = event.participantsRating.length;

    const existingRatingIndex = event.participantsRating.findIndex(
      ratingObj => ratingObj.userId.toString() === userId.toString()
    );
    
    const oldUserRating = existingRatingIndex !== -1 ? event.participantsRating[existingRatingIndex].rating : null;

    let newEventRating;
    let newRatingCount;
    let isUpdate = false;

    if (oldUserRating !== null) {
      isUpdate = true;
      
      const currentTotal = currentEventRating * currentRatingCount;
      const newTotal = currentTotal - oldUserRating + rating;
      newEventRating = currentRatingCount > 0 ? newTotal / currentRatingCount : rating;
      newRatingCount = currentRatingCount; 
      
      if (currentRatingCount === 1 && event.participantsRating.length === 1) {
        newEventRating = rating;
      }
      
      // Update the existing rating
      event.participantsRating[existingRatingIndex].rating = rating;
      
    } else {
      const currentTotal = currentEventRating * currentRatingCount;
      const newTotal = currentTotal + rating;
      newRatingCount = currentRatingCount + 1;
      newEventRating = newTotal / newRatingCount;
      
      event.participantsRating.push({
        userId: new mongoose.Types.ObjectId(userId),
        rating: Number(rating)
      });
    }
    
    event.eventRating = Math.round(newEventRating * 100) / 100;
    event.ratingCount = newRatingCount;

    const updatedEvent = await event.save();

    res.status(200).json();

  } catch (error) {
    console.error("Error rating event:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


module.exports = router;