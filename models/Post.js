const mongoose = require("mongoose");

const PostSchema = new mongoose.Schema({
  header: { type: String, required: true, trim: true, maxlength: 200
  },
    media: {
    type: [String],
    validate: {
        validator: function(v) {
        return v.length <= 3;
        },
        message: 'Maximum 3 media items allowed'
    }
    },
  text: { type: String, required: true, trim: true, maxlength: 2000},
  date: { type: String},
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required: true },
  likeCount: { type: Number, default: 0 },
  likes: [{userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }}]
});

PostSchema.index({ eventId: 1, date: -1 });
PostSchema.index({ authorId: 1 });

PostSchema.pre('save', function(next) {
  this.likeCount = this.likes.length;
  next();
});

module.exports = mongoose.model("Post", PostSchema);