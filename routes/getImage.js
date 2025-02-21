const express = require("express");
const User = require("../models/User");
const Event = require("../models/Event");
const Club = require("../models/Club");

const router = express.Router();

// Get User Avatar
router.get("/user/:id/avatar", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user || !user.avatar) return res.status(404).send("No avatar found");

    res.set("Content-Type", "image/png"); // Adjust based on image type
    res.send(user.avatar);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Event Picture
router.get("/event/:id/picture", async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event || !event.picture) return res.status(404).send("No event picture found");

    res.set("Content-Type", "image/png");
    res.send(event.picture);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Club Picture
router.get("/club/:id/picture", async (req, res) => {
  try {
    const club = await Club.findById(req.params.id);
    if (!club || !club.picture) return res.status(404).send("No club picture found");

    res.set("Content-Type", "image/png");
    res.send(club.picture);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
