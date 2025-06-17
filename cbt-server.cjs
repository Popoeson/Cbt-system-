const express = require("express");
const multer = require("multer");
const mongoose = require("mongoose");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const csv = require("csv-writer");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));

// MongoDB connection
mongoose.connect("mongodb+srv://CbtDatabase:CbtData@cbt.wmzjxzk.mongodb.net/?retryWrites=true&w=majority&appName=Cbt", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(async () => {
  console.log("Connected to MongoDB");
  await Student.syncIndexes(); // call this after connecting to DB
  await startServer();
}).catch(err => {
  console.error("MongoDB connection failed:", err);
});

// Mongoose Schemas
const studentSchema = new mongoose.Schema({
  name: String,
  matric: {
    type: String,
    required: true,
    unique: true,
  },
  department: String,
  level: {
  type: String,
  enum: ['ND1','ND2','HND1','HND2'],
  required: true
  },
  level: string,
  phone: String,
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: String,
  passport: String
});

const tokenSchema = new mongoose.Schema({
  studentName: String,
  studentEmail: String,
  amount: Number,
  reference: String,
  token: String,
  status: {
    type: String,
    enum: ['pending', 'success', 'used'],
    default: 'pending',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Token = mongoose.model("Token", tokenSchema);
const examSchema = new mongoose.Schema({
  course: String,
  courseCode: String,
  department: String,
  level: String,
  duration: Number,
  numQuestions: Number,
});

const questionSchema = new mongoose.Schema({
  courseCode: String,
  course: String,
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

// School Schema
const schoolSchema = new mongoose.Schema({
  name: String,
  address: String,
  email: String,
  logo: String,
});

const Student = mongoose.model("Student", studentSchema);
const Exam = mongoose.model("Exam", examSchema);
const Question = mongoose.model("Question", questionSchema);
const Result = mongoose.model("Result", resultSchema);
const School = mongoose.model("School", schoolSchema);

// Session tracking
const studentSessions = new Set();

// Ensure uploads folder exists
const uploadDir = "uploads";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

// Department mapping
function getDepartmentAndLevelFromMatric(matric) {
  if (matric.startsWith("HND/")) {
    // HND student format: HND/23/01/001
    const parts = matric.split("/");
    const deptCode = parts[2]; // e.g., "01"

    const hndMap = {
      "01": "Accountancy",
      "02": "Biochemistry",
      "03": "Business Administration",
      "04": "Computer Engineering",
      "05": "Computer Science",
      "06": "Electrical Engineering",
      "07": "Mass Communication",
      "08": "Microbiology"
    };

    return {
      department: hndMap[deptCode] || "Unknown",
      level: "HND"
    };

  } else {
    // ND student format: e.g., Cos/023456
    const prefix = matric.split("/")[0];
    const ndMap = {
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

    return {
      department: ndMap[prefix] || "Unknown",
      level: "ND"
    };
  }
      }
  //Student Registration 
  app.post("/api/students/register", upload.single("passport"), async (req, res) => {
  const { name, matric, phone, email, password, token, level } = req.body;
  const passport = req.file ? req.file.filename : null;

  if (!name || !matric || !phone || !email || !password || !passport || !token || !level) {
    return res.status(400).json({ message: "All fields and token are required." });
  }

  try {
    // Check token validity
    const validToken = await Token.findOne({ token, status: 'success' });

    if (!validToken) {
      return res.status(400).json({ message: "Invalid or already used token." });
    }

    // Check for duplicates
    const existingStudent = await Student.findOne({
      $or: [{ matric }, { email }]
    });

    if (existingStudent) {
      return res.status(409).json({
        message:
          existingStudent.matric === matric
            ? "A student with this matric number already exists."
            : "A student with this email already exists."
      });
    }

    // Detect department and level
    const { department, level } = getDepartmentAndLevelFromMatric(matric);

    // Save student
    const newStudent = new Student({
      name,
      matric,
      department,
      level, // <-- save the level too
      phone,
      email,
      password,
      passport
    });

    await newStudent.save();

    // Mark token as used
    validToken.status = 'used';
    await validToken.save();

    res.status(201).json({ message: "Student registered successfully." });

  } catch (err) {
    console.error("Error registering student:", err);
    res.status(500).json({ message: "Server error. Please try again." });
  }
});
  // Student Login
  app.post("/api/students/login", async (req, res) => {
    const { matric, password } = req.body;
    const student = await Student.findOne({ matric, password });

    if (!student) {
      return res.status(401).json({ message: "Invalid matric number or password." });
    }

    studentSessions.add(matric);
    res.json({ message: "Login successful", student });
  });

  // Student Dashboard
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
      res.status(500).json({ message: "Failed to load dashboard" });
    }
  });

  // Create Exam
  app.post("/api/exams", async (req, res) => {
    const { course, courseCode, department, level, duration, numQuestions } = req.body;

    if (!course || !courseCode || !department || !level || !duration || !numQuestions) {
      return res.status(400).json({ message: "All fields are required." });
    }

    const existing = await Exam.findOne({ courseCode });
    if (existing) {
      return res.status(409).json({ message: "Exam already exists for this course code." });
    }

    const exam = new Exam({ course, courseCode, department, level, duration, numQuestions });
    await exam.save();

    res.json({ message: "Exam created", exam });
  });

  // Save Questions
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

  // List Exams
  app.get("/api/exams", async (req, res) => {
    try {
      const exams = await Exam.find();
      res.json(exams);
    } catch (err) {
      res.status(500).json({ message: "Unable to fetch exam list." });
    }
  });

  // Get Course List for Frontend
  app.get("/api/questions/courses", async (req, res) => {
    try {
      const exams = await Exam.find({}, "course courseCode");
      const courses = exams.map((exam) => ({
        title: exam.course,
        code: exam.courseCode
      }));

      res.json({ courses });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch courses." });
    }
  });

  // Load Questions for a Course
  app.get("/api/exams/:courseCode/questions", async (req, res) => {
    const { courseCode } = req.params;
    try {
      const questions = await Question.find({ courseCode });
      res.json({ courseCode, questions });
    } catch (err) {
      res.status(500).json({ message: "Failed to load questions." });
    }
  });

  // Submit Exam
  app.post("/api/exams/:courseCode/submit", async (req, res) => {
    const { courseCode } = req.params;
    const { studentMatric, answers } = req.body;

    if (!studentMatric || !answers || typeof answers !== "object") {
      return res.status(400).json({ message: "Invalid submission data." });
    }

    try {
      const questions = await Question.find({ courseCode });
      let score = 0;
      questions.forEach((q) => {
        if (answers[q._id] && answers[q._id] === q.correctAnswer) {
          score++;
        }
      });

      const result = new Result({
        studentMatric,
        courseCode,
        score,
        total: questions.length,
      });

      await result.save();

      res.json({
        message: "Exam submitted successfully",
        score,
        total: questions.length,
      });
    } catch (err) {
      res.status(500).json({ message: "Failed to submit exam." });
    }
  });

  // Get JSON results with student details
  app.get("/api/results", async (req, res) => {
    try {
      const results = await Result.find();
      const students = await Student.find();

      const enriched = results.map(result => {
        const student = students.find(s => s.matric === result.studentMatric);
        return {
          name: student?.name || "Unknown",
          matric: result.studentMatric,
          department: student?.department || "Unknown",
          courseCode: result.courseCode,
          score: result.score,
          total: result.total,
        };
      });

      res.json(enriched);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch results" });
    }
  });

  // Download results as CSV
  app.get("/api/results/download", async (req, res) => {
    try {
      const submissions = await Result.find();
      const students = await Student.find();

      const records = submissions.map(sub => {
        const student = students.find(s => s.matric === sub.studentMatric);
        return {
          Name: student?.name || "",
          Matric: sub.studentMatric,
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
        if (!err) fs.unlinkSync(filePath);
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to generate result CSV" });
    }
  });

  // ===== School Registration =====
  app.post("/api/schools/register", upload.single("logo"), async (req, res) => {
    try {
      const { name, address, email } = req.body;
      const logo = req.file ? req.file.filename : null;

      if (!name || !address || !email || !logo) {
        return res.status(400).json({ message: "All fields are required." });
      }

      const school = new School({ name, address, email, logo });
      await school.save();

      res.json({ message: "School registered successfully.", school });
    } catch (err) {
      res.status(500).json({ error: "Failed to register school." });
    }
  });

  app.get("/api/schools", async (req, res) => {
    try {
      const schools = await School.find();
      const formatted = schools.map((s) => ({
        ...s._doc,
        logo: s.logo ? `${req.protocol}://${req.get("host")}/uploads/${s.logo}` : null,
      }));
      res.json({ schools: formatted });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch schools." });
    }
  });

  // Start Server
  app.listen(PORT, () => {
    console.log(`CBT server running at http://localhost:${PORT}`);
  });
