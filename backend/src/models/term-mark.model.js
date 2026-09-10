const mongoose = require("mongoose");

const termMarkSchema = new mongoose.Schema(
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
    semesterLabel: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    attendanceMark: {
      type: Number,
      min: 0,
      default: 0,
    },
    ctMark: {
      type: Number,
      min: 0,
      default: 0,
    },
    termFinalMark: {
      type: Number,
      min: 0,
      default: 0,
    },
    totalMark: {
      type: Number,
      min: 0,
      default: 0,
    },
    gradePoint: {
      type: Number,
      min: 0,
      max: 4,
      default: 0,
    },
    letterGrade: {
      type: String,
      trim: true,
      default: "F",
    },
    updatedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: "term_marks",
  }
);

termMarkSchema.index({ studentId: 1, courseId: 1, semesterLabel: 1 }, { unique: true });

module.exports = mongoose.model("TermMark", termMarkSchema);
