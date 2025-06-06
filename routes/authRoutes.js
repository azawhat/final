const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Event = require("../models/Event");
const Club = require("../models/Club");
const authMiddleware = require("../middleware/authMiddleware");
const { sendVerificationCode } = require("../config/emailConfig");

const router = express.Router();

router.post("/register", async (req, res) => {
  try {
    const { email, name, surname, username, password, interestedTags, profilePicture } = req.body;

    if (!email || !name || !surname || !username || !password) {
      return res.status(400).json({
        success: false,
        error: "All fields are required"
      });
    }

    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }
    
    if (!user.isEmailVerified) {
      return res.status(400).json({
        success: false,
        error: "Email must be verified before completing registration"
      });
    }

    const existingUsername = await User.findOne({ 
      username,
      _id: { $ne: user._id }
    });
    
    if (existingUsername) {
      return res.status(400).json({
        success: false,
        error: "Username already taken"
      });
    }

    // Update user information
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    user.name = name;
    user.surname = surname;
    user.username = username;
    user.password = hashedPassword;
    user.profilePicture = profilePicture;
    
    if (interestedTags && Array.isArray(interestedTags)) {
      user.interestedTags = interestedTags;
    }
    
    await user.save();

    res.status(200).json(true);
    console.log("User registered successfully");
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json(false);
  }
});

router.post("/verify/email", async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json(false);
    }

    let user = await User.findOne({ email });
    
    if (user) {
      return res.status(400).json(false);
    }
    
    user = new User({ 
      email,
      name: "Pending",
      surname: "Pending",
      username: `user_${Date.now().toString().slice(-6)}`,
      password: 1
    });
    
    const verificationCode = user.generateVerificationCode();
    await user.save();
    
    const emailSent = await sendVerificationCode(user, verificationCode);
    
    if (emailSent) {
      res.status(200).json(true);
    } else {
      res.status(500).json(false);
    }
  } catch (error) {
    console.error("Send verification code error:", error);
    res.status(500).json(false);
  }
});

// Verify Email with Code
router.post("/verify/code", async (req, res) => {
  try {
    const { email, code } = req.body;
    
    if (!email || !code) {
      return res.status(400).json(false);
    }

    const user = await User.findOne({
      email,
      verificationCode: code,
      verificationCodeExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json(false);
    }
    user.isEmailVerified = true;
    user.verificationCode = undefined;
    user.verificationCodeExpires = undefined;
    await user.save();

    res.status(200).json(true);
  } catch (error) {
    console.error("Verification error:", error);
    res.status(500).json(false);
  }
});


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
      return res.status(200).json(false);
    }
    
    // Username is available
    return res.status(200).json(true);
    
  } catch (error) {
    console.error("Error checking username availability:", error);
    res.status(500).json(false);
  }
});

// Login User
router.post("/login", async (req, res) => {
  try {
    const { email, password, fcmToken } = req.body;

    const user = await User.findOne({ email })
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

    // Check if registration is complete
    if (user.name === "Pending" || user.surname === "Pending") {
      return res.status(401).json({
        error: "Please complete your registration",
        needsCompletion: true,
        userId: user._id
      });
    }

    // Update FCM token if provided
    if (fcmToken) {
      user.fcmToken = fcmToken;
      await user.save();
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
        createdAt: user.createdAt,
        notificationSettings: user.notificationSettings
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/logout", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    await User.findByIdAndUpdate(userId, { 
      $unset: { fcmToken: 1 } 
    });

    res.json({ 
      success: true, 
      message: "Logged out successfully",
      clearToken: true
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ 
      success: false, 
      error: "Internal server error" 
    });
  }
});


module.exports = router;