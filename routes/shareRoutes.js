const express = require("express");
const Event = require("../models/Event"); 
const Club = require("../models/Club")
const mongoose = require("mongoose");
const router = express.Router();


router.get("/:clubId", async (req, res) => {
  try {
    const { clubId } = req.params;
    
    // Validate clubId
    if (!mongoose.Types.ObjectId.isValid(clubId)) {
      return res.status(400).json({ error: "Invalid clubId." });
    }

    // Check if club exists
    const club = await Club.findById(clubId);
    if (!club) {
      return res.status(404).json({ message: "Club not found" });
    }

    // Generate the shareable link
    const baseUrl = process.env.BASE_URL || "https://yourapp.com"; // Set your app's base URL
    const shareableLink = `${baseUrl}/clubs/${clubId}`;
    
    // Create a response with club details and link
    const shareData = {
      link: shareableLink,
      clubId: club._id,
      clubName: club.name,
      clubDescription: club.description,
      category: club.category,
      creator: club.creator.name + " " + club.creator.surname,
      participantCount: club.participants.length,
      isOpen: club.isOpen,
      shareText: `Join this club: ${club.name} - ${club.description}`,
      deepLink: `yourapp://club/${clubId}` // For mobile app deep linking
    };

    res.status(200).json(shareData);
  } catch (error) {
    console.error("Error generating club share link:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/share/:eventId", async (req, res) => {
  try {
    const { eventId } = req.params;
    
    // Validate eventId
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ error: "Invalid eventId." });
    }

    // Check if event exists
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Generate the shareable link
    const baseUrl = process.env.BASE_URL || "https://yourapp.com"; // Set your app's base URL
    const shareableLink = `${baseUrl}/events/${eventId}`;
    
    // Create a response with event details and link
    const shareData = {
      link: shareableLink,
      eventId: event._id,
      eventName: event.name,
      eventDescription: event.description,
      startDate: event.startDate,
      location: event.location,
      creator: event.creator.name + " " + event.creator.surname,
      shareText: `Check out this event: ${event.name} at ${event.location}`,
      deepLink: `yourapp://event/${eventId}` // For mobile app deep linking
    };

    res.status(200).json(shareData);
  } catch (error) {
    console.error("Error generating event share link:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;