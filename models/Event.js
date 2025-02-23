const mongoose = require("mongoose");

const EventSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  category: { type: String },
  eventPicture: { type: String}, 
  isClosed: { type: Boolean, default: false },
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
  maxParticipants: { type: Number },
  location: { type: String },
  startDate: { type: Date },
  endDate: { type: Date},
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Event", EventSchema);
