const mongoose = require("mongoose");

const ClubSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  clubPicture: { type: Buffer }, 
  isClosed: {type: Boolean, default: false},
  creatorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  createdAt: { type: Date, default: Date.now },
  deletedAt: { type: Date, default: null }
});

module.exports = mongoose.model("Club", ClubSchema);
