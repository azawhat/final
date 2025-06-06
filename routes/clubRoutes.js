const express = require("express");
const Club = require("../models/Club");
const mongoose = require("mongoose");
const User = require("../models/User");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware")

router.post("/create", authMiddleware, async (req, res) => {
  try {
    const creatorId = req.user._id;
    const {
      name,
      description,
      clubPicture,
      isOpen,
      category,
      clubTag,
      participants
    } = req.body;

    if (!name || !description || !category) {
      return res.status(400).json({ message: "Required fields missing" });
    }
    const user = await User.findById(creatorId);
    if (!user) return res.status(404).json({ message: "Creator not found" });

    const club = new Club({
      name,
      description,
      clubPicture,
      isOpen: isOpen !== undefined ? isOpen : true,
      category,
      clubTag,
      participants: [],
      creator: {
        _id: user._id,
        name: user.name,
        surname: user.surname,
        username: user.username,
      }
    });

    await club.save();

    await User.findByIdAndUpdate(creatorId, { $addToSet: { joinedClubs: club._id } });

    res.status(201).json(club._id.toString());
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

//get users clubs
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

router.get("/:clubId", async (req, res) => {
  try {
    const { clubId } = req.params;
    const club = await Club.findById(clubId);
    if (!club) {
      return res.status(404).json({ message: "Club not found" });
    }
    res.json(club);
  } catch (error) {
    console.error("Error fetching club:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.put("/update/:clubId", authMiddleware, async (req, res) => {
  try {
    const { clubId } = req.params;
    const userId = req.user._id;
    const updates = req.body;

    const existingClub = await Club.findById(clubId);
    if (!existingClub) {
      return res.status(404).json({ message: "Club not found" });
    }

    if (!existingClub.creator || !existingClub.creator._id) {
      return res.status(500).json({ message: "Club creator information missing" });
    }

    if (existingClub.creator._id.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Only the club creator can update this club" });
    }

    // Remove fields that shouldn't be updated directly
    delete updates._id;
    delete updates.__v;
    delete updates.creator;
    delete updates.participants;
    delete updates.clubRating;
    delete updates.ratingCount;
    delete updates.createdAt;
    delete updates.updatedAt;

    // Validate required fields if they exist in updates
    if (updates.hasOwnProperty('name') && !updates.name) {
      return res.status(400).json({ message: "Name is required" });
    }

    if (updates.hasOwnProperty('description') && !updates.description) {
      return res.status(400).json({ message: "Description is required" });
    }

    if (updates.hasOwnProperty('category') && !updates.category) {
      return res.status(400).json({ message: "Category is required" });
    }

    // Set default value for isOpen if provided but undefined
    if (updates.hasOwnProperty('isOpen') && updates.isOpen === undefined) {
      updates.isOpen = true;
    }

    // Update the club with all provided fields
    const updatedClub = await Club.findByIdAndUpdate(
      clubId,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!updatedClub) {
      return res.status(404).json({ message: "Club not found" });
    }

    res.json(updatedClub);
  } catch (error) {
    console.error("Error updating club:", error);
    if (error.name === "ValidationError") {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/join/:clubId", authMiddleware, async (req, res) => {
  try {
    const { clubId } = req.params;
    const userId = req.user._id; // Extracted from JWT

    if (!mongoose.Types.ObjectId.isValid(clubId)) {
      return res.status(400).json({ error: "Invalid clubId." });
    }

    // Find the club
    const club = await Club.findById(clubId);
    if (!club) {
      return res.status(404).json({ error: "Club not found." });
    }

    // Check if the club is closed
    if (club.isClosed) {
      return res.status(403).json({ error: "This club is closed for new members." });
    }

    // Prevent creator from joining as a participant
    if (club.creator._id.toString() === userId) {
      return res.status(400).json({ error: "You cannot join your own club." });
    }

    // Check if user is already a participant
    const isParticipant = club.participants.some(
      (participant) => participant._id.toString() === userId
    );
    if (isParticipant) {
      return res.status(400).json({ error: "You are already in this club." });
    }

    // Fetch user details
    const user = await User.findById(userId).select("username surname name");
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    // Add user to participants
    club.participants.push({
      _id: user._id,
      name: user.name,
      surname: user.surname,
      username: user.username,
    });

    await club.save();

    // Add club to user's joined clubs
    await User.findByIdAndUpdate(userId, { $addToSet: { joinedClubs: club._id } });

    res.status(200).json({ message: "Successfully joined the club.", club });
  } catch (error) {
    console.error("Error joining club:", error);
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

router.post("/rate/:clubId", authMiddleware, async (req, res) => {
  try {
    const { clubId } = req.params;
    const { rating } = req.body;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(clubId)) {
      return res.status(400).json({ error: "Invalid clubId" });
    }

    if (!rating || typeof rating !== 'number' || rating < 1 || rating > 5) {
      return res.status(400).json({ 
        error: "Rating must be a number between 1 and 5" 
      });
    }


    const club = await Club.findById(clubId);
    if (!club) {
      return res.status(404).json({ message: "Club not found" });
    }

    if (club.creator._id.toString() === userId.toString()) {
      return res.status(400).json({ 
        message: "You cannot rate your own club" 
      });
    }

    if (!club.participants.includes(userId)) {
      return res.status(400).json({ 
        message: "You must be a member to rate this club" 
      });
    }

    const currentRating = club.clubRating || 0;
    const currentCount = club.ratingCount || 0;
    
    const totalRating = (currentRating * currentCount) + rating;
    const newCount = currentCount + 1;
    const newAverageRating = totalRating / newCount;

    club.clubRating = Math.round(newAverageRating * 100) / 100;
    club.ratingCount = newCount;

    const updatedClub = await club.save();

    res.status(200).json({
      success: true,
      message: "Club rated successfully",
      data: {
        clubId: clubId,
        clubName: club.name,
        userRating: rating,
        newAverageRating: updatedClub.clubRating,
        totalRatings: updatedClub.ratingCount
      }
    });

  } catch (error) {
    console.error("Error rating club:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
