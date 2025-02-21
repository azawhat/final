const express = require("express");
const multer = require("multer");
const mongoose = require("mongoose");
const Image = require("../models/Image"); // Import the Image model

const router = express.Router();

// Configure Multer for file upload
const storage = multer.memoryStorage(); // Store image in memory as Buffer
const upload = multer({ storage: storage });

// 📌 Upload image
router.post("/upload", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const newImage = new Image({
      name: req.file.originalname,
      contentType: req.file.mimetype,
      data: req.file.buffer, // Store image as Buffer
    });

    await newImage.save();
    res.status(201).json({ message: "Image uploaded successfully", imageId: newImage._id });
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// 📌 Get image by ID
router.get("/image/:id", async (req, res) => {
  try {
    const image = await Image.findById(req.params.id);
    if (!image) {
      return res.status(404).json({ error: "Image not found" });
    }

    res.set("Content-Type", image.contentType);
    res.send(image.data); // Send image as bytes
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
