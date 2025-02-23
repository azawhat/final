const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  surname: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }, 
  isAdmin: { type: Boolean, default: false },
  profilePicture: { type: Buffer },
  visitedEvents: [{ type: mongoose.Schema.Types.ObjectId, ref: "Event" }],
  joinedClubs: [{ type: mongoose.Schema.Types.ObjectId, ref: "Club" }], 
  createdAt: { type: Date, default: Date.now}
});

UserSchema.virtual("rating").get(async function () {
  const Event = mongoose.model("Event");

  const events = await Event.find({ creatorId: this._id }); 
  if (!events.length) return 0;

  const totalRatings = events.reduce((sum, event) => {
    if (event.ratings.length > 0) {
      return sum + event.ratings.reduce((a, b) => a + b, 0);
    }
    return sum;
  }, 0);

  const ratingCount = events.reduce((count, event) => count + event.ratings.length, 0);
  return ratingCount > 0 ? totalRatings / ratingCount : 0; 
});


module.exports = mongoose.model("User", UserSchema);
