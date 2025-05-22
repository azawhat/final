const express = require("express");
const User = require("../models/User");
const bcrypt = require("bcrypt");
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

// Update profile fields (full user object from frontend)
router.put("/update", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const updates = req.body;

    delete updates.password;
    delete updates._id;
    delete updates.__v;
    delete updates.createdAt;
    delete updates.updatedAt;

    if (updates.username) {
      const existingUser = await User.findOne({ 
        username: updates.username, 
        _id: { $ne: userId } 
      });
      if (existingUser) {
        return res.status(400).json({ error: "Username is already taken." });
      }
    }

    if (updates.email) {
      const existingUser = await User.findOne({ 
        email: updates.email, 
        _id: { $ne: userId } 
      });
      if (existingUser) {
        return res.status(400).json({ error: "Email is already taken." });
      }
    }

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

// Update password
router.put("/update-password", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ 
        error: "Both old password and new password are required." 
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ 
        error: "New password must be at least 6 characters long." 
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    // Verify old password
    const isOldPasswordValid = await bcrypt.compare(oldPassword, user.password);
    if (!isOldPasswordValid) {
      return res.status(400).json({ error: "Old password is incorrect." });
    }

    // Hash new password
    const saltRounds = 10;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await User.findByIdAndUpdate(userId, { password: hashedNewPassword });

    res.status(200).json({ message: "Password updated successfully." });
  } catch (error) {
    console.error("Error updating password:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

router.put("/update-picture", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { picture } = req.body;

    if (!picture) {
      return res.status(400).json({ error: "Picture data is required." });
    }

    if (typeof picture !== "string") {
      return res.status(400).json({ error: "Picture must be a string." });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: { picture: picture } },
      { new: true, runValidators: true }
    ).select("-password");

    if (!updatedUser) {
      return res.status(404).json({ error: "User not found." });
    }

    res.status(200).json(updatedUser);
  } catch (error) {
    console.error("Error updating profile picture:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

router.delete("/delete", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: "Password is required to delete account." });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ error: "Incorrect password." });
    }

    const Event = require("../models/Event");
    const Club = require("../models/Club");
    
    await Event.updateMany({}, { $pull: { participants: userId } });
    await Club.updateMany({}, { $pull: { members: userId } });

    await User.findByIdAndDelete(userId);

    res.status(200).json({ message: "Account deleted successfully." });
  } catch (error) {
    console.error("Error deleting profile:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

module.exports = router;