const mongoose = require("mongoose");

const teacherAttendanceRecordSchema = new mongoose.Schema(
  {
    rollId: {
      type: String,
      required: true,
      trim: true,
    },
    studentId: {
      type: String,
      required: true,
      trim: true,
    },
    studentName: {
      type: String,
      required: true,
      trim: true,
    },
    studentRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      default: null,
    },
    status: {
      type: String,
      enum: ["P", "A"],
      required: true,
    },
  },
  { _id: false }
);

const teacherAttendanceSessionSchema = new mongoose.Schema(
  {
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher",
      required: true,
      index: true,
    },
    courseCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    courseName: {
      type: String,
      required: true,
      trim: true,
    },
    semesterLabel: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    batch: {
      type: String,
      trim: true,
      default: "",
    },
    section: {
      type: String,
      required: true,
      index: true,
      trim: true,
      uppercase: true,
    },
    date: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    records: {
      type: [teacherAttendanceRecordSchema],
      default: [],
    },
    presentCount: {
      type: Number,
      min: 0,
      default: 0,
    },
    absentCount: {
      type: Number,
      min: 0,
      default: 0,
    },
    savedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: "teacher_attendance_sessions",
  }
);

teacherAttendanceSessionSchema.index({ courseId: 1, teacherId: 1, section: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("TeacherAttendanceSession", teacherAttendanceSessionSchema);
