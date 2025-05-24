const mongoose = require('mongoose');

const ApplicationSchema = new mongoose.Schema({
  applicant: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  targetType: { type: String, enum: ['club', 'event'], required: true },
  targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
});

module.exports = mongoose.model('Application', ApplicationSchema);