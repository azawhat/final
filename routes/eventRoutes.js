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
    console.log("Received event data:", req.body);
    const creatorId = req.user._id;
    const { name, description, category, location, eventPicture, eventRating, participantId, startDate, endDate } = req.body;
    
    if (!name || !description || !location || !startDate) {
      return res.status(400).json({ message: "Required fields missing" });
    }

    // Parse complex date objects
    let parsedStartDate;
    let parsedEndDate;
    
    // Handle the complex date object format
    if (startDate && typeof startDate === 'object' && startDate.date && startDate.time) {
      const { date, time } = startDate;
      parsedStartDate = new Date(
        date.year, 
        date.month - 1, // JavaScript months are 0-indexed
        date.day,
        time.hour,
        time.minute,
        time.second,
        time.nano ? time.nano / 1000000 : 0 // Convert nano to milliseconds
      );
    } else {
      // Try standard date parsing as fallback
      parsedStartDate = new Date(startDate);
    }
    
    // Similar handling for endDate if it exists
    if (endDate && typeof endDate === 'object' && endDate.date && endDate.time) {
      const { date, time } = endDate;
      parsedEndDate = new Date(
        date.year, 
        date.month - 1, // JavaScript months are 0-indexed
        date.day,
        time.hour,
        time.minute,
        time.second,
        time.nano ? time.nano / 1000000 : 0
      );
    } else if (endDate) {
      parsedEndDate = new Date(endDate);
    } else {
      parsedEndDate = undefined;
    }
    
    // Check if dates are valid
    if (isNaN(parsedStartDate.getTime())) {
      return res.status(400).json({ message: "Invalid startDate format", receivedValue: startDate });
    }
    
    if (endDate && isNaN(parsedEndDate.getTime())) {
      return res.status(400).json({ message: "Invalid endDate format", receivedValue: endDate });
    }

    const user = await User.findById(creatorId);
    if (!user) return res.status(404).json({ message: "Creator not found" });

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

    // Create new event using the properly parsed dates
    const event = new Event({
      name,
      description,
      category,
      location,
      eventRating,
      eventPicture,
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
    console.log("Event created successfully:", event);
    res.status(201).json(event);
  } catch (error) {
    console.error("Error creating event:", error);
    res.status(400).json({ error: error.message });
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