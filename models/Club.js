const mongoose = require("mongoose");

const ClubSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  clubPicture: { type: String }, 
  isOpen: {type: Boolean, default: true},
  category: { type: String },
  clubTag : { type: String },
  creator: {
    _id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true },
    surname: { type: String, required: true },
    username: { type: String, required: true },
  },
  participants: [ { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }]
});

module.exports = mongoose.model("Club", ClubSchema);
