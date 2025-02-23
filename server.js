const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT;

// Middleware
app.use(express.json());
app.use(bodyParser.json());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected Successfully"))
  .catch(err => console.error("MongoDB Connection Error:", err));

// Import Routes
const userRoutes = require("./routes/userRoutes");
const eventRoutes = require("./routes/eventRoutes");
const clubRoutes = require("./routes/clubRoutes");
const authRoutes = require("./routes/authRoutes")

// Use Routes
app.use("/users", userRoutes);
app.use("/events", eventRoutes);
app.use("/clubs", clubRoutes);
app.use("/auth", authRoutes);

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
