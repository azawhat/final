const express = require("express");
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const authMiddleware = require("../middleware/authMiddleware");
const router = express.Router();

// Get user profile
router.get("/", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).select("-password");
    
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
    
    res.status(200).json(user);
  } catch (error) {
    console.error("Error fetching user profile:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

router.put("/update", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const updates = req.body;
    
    delete updates._id;
    delete updates.__v;
    delete updates.createdAt;
    
    if (updates.username) {
      const existingUser = await User.findOne({ 
        username: updates.username, 
        _id: { $ne: userId } 
      });
      if (existingUser) {
        return res.status(400).json({ error: "Username is already taken." });
      }
    }

    // Update user with all provided fields (including picture)
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true, runValidators: true }
    ).select("-password");
    
    if (!updatedUser) {
      return res.status(404).json({ error: "User not found." });
    }
    
    res.status(200).json(updatedUser);
  } catch (error) {
    console.error("Error updating profile:", error);
    
    if (error.name === "ValidationError") {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(500).json({ error: "Internal server error." });
  }
});

module.exports = router;