const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher",
      default: null,
      index: true,
    },
    batch: {
      type: String,
      trim: true,
      default: "",
    },
    section: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },
    semesterLabel: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    classStates: {
      type: [
        {
          type: String,
          enum: ["P", "A", "-"],
        },
      ],
      default: [],
    },
    classesHeld: {
      type: Number,
      min: 0,
      default: 0,
    },
    attended: {
      type: Number,
      min: 0,
      default: 0,
    },
    percentage: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    predictedMark: {
      type: Number,
      min: 0,
      max: 40,
      default: 0,
    },
    publishedByTeacher: {
      type: Boolean,
      default: false,
      index: true,
    },
    risk: {
      type: String,
      enum: ["good", "watch", "critical"],
      default: "watch",
      index: true,
    },
  },
  {
    timestamps: true,
    collection: "attendance",
  }
);

attendanceSchema.index({ studentId: 1, courseId: 1, semesterLabel: 1 }, { unique: true });

module.exports = mongoose.model("Attendance", attendanceSchema);
