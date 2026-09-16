const mongoose = require("mongoose");

const teacherSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    teacherId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true,
      index: true,
      maxlength: 60,
    },
    username: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
      maxlength: 60,
    },
    department: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    isAdvisor: {
      type: Boolean,
      default: false,
      index: true,
    },
    batchFocus: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
    collection: "teachers",
  }
);

module.exports = mongoose.model("Teacher", teacherSchema);
