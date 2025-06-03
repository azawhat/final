const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Event = require("../models/Event");
const authMiddleware = require("../middleware/authMiddleware");
const NotificationService = require("../services/notificationService");
const { notificationQueue } = require("../config/queueConfig");

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

// Send immediate notification to a user
router.post("/send", authMiddleware, async (req, res) => {
  try {
    const { userId, title, body, data } = req.body;
    const senderId = req.user.id;

    if (!userId || !title || !body) {
      return res.status(400).json({ 
        success: false, 
        error: "userId, title, and body are required" 
      });
    }

    // Check if sender has permission (admin or sending to self)
    const sender = await User.findById(senderId);
    if (!sender.isAdmin && senderId !== userId) {
      return res.status(403).json({ 
        success: false, 
        error: "Insufficient permissions" 
      });
    }

    const notification = { title, body };
    const notificationData = { 
      ...data, 
      senderId: senderId,
      type: 'direct_message'
    };

    // Add to queue for processing
    await NotificationService.addNotificationJob('send-notification', {
      userId,
      notification,
      data: notificationData
    });

    res.json({ 
      success: true, 
      message: "Notification queued successfully" 
    });
  } catch (error) {
    console.error("Error sending notification:", error);
    res.status(500).json({ 
      success: false, 
      error: "Internal server error" 
    });
  }
});

// Send bulk notification (admin only)
router.post("/send-bulk", authMiddleware, async (req, res) => {
  try {
    const { userIds, title, body, data } = req.body;
    const userId = req.user.id;

    // Check if user is admin
    const user = await User.findById(userId);
    if (!user.isAdmin) {
      return res.status(403).json({ 
        success: false, 
        error: "Admin privileges required" 
      });
    }

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0 || !title || !body) {
      return res.status(400).json({ 
        success: false, 
        error: "userIds (array), title, and body are required" 
      });
    }

    const notification = { title, body };
    const notificationData = { 
      ...data, 
      senderId: userId,
      type: 'bulk_notification'
    };

    // Add to queue for processing
    await NotificationService.addNotificationJob('send-bulk-notification', {
      userIds,
      notification,
      data: notificationData
    });

    res.json({ 
      success: true, 
      message: `Bulk notification queued for ${userIds.length} users` 
    });
  } catch (error) {
    console.error("Error sending bulk notification:", error);
    res.status(500).json({ 
      success: false, 
      error: "Internal server error" 
    });
  }
});

// Send notification to event participants
router.post("/send-to-event/:eventId", authMiddleware, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { title, body, data } = req.body;
    const userId = req.user.id;

    if (!title || !body) {
      return res.status(400).json({ 
        success: false, 
        error: "title and body are required" 
      });
    }

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ 
        success: false, 
        error: "Event not found" 
      });
    }

    // Check if user is event creator or admin
    const user = await User.findById(userId);
    if (!user.isAdmin && event.creator._id.toString() !== userId) {
      return res.status(403).json({ 
        success: false, 
        error: "Only event creator or admin can send notifications" 
      });
    }

    const notification = { title, body };
    const notificationData = { 
      ...data, 
      eventId,
      eventName: event.name,
      senderId: userId,
      type: 'event_notification'
    };

    // Add to queue for processing
    await NotificationService.addNotificationJob('send-bulk-notification', {
      userIds: event.participants,
      notification,
      data: notificationData
    });

    res.json({ 
      success: true, 
      message: `Notification queued for ${event.participants.length} event participants` 
    });
  } catch (error) {
    console.error("Error sending notification to event participants:", error);
    res.status(500).json({ 
      success: false, 
      error: "Internal server error" 
    });
  }
});

// Test notification (for development)
router.post("/test", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { title = "Test Notification", body = "This is a test notification" } = req.body;

    const user = await User.findById(userId);
    if (!user || !user.fcmToken) {
      return res.status(400).json({ 
        success: false, 
        error: "User not found or no FCM token registered" 
      });
    }

    const notification = { title, body };
    const data = { 
      type: 'test',
      timestamp: Date.now().toString()
    };

    const result = await NotificationService.sendImmediateNotification(userId, notification, data);

    res.json({ 
      success: result.success, 
      message: result.success ? "Test notification sent successfully" : "Failed to send test notification",
      details: result
    });
  } catch (error) {
    console.error("Error sending test notification:", error);
    res.status(500).json({ 
      success: false, 
      error: "Internal server error" 
    });
  }
});

// Get notification queue stats (admin only)
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

    const waiting = await notificationQueue.getWaiting();
    const active = await notificationQueue.getActive();
    const completed = await notificationQueue.getCompleted();
    const failed = await notificationQueue.getFailed();

    res.json({
      success: true,
      stats: {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length
      }
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