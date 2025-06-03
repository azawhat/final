const express = require("express");
const router = express.Router();
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");
const { eventReminderQueue } = require("../config/queueConfig");

// Update FCM token
router.post("/update-token", authMiddleware, async (req, res) => {
  try {
    const { fcmToken } = req.body;
    const userId = req.user.id;

    if (!fcmToken) {
      return res.status(400).json({ 
        success: false, 
        error: "FCM token is required" 
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { fcmToken },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: "User not found" 
      });
    }

    res.json({ 
      success: true, 
      message: "FCM token updated successfully" 
    });
  } catch (error) {
    console.error("Error updating FCM token:", error);
    res.status(500).json({ 
      success: false, 
      error: "Internal server error" 
    });
  }
});

// Update notification settings
router.put("/settings", authMiddleware, async (req, res) => {
  try {
    const { eventReminders, clubUpdates, generalNotifications } = req.body;
    const userId = req.user.id;

    const updateData = {
      'notificationSettings.eventReminders': eventReminders,
      'notificationSettings.clubUpdates': clubUpdates,
      'notificationSettings.generalNotifications': generalNotifications
    };

    // Remove undefined values
    Object.keys(updateData).forEach(key => 
      updateData[key] === undefined && delete updateData[key]
    );

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: "User not found" 
      });
    }

    res.json({ 
      success: true, 
      message: "Notification settings updated successfully",
      settings: user.notificationSettings
    });
  } catch (error) {
    console.error("Error updating notification settings:", error);
    res.status(500).json({ 
      success: false, 
      error: "Internal server error" 
    });
  }
});

// Get notification settings
router.get("/settings", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).select('notificationSettings');

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: "User not found" 
      });
    }

    res.json({ 
      success: true, 
      settings: user.notificationSettings || {
        eventReminders: true,
        clubUpdates: true,
        generalNotifications: true
      }
    });
  } catch (error) {
    console.error("Error fetching notification settings:", error);
    res.status(500).json({ 
      success: false, 
      error: "Internal server error" 
    });
  }
});

// Get notification queue stats (admin only) - for monitoring
router.get("/queue-stats", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);
    
    if (!user.isAdmin) {
      return res.status(403).json({ 
        success: false, 
        error: "Admin privileges required" 
      });
    }

    const waiting = await eventReminderQueue.getWaiting();
    const active = await eventReminderQueue.getActive();
    const completed = await eventReminderQueue.getCompleted();
    const failed = await eventReminderQueue.getFailed();

    res.json({
      success: true,
      stats: {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length
      },
      upcomingReminders: waiting.map(job => ({
        eventId: job.data.eventId,
        eventName: job.data.eventName,
        reminderTime: job.data.reminderHours ? `${job.data.reminderHours}h` : `${job.data.reminderMinutes}m`,
        scheduledFor: new Date(job.processedOn + job.delay)
      }))
    });
  } catch (error) {
    console.error("Error fetching queue stats:", error);
    res.status(500).json({ 
      success: false, 
      error: "Internal server error" 
    });
  }
});

// Clear FCM token (logout)
router.delete("/token", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    await User.findByIdAndUpdate(userId, { 
      $unset: { fcmToken: 1 } 
    });

    res.json({ 
      success: true, 
      message: "FCM token cleared successfully" 
    });
  } catch (error) {
    console.error("Error clearing FCM token:", error);
    res.status(500).json({ 
      success: false, 
      error: "Internal server error" 
    });
  }
});

module.exports = router;