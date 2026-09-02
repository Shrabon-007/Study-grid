const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    studentId: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    serialNo: {
      type: Number,
      min: 1,
      sparse: true,
      index: true,
    },
    batch: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    level: {
      type: Number,
      min: 1,
      max: 8,
      default: 1,
      index: true,
    },
    term: {
      type: Number,
      min: 1,
      max: 2,
      default: 1,
      index: true,
    },
    section: {
      type: String,
      trim: true,
      uppercase: true,
      default: "A",
      index: true,
    },
    department: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
    collection: "students",
  }
);

studentSchema.index({ batch: 1, section: 1, studentId: 1 });

module.exports = mongoose.model("Student", studentSchema);
