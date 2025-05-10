const express = require("express");
const multer = require("multer");
const mongoose = require("mongoose");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000; // Corrected for Render compatibility

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));

// MongoDB connection
mongoose.connect("mongodb+srv://CbtDatabase:CbtData@cbt.wmzjxzk.mongodb.net/?retryWrites=true&w=majority&appName=Cbt", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log("Connected to MongoDB"))
  .catch(err => console.error("MongoDB connection failed:", err));

// Mongoose schema
const studentSchema = new mongoose.Schema({
  name: String,
  matric: String,
  department: String,
  phone: String,
  email: String,
  password: String,
  passport: String,
});

const Student = mongoose.model("Student", studentSchema);

// Multer config
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = "uploads";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + ext);
  },
});
const upload = multer({ storage });

// Department mapping
function getDepartmentFromMatric(matric) {
  const prefix = matric.split("/")[0];
  const map = {
    "S": "Science Laboratory Technology",
    "Cos": "Computer Science",
    "Coe": "Computer Engineering",
    "B": "Business Administration",
    "Est": "Estate Management",
    "E": "Electrical Engineering",
    "M": "Mass Communication",
    "A": "Accountancy",
    "Mlt": "Medical Laboratory Technology"
  };
  return map[prefix] || "Unknown";
}

// Register endpoint
app.post("/api/students/register", upload.single("passport"), async (req, res) => {
  const { name, matric, phone, email, password } = req.body;
  const passport = req.file ? req.file.filename : null;
  const department = getDepartmentFromMatric(matric);

  if (!name || !matric || !phone || !email || !password || !passport) {
    return res.status(400).json({ message: "All fields are required." });
  }

  const existing = await Student.findOne({ matric });
  if (existing) {
    return res.status(400).json({ message: "Matric number already registered." });
  }

  const student = new Student({ name, matric, department, phone, email, password, passport });
  await student.save();

  res.json({ message: "Student registered successfully.", student });
});

// Login endpoint
app.post("/api/students/login", async (req, res) => {
  const { matric, password } = req.body;
  const student = await Student.findOne({ matric, password });

  if (!student) {
    return res.status(401).json({ message: "Invalid matric number or password." });
  }

  res.json({ message: "Login successful", student });
});

app.listen(PORT, () => {
  console.log(`CBT server running at http://localhost:${PORT}`);
});

