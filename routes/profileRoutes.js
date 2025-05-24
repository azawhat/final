const express = require("express");
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const authMiddleware = require("../middleware/authMiddleware");
const router = express.Router();
const { sendNewPasswordEmail } = require("../config/emailConfig");

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

    if (updates.email) {
      const existingUser = await User.findOne({ 
        email: updates.email, 
        _id: { $ne: userId } 
      });
      if (existingUser) {
        return res.status(400).json({ error: "Email is already taken." });
      }

      updates.isEmailVerified = false;
      updates.verificationCode = undefined;
      updates.verificationCodeExpires = undefined;
    }

    if (updates.password) {
      try {
        const saltRounds = 10;
        updates.password = await bcrypt.hash(updates.password, saltRounds);
      } catch (hashError) {
        console.error("Error hashing password:", hashError);
        return res.status(500).json({ error: "Error processing password." });
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

    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({ error: `${field} is already taken.` });
    }

    res.status(500).json({ error: "Internal server error." });
  }
});

router.post("/forgot-password/:email", async (req, res) => {
  const { email } = req.params;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "User with this email does not exist." });
    }

    const newPassword = Math.random().toString(36).slice(-8);

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    const emailSent = await sendNewPasswordEmail(user, newPassword);
    if (!emailSent) {
      return res.status(500).json({ error: "Failed to send new password email." });
    }

    res.status(200).json();
  } catch (error) {
    console.error("Error in forgot password route:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

module.exports = router;