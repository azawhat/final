const express = require("express");
const Event = require("../models/Event");
const mongoose = require("mongoose");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");
const router = express.Router();
const axios = require("axios");

// Get all events
router.get("/", async (req, res) => {
  try {
    const userId = req.query.userId; // передаём userId как параметр
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const allUsers = await User.find();
    const events = await Event.find();

    const response = await axios.post("http://localhost:5000/recommend", {
      currentUser: {
        id: user._id.toString(),
        interestedTags: user.interestedTags || [],
        registeredEvents: user.registeredEvents || [],
      },
      allUsers: allUsers.map(u => ({
        id: u._id.toString(),
        registeredEvents: u.registeredEvents || [],
      })),
      events: events.map(e => ({
        id: e._id.toString(),
        tags: e.tags || [],
        eventRating: e.eventRating || 0,
      })),
    });

    const sorted = response.data;

    // Присоединим полные данные к отсортированным ID
    const sortedFull = sorted.map(sortedEvent => {
      const fullEvent = events.find(e => e._id.toString() === sortedEvent.id);
      return { ...fullEvent._doc, score: sortedEvent.score };
    });

    res.json(sortedFull);
  } catch (error) {
    console.error("Error fetching recommended events:", error.message);
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
      tags,
      eventPicture,
      eventPosts, // corrected from eventPosrs
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
      tags,
      eventPicture,
      eventPosts,        // corrected
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