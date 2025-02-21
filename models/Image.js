const mongoose = require("mongoose");

const ImageSchema = new mongoose.Schema({
  name: String,
  contentType: String,
  data: Buffer, // Store image as Buffer
});

module.exports = mongoose.model("Image", ImageSchema);
