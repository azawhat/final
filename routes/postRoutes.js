const express = require("express");
const Post = require("../models/Post");
const Event = require("../models/Event");
const User = require("../models/User");
const mongoose = require("mongoose");
const authMiddleware = require("../middleware/authMiddleware");
const router = express.Router();

// Create a new post
router.post("/create/:eventId", authMiddleware, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { header, media, text, date } = req.body;
    const authorId = req.user.id;

    if (!header || !text || !eventId) {
      return res.status(400).json({ 
        error: "Header, text, and eventId are required" 
      });
    }

    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ error: "Invalid eventId" });
    }
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }
        if (!event.isActive) {
      return res.status(400).json({ 
        error: "Cannot post on inactive events" 
      });
    }

    // Check if user is a participant or creator of the event
    const isParticipant = event.participants.includes(authorId) || event.creator._id.toString() === authorId.toString();
    if (!isParticipant) {
      return res.status(403).json({ 
        error: "You must be a creator to post on this event" 
      });
    }

    // Create new post
    const post = new Post({
      header: header.trim(),
      media: media || [],
      text: text.trim(),
      authorId,
      eventId,
      likes: [],
      likeCount: 0,
      date
    });

    await post.save();

    // Add post to event's posts array
    await Event.findByIdAndUpdate(
      eventId,
      { $push: { posts: post._id } },
      { new: true }
    );

    res.status(200).json();
  } catch (error) {
    console.error("Error creating post:", error);
    if (error.name === "ValidationError") {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: "Internal server error" });
  }
});



// Like a post
router.post("/like/:postId", authMiddleware, async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ error: "Invalid postId" });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    const existingLike = post.likes.find(
      like => like.userId.toString() === userId.toString()
    );

    if (existingLike) {
      return res.status(400).json({ error: "You have already liked this post" });
    }

    post.likes.push({ userId: new mongoose.Types.ObjectId(userId) });
    await post.save();

    res.status(200).json({ 
      message: "Post liked successfully",
      likeCount: post.likeCount,
      isLiked: true
    });
  } catch (error) {
    console.error("Error liking post:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


router.post("/unlike/:postId", authMiddleware, async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ error: "Invalid postId" });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    const likeIndex = post.likes.findIndex(
      like => like.userId.toString() === userId.toString()
    );

    if (likeIndex === -1) {
      return res.status(400).json({ error: "You have not liked this post" });
    }

    post.likes.splice(likeIndex, 1);
    await post.save();

    res.status(200).json({ 
      message: "Post unliked successfully",
      likeCount: post.likeCount,
      isLiked: false
    });
  } catch (error) {
    console.error("Error unliking post:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/delete/:postId", authMiddleware, async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ error: "Invalid postId" });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    const event = await Event.findById(post.eventId);
    const isAuthor = post.authorId.toString() === userId.toString();
    const isEventCreator = event && event.creator._id.toString() === userId.toString();

    if (!isAuthor && !isEventCreator) {
      return res.status(403).json({ 
        error: "You can only delete your own posts or posts in events you created" 
      });
    }

    await Post.findByIdAndDelete(postId);

    await Event.findByIdAndUpdate(
      post.eventId,
      { $pull: { posts: postId } },
      { new: true }
    );

    res.status(200).json({ message: "Post deleted successfully" });
  } catch (error) {
    console.error("Error deleting post:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get all posts for a specific event
router.get("/event/:eventId", async (req, res) => {
  try {
    const { eventId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ error: "Invalid eventId" });
    }


    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    const posts = await Post.find({ eventId })
      .populate('authorId', 'name surname username')

    res.status(200).json({posts});
  } catch (error) {
    console.error("Error fetching posts for event:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get a specific post
router.get("/:postId", async (req, res) => {
  try {
    const { postId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ error: "Invalid postId" });
    }

    const post = await Post.findById(postId)
      .populate('authorId', 'name surname username')

    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    res.status(200).json(post);
  } catch (error) {
    console.error("Error fetching post:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;