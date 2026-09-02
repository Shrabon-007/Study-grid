const mongoose = require("mongoose");
require("dotenv").config();

const User = require("../src/models/user.model");
const Student = require("../src/models/student.model");
const Advisor = require("../src/models/advisor.model");
const Admin = require("../src/models/admin.model");
const Teacher = require("../src/models/teacher.model");

const Course = require("../src/models/course.model");
const StudentCourse = require("../src/models/student-course.model");
const Attendance = require("../src/models/attendance.model");
const CtMark = require("../src/models/ct-mark.model");
const SemesterSetup = require("../src/models/semester-setup.model");
const SemesterCgpa = require("../src/models/semester-cgpa.model");
const Notice = require("../src/models/notice.model");
const AdvisorAssignment = require("../src/models/advisor-assignment.model");
const Message = require("../src/models/message.model");
const TeacherAttendanceSession = require("../src/models/teacher-attendance-session.model");

const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/academicradar";

async function syncModel(model) {
  await model.createCollection().catch(() => {
    // Collection may already exist.
  });
  await model.syncIndexes();
  console.log("DB_SYNC:", model.collection.collectionName);
}

const batchAliases = (value) => {
  const normalized = String(value || "").trim().replace(/^batch\s*/i, "");
  const aliases = new Set(normalized ? [normalized] : []);
  if (/^\d{4}$/.test(normalized) && normalized.startsWith("20")) aliases.add(normalized.slice(-2));
  if (/^\d{2}$/.test(normalized)) aliases.add(`20${normalized}`);
  return [...aliases];
};

async function reconcileLegacyCourseEnrollments() {
  const sources = await Course.find({ teacherId: null });
  const result = { courses: 0, enrollments: 0, attendance: 0, ctMarks: 0, sessions: 0 };

  for (const source of sources) {
    const targets = await Course.find({
      _id: { $ne: source._id },
      code: source.code,
      semesterLabel: source.semesterLabel,
      batch: { $in: batchAliases(source.batch) },
      teacherId: { $ne: null },
    }).limit(2);
    if (targets.length !== 1) continue;
    const target = targets[0];

    const enrollments = await StudentCourse.find({ courseId: source._id });
    for (const enrollment of enrollments) {
      const duplicate = await StudentCourse.findOne({
        studentId: enrollment.studentId,
        courseId: target._id,
        semesterLabel: enrollment.semesterLabel,
      });
      if (duplicate) await StudentCourse.deleteOne({ _id: enrollment._id });
      else {
        enrollment.courseId = target._id;
        await enrollment.save();
      }
      result.enrollments += 1;
    }

    const attendanceRows = await Attendance.find({ courseId: source._id });
    for (const row of attendanceRows) {
      const duplicate = await Attendance.findOne({ studentId: row.studentId, courseId: target._id, semesterLabel: row.semesterLabel });
      if (duplicate) await Attendance.deleteOne({ _id: row._id });
      else {
        row.courseId = target._id;
        row.teacherId = target.teacherId;
        row.batch = target.batch;
        await row.save();
      }
      result.attendance += 1;
    }

    const ctRows = await CtMark.find({ courseId: source._id });
    for (const row of ctRows) {
      const duplicate = await CtMark.findOne({ studentId: row.studentId, courseId: target._id, semesterLabel: row.semesterLabel });
      if (duplicate) await CtMark.deleteOne({ _id: row._id });
      else {
        row.courseId = target._id;
        row.teacherId = target.teacherId;
        row.batch = target.batch;
        await row.save();
      }
      result.ctMarks += 1;
    }

    const sessions = await TeacherAttendanceSession.find({ courseId: source._id });
    for (const session of sessions) {
      const duplicate = await TeacherAttendanceSession.findOne({
        courseId: target._id,
        teacherId: target.teacherId,
        section: session.section,
        date: session.date,
      });
      if (duplicate) await TeacherAttendanceSession.deleteOne({ _id: session._id });
      else {
        session.courseId = target._id;
        session.teacherId = target.teacherId;
        session.batch = target.batch;
        await session.save();
      }
      result.sessions += 1;
    }

    await Course.deleteOne({ _id: source._id });
    result.courses += 1;
  }

  return result;
}

async function run() {
  await mongoose.connect(uri);

  const models = [
    User,
    Student,
    Advisor,
    Admin,
    Teacher,
    Course,
    StudentCourse,
    Attendance,
    CtMark,
    SemesterSetup,
    SemesterCgpa,
    Notice,
    AdvisorAssignment,
    Message,
    TeacherAttendanceSession,
  ];

  for (const model of models) {
    await syncModel(model);
  }

  // Profiles created before section, level, and term were introduced are
  // assigned the previous portal defaults. Teachers can then query them using
  // the same enrollment + batch + section workflow as newly registered users.
  const profileBackfill = await Student.updateMany(
    {
      $or: [
        { level: { $exists: false } },
        { term: { $exists: false } },
        { section: { $exists: false } },
        { section: "" },
      ],
    },
    [
      {
        $set: {
          level: { $ifNull: ["$level", 1] },
          term: { $ifNull: ["$term", 1] },
          section: {
            $cond: [
              { $or: [{ $eq: ["$section", null] }, { $eq: ["$section", ""] }] },
              "A",
              "$section",
            ],
          },
        },
      },
    ],
    { updatePipeline: true }
  );
  console.log(`DB_BACKFILL: studentProfiles=${profileBackfill.modifiedCount || 0}`);

  const enrollmentReconciliation = await reconcileLegacyCourseEnrollments();
  console.log(`DB_RECONCILE: courses=${enrollmentReconciliation.courses} enrollments=${enrollmentReconciliation.enrollments} attendance=${enrollmentReconciliation.attendance} ctMarks=${enrollmentReconciliation.ctMarks} sessions=${enrollmentReconciliation.sessions}`);

  console.log("DB_SYNC_DONE: frontend-driven schema is ready");
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error("DB_SYNC_ERROR:", error.message);
  try {
    await mongoose.disconnect();
  } catch (err) {
    // ignore disconnect errors
  }
  process.exit(1);
});
