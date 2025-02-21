const express = require("express");
const Event = require("../models/Event");
const mongoose = require("mongoose");
const User = require("../models/User"); 


const router = express.Router();

// 📌 Create an event
router.post("/create", async (req, res) => {
  try {
    const event = new Event(req.body);
    await event.save();
    res.status(201).json(event);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 📌 Get all events
router.get("/", async (req, res) => {
  try {
    const events = await Event.find();
    res.status(200).json(events);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/delete-event/:eventId", async (req, res) => {
    const { eventId } = req.params;
  
    try {
      if (!mongoose.Types.ObjectId.isValid(eventId)) {
        return res.status(400).json({ error: "Invalid eventId." });
      }
  
      // Remove event reference from users
      await User.updateMany({}, { $pull: { registeredEvents: eventId } });
  
      // Delete event
      const deletedEvent = await Event.findByIdAndDelete(eventId);
      if (!deletedEvent) {
        return res.status(404).json({ error: "Event not found." });
      }
  
      res.json({ message: "Event deleted successfully.", deletedEvent });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error." });
    }
});
  
module.exports = router;
