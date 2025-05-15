const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');

const authMiddleware  = require("../middleware/authMiddleware");

// Register device token
router.post('/register-token', authMiddleware, notificationController.registerToken);

// Send notification to a specific user
router.post('/send-to-user', authMiddleware, notificationController.sendToUser);

// Send notification to multiple users
router.post('/send-to-multiple', authMiddleware, notificationController.sendToMultipleUsers);

// Send notification based on topic
router.post('/send-to-topic', authMiddleware, notificationController.sendToTopic);

// Get user's notifications
router.get('/user', authMiddleware, notificationController.getUserNotifications);

// Mark notification as read
router.put('/:notificationId/read', authMiddleware, notificationController.markAsRead);

// Mark all notifications as read
router.put('/mark-all-read', authMiddleware, notificationController.markAllAsRead);

// Delete a notification
router.delete('/:notificationId', authMiddleware, notificationController.deleteNotification);

module.exports = router;