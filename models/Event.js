const mongoose = require("mongoose");
const User = require("./User");

const EventSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  category: { type: String }, 
  eventTags: { type: String },
  eventPicture: { type: String },
  isOpen: { type: Boolean, default: true },
  isActive: { type: Boolean, default: true }, 
  location: { type: String },
  locationCoordinates: { type: String },
  eventRating: { type: Number},
  ratingCount: { type: Number, default: 0 },
  media: [{ type : String }],
  // Add the missing participantsRating field
  participantsRating: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    rating: { type: Number, required: true, min: 1, max: 5 }
  }],
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
  startDate: { type: String, required: true },
  posts: [{ type: mongoose.Schema.Types.ObjectId, ref: "Post" }]
});

EventSchema.post("save", async function (doc) {
  try {
    const events = await mongoose.model("Event").find({ "creator._id": doc.creator._id });

    // Use participantsRating length instead of ratingCount for more accuracy
    const ratedEvents = events.filter(event => 
      event.participantsRating && 
      Array.isArray(event.participantsRating) && 
      event.participantsRating.length > 0
    );

    const Club = mongoose.model("Club");
    const clubs = await Club.find({ "creator._id": doc.creator._id });
    
    // Assuming clubs have similar structure, adjust accordingly
    const ratedClubs = clubs.filter(club => 
      (club.participantsRating && Array.isArray(club.participantsRating) && club.participantsRating.length > 0) ||
      (club.ratingCount && club.ratingCount > 0)
    );

    let finalUserRating = 0;
    let totalRatedItems = 0;

    if (ratedEvents.length > 0 && ratedClubs.length > 0) {
      const eventsTotal = ratedEvents.reduce((sum, event) => sum + (Number(event.eventRating) || 0), 0);
      const clubsTotal = ratedClubs.reduce((sum, club) => sum + (Number(club.clubRating) || 0), 0);
      
      totalRatedItems = ratedEvents.length + ratedClubs.length;
      finalUserRating = (eventsTotal + clubsTotal) / totalRatedItems;
      
    } else if (ratedEvents.length > 0) {
      const eventsTotal = ratedEvents.reduce((sum, event) => sum + (Number(event.eventRating) || 0), 0);
      finalUserRating = eventsTotal / ratedEvents.length;
      totalRatedItems = ratedEvents.length;

    } else if (ratedClubs.length > 0) {
      const clubsTotal = ratedClubs.reduce((sum, club) => sum + (Number(club.clubRating) || 0), 0);
      finalUserRating = clubsTotal / ratedClubs.length;
      totalRatedItems = ratedClubs.length;
    }

    if (totalRatedItems > 0) {
      const finalRoundedRating = Math.round(finalUserRating * 100) / 100;

      const updatedUser = await User.findByIdAndUpdate(
        doc.creator._id,
        { rating: finalRoundedRating },
        { new: true }
      );
      
    } else {
      console.log(`No rated events or clubs found, setting user rating to 0`);
      await User.findByIdAndUpdate(doc.creator._id, { rating: 0 });
    }
  } catch (error) {
    console.error("Error updating user rating:", error);
  }
});

module.exports = mongoose.model("Event", EventSchema);