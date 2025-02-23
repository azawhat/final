const mongoose = require("mongoose");

const ClubSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  clubPicture: { type: String }, 
  isClosed: {type: Boolean, default: false},
  category: { type: String },
  creator: { 
    _id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true },
    surname: { type: String, required: true },
    username: { type: String, required: true },
  },
  participants: [{ 
    _id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true },
    surname: { type: String, required: true },
    username: { type: String, required: true },
  }],
  createdAt: { type: Date, default: Date.now },
  deletedAt: { type: Date, default: null }
});

module.exports = mongoose.model("Club", ClubSchema);
