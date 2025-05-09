
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const studentRoutes = require("./routes/students");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

mongoose.connect("mongodb://localhost:27017/cbt", {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log("MongoDB connected"))
  .catch(err => console.error("MongoDB error:", err));

app.use(cors());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/api/students", studentRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
