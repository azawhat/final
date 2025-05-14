const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Event = require("../models/Event");
const Club = require("../models/Club");
const authMiddleware = require("../middleware/authMiddleware");
const { sendConfirmationEmail } = require("../config/emailConfig");

const router = express.Router();

// Register User
router.post("/register", async (req, res) => {
  try {
    const { name, surname, username, email, password } = req.body;

    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ error: "User already exists" });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    user = new User({ 
      name, 
      surname, 
      username, 
      email, 
      password: hashedPassword 
    });

    // Generate confirmation token
    const confirmationToken = user.generateConfirmationToken();
    
    await user.save();

    // Send confirmation email
    const emailSent = await sendConfirmationEmail(user, confirmationToken);
    
    if (emailSent) {
      res.status(201).json({ 
        message: "User registered successfully. Please check your email to confirm your account." 
      });
    } else {
      res.status(500).json({ 
        message: "User registered, but there was a problem sending the confirmation email. Please try logging in later." 
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Confirm Email
router.get("/confirm/:token", async (req, res) => {
  try {
    const { token } = req.params;
    
    const user = await User.findOne({
      confirmationToken: token,
      confirmationTokenExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ 
        error: "Invalid or expired confirmation token. Please request a new confirmation email." 
      });
    }

    // Confirm user's email
    user.isEmailConfirmed = true;
    user.confirmationToken = undefined;
    user.confirmationTokenExpires = undefined;
    
    await user.save();

    res.status(200).json({ message: "Email confirmed successfully. You can now log in." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Resend confirmation email
router.post("/resend-confirmation", async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.isEmailConfirmed) {
      return res.status(400).json({ message: "Email is already confirmed" });
    }

    // Generate new confirmation token
    const confirmationToken = user.generateConfirmationToken();
    await user.save();

    // Send confirmation email
    const emailSent = await sendConfirmationEmail(user, confirmationToken);
    
    if (emailSent) {
      res.status(200).json({ message: "Confirmation email sent successfully" });
    } else {
      res.status(500).json({ error: "Failed to send confirmation email" });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Login User
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email })
      .populate("joinedClubs")
      .populate("visitedEvents"); 

    if (!user) return res.status(400).json({ error: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "Invalid credentials" });

    // Check if email is confirmed
    if (!user.isEmailConfirmed) {
      return res.status(401).json({ 
        error: "Please confirm your email before logging in",
        needsConfirmation: true,
        email: user.email 
      });
    }

    // Generate JWT
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "1d" });

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        surname: user.surname,
        email: user.email,
        username: user.username,
        profilePicture: user.profilePicture,
        isAdmin: user.isAdmin,
        visitedEvents: user.visitedEvents, 
        joinedClubs: user.joinedClubs,
        createdAt: user.createdAt
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;