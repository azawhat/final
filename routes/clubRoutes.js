const express = require("express");
const Club = require("../models/Club");
const mongoose = require("mongoose");
const User = require("../models/User");
const router = express.Router();

// Create a club
router.post("/create", async (req, res) => {
  try {
    const club = new Club(req.body);
    await club.save();
    res.status(201).json(club);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get all clubs
router.get("/", async (req, res) => {
  try {
    const clubs = await Club.find();
    res.status(200).json(clubs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a club
router.delete("/delete-club/:clubId", async (req, res) => {
    const { clubId } = req.params;
  
    try {
      if (!mongoose.Types.ObjectId.isValid(clubId)) {
        return res.status(400).json({ error: "Invalid clubId." });
      }
  
      // Remove club reference from users
      await User.updateMany({}, { $pull: { joinedClubs: clubId } });
  
      // Delete club
      const deletedClub = await Club.findByIdAndDelete(clubId);
      if (!deletedClub) {
        return res.status(404).json({ error: "Club not found." });
      }
  
      res.json({ message: "Club deleted successfully.", deletedClub });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error." });
    }
});
  
module.exports = router;
