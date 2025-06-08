const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected Successfully"))
  .catch(err => console.error("MongoDB Connection Error:", err));

// Initialize notification processors
require('./workers/notificationProcessor');

// Import Routes
const userRoutes = require("./routes/userRoutes");
const eventRoutes = require("./routes/eventRoutes");
const clubRoutes = require("./routes/clubRoutes");
const authRoutes = require("./routes/authRoutes")
const searchRoutes = require('./routes/searchRoutes');
const profileRoutes = require("./routes/profileRoutes");
const applyRoutes = require("./routes/applyRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const EventExpirationService = require('./services/eventExpirationService');
const postRoutes = require("./routes/postRoutes");

// Use Routes
app.use("/users", userRoutes);
app.use("/events", eventRoutes);
app.use("/clubs", clubRoutes);
app.use("/auth", authRoutes);
app.use('/search', searchRoutes);
app.use("/profile", profileRoutes);
app.use("/applications", applyRoutes);
app.use("/notifications", notificationRoutes);
app.use("/posts", postRoutes);
EventExpirationService.initializeExistingEvents().catch(console.error);

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Notification system initialized');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});