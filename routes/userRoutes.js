const express = require("express");
const User = require("../models/User");
const mongoose = require("mongoose");
const Event = require("../models/Event");
const Club = require("../models/Club");
const router = express.Router();

// Create new user
router.post("/create", async (req, res) => {
  try {
    const user = new User(req.body);
    await user.save();
    res.status(201).json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

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
  
  

module.exports = router;

