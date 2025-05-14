const mongoose = require("mongoose");
const User = require("./User");

const EventSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  category: { type: String }, 
  tags: { type: String },
  eventPicture: { type: String },
  isOpen: { type: Boolean, default: true },
  eventRating: { type: Number },
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
  startDate: { type: String },
  endDate: { type: String },
  createdAt: { type: Date, default: Date.now }
});

EventSchema.post("save", async function () {
  try {
    // Use this.creator._id instead of this.creatorId
    const events = await mongoose.model("Event").find({ "creator._id": this.creator._id });
    // Compute total rating and count of rated events
    const totalRatings = events.reduce((sum, event) => sum + (Number(event.eventRating) || 0), 0);
    const ratingCount = events.length;
    // Calculate the average rating
    const newRating = ratingCount > 0 ? totalRatings / ratingCount : 0;
    // Update the User model
    await User.findByIdAndUpdate(this.creator._id, { rating: newRating });
  } catch (error) {
    console.error("Error updating user rating:", error);
  }
});

// Create and export the Event model directly
module.exports = mongoose.model("Event", EventSchema);