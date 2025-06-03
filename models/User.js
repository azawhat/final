const mongoose = require("mongoose");
const crypto = require("crypto");

const UserSchema = new mongoose.Schema({
  // Basic user information
  name: { type: String, required: true },
  surname: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }, 
  isAdmin: { type: Boolean, default: false },
  profilePicture: { type: String },
  interestedTags: { type: [String] },
  createdAt: { type: Date, default: Date.now},

  // User preferences
  rating: { type: Number},
  visitedEvents: [{ type: mongoose.Schema.Types.ObjectId, ref: "Event" }],
  joinedClubs: [{ type: mongoose.Schema.Types.ObjectId, ref: "Club" }], 

  // FCM Token for push notifications
  fcmToken: { type: String },
  notificationSettings: {
    eventReminders: { type: Boolean, default: true },
    clubUpdates: { type: Boolean, default: true },
    generalNotifications: { type: Boolean, default: true }
  },

  // Email verification fields
  isEmailVerified: { type: Boolean, default: false },
  verificationCode: { type: String },
  verificationCodeExpires: { type: Date }
});

UserSchema.methods.generateVerificationCode = function() {
  const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
  
  this.verificationCode = verificationCode;
  this.verificationCodeExpires = Date.now() + 30 * 60 * 1000;
  
  return verificationCode;
};

module.exports = mongoose.model("User", UserSchema);