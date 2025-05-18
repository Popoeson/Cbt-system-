const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const { Parser } = require("json2csv");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));

// Multer for passport uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

// MongoDB connection
mongoose.connect("mongodb+srv://CbtDatabase:CbtData@cbt.wmzjxzk.mongodb.net/?retryWrites=true&w=majority&appName=Cbt", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log("Connected to MongoDB"))
  .catch(err => console.error("MongoDB connection failed:", err));

// Schemas
const studentSchema = new mongoose.Schema({
  name: String,
  matric: { type: String, unique: true },
  department: String,
  phone: String,
  email: String,
  password: String,
  passport: String,
});

const examSchema = new mongoose.Schema({
  course: String,
  courseCode: String,
  questions: [
    {
      question: String,
      options: [String],
      answer: String,
    },
  ],
});

const questionSchema = new mongoose.Schema({
  courseCode: String,
  course: String, // NEW: to help carry course title
  questionText: String,
  options: {
    a: String,
    b: String,
    c: String,
    d: String,
  },
  correctAnswer: String,
});

const resultSchema = new mongoose.Schema({
  studentMatric: String,
  courseCode: String,
  score: Number,
  total: Number,
  timestamp: { type: Date, default: Date.now },
});

// Models
const Student = mongoose.model("Student", studentSchema);
const Exam = mongoose.model("Exam", examSchema);
const Question = mongoose.model("Question", questionSchema);
const Result = mongoose.model("Result", resultSchema);


// Session tracking
const studentSessions = new Set();

// Ensure uploads folder exists
const uploadDir = "uploads";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Multer config
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
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

// Student Registration
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

// Login
app.post("/api/students/login", async (req, res) => {
  try {
    const { matric, password } = req.body;
    const student = await Student.findOne({ matric, password });
    if (!student) return res.status(401).json({ message: "Invalid login" });
    res.json({ message: "Login successful", student });
  } catch (err) {
    res.status(500).json({ message: "Login error" });
  }
});

// Dashboard
app.get("/api/students/dashboard", async (req, res) => {
  try {
    const students = await Student.find().select("-password");
    const formatted = students.map((s) => ({
      ...s._doc,
      passport: s.passport ? `${req.protocol}://${req.get("host")}/uploads/${s.passport}` : null
    }));

    res.json({
      students: formatted,
      sessions: Array.from(studentSessions),
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).json({ message: "Failed to load dashboard" });
  }
});

// Store Exam Course
app.post("/api/exams", async (req, res) => {
  const { course, courseCode, numQuestions } = req.body;

  if (!course || !courseCode || !numQuestions) {
    return res.status(400).json({ message: "All fields are required." });
  }

  const existing = await Exam.findOne({ courseCode });
  if (existing) {
    return res.status(409).json({ message: "Exam already exists for this course code." });
  }

  const exam = new Exam({ course, courseCode, numQuestions });
  await exam.save();

  res.json({ message: "Exam created", exam });
});

// Store Exam Questions & Auto-create Exam Entry
app.post("/api/exams/:courseCode/questions", async (req, res) => {
  const { courseCode } = req.params;
  const { questions } = req.body;

  if (!Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ message: "No questions provided." });
  }

  const courseTitle = questions[0]?.course || "Untitled Course";

  const formatted = questions.map(q => ({
    courseCode,
    course: q.course || courseTitle,
    questionText: q.questionText,
    options: q.options,
    correctAnswer: q.correctAnswer
  }));

  await Question.insertMany(formatted);

  let exam = await Exam.findOne({ courseCode });
  if (!exam) {
    const newExam = new Exam({
      course: courseTitle,
      courseCode,
      numQuestions: formatted.length
    });
    await newExam.save();
  }

  res.json({ message: "Questions saved successfully" });
});

// Fetch All Exams
app.get("/api/exams", async (req, res) => {
  try {
    const exams = await Exam.find();
    res.json(exams);
  } catch (err) {
    console.error("Error fetching exams:", err);
    res.status(500).json({ message: "Unable to fetch exam list." });
  }
});

