const express = require("express");
const User = require("../models/User");
const mongoose = require("mongoose");
const Event = require("../models/Event");
const Club = require("../models/Club");
const authMiddleware = require("../middleware/authMiddleware");
const { sendQRCodeEmail } = require("../config/emailConfig");
const QRCode = require('qrcode');
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

// Get events joined by the authenticated user
router.get("/joinedEvents", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    console.log("User ID for joinedEvents:", userId);
    
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Invalid userId." });
    }

    const events = await Event.find({ participants: userId });

    if (!events.length) {
      return res.status(404).json({ message: "No joined events found for this user." });
    }

    res.status(200).json(events);
  } catch (error) {
    console.error("Error fetching joined events:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// Delete user
router.delete("/delete-user/:userId", async (req, res) => {
  const { userId } = req.params;
  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Invalid userId." });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const userEvents = await Event.find({ "creator._id": userId });
    
    const userClubs = await Club.find({ "creator._id": userId });

    await Event.updateMany({}, { $pull: { participants: userId } });
    
    await Club.updateMany({}, { $pull: { participants: userId } });

    await User.updateMany({}, { $pull: { joinedClubs: { $in: userClubs.map(club => club._id) } } });

    await User.updateMany({}, { $pull: { visitedEvents: { $in: userEvents.map(event => event._id) } } });

    const deletedEventsResult = await Event.deleteMany({ "creator._id": userId });

    const deletedClubsResult = await Club.deleteMany({ "creator._id": userId });

    const deletedUser = await User.findByIdAndDelete(userId);

    res.json({ 
      message: "User and all associated content deleted successfully.", 
      deletedUser: {
        _id: deletedUser._id,
        username: deletedUser.username,
        email: deletedUser.email,
        name: deletedUser.name,
        surname: deletedUser.surname
      },
      deletedEvents: deletedEventsResult.deletedCount,
      deletedClubs: deletedClubsResult.deletedCount
    });

  } catch (error) {
    console.error("Error deleting user:", error);
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

    const user = await User.findById(userId).select("username surname name email");
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    // Add user to participants
    event.participants.push({
      _id: user._id,
      username: user.username,
      surname: user.surname,
      name: user.name,
    });

    await User.findByIdAndUpdate(
      userId,
      { $addToSet: { visitedEvents: eventId } },
      { new: true }
    );
    
    let qrCodeSent = false;
    let emailError = null;

    // Handle QR code email sending for open events
    if (event.isOpen) {
      try {
        console.log(`Attempting to send QR code email for event: ${event.name}, user: ${user.email}`);
        
        const qrData = JSON.stringify({
          userId: userId,
          eventId: eventId,
          timestamp: new Date().toISOString()
        });

        const qrCodeImage = await QRCode.toDataURL(qrData);
        console.log('QR code generated successfully');

        const emailSent = await sendQRCodeEmail(user, event, qrCodeImage);
        
        if (emailSent) {
          console.log(`✓ QR code email sent successfully to ${user.email} for event ${event.name}`);
          qrCodeSent = true;
        } else {
          console.error(`✗ Failed to send QR code email to ${user.email}`);
          emailError = "Email sending failed";
        }
      } catch (qrError) {
        console.error("Error generating or sending QR code email:", qrError);
        emailError = qrError.message;
      }
    }

    // Always respond with success, but include email status
    const response = { 
      message: "Successfully joined the event.", 
      event,
      qrCodeSent: qrCodeSent,
      isOpen: event.isOpen
    };
    await event.save();
    
    // Include email error in response for debugging (optional)
    if (emailError && event.isOpen) {
      response.emailWarning = `QR code email could not be sent: ${emailError}`;
    }

    console.log(`Response being sent:`, {
      success: true,
      eventName: event.name,
      userEmail: user.email,
      isOpen: event.isOpen,
      qrCodeSent: qrCodeSent,
      emailError: emailError
    });

    res.status(200).json(response);

  } catch (error) {
    console.error("Error joining event:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// Check attendance for an event
router.post("/check-attendance", authMiddleware, async (req, res) => {
  try {
    const { eventId, userId } = req.body;
    const scannerId = req.user.id;
    
    if (!eventId || !userId) {
      return res.status(400).json({ error: "Event ID and User ID are required." });
    }
    
    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ error: "Invalid user ID or event ID." });
    }
    
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ error: "Event not found." });
    }
    
    if (event.creator._id.toString() !== scannerId.toString()) {
      return res.status(403).json({ error: "Only the event creator can check attendance." });
    }
    
    const participantIndex = event.participants.findIndex(
      (participant) => participant._id.toString() === userId
    );
    
    if (participantIndex === -1) {
      return res.status(400).json({ error: "User is not registered for this event." });
    }
    
    const participant = event.participants[participantIndex];
    
    if (!event.attendance) {
      event.attendance = [];
    }
    
    const isAlreadyAttending = event.attendance.some(
      (attendee) => attendee._id.toString() === userId
    );
    
    if (isAlreadyAttending) {
      return res.status(400).json({ error: "User attendance already recorded." });
    }
    
    event.attendance.push({
      _id: participant._id
    });
    
    await event.save();
    
    const attendanceIds = event.attendance.map(attendee => attendee._id.toString());
    res.status(200).json(attendanceIds);
    
  } catch (error) {
    console.error("Error checking attendance:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid user ID." });
    }

    const user = await User.findById(id).select("-password");
    
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    res.status(200).json(user);
  } catch (error) {
    console.error("Error fetching user by ID:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

module.exports = router;