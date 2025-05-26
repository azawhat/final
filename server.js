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

// Import Routes
const userRoutes = require("./routes/userRoutes");
const eventRoutes = require("./routes/eventRoutes");
const clubRoutes = require("./routes/clubRoutes");
const authRoutes = require("./routes/authRoutes")
const searchRoutes = require('./routes/searchRoutes');
const profileRoutes = require("./routes/profileRoutes");
const shareRoutes = require("./routes/shareRoutes");

// Use Routes
app.use("/users", userRoutes);
app.use("/events", eventRoutes);
app.use("/clubs", clubRoutes);
app.use("/auth", authRoutes);
app.use('/search', searchRoutes);
app.use("/profile", profileRoutes);
app.use("/share", shareRoutes);

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
