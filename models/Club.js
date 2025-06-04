const mongoose = require("mongoose");
const User = require("./User");

const ClubSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  clubPicture: { type: String },
  isOpen: { type: Boolean, default: true },
  category: { type: String },
  clubTag: { type: String },
  clubRating: { type: Number, default: 0 },
  ratingCount: { type: Number, default: 0 },
  creator: {
    _id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true },
    surname: { type: String, required: true },
    username: { type: String, required: true },
  },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }]
});



ClubSchema.post("save", async function (doc) {
  try {
    const clubs = await mongoose.model("Club").find({ "creator._id": doc.creator._id });

    const ratedClubs = clubs.filter(club => (club.ratingCount || 0) > 0);

    if (ratedClubs.length > 0) {
      const totalRating = ratedClubs.reduce((sum, club) => {
        const rating = Number(club.clubRating) || 0;
        console.log(`Club "${club.name}" rating: ${rating}`);
        return sum + rating;
      }, 0);

      const newUserRating = totalRating / ratedClubs.length;
      const roundedRating = Math.round(newUserRating * 100) / 100;

      const user = await User.findById(doc.creator._id);
      if (!user) {
        console.log("User not found");
        return;
      }

      const Event = mongoose.model("Event");
      const events = await Event.find({ "creator._id": doc.creator._id });
      const ratedEvents = events.filter(event => (event.ratingCount || 0) > 0);

      let finalUserRating = 0;
      let totalRatedItems = 0;

      if (ratedClubs.length > 0 && ratedEvents.length > 0) {
        const clubsTotal = ratedClubs.reduce((sum, club) => sum + (Number(club.clubRating) || 0), 0);
        const eventsTotal = ratedEvents.reduce((sum, event) => sum + (Number(event.eventRating) || 0), 0);
        
        totalRatedItems = ratedClubs.length + ratedEvents.length;
        finalUserRating = (clubsTotal + eventsTotal) / totalRatedItems;
        
      } else if (ratedClubs.length > 0) {
        finalUserRating = roundedRating;
        totalRatedItems = ratedClubs.length;
      } else if (ratedEvents.length > 0) {
        const eventsTotal = ratedEvents.reduce((sum, event) => sum + (Number(event.eventRating) || 0), 0);
        finalUserRating = eventsTotal / ratedEvents.length;
        totalRatedItems = ratedEvents.length;
      }

      if (totalRatedItems > 0) {
        const finalRoundedRating = Math.round(finalUserRating * 100) / 100;
        
        const updatedUser = await User.findByIdAndUpdate(
          doc.creator._id,
          { rating: finalRoundedRating },
          { new: true }
        );

        console.log(`Updated user rating to: ${updatedUser?.rating} (from ${totalRatedItems} rated items)`);
      }
    } else {
      const Event = mongoose.model("Event");
      const events = await Event.find({ "creator._id": doc.creator._id });
      const ratedEvents = events.filter(event => (event.ratingCount || 0) > 0);

      if (ratedEvents.length > 0) {
        const eventsTotal = ratedEvents.reduce((sum, event) => sum + (Number(event.eventRating) || 0), 0);
        const eventsAverage = eventsTotal / ratedEvents.length;
        const roundedRating = Math.round(eventsAverage * 100) / 100;

        await User.findByIdAndUpdate(doc.creator._id, { rating: roundedRating });
      } else {
        // No rated clubs or events, set user rating to 0
        console.log(`No rated clubs or events found, setting user rating to 0`);
        await User.findByIdAndUpdate(doc.creator._id, { rating: 0 });
      }
    }
  } catch (error) {
    console.error("Error updating user rating after club rating change:", error);
  }
});

module.exports = mongoose.model("Club", ClubSchema);