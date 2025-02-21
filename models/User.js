const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phoneNumber: { type: String },
  isAdmin: { type: Boolean, default: false },
  picture: { type: Buffer}, // URL of the avatar image
  visitedEvents: [{ type: mongoose.Schema.Types.ObjectId, ref: "Event" }], // Array of event IDs
  joinedClubs: [{ type: mongoose.Schema.Types.ObjectId, ref: "Club" }], // Array of club IDs
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("User", UserSchema);
