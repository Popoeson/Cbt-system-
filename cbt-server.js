const express = require("express");
const cors = require("cors");
const multer = require("multer");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");
const csv = require("csv-writer");

const app = express();
app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use("/uploads", express.static("uploads"));

// Connect to MongoDB
mongoose.connect("mongodb+srv://CbtDatabase:CbtData@cbt.wmzjxzk.mongodb.net/?retryWrites=true&w=majority&appName=Cbt", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log("Connected to MongoDB"))
  .catch(err => console.error("MongoDB connection failed:", err));

// Storage for passport photos
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage });

// Student schema
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

// Course schema
const courseSchema = new mongoose.Schema({
  courseCode: String,
  courseTitle: String,
});
const Course = mongoose.model("Course", courseSchema);

// Question schema
const questionSchema = new mongoose.Schema({
  courseCode: String,
  question: String,
  options: {
    a: String,
    b: String,
    c: String,
    d: String,
  },
  correctAnswer: String,
});
const Question = mongoose.model("Question", questionSchema);

// Submission schema
const submissionSchema = new mongoose.Schema({
  matric: String,
  courseCode: String,
  answers: Object,
  score: Number,
});
const Submission = mongoose.model("Submission", submissionSchema);

// Detect department based on matric prefix
function detectDepartment(matric) {
  if (matric.startsWith("S/")) return "Science Lab Tech";
  if (matric.startsWith("Cos/")) return "Computer Science";
  if (matric.startsWith("Coe/")) return "Computer Engineering";
  if (matric.startsWith("B/")) return "Business Admin";
  if (matric.startsWith("Est/")) return "Estate Management";
  if (matric.startsWith("E/")) return "Electrical Engineering";
  if (matric.startsWith("M/")) return "Mass Communication";
  if (matric.startsWith("A/")) return "Accountancy";
  if (matric.startsWith("Mlt/")) return "Medical Lab Tech";
  return "Unknown";
}

// Register a new student
app.post("/api/students/register", upload.single("passport"), async (req, res) => {
  try {
    const { name, matric, phone, email, password } = req.body;
    const department = detectDepartment(matric);
    const passport = req.file ? req.file.path : "";

    const student = new Student({ name, matric, department, phone, email, password, passport });
    await student.save();

    res.status(201).json({ message: "Student registered successfully" });
  } catch (error) {
    res.status(500).json({ error: "Registration failed" });
  }
});

// Student login (plaintext password check)
app.post("/api/students/login", async (req, res) => {
  try {
    const { matric, password } = req.body;
    const student = await Student.findOne({ matric });

    if (!student) return res.status(404).json({ error: "Student not found" });
    if (student.password !== password) return res.status(401).json({ error: "Invalid password" });

    res.status(200).json({ message: "Login successful", student });
  } catch (error) {
    res.status(500).json({ error: "Login failed" });
  }
});

// Create a course
app.post("/api/courses", async (req, res) => {
  try {
    const { courseCode, courseTitle } = req.body;
    const course = new Course({ courseCode, courseTitle });
    await course.save();
    res.status(201).json({ message: "Course created" });
  } catch (error) {
    res.status(500).json({ error: "Failed to create course" });
  }
});

// Get all courses
app.get("/api/courses", async (req, res) => {
  const courses = await Course.find();
  res.json(courses);
});

// Add a question to a course
app.post("/api/questions", async (req, res) => {
  try {
    const { courseCode, question, options, correctAnswer } = req.body;
    const newQuestion = new Question({ courseCode, question, options, correctAnswer });
    await newQuestion.save();
    res.status(201).json({ message: "Question saved" });
  } catch (error) {
    res.status(500).json({ error: "Failed to save question" });
  }
});

// Get questions by course code
app.get("/api/questions/:courseCode", async (req, res) => {
  const questions = await Question.find({ courseCode: req.params.courseCode });
  res.json(questions);
});

// Submit exam answers and calculate score
app.post("/api/submissions", async (req, res) => {
  try {
    const { matric, courseCode, answers } = req.body;
    const questions = await Question.find({ courseCode });

    let score = 0;
    questions.forEach(q => {
      const studentAnswer = answers[q._id];
      if (studentAnswer && studentAnswer === q.correctAnswer) score++;
    });

    const submission = new Submission({ matric, courseCode, answers, score });
    await submission.save();

    res.status(200).json({ message: "Submission saved", score });
  } catch (error) {
    res.status(500).json({ error: "Failed to save submission" });
  }
});

// Download result as CSV
app.get("/api/results/download", async (req, res) => {
  try {
    const submissions = await Submission.find();
    const students = await Student.find();

    const records = submissions.map(sub => {
      const student = students.find(s => s.matric === sub.matric);
      return {
        Name: student?.name || "",
        Matric: sub.matric,
        Department: student?.department || "",
        CourseCode: sub.courseCode,
        Score: sub.score,
      };
    });

    const filePath = path.join(__dirname, "results.csv");
    const writer = csv.createObjectCsvWriter({
      path: filePath,
      header: [
        { id: "Name", title: "Name" },
        { id: "Matric", title: "Matric" },
        { id: "Department", title: "Department" },
        { id: "CourseCode", title: "Course Code" },
        { id: "Score", title: "Score" },
      ],
    });

    await writer.writeRecords(records);

    res.download(filePath, "results.csv", (err) => {
      if (!err) fs.unlinkSync(filePath); // Delete file after sending
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to generate result CSV" });
  }
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`CBT server running on port ${PORT}`));
