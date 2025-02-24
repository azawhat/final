const mongoose = require("mongoose");

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
  createdAt: { type: Date, default: Date.now}
});

module.exports = mongoose.model("User", UserSchema);
