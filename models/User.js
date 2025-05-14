const mongoose = require("mongoose");
const crypto = require("crypto");

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  surname: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  rating: { type: Number},
  password: { type: String, required: true }, 
  isAdmin: { type: Boolean, default: false },
  profilePicture: { type: Buffer },
  visitedEvents: [{ type: mongoose.Schema.Types.ObjectId, ref: "Event" }],
  joinedClubs: [{ type: mongoose.Schema.Types.ObjectId, ref: "Club" }], 
  createdAt: { type: Date, default: Date.now},
  // Email confirmation fields
  isEmailConfirmed: { type: Boolean, default: false },
  confirmationToken: { type: String },
  confirmationTokenExpires: { type: Date }
});

// Method to generate confirmation token
UserSchema.methods.generateConfirmationToken = function() {
  // Generate a random token
  const confirmationToken = crypto.randomBytes(32).toString('hex');
  
  // Set the token and expiration (24 hours)
  this.confirmationToken = confirmationToken;
  this.confirmationTokenExpires = Date.now() + 24 * 60 * 60 * 1000;
  
  return confirmationToken;
};

module.exports = mongoose.model("User", UserSchema);