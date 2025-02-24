const express = require("express");
const User = require("../models/User");
const mongoose = require("mongoose");
const Event = require("../models/Event");
const Club = require("../models/Club");
const authMiddleware = require("../middleware/authMiddleware");
const router = express.Router();


// Get all users
router.get("/", async (req, res) => {
  try {
    const users = await User.find();
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete user
router.delete("/delete-user/:userId", async (req, res) => {
  const { userId } = req.params;
  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Invalid userId." });
    }
    
    // Remove user from events and clubs
    await Event.updateMany({}, { $pull: { participants: userId } });
    await Club.updateMany({}, { $pull: { members: userId } });

    // Delete user
    const deletedUser = await User.findByIdAndDelete(userId);
    if (!deletedUser) {
      return res.status(404).json({ error: "User not found." });
    }

    res.json({ message: "User deleted successfully.", deletedUser });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error." });
  }
});

router.get("/eventsCreated", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Invalid userId." });
    }

    // Find events where the user is the creator
    const events = await Event.find({ "creator._id": userId });

    if (!events.length) {
      return res.status(404).json({ message: "No events found for this user." });
    }

    res.status(200).json(events);
  } catch (error) {
    console.error("Error fetching events for user:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// Join an event
router.post("/join/:eventId", authMiddleware, async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ error: "Invalid eventId." });
    }

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ error: "Event not found." });
    }

    if (event.creator._id.toString() === userId) {
      return res.status(400).json({ error: "You cannot join your own event." });
    }

    const isParticipant = event.participants.some(
      (participant) => participant._id.toString() === userId
    );
    if (isParticipant) {
      return res.status(400).json({ error: "You are already in this event." });
    }

    if (event.isClosed) {
      return res.status(403).json({ error: "This event is closed for new members." });
    }

    const user = await User.findById(userId).select("username surname name");
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    event.participants.push({
      _id: user._id,
      username: user.username,
      surname: user.surname,
      name: user.name,
    });

    await event.save();

    res.status(200).json({ message: "Successfully joined the event.", event });
  } catch (error) {
    console.error("Error joining event:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

module.exports = router;
