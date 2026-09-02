const mongoose = require("mongoose");

const ctMarkSchema = new mongoose.Schema(
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
    ct1: {
      type: Number,
      min: 0,
      max: 20,
      default: 0,
    },
    ct2: {
      type: Number,
      min: 0,
      max: 20,
      default: 0,
    },
    ct3: {
      type: Number,
      min: 0,
      max: 20,
      default: 0,
    },
    ct4: {
      type: Number,
      min: 0,
      max: 20,
      default: 0,
    },
    ct5: {
      type: Number,
      min: 0,
      max: 20,
      default: 0,
    },
    totalCt: {
      type: Number,
      min: 0,
      max: 5,
      default: 0,
    },
    bestCount: {
      type: Number,
      min: 0,
      max: 5,
      default: 0,
    },
    maxMarks: {
      type: Number,
      min: 0,
      max: 80,
      default: 0,
    },
    total: {
      type: Number,
      min: 0,
      max: 80,
      default: 0,
    },
    publishedByTeacher: {
      type: Boolean,
      default: false,
      index: true,
    },
    performance: {
      type: String,
      enum: ["strong", "average", "low"],
      default: "average",
      index: true,
    },
  },
  {
    timestamps: true,
    collection: "ct_marks",
  }
);

ctMarkSchema.index({ studentId: 1, courseId: 1, semesterLabel: 1 }, { unique: true });

module.exports = mongoose.model("CtMark", ctMarkSchema);
