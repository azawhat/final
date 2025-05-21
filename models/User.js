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
  profilePicture: { type: Buffer },
  interestedTags: { type: String},
  createdAt: { type: Date, default: Date.now},
  
  // User preferences
  rating: { type: Number},
  visitedEvents: [{ type: mongoose.Schema.Types.ObjectId, ref: "Event" }],
  joinedClubs: [{ type: mongoose.Schema.Types.ObjectId, ref: "Club" }], 


  // Email verification fields
  isEmailVerified: { type: Boolean, default: false },
  verificationCode: { type: String },
  verificationCodeExpires: { type: Date }
});

// Method to generate verification code
UserSchema.methods.generateVerificationCode = function() {
  // Generate a 6-digit numeric code
  const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
  
  // Set the code and expiration (30 minutes)
  this.verificationCode = verificationCode;
  this.verificationCodeExpires = Date.now() + 30 * 60 * 1000;
  
  return verificationCode;
};

module.exports = mongoose.model("User", UserSchema);