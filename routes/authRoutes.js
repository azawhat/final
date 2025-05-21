const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Event = require("../models/Event");
const Club = require("../models/Club");
const authMiddleware = require("../middleware/authMiddleware");
const { sendVerificationCode } = require("../config/emailConfig");

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

    // Generate verification code
    const verificationCode = user.generateVerificationCode();
    
    await user.save();

    // Send verification code email
    const emailSent = await sendVerificationCode(user, verificationCode);
    
    if (emailSent) {
      res.status(201).json({ 
        message: "User registered successfully. Please check your email for the verification code." 
      });
    } else {
      res.status(500).json({ 
        message: "User registered, but there was a problem sending the verification email. Please try again later." 
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Verify Email with Code
router.post("/verify/code", async (req, res) => {
  try {
    const { email, code } = req.body;
    
    if (!email || !code) {
      return res.status(400).json({
        success: false,
        error: "Email and verification code are required"
      });
    }

    const user = await User.findOne({
      email,
      verificationCode: code,
      verificationCodeExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        error: "Invalid or expired verification code. Please request a new code."
      });
    }
    user.isEmailVerified = true;
    user.verificationCode = undefined;
    user.verificationCodeExpires = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Email verified successfully. You can now log in.",
      userId: user._id
    });
  } catch (error) {
    console.error("Verification error:", error);
    res.status(500).json({
      success: false,
      error: "An error occurred during verification. Please try again."
    });
  }
});

// Resend verification code
router.post("/resend-verification", async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({ message: "Email is already verified" });
    }

    // Generate new verification code
    const verificationCode = user.generateVerificationCode();
    await user.save();

    // Send verification email
    const emailSent = await sendVerificationCode(user, verificationCode);
    
    if (emailSent) {
      res.status(200).json({ message: "Verification code sent successfully" });
    } else {
      res.status(500).json({ error: "Failed to send verification code" });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/check-username/:username", async (req, res) => {
  try {
    const { username } = req.params;

    // if username exists
    const existingUser = await User.findOne({ username: username });
    
    if (existingUser) {
      return res.status(200).json({ 
        isAvailable: false, 
      });
    }
    
    // Username is available
    return res.status(200).json({ 
      isAvailable: true, 
    });
    
  } catch (error) {
    console.error("Error checking username availability:", error);
    res.status(500).json({ 
      available: false, 
      error: "Internal server error." 
    });
  }
});

router.get("/verify/email/:email", async (req, res) => {
  try {
    const { email } = req.params;
    
    // Check if email exists
    const existingUser = await User.findOne({ email: email });
    
    if (existingUser) {
      return res.status(200).json({
        isAvailable: false,
      });
    }
    
    // Email is available
    return res.status(200).json({
      isAvailable: true,
    });
  } catch (error) {
    console.error("Error checking email availability:", error);
    res.status(500).json({
      isAvailable: false,
      error: "Internal server error."
    });
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

    // Check if email is verified
    if (!user.isEmailVerified) {
      return res.status(401).json({ 
        error: "Please verify your email before logging in",
        needsVerification: true,
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