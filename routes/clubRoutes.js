const express = require("express");
const Club = require("../models/Club");
const mongoose = require("mongoose");
const User = require("../models/User");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware")

// 📌 Create a club
router.post("/create", authMiddleware, async (req, res) => {
  try {
    const creatorId = req.user._id; 

    const { name, description, category, clubPicture, participantId } = req.body;

    if (!name || !description || !category) {
      return res.status(400).json({ message: "All fields are required." });
    }

    const user = await User.findById(creatorId);
    if (!user) return res.status(404).json({ message: "Creator not found" });

    let participants = [];
    if (Array.isArray(participantId)) {
      participants = await User.find({ _id: { $in: participantId } });
    } else if (participantId) {
      const participant = await User.findById(participantId);
      if (participant) participants.push(participant);
    }

    const participantData = participants.map(p => ({
      _id: p._id,
      name: p.name,
      surname: p.surname,
      username: p.username,
    }));

    const club = new Club({
      name,
      description,
      category,
      clubPicture,
      participants: participantData,
      creator: {
        _id: user._id,
        name: user.name,
        surname: user.surname,
        username: user.username,
      }
    });

    await club.save();

    await User.findByIdAndUpdate(creatorId, { $addToSet: { joinedClubs: club._id } });

    await User.updateMany(
      { _id: { $in: participants.map(p => p._id) } },
      { $addToSet: { joinedClubs: club._id } }
    );

    res.status(201).json(club);
  } catch (error) {
    console.error("Error creating club:", error);
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


router.get("/user/", async (req, res) => {
  const { userId } = req.params;

  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Invalid userId." });
    }

    const clubs = await Club.find({
        "creator._id": userId 
    });

    res.status(200).json(clubs);
  } catch (error) {
    console.error("Error fetching clubs:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});


// Delete a club
router.delete("/delete-club/:clubId/:userId", async (req, res) => {
  const { clubId, userId } = req.params;

  try {
    if (!mongoose.Types.ObjectId.isValid(clubId) || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Invalid clubId or userId." });
    }

    const club = await Club.findById(clubId);
    if (!club) {
      return res.status(404).json({ error: "Club not found." });
    }

    //if the requesting user is the creator of the club
    if (club.creator._id.toString() !== userId) {
      return res.status(403).json({ error: "Unauthorized: Only the creator can delete this club." });
    }

    // Remove club reference from users
    await User.updateMany({}, { $pull: { joinedClubs: clubId } });

    // Delete club
    await Club.findByIdAndDelete(clubId);

    res.json({ message: "Club deleted successfully." });
  } catch (error) {
    console.error("Error deleting club:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});


module.exports = router;
