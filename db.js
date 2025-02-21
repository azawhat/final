const mongoose = require("mongoose");

const MONGO_URI = "mongodb+srv://azamat:azamat@seeyadb.wkawg.mongodb.net/SeeYaDB?retryWrites=true&w=majority";

const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ MongoDB Connected Successfully");
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error);
    process.exit(1); // Stop the app if it can't connect to MongoDB
  }
};

module.exports = connectDB;
