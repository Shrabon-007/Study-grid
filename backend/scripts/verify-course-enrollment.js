const mongoose = require("mongoose");
require("dotenv").config();

const app = require("../src/app");
const { connectDatabase } = require("../src/config/db");
const User = require("../src/models/user.model");
const Student = require("../src/models/student.model");
const Teacher = require("../src/models/teacher.model");
const Course = require("../src/models/course.model");
const StudentCourse = require("../src/models/student-course.model");
const Attendance = require("../src/models/attendance.model");
const CtMark = require("../src/models/ct-mark.model");
const TeacherAttendanceSession = require("../src/models/teacher-attendance-session.model");

const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const studentBatch = "2022";
const teacherBatch = "22";
const semesterLabel = "Level-2 Term-1";
const courseCode = `VER-${suffix.slice(-6)}`;
const emails = [
  `teacher_${suffix}@verify.example`,
  `student_a_${suffix}@verify.example`,
  `student_b_${suffix}@verify.example`,
];

let server;

async function request(base, path, method, body, token) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${method} ${path}: ${payload.message || response.status}`);
  return payload;
}

async function register(base, body) {
  await request(base, "/api/auth/register", "POST", body);
  const login = await request(base, "/api/auth/login", "POST", {
    role: body.role,
    email: body.email,
    password: body.password,
  });
  return login.data.token;
}

async function cleanup() {
  const users = await User.find({ email: { $in: emails } }).select("_id");
  const userIds = users.map((item) => item._id);
  const students = await Student.find({ userId: { $in: userIds } }).select("_id");
  const studentIds = students.map((item) => item._id);
  const teachers = await Teacher.find({ userId: { $in: userIds } }).select("_id");
  const teacherIds = teachers.map((item) => item._id);
  const courses = await Course.find({ code: courseCode, batch: { $in: [studentBatch, teacherBatch] }, semesterLabel }).select("_id");
  const courseIds = courses.map((item) => item._id);

  await Promise.all([
    TeacherAttendanceSession.deleteMany({ courseId: { $in: courseIds } }),
    Attendance.deleteMany({ courseId: { $in: courseIds }, studentId: { $in: studentIds } }),
    CtMark.deleteMany({ courseId: { $in: courseIds }, studentId: { $in: studentIds } }),
    StudentCourse.deleteMany({ courseId: { $in: courseIds }, studentId: { $in: studentIds } }),
  ]);
  await Promise.all([
    Course.deleteMany({ _id: { $in: courseIds } }),
    Student.deleteMany({ _id: { $in: studentIds } }),
    Teacher.deleteMany({ _id: { $in: teacherIds } }),
    User.deleteMany({ _id: { $in: userIds } }),
  ]);
}

async function run() {
  await connectDatabase();
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const password = "VerifyPassword123!";

  const teacherToken = await register(base, {
    role: "teacher",
    name: "Verification Teacher",
    email: emails[0],
    password,
    teacherId: `TCH-${suffix}`,
    username: `teacher_${suffix}`,
    department: "CSE",
  });

  const studentAToken = await register(base, {
    role: "student",
    name: "Verification Student A",
    email: emails[1],
    password,
    studentId: `2201001-${suffix}`,
    batch: studentBatch,
    level: 2,
    term: 1,
    section: "A",
    department: "CSE",
  });
  const studentBToken = await register(base, {
    role: "student",
    name: "Verification Student B",
    email: emails[2],
    password,
    studentId: `2201002-${suffix}`,
    batch: studentBatch,
    level: 2,
    term: 1,
    section: "A",
    department: "CSE",
  });

  await request(base, "/api/portal/teacher/courses", "POST", {
    code: courseCode,
    name: "Verification Course",
    credit: 3,
    batch: teacherBatch,
    semesterLabel,
  }, teacherToken);

  const enrollment = { code: courseCode, name: "Verification Course", credit: 3, courseType: "theory", semesterLabel };
  await request(base, "/api/portal/student/courses", "POST", enrollment, studentAToken);
  await request(base, "/api/portal/student/courses", "POST", enrollment, studentBToken);

  const students = await request(base, `/api/portal/teacher/attendance/students?${new URLSearchParams({ courseCode, semesterLabel, batch: teacherBatch, section: "A" })}`, "GET", undefined, teacherToken);
  const enrolled = students.data.items;
  if (enrolled.length !== 2 || enrolled[0].studentId > enrolled[1].studentId) {
    throw new Error("Course enrollment did not return the two enrolled students in student-ID order.");
  }

  const attendanceRecords = enrolled.map((student, index) => ({ ...student, status: index === 0 ? "P" : "A" }));
  await request(base, "/api/portal/teacher/attendance", "POST", {
    courseCode,
    semesterLabel,
    batch: teacherBatch,
    section: "A",
    date: "2026-08-20",
    records: attendanceRecords,
  }, teacherToken);

  const ctRecords = enrolled.map((student, index) => ({ ...student, marks: index === 0 ? 18 : 16 }));
  await request(base, "/api/portal/teacher/ct-marks", "PUT", {
    courseCode,
    semesterLabel,
    batch: teacherBatch,
    section: "A",
    ctNumber: 1,
    records: ctRecords,
  }, teacherToken);

  const resultSheet = await request(base, `/api/portal/teacher/student-results?${new URLSearchParams({ courseCode, semesterLabel, batch: teacherBatch, section: "A" })}`, "GET", undefined, teacherToken);
  const resultItems = resultSheet.data.items;
  if (resultSheet.data.totalClasses !== 1 || resultItems.length !== 2 || resultItems[0]?.attendance?.present !== 1 || resultItems[0]?.attendance?.mark !== 30 || resultItems[1]?.attendance?.present !== 0 || resultItems[0]?.ct?.total !== 18 || resultItems[1]?.ct?.total !== 16) {
    throw new Error("Teacher result sheet did not return the saved attendance and CT results.");
  }

  const [studentAAttendance, studentACt, studentBAttendance, studentBCt] = await Promise.all([
    request(base, "/api/portal/student/attendance", "GET", undefined, studentAToken),
    request(base, "/api/portal/student/ct-marks", "GET", undefined, studentAToken),
    request(base, "/api/portal/student/attendance", "GET", undefined, studentBToken),
    request(base, "/api/portal/student/ct-marks", "GET", undefined, studentBToken),
  ]);

  if (studentAAttendance.data.items[0]?.attended !== 1 || studentBAttendance.data.items[0]?.attended !== 0) {
    throw new Error("Students did not receive their own attendance records.");
  }
  if (studentACt.data.items[0]?.ct?.[0] !== 18 || studentBCt.data.items[0]?.ct?.[0] !== 16) {
    throw new Error("Students did not receive their own CT marks.");
  }

  console.log("VERIFY: enrollment-driven teacher attendance and CT workflow passed");
}

run()
  .catch((error) => {
    console.error("VERIFY_ERROR:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await cleanup(); } catch (error) { console.error("VERIFY_CLEANUP_ERROR:", error.message); process.exitCode = 1; }
    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  });
