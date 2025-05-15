const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true
  },
  body: {
    type: String,
    required: true
  },
  data: {
    type: Object,
    default: {}
  },
  isRead: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const deviceTokenSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  token: {
    type: String,
    required: true
  },
  deviceType: {
    type: String,
    enum: ['android', 'ios'],
    default: 'android'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastUsed: {
    type: Date,
    default: Date.now
  }
});

// Create unique index on user and token fields
deviceTokenSchema.index({ user: 1, token: 1 }, { unique: true });

const Notification = mongoose.model('Notification', notificationSchema);
const DeviceToken = mongoose.model('DeviceToken', deviceTokenSchema);

module.exports = { Notification, DeviceToken };