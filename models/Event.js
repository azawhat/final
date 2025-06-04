const mongoose = require("mongoose");
const User = require("./User");

const EventSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  category: { type: String }, 
  eventTags: { type: String },
  eventPicture: { type: String },
  eventPosts : { type: String },
  eventProgramme: { type: String },
  isOpen: { type: Boolean, default: true },
  chatLink: { type: String },
  location: { type: String },
  eventRating: { type: Number, default: 0 },
  ratingCount: { type: Number, default: 0 },
  creator: {
    _id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true },
    surname: { type: String, required: true },
    username: { type: String, required: true },
  },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  attendance: [{
    _id: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  }],
  maxParticipants: { type: Number },
  location: { type: String },
  startDate: { type: String }
});

EventSchema.post("save", async function (doc) {
  try {
    
    // Find all events created by this user
    const events = await mongoose.model("Event").find({ "creator._id": doc.creator._id });
    
    // Only calculate from events that have been rated (ratingCount > 0)
    const ratedEvents = events.filter(event => (event.ratingCount || 0) > 0);
    
    if (ratedEvents.length > 0) {
      // Sum all event ratings and divide by number of rated events
      const totalRating = ratedEvents.reduce((sum, event) => {
        const rating = Number(event.eventRating) || 0;
        console.log(`Event "${event.name}" rating: ${rating}`);
        return sum + rating;
      }, 0);
      
      const newUserRating = totalRating / ratedEvents.length;
      const roundedRating = Math.round(newUserRating * 100) / 100;
      
      // Update the User model with the average rating of their events
      const updatedUser = await User.findByIdAndUpdate(
        doc.creator._id, 
        { rating: roundedRating },
        { new: true }
      );
      
    } else {
      // If no events are rated, set user rating to 0
      console.log(`No rated events found, setting user rating to 0`);
      await User.findByIdAndUpdate(doc.creator._id, { rating: 0 });
    }
  } catch (error) {
    console.error("Error updating user rating:", error);
  }
});

module.exports = mongoose.model("Event", EventSchema);