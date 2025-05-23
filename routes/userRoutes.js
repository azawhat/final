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


router.post("/check-attendance", authMiddleware, async (req, res) => {
  try {
    const { qrData } = req.body;
    const scannerId = req.user.id;

    if (!qrData) {
      return res.status(400).json({ error: "QR data is required." });
    }

    let parsedData;
    try {
      parsedData = JSON.parse(qrData);
    } catch (parseError) {
      return res.status(400).json({ error: "Invalid QR code format." });
    }

    const { userId, eventId } = parsedData;

    if (!userId || !eventId) {
      return res.status(400).json({ error: "Invalid QR code data." });
    }

    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ error: "Invalid user ID or event ID in QR code." });
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

    event.participants.splice(participantIndex, 1);
    event.attendance.push({
      _id: participant._id,
      username: participant.username,
      surname: participant.surname,
      name: participant.name,
    });

    await event.save();

  res.status(200).json(event);


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

router.get("/joinedEvents", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Invalid userId." });
    }

    // Find events where the user is a participant
    const events = await Event.find({ "participants._id": userId });

    if (!events.length) {
      return res.status(404).json({ message: "No joined events found for this user." });
    }

    res.status(200).json(events);
  } catch (error) {
    console.error("Error fetching joined events:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

module.exports = router;