// Fetch All Courses (used in exam-courses.html)
app.get("/api/questions/courses", async (req, res) => {
  try {
    const exams = await Exam.find({}, "course courseCode");
    const courses = exams.map((exam) => ({
      title: exam.course,
      code: exam.courseCode
    }));

    res.json({ courses });
  } catch (error) {
    console.error("Failed to fetch courses:", error);
    res.status(500).json({ message: "Failed to fetch courses." });
  }
});

// Fetch Questions for Exam
app.get("/api/exams/:courseCode/questions", async (req, res) => {
  const { courseCode } = req.params;
  try {
    const questions = await Question.find({ courseCode });
    res.json({ courseCode, questions });
  } catch (err) {
    console.error("Error fetching questions:", err);
    res.status(500).json({ message: "Failed to load questions." });
  }
});
// Submit Exam – Prevent Duplicates
app.post("/api/submissions", async (req, res) => {
  try {
    const { studentMatric, courseCode, answers } = req.body;

    const existing = await Result.findOne({ studentMatric, courseCode });
    if (existing) return res.status(400).json({ message: "Already submitted." });

    const exam = await Exam.findOne({ courseCode });
    if (!exam) return res.status(404).json({ message: "Exam not found" });

    let score = 0;
    for (let i = 0; i < exam.questions.length; i++) {
      if (answers[i] && answers[i] === exam.questions[i].answer) score++;
    }

    const result = new Result({ studentMatric, courseCode, score, total: exam.questions.length });
    await result.save();

    res.json({ message: "Submission successful" });
  } catch (err) {
    console.error("Submit error:", err);
    res.status(500).json({ message: "Submit error" });
  }
});

// Fetch Results (Search)
app.get("/api/results", async (req, res) => {
  try {
    const { matric, name, courseCode } = req.query;

    const studentFilter = {};
    if (matric) studentFilter.matric = new RegExp(matric, "i");
    if (name) studentFilter.name = new RegExp(name, "i");

    const students = await Student.find(studentFilter);
    const exams = await Exam.find({}, "course courseCode");
    const results = await Result.find();

    const response = [];

    students.forEach(student => {
      results
        .filter(r => r.studentMatric === student.matric && (!courseCode || r.courseCode === courseCode))
        .forEach(r => {
          const exam = exams.find(e => e.courseCode === r.courseCode);
          response.push({
            name: student.name,
            matric: student.matric,
            department: student.department,
            course: exam?.course || "Unknown",
            courseCode: r.courseCode,
            score: r.score,
            total: r.total,
            timestamp: r.timestamp,
            passport: student.passport
              ? `${req.protocol}://${req.get("host")}/uploads/${student.passport}`
              : null,
          });
        });
    });

    res.json({ results: response });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch results" });
  }
});

// Download Results as CSV
app.get("/api/results/download", async (req, res) => {
  try {
    const { matric, name, courseCode } = req.query;

    const studentFilter = {};
    if (matric) studentFilter.matric = new RegExp(matric, "i");
    if (name) studentFilter.name = new RegExp(name, "i");

    const students = await Student.find(studentFilter);
    const exams = await Exam.find({}, "course courseCode");
    const results = await Result.find();

    const data = [];

    students.forEach(student => {
      results
        .filter(r => r.studentMatric === student.matric && (!courseCode || r.courseCode === courseCode))
        .forEach(r => {
          const exam = exams.find(e => e.courseCode === r.courseCode);
          data.push({
            Name: student.name,
            Matric: student.matric,
            Department: student.department,
            Course: exam?.course || "Unknown",
            CourseCode: r.courseCode,
            Score: r.score,
            Total: r.total,
            Timestamp: r.timestamp.toLocaleString(),
          });
        });
    });

    const parser = new Parser();
    const csv = parser.parse(data);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=results.csv");
    res.status(200).send(csv);
  } catch (err) {
    res.status(500).json({ message: "CSV generation failed" });
  }
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`CBT backend running on port ${PORT}`));
