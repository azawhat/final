const admin = require('firebase-admin');
const { Notification, DeviceToken } = require('../models/Notification');
const User = require('../models/User');

// Initialize Firebase Admin SDK
// Note: You'll need to add your Firebase service account credentials file
try {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    })
  });
} catch (error) {
  if (error.code !== 'app/duplicate-app') {
    console.error('Firebase admin initialization error:', error);
  }
}

// Controller for handling notifications
const notificationController = {
  // Register device token
  registerToken: async (req, res) => {
    try {
      const { token } = req.body;
      const userId = req.user.id; // Assuming authentication middleware sets req.user
      
      if (!token) {
        return res.status(400).json({ success: false, message: 'Device token is required' });
      }
      
      // Upsert token (update if exists, insert if not)
      const deviceToken = await DeviceToken.findOneAndUpdate(
        { user: userId, token },
        { token, user: userId, deviceType: 'android', lastUsed: Date.now() },
        { upsert: true, new: true }
      );
      
      res.status(200).json({
        success: true,
        message: 'Device token registered successfully',
        data: deviceToken
      });
    } catch (error) {
      console.error('Error registering device token:', error);
      res.status(500).json({ success: false, message: 'Failed to register device token', error: error.message });
    }
  },
  
  // Send notification to a specific user
  sendToUser: async (req, res) => {
    try {
      const { userId, title, body, data } = req.body;
      
      if (!userId || !title || !body) {
        return res.status(400).json({ 
          success: false, 
          message: 'User ID, title, and body are required' 
        });
      }
      
      // Find all device tokens for the user
      const deviceTokens = await DeviceToken.find({ user: userId });
      
      if (!deviceTokens.length) {
        return res.status(404).json({ 
          success: false, 
          message: 'No device tokens found for this user' 
        });
      }
      
      // Extract token strings
      const tokens = deviceTokens.map(device => device.token);
      
      // Create notification in database
      const notification = await Notification.create({
        user: userId,
        title,
        body,
        data: data || {}
      });
      
      // Prepare message for FCM
      const message = {
        notification: {
          title,
          body
        },
        data: {
          ...data,
          notificationId: notification._id.toString()
        },
        tokens: tokens
      };
      
      // Send via FCM
      const response = await admin.messaging().sendMulticast(message);
      
      res.status(200).json({
        success: true,
        message: `Successfully sent notification to ${response.successCount} devices`,
        failureCount: response.failureCount,
        results: response.responses,
        notification
      });
    } catch (error) {
      console.error('Error sending notification:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to send notification', 
        error: error.message 
      });
    }
  },
  
  // Send notification to multiple users
  sendToMultipleUsers: async (req, res) => {
    try {
      const { userIds, title, body, data } = req.body;
      
      if (!userIds || !Array.isArray(userIds) || !title || !body) {
        return res.status(400).json({ 
          success: false, 
          message: 'User IDs array, title, and body are required' 
        });
      }
      
      // Find all device tokens for the users
      const deviceTokens = await DeviceToken.find({ user: { $in: userIds } });
      
      if (!deviceTokens.length) {
        return res.status(404).json({ 
          success: false, 
          message: 'No device tokens found for these users' 
        });
      }
      
      // Extract token strings
      const tokens = deviceTokens.map(device => device.token);
      
      // Create notifications in database for each user
      const notifications = await Promise.all(
        userIds.map(userId => 
          Notification.create({
            user: userId,
            title,
            body,
            data: data || {}
          })
        )
      );
      
      // Prepare message for FCM
      const message = {
        notification: {
          title,
          body
        },
        data: {
          ...data,
          notificationType: 'general'
        },
        tokens: tokens
      };
      
      // Send via FCM
      const response = await admin.messaging().sendMulticast(message);
      
      res.status(200).json({
        success: true,
        message: `Successfully sent notification to ${response.successCount} devices`,
        failureCount: response.failureCount,
        results: response.responses,
        notifications
      });
    } catch (error) {
      console.error('Error sending notification to multiple users:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to send notification to multiple users', 
        error: error.message 
      });
    }
  },
  
  // Send notification based on topic (can be used for group notifications)
  sendToTopic: async (req, res) => {
    try {
      const { topic, title, body, data } = req.body;
      
      if (!topic || !title || !body) {
        return res.status(400).json({ 
          success: false, 
          message: 'Topic, title, and body are required' 
        });
      }
      
      // Prepare message for FCM
      const message = {
        notification: {
          title,
          body
        },
        data: {
          ...data,
          notificationType: topic
        },
        topic
      };
      
      // Send to topic
      const response = await admin.messaging().send(message);
      
      res.status(200).json({
        success: true,
        message: `Successfully sent notification to topic: ${topic}`,
        messageId: response
      });
    } catch (error) {
      console.error('Error sending notification to topic:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to send notification to topic', 
        error: error.message 
      });
    }
  },
  
  // Get user's notifications
  getUserNotifications: async (req, res) => {
    try {
      const userId = req.user.id; // Assuming authentication middleware sets req.user
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;
      
      const notifications = await Notification.find({ user: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
      
      const total = await Notification.countDocuments({ user: userId });
      
      res.status(200).json({
        success: true,
        count: notifications.length,
        total,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        notifications
      });
    } catch (error) {
      console.error('Error fetching user notifications:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to fetch notifications', 
        error: error.message 
      });
    }
  },
  
  // Mark notification as read
  markAsRead: async (req, res) => {
    try {
      const { notificationId } = req.params;
      const userId = req.user.id; // Assuming authentication middleware sets req.user
      
      const notification = await Notification.findOneAndUpdate(
        { _id: notificationId, user: userId },
        { isRead: true },
        { new: true }
      );
      
      if (!notification) {
        return res.status(404).json({ 
          success: false, 
          message: 'Notification not found or not authorized' 
        });
      }
      
      res.status(200).json({
        success: true,
        message: 'Notification marked as read',
        notification
      });
    } catch (error) {
      console.error('Error marking notification as read:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to mark notification as read', 
        error: error.message 
      });
    }
  },
  
  // Mark all notifications as read
  markAllAsRead: async (req, res) => {
    try {
      const userId = req.user.id; // Assuming authentication middleware sets req.user
      
      const result = await Notification.updateMany(
        { user: userId, isRead: false },
        { isRead: true }
      );
      
      res.status(200).json({
        success: true,
        message: `Marked ${result.modifiedCount} notifications as read`
      });
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to mark all notifications as read', 
        error: error.message 
      });
    }
  },
  
  // Delete a notification
  deleteNotification: async (req, res) => {
    try {
      const { notificationId } = req.params;
      const userId = req.user.id; // Assuming authentication middleware sets req.user
      
      const notification = await Notification.findOneAndDelete({ 
        _id: notificationId, 
        user: userId 
      });
      
      if (!notification) {
        return res.status(404).json({ 
          success: false, 
          message: 'Notification not found or not authorized' 
        });
      }
      
      res.status(200).json({
        success: true,
        message: 'Notification deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting notification:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to delete notification', 
        error: error.message 
      });
    }
  },
  
  // Helper function for sending notifications from within other controllers
  sendPushNotification: async (userId, title, body, data = {}) => {
    try {
      // Find all device tokens for the user
      const deviceTokens = await DeviceToken.find({ user: userId });
      
      if (!deviceTokens.length) {
        return { success: false, message: 'No device tokens found for this user' };
      }
      
      // Extract token strings
      const tokens = deviceTokens.map(device => device.token);
      
      // Create notification in database
      const notification = await Notification.create({
        user: userId,
        title,
        body,
        data
      });
      
      // Prepare message for FCM
      const message = {
        notification: {
          title,
          body
        },
        data: {
          ...data,
          notificationId: notification._id.toString()
        },
        tokens: tokens
      };
      
      // Send via FCM
      const response = await admin.messaging().sendMulticast(message);
      
      return {
        success: true,
        successCount: response.successCount,
        failureCount: response.failureCount,
        notification
      };
    } catch (error) {
      console.error('Error in sendPushNotification helper:', error);
      return { success: false, error: error.message };
    }
  }
};

module.exports = notificationController;