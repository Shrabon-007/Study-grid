const mongoose = require("mongoose");

const noticeSchema = new mongoose.Schema(
  {
    createdByAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      index: true,
    },
    createdByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    createdByTeacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher",
      default: null,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    target: {
      type: String,
      enum: ["students", "advisors", "students_advisors"],
      required: true,
      default: "students",
      index: true,
    },
    batch: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      default: null,
      index: true,
    },
    semesterLabel: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    priority: {
      type: String,
      enum: ["normal", "important", "urgent"],
      required: true,
      default: "normal",
      index: true,
    },
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "published",
      index: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
    publishedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: "notices",
  }
);

noticeSchema.index({ publishedAt: -1, priority: 1 });

module.exports = mongoose.model("Notice", noticeSchema);
