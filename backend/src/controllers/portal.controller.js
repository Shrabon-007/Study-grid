const mongoose = require("mongoose");
const User = require("../models/user.model");
const Student = require("../models/student.model");
const Advisor = require("../models/advisor.model");
const Admin = require("../models/admin.model");
const Teacher = require("../models/teacher.model");

const Course = require("../models/course.model");
const StudentCourse = require("../models/student-course.model");
const Attendance = require("../models/attendance.model");
const CtMark = require("../models/ct-mark.model");
const SemesterSetup = require("../models/semester-setup.model");
const SemesterCgpa = require("../models/semester-cgpa.model");
const Notice = require("../models/notice.model");
const AdvisorAssignment = require("../models/advisor-assignment.model");
const Message = require("../models/message.model");
const TeacherAttendanceSession = require("../models/teacher-attendance-session.model");

const normalize = (value) => String(value || "").trim();
const normalizeLower = (value) => normalize(value).toLowerCase();

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeBatchValue = (value) => normalize(value).replace(/^batch\s*/i, "").trim();

// Older data used short batch labels (for example, "22") while newer
// profiles commonly use the full admission year ("2022"). Treat these forms
// as aliases only for course-enrollment matching.
const getBatchAliases = (value) => {
  const normalized = normalizeBatchValue(value);
  const aliases = new Set(normalized ? [normalized] : []);
  if (/^\d{4}$/.test(normalized) && normalized.startsWith("20")) aliases.add(normalized.slice(-2));
  if (/^\d{2}$/.test(normalized)) aliases.add(`20${normalized}`);
  return [...aliases];
};

const batchesMatch = (left, right) => {
  const rightAliases = new Set(getBatchAliases(right));
  return getBatchAliases(left).some((value) => rightAliases.has(value));
};

const toBatchMongoMatch = (value) => {
  const aliases = getBatchAliases(value);
  return { $in: aliases.map(toBatchPattern) };
};

const toBatchPattern = (batchValue) => {
  const normalized = normalizeBatchValue(batchValue);
  const escaped = escapeRegex(normalized);
  return new RegExp("^(batch\\s*)?" + escaped + "$", "i");
};

const toComparableStudentNumber = (student) => {
  if (!student) return null;
  if (Number.isFinite(Number(student.serialNo)) && Number(student.serialNo) > 0) {
    return Number(student.serialNo);
  }
  const numeric = String(student.studentId || "").replace(/\D/g, "");
  return numeric ? Number(numeric) : null;
};

const toNoticeTarget = (target) => {
  const value = normalizeLower(target);
  if (value === "advisors") return "advisors";
  if (value === "students + advisors" || value === "students_advisors") return "students_advisors";
  return "students";
};

const toNoticePriority = (priority) => {
  const value = normalizeLower(priority);
  if (value === "urgent") return "urgent";
  if (value === "important") return "important";
  return "normal";
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value || 0)));

const getCtPolicy = (courseType, credit) => {
  const type = String(courseType || "theory").toLowerCase();
  const c = Number(credit || 0);

  if (type === "lab") {
    return { totalCt: 0, bestCount: 0, maxMarks: 0, label: "No CT (Lab)" };
  }
  if (c >= 4) {
    return { totalCt: 5, bestCount: 4, maxMarks: 80, label: "5 CT, best 4 (80)" };
  }
  if (c >= 3) {
    return { totalCt: 4, bestCount: 3, maxMarks: 60, label: "4 CT, best 3 (60)" };
  }
  if (c >= 2) {
    return { totalCt: 3, bestCount: 2, maxMarks: 40, label: "3 CT, best 2 (40)" };
  }
  return { totalCt: 0, bestCount: 0, maxMarks: 0, label: "No CT" };
};

const getAttendanceMaxMark = (credit, courseType) => {
  const type = String(courseType || "theory").toLowerCase();
  const value = Number(credit || 0);
  if (type === "lab") return Math.round(value * 10);
  if (value >= 4) return 40;
  if (value >= 3) return 30;
  if (value >= 2) return 20;
  return Math.round(value * 10);
};

const getAttendanceMark = (percentage, credit, courseType) => {
  const maxMark = getAttendanceMaxMark(credit, courseType);
  if (percentage >= 90) return Math.round(maxMark * 1.0);
  if (percentage >= 85) return Math.round(maxMark * 0.9);
  if (percentage >= 80) return Math.round(maxMark * 0.8);
  if (percentage >= 75) return Math.round(maxMark * 0.7);
  if (percentage >= 70) return Math.round(maxMark * 0.6);
  if (percentage >= 65) return Math.round(maxMark * 0.5);
  if (percentage >= 60) return Math.round(maxMark * 0.4);
  return 0;
};

const getAttendanceRisk = (percentage, classesHeld = 0) => {
  if (classesHeld === 0) return "watch";
  if (percentage >= 90) return "good";
  if (percentage >= 75) return "watch";
  if (percentage >= 60) return "watch";
  return "critical";
};

const getCtPerformance = (earned, maxMarks) => {
  if (!maxMarks || earned === 0) return "average";
  const ratio = earned / maxMarks;
  if (ratio >= 0.8) return "strong";
  if (ratio >= 0.6) return "average";
  return "low";
};

const resolveCourseForStudent = async (studentId, semesterLabel, courseCode) => {
  const normalizedCode = normalize(courseCode).toUpperCase();
  if (!normalizedCode) return null;

  const studentCourse = await StudentCourse.findOne({ studentId, semesterLabel })
    .populate({
      path: "courseId",
      match: { code: normalizedCode },
    });

  if (studentCourse && studentCourse.courseId) {
    return studentCourse.courseId;
  }

  return Course.findOne({ code: normalizedCode, semesterLabel });
};

const withContext = async (req) => {
  const user = await User.findById(req.auth.sub);
  if (!user) return { user: null, student: null, advisor: null, admin: null, teacher: null };

  const [student, advisor, admin, teacher] = await Promise.all([
    Student.findOne({ userId: user._id }),
    Advisor.findOne({ userId: user._id }),
    Admin.findOne({ userId: user._id }),
    Teacher.findOne({ userId: user._id }),
  ]);

  return { user, student, advisor, admin, teacher };
};

const ensureRole = (res, user, roles) => {
  if (!user || !roles.includes(user.role)) {
    res.status(403).json({ success: false, message: "Forbidden for this role." });
    return false;
  }
  return true;
};

const getStudentCourses = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["student"])) return;
    if (!ctx.student) {
      return res.status(404).json({ success: false, message: "Student profile not found." });
    }

    const rows = await StudentCourse.find({ studentId: ctx.student._id })
      .populate("courseId")
      .sort({ createdAt: -1 });

    const items = rows.map((row) => ({
      id: row._id,
      semesterLabel: row.semesterLabel,
      status: row.status,
      course: row.courseId
        ? {
            id: row.courseId._id,
            code: row.courseId.code,
            name: row.courseId.name,
            credit: row.courseId.credit,
            courseType: row.courseId.courseType,
            teacherName: row.courseId.teacherName,
            teacherNames: row.courseId.teacherNames || [],
          }
        : null,
    }));

    return res.status(200).json({ success: true, data: { items } });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not load courses.", error: error.message });
  }
};

const addStudentCourse = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["student"])) return;
    if (!ctx.student) {
      return res.status(404).json({ success: false, message: "Student profile not found." });
    }

    const code = normalize(req.body.code).toUpperCase();
    const name = normalize(req.body.name);
    const semesterLabel = normalize(req.body.semesterLabel || req.body.semester) || "Level-1 Term-1";
    const credit = Number(req.body.credit || 0);
    const courseType = normalizeLower(req.body.courseType || "theory");

    if (!code) return res.status(400).json({ success: false, message: "Course code is required." });

    const courseBatch = normalizeBatchValue(ctx.student.batch);
    const offeringFilter = { code, semesterLabel, batch: courseBatch };
    const teacherOffering = await Course.findOne({
      code,
      semesterLabel,
      batch: { $in: getBatchAliases(courseBatch) },
      teacherId: { $ne: null },
    });
    if (!teacherOffering && (!name || !credit)) {
      return res.status(400).json({ success: false, message: "Course name and credit are required until a teacher creates this course offering." });
    }
    if (!teacherOffering && !["theory", "lab"].includes(courseType)) {
      return res.status(400).json({ success: false, message: "courseType must be theory or lab." });
    }
    // When a teacher has published this offering, enrollment must retain that
    // teacher's course details instead of allowing a student to overwrite them.
    const course = teacherOffering || await Course.findOneAndUpdate(
      offeringFilter,
      {
        $set: {
          code,
          name,
          credit,
          courseType,
          teacherName: "",
          teacherNames: [],
          department: ctx.student.department || "",
          batch: courseBatch,
          semesterLabel,
        },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );

    const existingLink = await StudentCourse.findOne({ studentId: ctx.student._id, courseId: course._id, semesterLabel });
    if (!existingLink) {
      const activeCount = await StudentCourse.countDocuments({
        studentId: ctx.student._id,
        semesterLabel,
        status: "active",
      });
      if (activeCount >= 10) {
        return res.status(400).json({
          success: false,
          message: "You can add maximum 10 courses in one semester.",
        });
      }
    }

    const studentCourse = await StudentCourse.findOneAndUpdate(
      { studentId: ctx.student._id, courseId: course._id, semesterLabel },
      { $set: { status: "active" } },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );

    return res.status(201).json({
      success: true,
      message: "Course saved.",
      data: {
        id: studentCourse._id,
        semesterLabel,
        status: studentCourse.status,
        course: {
          id: course._id,
          code: course.code,
          name: course.name,
          credit: course.credit,
          courseType: course.courseType,
          teacherName: course.teacherName,
          teacherNames: course.teacherNames || [],
        },
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not save course.", error: error.message });
  }
};

const updateStudentCourse = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["student"])) return;
    if (!ctx.student) {
      return res.status(404).json({ success: false, message: "Student profile not found." });
    }

    const studentCourseId = normalize(req.params.courseId);
    if (!studentCourseId) {
      return res.status(400).json({ success: false, message: "courseId is required." });
    }

    const studentCourse = await StudentCourse.findOne({ _id: studentCourseId, studentId: ctx.student._id }).populate("courseId");
    if (!studentCourse) {
      return res.status(404).json({ success: false, message: "Course row not found." });
    }

    const oldCourse = studentCourse.courseId;
    const oldSemesterLabel = studentCourse.semesterLabel;
    if (oldCourse && oldCourse.teacherId) {
      return res.status(403).json({
        success: false,
        message: "Teacher-published course details can only be changed by its teacher.",
      });
    }

    const code = normalize(req.body.code || (oldCourse && oldCourse.code)).toUpperCase();
    const name = normalize(req.body.name || (oldCourse && oldCourse.name));
    const semesterLabel = normalize(req.body.semesterLabel || req.body.semester || oldSemesterLabel);
    const credit = Number(req.body.credit !== undefined ? req.body.credit : (oldCourse && oldCourse.credit));
    const courseType = normalizeLower(req.body.courseType || (oldCourse && oldCourse.courseType) || "theory");

    if (!code || !semesterLabel) {
      return res.status(400).json({ success: false, message: "Course code and semester are required." });
    }

    const courseBatch = normalizeBatchValue(ctx.student.batch);
    const offeringFilter = { code, semesterLabel, batch: courseBatch };
    const teacherOffering = await Course.findOne({
      code,
      semesterLabel,
      batch: { $in: getBatchAliases(courseBatch) },
      teacherId: { $ne: null },
    });
    if (!teacherOffering && (!name || !credit)) {
      return res.status(400).json({ success: false, message: "Course name and credit are required until a teacher creates this course offering." });
    }
    if (!teacherOffering && !["theory", "lab"].includes(courseType)) {
      return res.status(400).json({ success: false, message: "courseType must be theory or lab." });
    }

    const targetCourse = teacherOffering || await Course.findOneAndUpdate(
      { ...offeringFilter, teacherId: null },
      {
        $set: {
          code,
          name,
          credit,
          courseType,
          teacherName: "",
          teacherNames: [],
          department: ctx.student.department || "",
          batch: courseBatch,
          semesterLabel,
        },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );

    const isChangingSemester = semesterLabel !== oldSemesterLabel;
    const isChangingCourse = String(targetCourse._id) !== String(oldCourse ? oldCourse._id : "");
    if (isChangingSemester || isChangingCourse) {
      const activeCount = await StudentCourse.countDocuments({
        studentId: ctx.student._id,
        semesterLabel,
        status: "active",
        _id: { $ne: studentCourse._id },
      });
      if (activeCount >= 10) {
        return res.status(400).json({
          success: false,
          message: "You can add maximum 10 courses in one semester.",
        });
      }
    }

    const duplicate = await StudentCourse.findOne({
      studentId: ctx.student._id,
      courseId: targetCourse._id,
      semesterLabel,
      _id: { $ne: studentCourse._id },
    });
    if (duplicate) {
      return res.status(409).json({ success: false, message: "This course already exists in the selected semester." });
    }

    studentCourse.courseId = targetCourse._id;
    studentCourse.semesterLabel = semesterLabel;
    studentCourse.status = "active";
    await studentCourse.save();

    await Promise.all([
      Attendance.updateMany(
        { studentId: ctx.student._id, courseId: oldCourse ? oldCourse._id : null, semesterLabel: oldSemesterLabel },
        { $set: { courseId: targetCourse._id, semesterLabel } }
      ),
      CtMark.updateMany(
        { studentId: ctx.student._id, courseId: oldCourse ? oldCourse._id : null, semesterLabel: oldSemesterLabel },
        { $set: { courseId: targetCourse._id, semesterLabel } }
      ),
    ]);

    return res.status(200).json({
      success: true,
      message: "Course updated.",
      data: {
        id: studentCourse._id,
        semesterLabel,
        status: studentCourse.status,
        course: {
          id: targetCourse._id,
          code: targetCourse.code,
          name: targetCourse.name,
          credit: targetCourse.credit,
          courseType: targetCourse.courseType,
          teacherName: targetCourse.teacherName,
          teacherNames: targetCourse.teacherNames || [],
        },
      },
    });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({ success: false, message: "This course already exists in the selected semester." });
    }
    return res.status(500).json({ success: false, message: "Could not update course.", error: error.message });
  }
};

const deleteStudentCourse = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["student"])) return;
    if (!ctx.student) {
      return res.status(404).json({ success: false, message: "Student profile not found." });
    }

    const studentCourseId = normalize(req.params.courseId);
    if (!studentCourseId) {
      return res.status(400).json({ success: false, message: "courseId is required." });
    }

    const studentCourse = await StudentCourse.findOne({
      _id: studentCourseId,
      studentId: ctx.student._id,
    });

    if (!studentCourse) {
      return res.status(404).json({ success: false, message: "Course row not found." });
    }

    await Promise.all([
      Attendance.deleteMany({
        studentId: ctx.student._id,
        courseId: studentCourse.courseId,
        semesterLabel: studentCourse.semesterLabel,
      }),
      CtMark.deleteMany({
        studentId: ctx.student._id,
        courseId: studentCourse.courseId,
        semesterLabel: studentCourse.semesterLabel,
      }),
      StudentCourse.deleteOne({ _id: studentCourse._id }),
    ]);

    return res.status(200).json({ success: true, message: "Course deleted." });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not delete course.", error: error.message });
  }
};

const clearStudentSemesterData = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["student"])) return;
    if (!ctx.student) {
      return res.status(404).json({ success: false, message: "Student profile not found." });
    }

    const semesterLabel = normalize(req.body.semesterLabel || req.body.semester);
    if (!semesterLabel) {
      return res.status(400).json({ success: false, message: "semesterLabel is required." });
    }

    const [deletedCourses, deletedAttendance, deletedCt, deletedSetup, deletedSemesterCgpa] = await Promise.all([
      StudentCourse.deleteMany({ studentId: ctx.student._id, semesterLabel }),
      Attendance.deleteMany({ studentId: ctx.student._id, semesterLabel }),
      CtMark.deleteMany({ studentId: ctx.student._id, semesterLabel }),
      SemesterSetup.deleteMany({ studentId: ctx.student._id, semesterLabel }),
      SemesterCgpa.deleteMany({ studentId: ctx.student._id, semesterLabel }),
    ]);

    return res.status(200).json({
      success: true,
      message: "Current semester data cleared.",
      data: {
        semesterLabel,
        deleted: {
          courses: deletedCourses.deletedCount || 0,
          attendance: deletedAttendance.deletedCount || 0,
          ctMarks: deletedCt.deletedCount || 0,
          semesterSetup: deletedSetup.deletedCount || 0,
          semesterCgpa: deletedSemesterCgpa.deletedCount || 0,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not clear semester data.", error: error.message });
  }
};

const getSemesterSetup = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["student"])) return;
    if (!ctx.student) {
      return res.status(404).json({ success: false, message: "Student profile not found." });
    }

    const items = await SemesterSetup.find({ studentId: ctx.student._id }).sort({ updatedAt: -1 });
    return res.status(200).json({ success: true, data: { items } });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not load semester setup.", error: error.message });
  }
};

const saveSemesterSetup = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["student"])) return;
    if (!ctx.student) {
      return res.status(404).json({ success: false, message: "Student profile not found." });
    }

    const semesterLabel = normalize(req.body.semesterLabel || req.body.semester);
    const totalCredit = Number(req.body.totalCredit || 0);
    const targetCgpa = Number(req.body.targetCgpa || 0);

    if (!semesterLabel) {
      return res.status(400).json({ success: false, message: "semester is required." });
    }

    const setup = await SemesterSetup.findOneAndUpdate(
      { studentId: ctx.student._id, semesterLabel },
      {
        $set: {
          totalCredit,
          targetCgpa,
          updatedByUserId: ctx.user._id,
        },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );

    return res.status(200).json({ success: true, message: "Semester setup saved.", data: setup });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not save semester setup.", error: error.message });
  }
};

const getSemesterCgpa = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["student"])) return;
    if (!ctx.student) {
      return res.status(404).json({ success: false, message: "Student profile not found." });
    }

    const items = await SemesterCgpa.find({ studentId: ctx.student._id }).sort({ updatedAt: -1 });
    return res.status(200).json({ success: true, data: { items } });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not load semester CGPA.", error: error.message });
  }
};

const saveSemesterCgpa = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["student"])) return;
    if (!ctx.student) {
      return res.status(404).json({ success: false, message: "Student profile not found." });
    }

    const semesterLabel = normalize(req.body.semesterLabel || req.body.semester);
    const cgpa = Number(req.body.cgpa || 0);
    const note = normalize(req.body.note);

    if (!semesterLabel || !cgpa) {
      return res.status(400).json({ success: false, message: "semester and cgpa are required." });
    }

    const previous = await SemesterCgpa.findOne({ studentId: ctx.student._id, semesterLabel: { $ne: semesterLabel } }).sort({ updatedAt: -1 });
    let trend = "stable";
    if (previous) {
      if (cgpa > previous.cgpa) trend = "up";
      if (cgpa < previous.cgpa) trend = "down";
    }

    const item = await SemesterCgpa.findOneAndUpdate(
      { studentId: ctx.student._id, semesterLabel },
      {
        $set: {
          cgpa,
          note,
          trend,
          updatedByUserId: ctx.user._id,
        },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );

    return res.status(200).json({ success: true, message: "Semester CGPA saved.", data: item });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not save semester CGPA.", error: error.message });
  }
};

const getStudentAttendance = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["student"])) return;
    if (!ctx.student) {
      return res.status(404).json({ success: false, message: "Student profile not found." });
    }

    const semesterLabel = normalize(req.query.semesterLabel || req.query.semester || "");
    const query = { studentId: ctx.student._id, publishedByTeacher: true };
    if (semesterLabel) query.semesterLabel = semesterLabel;

    const rows = await Attendance.find(query).populate("courseId").sort({ updatedAt: -1 });
    const items = rows.map((row) => {
      const credit = row.courseId ? row.courseId.credit : 0;
      const courseType = row.courseId ? row.courseId.courseType : "theory";
      return {
        id: row._id,
        semesterLabel: row.semesterLabel,
        course: row.courseId
          ? {
              id: row.courseId._id,
              code: row.courseId.code,
              name: row.courseId.name,
              credit: row.courseId.credit,
              courseType: row.courseId.courseType,
            }
          : null,
        classStates: row.classStates,
        classesHeld: row.classesHeld,
        attended: row.attended,
        percentage: row.percentage,
        predictedMark: row.predictedMark,
        maxMark: getAttendanceMaxMark(credit, courseType),
        risk: row.risk,
      };
    });

    return res.status(200).json({ success: true, data: { items } });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not load attendance.", error: error.message });
  }
};

const saveStudentAttendance = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["student"])) return;
    return res.status(403).json({
      success: false,
      message: "Attendance is published by the course teacher and cannot be changed by students.",
    });

    const semesterLabel = normalize(req.body.semesterLabel || req.body.semester);
    const courseCode = normalize(req.body.courseCode || req.body.code).toUpperCase();
    const statesRaw = Array.isArray(req.body.classStates) ? req.body.classStates : [];

    if (!semesterLabel || !courseCode) {
      return res.status(400).json({ success: false, message: "semesterLabel and courseCode are required." });
    }

    const course = await resolveCourseForStudent(ctx.student._id, semesterLabel, courseCode);
    if (!course) {
      return res.status(404).json({ success: false, message: "Course not found for this student/semester." });
    }

    const classStates = statesRaw.map((state) => {
      const normalized = normalize(state).toUpperCase();
      if (normalized === "P" || normalized === "A") return normalized;
      return "-";
    });

    const present = classStates.filter((x) => x === "P").length;
    const absent = classStates.filter((x) => x === "A").length;
    const held = present + absent;
    const percentage = held ? Math.round((present / held) * 100) : 0;
    const predictedMark = getAttendanceMark(percentage, course.credit, course.courseType);
    const risk = getAttendanceRisk(percentage, held);

    const item = await Attendance.findOneAndUpdate(
      { studentId: ctx.student._id, courseId: course._id, semesterLabel },
      {
        $set: {
          classStates,
          classesHeld: held,
          attended: present,
          percentage,
          predictedMark,
          risk,
        },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );

    return res.status(200).json({
      success: true,
      message: "Attendance saved.",
      data: {
        id: item._id,
        semesterLabel,
        course: {
          id: course._id,
          code: course.code,
          name: course.name,
          credit: course.credit,
          courseType: course.courseType,
        },
        classStates: item.classStates,
        classesHeld: item.classesHeld,
        attended: item.attended,
        percentage: item.percentage,
        predictedMark: item.predictedMark,
        maxMark: getAttendanceMaxMark(course.credit, course.courseType),
        risk: item.risk,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not save attendance.", error: error.message });
  }
};

const getStudentCtMarks = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["student"])) return;
    if (!ctx.student) {
      return res.status(404).json({ success: false, message: "Student profile not found." });
    }

    const semesterLabel = normalize(req.query.semesterLabel || req.query.semester || "");
    const query = { studentId: ctx.student._id, publishedByTeacher: true };
    if (semesterLabel) query.semesterLabel = semesterLabel;

    const rows = await CtMark.find(query).populate("courseId").sort({ updatedAt: -1 });
    const items = rows.map((row) => ({
      id: row._id,
      semesterLabel: row.semesterLabel,
      course: row.courseId
        ? {
            id: row.courseId._id,
            code: row.courseId.code,
            name: row.courseId.name,
            credit: row.courseId.credit,
            courseType: row.courseId.courseType,
          }
        : null,
      ct: [row.ct1, row.ct2, row.ct3, row.ct4, row.ct5],
      totalCt: row.totalCt,
      bestCount: row.bestCount,
      maxMarks: row.maxMarks,
      total: row.total,
      performance: row.performance,
    }));

    return res.status(200).json({ success: true, data: { items } });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not load CT marks.", error: error.message });
  }
};

const saveStudentCtMarks = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["student"])) return;
    return res.status(403).json({
      success: false,
      message: "CT marks are published by the course teacher and cannot be changed by students.",
    });

    const semesterLabel = normalize(req.body.semesterLabel || req.body.semester);
    const courseCode = normalize(req.body.courseCode || req.body.code).toUpperCase();

    if (!semesterLabel || !courseCode) {
      return res.status(400).json({ success: false, message: "semesterLabel and courseCode are required." });
    }

    const course = await resolveCourseForStudent(ctx.student._id, semesterLabel, courseCode);
    if (!course) {
      return res.status(404).json({ success: false, message: "Course not found for this student/semester." });
    }

    const ctArrayInput = Array.isArray(req.body.ct) ? req.body.ct : [];
    const ct1 = clamp(ctArrayInput[0] !== undefined ? ctArrayInput[0] : req.body.ct1, 0, 20);
    const ct2 = clamp(ctArrayInput[1] !== undefined ? ctArrayInput[1] : req.body.ct2, 0, 20);
    const ct3 = clamp(ctArrayInput[2] !== undefined ? ctArrayInput[2] : req.body.ct3, 0, 20);
    const ct4 = clamp(ctArrayInput[3] !== undefined ? ctArrayInput[3] : req.body.ct4, 0, 20);
    const ct5 = clamp(ctArrayInput[4] !== undefined ? ctArrayInput[4] : req.body.ct5, 0, 20);

    const policy = getCtPolicy(course.courseType, course.credit);
    const values = [ct1, ct2, ct3, ct4, ct5];
    const activeValues = values.slice(0, policy.totalCt);
    const sorted = activeValues.slice().sort((a, b) => b - a);
    const total = sorted.slice(0, policy.bestCount).reduce((sum, value) => sum + value, 0);
    const performance = getCtPerformance(total, policy.maxMarks);

    const item = await CtMark.findOneAndUpdate(
      { studentId: ctx.student._id, courseId: course._id, semesterLabel },
      {
        $set: {
          ct1,
          ct2,
          ct3,
          ct4,
          ct5,
          totalCt: policy.totalCt,
          bestCount: policy.bestCount,
          maxMarks: policy.maxMarks,
          total,
          performance,
        },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );

    return res.status(200).json({
      success: true,
      message: "CT marks saved.",
      data: {
        id: item._id,
        semesterLabel,
        course: {
          id: course._id,
          code: course.code,
          name: course.name,
          credit: course.credit,
          courseType: course.courseType,
        },
        ct: [item.ct1, item.ct2, item.ct3, item.ct4, item.ct5],
        totalCt: item.totalCt,
        bestCount: item.bestCount,
        maxMarks: item.maxMarks,
        total: item.total,
        performance: item.performance,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not save CT marks.", error: error.message });
  }
};

const getStudentCumulativeCgpa = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["student"])) return;
    if (!ctx.student) {
      return res.status(404).json({ success: false, message: "Student profile not found." });
    }

    const rows = await SemesterCgpa.find({ studentId: ctx.student._id }).sort({ semesterLabel: 1, updatedAt: 1 });
    const timeline = [];
    let sum = 0;
    rows.forEach((row, idx) => {
      sum += Number(row.cgpa || 0);
      timeline.push({
        semesterLabel: row.semesterLabel,
        semesterCgpa: row.cgpa,
        cumulativeCgpa: Number((sum / (idx + 1)).toFixed(2)),
      });
    });

    const cumulativeCgpa = timeline.length ? timeline[timeline.length - 1].cumulativeCgpa : 0;

    const latestSemesterRow = rows.length ? rows[rows.length - 1] : null;
    const latestSemesterLabel = latestSemesterRow ? latestSemesterRow.semesterLabel : "";

    let shortCourses = [];
    let backlogCourses = [];

    if (latestSemesterLabel) {
      const [semesterCourses, attendanceRows, ctRows] = await Promise.all([
        StudentCourse.find({ studentId: ctx.student._id, semesterLabel: latestSemesterLabel, status: "active" }).populate("courseId"),
        Attendance.find({ studentId: ctx.student._id, semesterLabel: latestSemesterLabel }).populate("courseId"),
        CtMark.find({ studentId: ctx.student._id, semesterLabel: latestSemesterLabel }).populate("courseId"),
      ]);

      const attendanceByCode = new Map();
      attendanceRows.forEach((row) => {
        const code = row.courseId && row.courseId.code ? String(row.courseId.code).toUpperCase() : "";
        if (code) attendanceByCode.set(code, row);
      });

      const ctByCode = new Map();
      ctRows.forEach((row) => {
        const code = row.courseId && row.courseId.code ? String(row.courseId.code).toUpperCase() : "";
        if (code) ctByCode.set(code, row);
      });

      const evaluated = semesterCourses.map((item) => {
        const course = item.courseId;
        if (!course) return null;

        const code = String(course.code || "").toUpperCase();
        const attendance = attendanceByCode.get(code);
        const ct = ctByCode.get(code);

        const ctPolicy = getCtPolicy(course.courseType, course.credit);
        const attendanceMax = getAttendanceMaxMark(course.credit, course.courseType);
        const ctMax = Number(ct && ct.maxMarks !== undefined ? ct.maxMarks : ctPolicy.maxMarks);
        const totalMax = ctMax + attendanceMax;
        const earnedCt = Number(ct ? ct.total : 0);
        const earnedAttendance = Number(attendance ? attendance.predictedMark : 0);
        const scorePercent = totalMax ? Number((((earnedCt + earnedAttendance) / totalMax) * 100).toFixed(1)) : 0;
        const attendancePercent = Number(attendance ? attendance.percentage : 0);
        const ctGiven = !!(ct && [ct.ct1, ct.ct2, ct.ct3, ct.ct4, ct.ct5].some((v) => Number(v || 0) > 0));

        return {
          courseCode: code,
          courseName: course.name || "Course",
          semesterLabel: latestSemesterLabel,
          scorePercent,
          attendancePercent,
          ctGiven,
        };
      }).filter(Boolean);

      shortCourses = evaluated.filter((x) => x.scorePercent < 40);
      backlogCourses = evaluated.filter((x) => x.scorePercent < 40 && x.attendancePercent < 60 && !x.ctGiven);
    }

    return res.status(200).json({
      success: true,
      data: {
        cumulativeCgpa,
        semesterCount: timeline.length,
        timeline,
        shortCourses,
        backlogCourses,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not load cumulative CGPA.", error: error.message });
  }
};

const getStudentRanking = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["student"])) return;
    if (!ctx.student) {
      return res.status(404).json({ success: false, message: "Student profile not found." });
    }

    const scope = normalizeLower(req.query.scope || "batch");
    const studentFilter = {};

    if (scope === "department") {
      studentFilter.department = ctx.student.department;
    } else {
      studentFilter.batch = ctx.student.batch;
    }

    const studentsInScope = await Student.find(studentFilter).select("_id studentId batch department");
    if (!studentsInScope.length) {
      return res.status(200).json({
        success: true,
        data: {
          scope,
          rank: 0,
          classSize: 0,
          percentile: 0,
          cumulativeCgpa: 0,
          latestSemesterCgpa: 0,
        },
      });
    }

    const studentIds = studentsInScope.map((s) => s._id);

    const cgpaAgg = await SemesterCgpa.aggregate([
      { $match: { studentId: { $in: studentIds } } },
      {
        $group: {
          _id: "$studentId",
          cumulativeCgpa: { $avg: "$cgpa" },
          latestUpdatedAt: { $max: "$updatedAt" },
        },
      },
      {
        $lookup: {
          from: "semester_cgpa",
          let: { sid: "$_id", lu: "$latestUpdatedAt" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$studentId", "$$sid"] },
                    { $eq: ["$updatedAt", "$$lu"] },
                  ],
                },
              },
            },
            { $project: { _id: 0, cgpa: 1 } },
          ],
          as: "latestRows",
        },
      },
      {
        $project: {
          cumulativeCgpa: { $round: ["$cumulativeCgpa", 2] },
          latestSemesterCgpa: {
            $round: [{ $ifNull: [{ $arrayElemAt: ["$latestRows.cgpa", 0] }, 0] }, 2],
          },
        },
      },
    ]);

    const scoreByStudent = new Map();
    cgpaAgg.forEach((row) => {
      scoreByStudent.set(String(row._id), {
        cumulativeCgpa: Number(row.cumulativeCgpa || 0),
        latestSemesterCgpa: Number(row.latestSemesterCgpa || 0),
      });
    });

    const ranked = studentsInScope
      .map((student) => {
        const score = scoreByStudent.get(String(student._id)) || { cumulativeCgpa: 0, latestSemesterCgpa: 0 };
        return {
          studentId: String(student._id),
          cumulativeCgpa: score.cumulativeCgpa,
          latestSemesterCgpa: score.latestSemesterCgpa,
        };
      })
      .sort((a, b) => {
        if (b.cumulativeCgpa !== a.cumulativeCgpa) return b.cumulativeCgpa - a.cumulativeCgpa;
        return b.latestSemesterCgpa - a.latestSemesterCgpa;
      });

    const myStudentId = String(ctx.student._id);
    const myIndex = ranked.findIndex((row) => row.studentId === myStudentId);
    const classSize = ranked.length;
    const rank = myIndex >= 0 ? myIndex + 1 : classSize;
    const percentile = classSize ? Math.round(((classSize - rank + 1) / classSize) * 100) : 0;
    const me = ranked[myIndex] || { cumulativeCgpa: 0, latestSemesterCgpa: 0 };

    return res.status(200).json({
      success: true,
      data: {
        scope,
        rank,
        classSize,
        percentile,
        cumulativeCgpa: me.cumulativeCgpa,
        latestSemesterCgpa: me.latestSemesterCgpa,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not load student ranking.", error: error.message });
  }
};

const getNotices = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ctx.user) {
      return res.status(401).json({ success: false, message: "Unauthorized." });
    }

    const role = ctx.user.role;
    const targets = role === "advisor" ? ["advisors", "students_advisors"] : role === "student" ? ["students", "students_advisors"] : ["students", "advisors", "students_advisors"];

    const items = await Notice.find({ target: { $in: targets }, status: { $ne: "archived" } }).sort({ publishedAt: -1 });
    return res.status(200).json({ success: true, data: { items } });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not load notices.", error: error.message });
  }
};

const createNotice = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["admin"])) return;
    if (!ctx.admin) {
      return res.status(404).json({ success: false, message: "Admin profile not found." });
    }

    const title = normalize(req.body.title);
    const content = normalize(req.body.content);
    if (!title || !content) {
      return res.status(400).json({ success: false, message: "title and content are required." });
    }

    const item = await Notice.create({
      createdByAdminId: ctx.admin._id,
      title,
      content,
      target: toNoticeTarget(req.body.target),
      priority: toNoticePriority(req.body.priority),
      status: "published",
      publishedAt: new Date(),
    });

    return res.status(201).json({ success: true, message: "Notice published.", data: item });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not publish notice.", error: error.message });
  }
};

const getAdvisorAssignments = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["admin"])) return;

    const items = await AdvisorAssignment.find({}).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data: { items } });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not load assignments.", error: error.message });
  }
};

const getAdminAdvisors = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["admin"])) return;

    const advisors = await Advisor.find({}).populate("userId", "name").sort({ createdAt: -1 });
    const assignments = await AdvisorAssignment.find({ status: "assigned" }).select("advisorName startSerial endSerial");

    const adviseeCountByAdvisor = {};
    assignments.forEach((item) => {
      const name = normalize(item.advisorName);
      const count = Math.max(0, Number(item.endSerial || 0) - Number(item.startSerial || 0) + 1);
      adviseeCountByAdvisor[name] = (adviseeCountByAdvisor[name] || 0) + count;
    });

    const items = advisors.map((advisor) => {
      const advisorName = advisor.userId && advisor.userId.name ? advisor.userId.name : "Advisor";
      return {
        id: advisor._id,
        advisorId: advisor.advisorId,
        name: advisorName,
        department: advisor.department || "",
        batchFocus: advisor.batchFocus || "",
        adviseeCount: adviseeCountByAdvisor[advisorName] || 0,
      };
    });

    return res.status(200).json({ success: true, data: { items } });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not load advisors.", error: error.message });
  }
};

const getStudentAssignedAdvisor = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["student"])) return;
    if (!ctx.student) {
      return res.status(404).json({ success: false, message: "Student profile not found." });
    }

    const comparable = toComparableStudentNumber(ctx.student);
    if (!Number.isFinite(comparable)) {
      return res.status(200).json({ success: true, data: { advisor: null } });
    }

    const assignment = await AdvisorAssignment.findOne({
      batch: toBatchPattern(ctx.student.batch),
      status: "assigned",
      startSerial: { $lte: comparable },
      endSerial: { $gte: comparable },
    }).sort({ createdAt: -1 });

    if (!assignment) {
      return res.status(200).json({ success: true, data: { advisor: null } });
    }

    return res.status(200).json({
      success: true,
      data: {
        advisor: {
          advisorName: assignment.advisorName,
          batch: assignment.batch,
          startSerial: assignment.startSerial,
          endSerial: assignment.endSerial,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not resolve assigned advisor.", error: error.message });
  }
};

const getAdvisorStudentsByBatch = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["advisor"])) return;

    const batchQuery = normalize(req.query.batch);
    const advisorProfile = ctx.advisor || await Advisor.findOne({ userId: ctx.user._id });
    const assignmentsFilter = { status: "assigned" };
    if (advisorProfile && advisorProfile._id) {
      assignmentsFilter.advisorId = advisorProfile._id;
    } else {
      assignmentsFilter.advisorName = ctx.user.name;
    }

    if (batchQuery) {
      assignmentsFilter.batch = toBatchPattern(batchQuery);
    }

    const assignments = await AdvisorAssignment.find(assignmentsFilter).sort({ createdAt: -1 });
    const availableBatches = Array.from(new Set(assignments.map((item) => normalizeBatchValue(item.batch)).filter(Boolean)));

    if (!assignments.length) {
      return res.status(200).json({ success: true, data: { batches: availableBatches, items: [] } });
    }

    const assignmentByBatch = {};
    assignments.forEach((assignment) => {
      var key = normalizeBatchValue(assignment.batch);
      if (!assignmentByBatch[key]) assignmentByBatch[key] = [];
      assignmentByBatch[key].push(assignment);
    });

    const targetBatchKeys = Object.keys(assignmentByBatch);
    const students = await Student.find({}).populate("userId", "name");

    const matchedStudents = students.filter((student) => {
      var batchKey = normalizeBatchValue(student.batch);
      if (targetBatchKeys.indexOf(batchKey) < 0) return false;

      var comparable = toComparableStudentNumber(student);
      if (!Number.isFinite(comparable)) return false;

      return assignmentByBatch[batchKey].some((assignment) => {
        return comparable >= Number(assignment.startSerial || 0) && comparable <= Number(assignment.endSerial || 0);
      });
    });

    const studentIds = matchedStudents.map((student) => student._id);
    const cgpaRows = await SemesterCgpa.find({ studentId: { $in: studentIds } }).sort({ updatedAt: -1 });

    const cgpaMap = new Map();
    cgpaRows.forEach((row) => {
      const key = String(row.studentId);
      const current = cgpaMap.get(key) || { latest: null, sum: 0, count: 0 };
      if (current.latest === null) {
        current.latest = Number(row.cgpa || 0);
      }
      current.sum += Number(row.cgpa || 0);
      current.count += 1;
      cgpaMap.set(key, current);
    });

    const items = matchedStudents.map((student) => {
      const cgpa = cgpaMap.get(String(student._id)) || { latest: 0, sum: 0, count: 0 };
      const overall = cgpa.count ? Number((cgpa.sum / cgpa.count).toFixed(2)) : 0;

      return {
        userId: student.userId ? String(student.userId._id) : "",
        studentId: student.studentId,
        name: (student.userId && student.userId.name) ? student.userId.name : "Student",
        batch: normalizeBatchValue(student.batch),
        currentCgpa: Number(Number(cgpa.latest || 0).toFixed(2)),
        overallCgpa: overall,
      };
    }).sort((a, b) => {
      if (a.batch !== b.batch) return String(a.batch).localeCompare(String(b.batch));
      if (b.currentCgpa !== a.currentCgpa) return b.currentCgpa - a.currentCgpa;
      return String(a.studentId || "").localeCompare(String(b.studentId || ""));
    }).map((item, idx) => {
      return {
        rank: idx + 1,
        userId: item.userId,
        studentId: item.studentId,
        name: item.name,
        batch: item.batch,
        currentCgpa: item.currentCgpa,
        overallCgpa: item.overallCgpa,
      };
    });

    return res.status(200).json({ success: true, data: { batches: availableBatches, items } });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not load advisor students.", error: error.message });
  }
};

const getAdminStudentsByBatch = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["admin"])) return;

    const batchRaw = normalize(req.query.batch);
    if (!batchRaw) {
      return res.status(400).json({ success: false, message: "batch query is required." });
    }

    const batchNumber = batchRaw.replace(/^batch\s*/i, "").trim();
    const escapedBatch = batchNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const batchPattern = new RegExp("^(batch\\s*)?" + escapedBatch + "$", "i");

    const [students, assignments] = await Promise.all([
      Student.find({ batch: batchPattern }).populate("userId", "name").sort({ studentId: 1 }),
      AdvisorAssignment.find({ batch: batchPattern, status: "assigned" }).sort({ createdAt: -1 }),
    ]);

    const toComparableNumber = (student) => {
      if (Number.isFinite(student.serialNo) && Number(student.serialNo) > 0) {
        return Number(student.serialNo);
      }
      const numeric = String(student.studentId || "").replace(/\D/g, "");
      return numeric ? Number(numeric) : null;
    };

    const normalizedStudents = students.map((student) => {
      const comparable = toComparableNumber(student);
      const activeAssignment = assignments.find((assignment) => {
        if (!Number.isFinite(comparable)) return false;
        return comparable >= Number(assignment.startSerial || 0) && comparable <= Number(assignment.endSerial || 0);
      });

      return {
        id: student._id,
        studentId: student.studentId,
        name: student.userId && student.userId.name ? student.userId.name : "Student",
        batch: student.batch,
        comparable,
        assignedAdvisor: activeAssignment ? activeAssignment.advisorName : null,
      };
    }).sort((a, b) => {
      const av = Number.isFinite(a.comparable) ? a.comparable : Number.MAX_SAFE_INTEGER;
      const bv = Number.isFinite(b.comparable) ? b.comparable : Number.MAX_SAFE_INTEGER;
      if (av !== bv) return av - bv;
      return String(a.studentId || "").localeCompare(String(b.studentId || ""));
    });

    const items = normalizedStudents.map((student, idx) => ({
      serial: idx + 1,
      studentId: student.studentId,
      name: student.name,
      batch: student.batch,
      assignedAdvisor: student.assignedAdvisor,
    }));

    return res.status(200).json({ success: true, data: { batch: batchNumber, items } });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not load students by batch.", error: error.message });
  }
};

const createAdvisorAssignment = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["admin"])) return;
    if (!ctx.admin) {
      return res.status(404).json({ success: false, message: "Admin profile not found." });
    }

    const batch = normalize(req.body.batch);
    const advisorName = normalize(req.body.advisorName || req.body.teacher);
    const startSerial = Number(req.body.startSerial || req.body.startId || 0);
    const endSerial = Number(req.body.endSerial || req.body.endId || 0);
    const studentCount = endSerial - startSerial + 1;

    if (!batch || !advisorName || !startSerial || !endSerial || endSerial < startSerial) {
      return res.status(400).json({ success: false, message: "Invalid assignment payload." });
    }

    if (studentCount !== 10) {
      return res.status(400).json({ success: false, message: "Each advisor assignment must include exactly 10 students." });
    }

    const advisorUser = await User.findOne({ role: "advisor", name: advisorName });
    let advisorId = null;
    if (advisorUser) {
      const advisorProfile = await Advisor.findOne({ userId: advisorUser._id });
      advisorId = advisorProfile ? advisorProfile._id : null;
    }
    if (!advisorId) {
      return res.status(404).json({ success: false, message: "Selected advisor account was not found." });
    }

    const existingExact = await AdvisorAssignment.findOne({ batch, advisorName, startSerial, endSerial });

    if (!existingExact) {
      const overlapping = await AdvisorAssignment.findOne({
        batch,
        status: "assigned",
        startSerial: { $lte: endSerial },
        endSerial: { $gte: startSerial },
      });

      if (overlapping) {
        return res.status(409).json({
          success: false,
          message: "This student range overlaps with an existing advisor assignment in the same batch.",
        });
      }
    }

    const item = await AdvisorAssignment.findOneAndUpdate(
      { batch, advisorName, startSerial, endSerial },
      {
        $set: {
          advisorId,
          status: "assigned",
          createdByAdminId: ctx.admin._id,
        },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );

    return res.status(201).json({ success: true, message: "Advisor assigned.", data: item });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not save assignment.", error: error.message });
  }
};

const getAdvisorStudentReport = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["advisor"])) return;

    const studentUserId = normalize(req.query.studentUserId);
    const studentIdValue = normalize(req.query.studentId);

    if (!studentUserId && !studentIdValue) {
      return res.status(400).json({ success: false, message: "studentUserId or studentId query is required." });
    }

    let targetStudent = null;
    if (studentUserId) {
      targetStudent = await Student.findOne({ userId: studentUserId }).populate("userId", "name");
    }
    if (!targetStudent && studentIdValue) {
      targetStudent = await Student.findOne({ studentId: studentIdValue }).populate("userId", "name");
    }

    if (!targetStudent) {
      return res.status(404).json({ success: false, message: "Student not found." });
    }

    const comparable = toComparableStudentNumber(targetStudent);
    if (!Number.isFinite(comparable)) {
      return res.status(403).json({ success: false, message: "Student is not assigned to this advisor." });
    }

    const advisorProfile = ctx.advisor || await Advisor.findOne({ userId: ctx.user._id });
    const advisorQuery = {
      batch: toBatchPattern(targetStudent.batch),
      status: "assigned",
      startSerial: { $lte: comparable },
      endSerial: { $gte: comparable },
    };
    if (advisorProfile && advisorProfile._id) {
      advisorQuery.advisorId = advisorProfile._id;
    } else {
      advisorQuery.advisorName = ctx.user.name;
    }
    const advisorAssignments = await AdvisorAssignment.find(advisorQuery).sort({ createdAt: -1 });

    if (!advisorAssignments.length) {
      return res.status(403).json({ success: false, message: "You can only view reports of your assigned students." });
    }

    const semesterRows = await SemesterCgpa.find({ studentId: targetStudent._id }).sort({ updatedAt: -1, semesterLabel: -1 });
    const attendanceRowsAll = await Attendance.find({ studentId: targetStudent._id }).populate("courseId").sort({ updatedAt: -1 });
    const ctRowsAll = await CtMark.find({ studentId: targetStudent._id }).populate("courseId").sort({ updatedAt: -1 });

    const semesterItems = semesterRows.map((row) => ({
      semesterLabel: row.semesterLabel,
      cgpa: Number(Number(row.cgpa || 0).toFixed(2)),
      trend: row.trend || "stable",
      updatedAt: row.updatedAt,
    }));

    const latestSemesterLabel = semesterItems.length
      ? semesterItems[0].semesterLabel
      : (attendanceRowsAll[0] && attendanceRowsAll[0].semesterLabel) || (ctRowsAll[0] && ctRowsAll[0].semesterLabel) || "";
    const latestAttendanceSemesterLabel = (attendanceRowsAll[0] && attendanceRowsAll[0].semesterLabel) || latestSemesterLabel || "";
    const latestCtSemesterLabel = (ctRowsAll[0] && ctRowsAll[0].semesterLabel) || latestSemesterLabel || "";
    const currentSemesterCgpa = semesterItems.length ? Number(semesterItems[0].cgpa || 0) : 0;
    const overallCgpa = semesterItems.length
      ? Number((semesterItems.reduce((sum, item) => sum + Number(item.cgpa || 0), 0) / semesterItems.length).toFixed(2))
      : 0;

    const attendanceRows = latestAttendanceSemesterLabel
      ? attendanceRowsAll.filter((row) => normalize(row.semesterLabel) === normalize(latestAttendanceSemesterLabel))
      : attendanceRowsAll;
    const attendanceItems = attendanceRows.map((row) => ({
      courseCode: row.courseId ? row.courseId.code : "",
      courseName: row.courseId ? row.courseId.name : "Course",
      percentage: Number(row.percentage || 0),
      predictedMark: Number(row.predictedMark || 0),
      risk: row.risk || "watch",
    }));

    const ctRows = latestCtSemesterLabel
      ? ctRowsAll.filter((row) => normalize(row.semesterLabel) === normalize(latestCtSemesterLabel))
      : ctRowsAll;
    let ctItems = ctRows.map((row) => ({
      courseCode: row.courseId ? row.courseId.code : "",
      courseName: row.courseId ? row.courseId.name : "Course",
      total: Number(row.total || 0),
      maxMarks: Number(row.maxMarks || 0),
      performance: row.performance || "average",
    }));

    // If no CT rows are stored yet, still show course-wise CT report skeleton for advisor.
    if (!ctItems.length && latestCtSemesterLabel) {
      const semesterCourses = await StudentCourse.find({
        studentId: targetStudent._id,
        semesterLabel: latestCtSemesterLabel,
        status: "active",
      }).populate("courseId");

      ctItems = semesterCourses
        .map((item) => item.courseId)
        .filter(Boolean)
        .map((course) => {
          const policy = getCtPolicy(course.courseType, course.credit);
          return {
            courseCode: course.code,
            courseName: course.name || "Course",
            total: 0,
            maxMarks: Number(policy.maxMarks || 0),
            performance: "average",
          };
        });
    }

    const avgAttendance = attendanceItems.length
      ? Number((attendanceItems.reduce((sum, item) => sum + Number(item.percentage || 0), 0) / attendanceItems.length).toFixed(1))
      : 0;
    const avgCtPercent = ctItems.length
      ? Number((ctItems.reduce((sum, item) => {
        var maxMarks = Number(item.maxMarks || 0);
        if (!maxMarks) return sum;
        return sum + (Number(item.total || 0) / maxMarks) * 100;
      }, 0) / ctItems.length).toFixed(1))
      : 0;

    const assignmentQuery = { status: "assigned" };
    if (advisorProfile && advisorProfile._id) {
      assignmentQuery.advisorId = advisorProfile._id;
    } else {
      assignmentQuery.advisorName = ctx.user.name;
    }
    const assignments = await AdvisorAssignment.find(assignmentQuery).sort({ createdAt: -1 });
    const assignmentByBatch = {};
    assignments.forEach((assignment) => {
      const key = normalizeBatchValue(assignment.batch);
      if (!assignmentByBatch[key]) assignmentByBatch[key] = [];
      assignmentByBatch[key].push(assignment);
    });

    const students = await Student.find({}).select("_id studentId serialNo batch");
    const matchedStudentIds = students.filter((student) => {
      const key = normalizeBatchValue(student.batch);
      if (!assignmentByBatch[key]) return false;
      const studentComparable = toComparableStudentNumber(student);
      if (!Number.isFinite(studentComparable)) return false;
      return assignmentByBatch[key].some((assignment) => {
        return studentComparable >= Number(assignment.startSerial || 0) && studentComparable <= Number(assignment.endSerial || 0);
      });
    }).map((student) => String(student._id));

    const rankingRows = await SemesterCgpa.aggregate([
      { $match: { studentId: { $in: matchedStudentIds.map((id) => new mongoose.Types.ObjectId(id)) } } },
      {
        $group: {
          _id: "$studentId",
          overall: { $avg: "$cgpa" },
          latestUpdatedAt: { $max: "$updatedAt" },
        },
      },
      {
        $lookup: {
          from: "semester_cgpa",
          let: { sid: "$_id", lu: "$latestUpdatedAt" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$studentId", "$$sid"] },
                    { $eq: ["$updatedAt", "$$lu"] },
                  ],
                },
              },
            },
            { $project: { _id: 0, cgpa: 1 } },
          ],
          as: "latestRows",
        },
      },
      {
        $project: {
          overall: { $round: ["$overall", 2] },
          current: { $round: [{ $ifNull: [{ $arrayElemAt: ["$latestRows.cgpa", 0] }, 0] }, 2] },
        },
      },
    ]);

    const ranked = rankingRows
      .map((row) => ({
        studentId: String(row._id),
        overall: Number(row.overall || 0),
        current: Number(row.current || 0),
      }))
      .sort((a, b) => {
        if (b.overall !== a.overall) return b.overall - a.overall;
        return b.current - a.current;
      });

    const currentStudentRank = ranked.findIndex((item) => item.studentId === String(targetStudent._id)) + 1;
    const classSize = ranked.length || 0;

    const weakAttendanceCourses = attendanceItems
      .filter((item) => String(item.risk || "").toLowerCase() === "critical" || String(item.risk || "").toLowerCase() === "watch")
      .map((item) => item.courseCode)
      .filter(Boolean)
      .slice(0, 3);
    const weakCtCourses = ctItems
      .filter((item) => String(item.performance || "").toLowerCase() === "low")
      .map((item) => item.courseCode)
      .filter(Boolean)
      .slice(0, 3);

    let suggestion = "Performance is stable; maintain current effort and target stronger CT scores.";
    if (overallCgpa < 3) {
      suggestion = "Overall CGPA is below target. Prioritize weak courses and schedule advisor follow-up.";
    } else if (weakAttendanceCourses.length && weakCtCourses.length) {
      suggestion = `Attendance and CT both need attention in ${weakAttendanceCourses.concat(weakCtCourses).slice(0, 3).join(", ")}.`;
    } else if (weakAttendanceCourses.length) {
      suggestion = `Improve attendance consistency in ${weakAttendanceCourses.join(", ")} to protect marks.`;
    } else if (weakCtCourses.length) {
      suggestion = `Focus CT preparation in ${weakCtCourses.join(", ")} to raise semester performance.`;
    } else if (avgAttendance < 75) {
      suggestion = "Improve class attendance consistency to stabilize performance.";
    }

    const performanceSummary = {
      standing: overallCgpa >= 3.5 ? "Good" : overallCgpa >= 3 ? "Moderate" : "At Risk",
      overallCgpa,
      currentSemesterCgpa,
      avgAttendance,
      avgCtPercent,
      suggestion,
    };

    return res.status(200).json({
      success: true,
      data: {
        student: {
          userId: targetStudent.userId ? String(targetStudent.userId._id) : "",
          studentId: targetStudent.studentId,
          name: targetStudent.userId && targetStudent.userId.name ? targetStudent.userId.name : "Student",
          batch: targetStudent.batch,
          department: targetStudent.department,
        },
        ranking: {
          rank: currentStudentRank > 0 ? currentStudentRank : classSize,
          classSize,
        },
        latestSemesterLabel,
        latestAttendanceSemesterLabel,
        latestCtSemesterLabel,
        overallCgpa,
        currentSemesterCgpa,
        semesterCgpa: semesterItems,
        currentSemesterAttendance: attendanceItems,
        currentSemesterCtMarks: ctItems,
        performanceSummary,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not load advisor student report.", error: error.message });
  }
};

const getAdvisorPerformanceWatchlist = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["advisor"])) return;

    const advisorProfile = ctx.advisor || await Advisor.findOne({ userId: ctx.user._id });
    const assignmentQuery = { status: "assigned" };
    if (advisorProfile && advisorProfile._id) {
      assignmentQuery.advisorId = advisorProfile._id;
    } else {
      assignmentQuery.advisorName = ctx.user.name;
    }
    const assignments = await AdvisorAssignment.find(assignmentQuery).sort({ createdAt: -1 });
    if (!assignments.length) {
      return res.status(200).json({ success: true, data: { items: [] } });
    }

    const assignmentByBatch = {};
    assignments.forEach((assignment) => {
      const key = normalizeBatchValue(assignment.batch);
      if (!assignmentByBatch[key]) assignmentByBatch[key] = [];
      assignmentByBatch[key].push(assignment);
    });

    const students = await Student.find({}).populate("userId", "name");
    const assignedStudents = students.filter((student) => {
      const key = normalizeBatchValue(student.batch);
      const ranges = assignmentByBatch[key] || [];
      if (!ranges.length) return false;
      const comparable = toComparableStudentNumber(student);
      if (!Number.isFinite(comparable)) return false;
      return ranges.some((range) => comparable >= Number(range.startSerial || 0) && comparable <= Number(range.endSerial || 0));
    });

    if (!assignedStudents.length) {
      return res.status(200).json({ success: true, data: { items: [] } });
    }

    const studentIds = assignedStudents.map((student) => student._id);
    const semesterRows = await SemesterCgpa.find({ studentId: { $in: studentIds } }).sort({ updatedAt: -1 });
    const attendanceRows = await Attendance.find({ studentId: { $in: studentIds } }).sort({ updatedAt: -1 });
    const ctRows = await CtMark.find({ studentId: { $in: studentIds } }).sort({ updatedAt: -1 });

    const latestSemesterByStudent = new Map();
    const latestCgpaByStudent = new Map();
    const cgpaAggByStudent = new Map();

    semesterRows.forEach((row) => {
      const sid = String(row.studentId);
      const current = cgpaAggByStudent.get(sid) || { sum: 0, count: 0 };
      current.sum += Number(row.cgpa || 0);
      current.count += 1;
      cgpaAggByStudent.set(sid, current);

      if (!latestSemesterByStudent.has(sid)) {
        latestSemesterByStudent.set(sid, row.semesterLabel || "");
        latestCgpaByStudent.set(sid, Number(row.cgpa || 0));
      }
    });

    const attendanceAvgByStudentSemester = new Map();
    attendanceRows.forEach((row) => {
      const key = String(row.studentId) + "::" + String(row.semesterLabel || "");
      const current = attendanceAvgByStudentSemester.get(key) || { sum: 0, count: 0 };
      current.sum += Number(row.percentage || 0);
      current.count += 1;
      attendanceAvgByStudentSemester.set(key, current);
    });

    const ctAvgByStudentSemester = new Map();
    ctRows.forEach((row) => {
      const key = String(row.studentId) + "::" + String(row.semesterLabel || "");
      const maxMarks = Number(row.maxMarks || 0);
      if (!maxMarks) return;
      const percentage = (Number(row.total || 0) / maxMarks) * 100;
      const current = ctAvgByStudentSemester.get(key) || { sum: 0, count: 0 };
      current.sum += percentage;
      current.count += 1;
      ctAvgByStudentSemester.set(key, current);
    });

    const riskBucket = (value, thresholds) => {
      if (value <= thresholds.high) return "high";
      if (value <= thresholds.medium) return "medium";
      return "low";
    };

    const riskScore = (risk) => {
      if (risk === "high") return 3;
      if (risk === "medium") return 2;
      return 0;
    };

    const items = assignedStudents.map((student) => {
      const sid = String(student._id);
      const latestSemesterLabel = latestSemesterByStudent.get(sid) || "";
      const semKey = sid + "::" + latestSemesterLabel;

      const currentCgpa = Number(latestCgpaByStudent.get(sid) || 0);
      const cgpaAgg = cgpaAggByStudent.get(sid) || { sum: 0, count: 0 };
      const overallCgpa = cgpaAgg.count ? Number((cgpaAgg.sum / cgpaAgg.count).toFixed(2)) : 0;

      const attendanceAgg = attendanceAvgByStudentSemester.get(semKey) || { sum: 0, count: 0 };
      const attendancePercent = attendanceAgg.count ? Number((attendanceAgg.sum / attendanceAgg.count).toFixed(1)) : 0;

      const ctAgg = ctAvgByStudentSemester.get(semKey) || { sum: 0, count: 0 };
      const ctPercent = ctAgg.count ? Number((ctAgg.sum / ctAgg.count).toFixed(1)) : 0;

      const cgpaRisk = riskBucket(currentCgpa, { high: 2.5, medium: 3.0 });
      const attendanceRisk = attendanceAgg.count === 0 ? "low" : riskBucket(attendancePercent, { high: 60, medium: 75 });
      const ctRisk = ctAgg.count === 0 ? "low" : riskBucket(ctPercent, { high: 50, medium: 65 });
      const totalRiskScore = riskScore(cgpaRisk) + riskScore(attendanceRisk) + riskScore(ctRisk);

      return {
        userId: student.userId ? String(student.userId._id) : "",
        studentId: student.studentId,
        name: student.userId && student.userId.name ? student.userId.name : "Student",
        batch: normalizeBatchValue(student.batch),
        latestSemesterLabel,
        currentCgpa: Number(currentCgpa.toFixed(2)),
        overallCgpa,
        attendancePercent,
        ctPercent,
        cgpaRisk,
        attendanceRisk,
        ctRisk,
        riskScore: totalRiskScore,
      };
    }).filter((item) => item.riskScore >= 6)
      .sort((a, b) => {
        if (b.riskScore !== a.riskScore) return b.riskScore - a.riskScore;
        return a.currentCgpa - b.currentCgpa;
      });

    return res.status(200).json({ success: true, data: { items } });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not load performance watchlist.", error: error.message });
  }
};

const getMessages = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ctx.user) {
      return res.status(401).json({ success: false, message: "Unauthorized." });
    }

    const items = await Message.find({
      $or: [{ fromUserId: ctx.user._id }, { toUserId: ctx.user._id }],
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate("fromUserId", "name role")
      .populate("toUserId", "name role");

    const mapped = items.map((item) => ({
      id: item._id,
      date: item.createdAt,
      from: item.fromRole,
      to: item.toRole,
      fromName: item.fromUserId ? item.fromUserId.name : "Unknown",
      toName: item.toUserId ? item.toUserId.name : "Unknown",
      subject: item.subject,
      message: item.content,
      status: item.status,
      channel: item.channel,
    }));

    return res.status(200).json({ success: true, data: { items: mapped } });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not load messages.", error: error.message });
  }
};

const sendMessage = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ctx.user) {
      return res.status(401).json({ success: false, message: "Unauthorized." });
    }

    const toRole = normalizeLower(req.body.toRole || (ctx.user.role === "student" ? "advisor" : "student"));
    const toUserId = normalize(req.body.toUserId);
    const toName = normalize(req.body.toName || req.body.studentName || req.body.advisorName || req.body.advisor || req.body.toStudent);
    const subject = normalize(req.body.subject);
    const content = normalize(req.body.content || req.body.message || req.body.sms);
    const channel = normalizeLower(req.body.channel || (ctx.user.role === "advisor" ? "sms" : "portal"));

    if (!subject || !content) {
      return res.status(400).json({ success: false, message: "subject and content are required." });
    }

    let targetUser = null;
    if (toUserId) {
      targetUser = await User.findOne({ _id: toUserId, role: toRole });
    }
    if (!targetUser && toName) {
      targetUser = await User.findOne({ role: toRole, name: toName });
    }
    if (!targetUser) {
      return res.status(404).json({ success: false, message: `Recipient ${toRole} was not found. Provide a valid recipient.` });
    }

    const item = await Message.create({
      fromUserId: ctx.user._id,
      toUserId: targetUser._id,
      fromRole: ctx.user.role,
      toRole,
      channel: channel === "sms" ? "sms" : "portal",
      subject,
      content,
      status: "sent",
    });

    return res.status(201).json({
      success: true,
      message: "Message sent.",
      data: {
        id: item._id,
        date: item.createdAt,
        from: item.fromRole,
        to: item.toRole,
        subject: item.subject,
        message: item.content,
        status: item.status,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not send message.", error: error.message });
  }
};

const toTeacherCourseItem = (course) => ({
  id: course._id,
  batch: course.batch || "",
  semesterLabel: course.semesterLabel,
  code: course.code,
  name: course.name,
  credit: course.credit,
  courseType: course.courseType,
});

const getTeacherCourses = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["teacher"])) return;
    if (!ctx.teacher) return res.status(404).json({ success: false, message: "Teacher profile not found." });

    const courses = await Course.find({ teacherId: ctx.teacher._id }).sort({ semesterLabel: 1, code: 1 });
    return res.status(200).json({ success: true, data: { items: courses.map(toTeacherCourseItem) } });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not load teacher courses.", error: error.message });
  }
};

const saveTeacherCourse = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["teacher"])) return;
    if (!ctx.teacher) return res.status(404).json({ success: false, message: "Teacher profile not found." });

    const code = normalize(req.body.code).toUpperCase();
    const name = normalize(req.body.name);
    const batch = normalizeBatchValue(req.body.batch);
    const semesterLabel = normalize(req.body.semesterLabel || req.body.semester);
    const credit = Number(req.body.credit || 0);
    const courseType = normalizeLower(req.body.courseType || ([0.75, 1.5].includes(credit) ? "lab" : "theory"));

    if (!code || !name || !batch || !semesterLabel || !credit) {
      return res.status(400).json({ success: false, message: "code, name, batch, semesterLabel and credit are required." });
    }
    if (!['theory', 'lab'].includes(courseType)) {
      return res.status(400).json({ success: false, message: "courseType must be theory or lab." });
    }

    // A course that a student created before a teacher began using the portal
    // can be adopted by its teacher instead of becoming a duplicate offering.
    const unassignedCourse = await Course.findOne({ code, semesterLabel, batch, teacherId: null });
    if (unassignedCourse) {
      unassignedCourse.set({
        name,
        credit,
        courseType,
        department: ctx.teacher.department,
        teacherId: ctx.teacher._id,
        teacherName: ctx.user.name,
        teacherNames: [ctx.user.name],
      });
      await unassignedCourse.save();
      return res.status(200).json({ success: true, message: "Existing course linked to teacher.", data: toTeacherCourseItem(unassignedCourse) });
    }

    const course = await Course.findOneAndUpdate(
      { code, semesterLabel, batch, teacherId: ctx.teacher._id },
      {
        $set: {
          name,
          credit,
          courseType,
          department: ctx.teacher.department,
          teacherName: ctx.user.name,
          teacherNames: [ctx.user.name],
        },
        $setOnInsert: { code, semesterLabel, batch, teacherId: ctx.teacher._id },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );

    return res.status(201).json({ success: true, message: "Teacher course saved.", data: toTeacherCourseItem(course) });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({ success: false, message: "This course is already assigned to another teacher for that batch and semester." });
    }
    return res.status(500).json({ success: false, message: "Could not save teacher course.", error: error.message });
  }
};

const updateTeacherCourse = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["teacher"])) return;
    if (!ctx.teacher) return res.status(404).json({ success: false, message: "Teacher profile not found." });

    const course = await Course.findOne({ _id: req.params.courseId, teacherId: ctx.teacher._id });
    if (!course) return res.status(404).json({ success: false, message: "Teacher course not found." });

    const code = normalize(req.body.code || course.code).toUpperCase();
    const name = normalize(req.body.name || course.name);
    const batch = normalizeBatchValue(req.body.batch || course.batch);
    const semesterLabel = normalize(req.body.semesterLabel || req.body.semester || course.semesterLabel);
    const credit = Number(req.body.credit ?? course.credit);
    const courseType = normalizeLower(req.body.courseType || course.courseType);
    if (!code || !name || !batch || !semesterLabel || !credit || !["theory", "lab"].includes(courseType)) {
      return res.status(400).json({ success: false, message: "Valid code, name, batch, semester, credit and course type are required." });
    }

    course.set({ code, name, batch, semesterLabel, credit, courseType });
    await course.save();
    return res.status(200).json({ success: true, message: "Teacher course updated.", data: toTeacherCourseItem(course) });
  } catch (error) {
    if (error && error.code === 11000) return res.status(409).json({ success: false, message: "This course offering already exists." });
    return res.status(500).json({ success: false, message: "Could not update teacher course.", error: error.message });
  }
};

const deleteTeacherCourse = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["teacher"])) return;
    if (!ctx.teacher) return res.status(404).json({ success: false, message: "Teacher profile not found." });

    const course = await Course.findOneAndDelete({ _id: req.params.courseId, teacherId: ctx.teacher._id });
    if (!course) return res.status(404).json({ success: false, message: "Teacher course not found." });

    await Promise.all([
      StudentCourse.deleteMany({ courseId: course._id }),
      Attendance.deleteMany({ courseId: course._id }),
      CtMark.deleteMany({ courseId: course._id }),
    ]);
    return res.status(200).json({ success: true, message: "Teacher course deleted." });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not delete teacher course.", error: error.message });
  }
};

const resolveCourseForTeacher = async ({ courseCode, semesterLabel, courseName, credit, batch, teacherId }) => {
  const code = normalize(courseCode).toUpperCase();
  const label = normalize(semesterLabel);
  const normalizedBatch = normalizeBatchValue(batch);
  if (!code || !label || !normalizedBatch) return null;

  const existing = await Course.findOne(teacherId ? { code, semesterLabel: label, batch: normalizedBatch, teacherId } : { code, semesterLabel: label, batch: normalizedBatch });
  if (existing) return existing;

  // Teachers must create a course offering first. This is what makes the
  // attendance and CT records belong to the authenticated teacher.
  if (teacherId) return null;

  const parsedCredit = Number(credit || 0);
  const courseType = [0.75, 1.5].includes(parsedCredit) ? "lab" : "theory";

  return Course.findOneAndUpdate(
    { code, semesterLabel: label, batch: normalizedBatch },
    {
      $setOnInsert: {
        code,
        name: normalize(courseName) || code,
        credit: parsedCredit || 3,
        courseType,
        semesterLabel: label,
        batch: normalizedBatch,
        department: batch ? `Batch ${normalizeBatchValue(batch)}` : "",
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );
};

const getTeacherCourse = async (teacherId, courseCode, semesterLabel, batch) => {
  const code = normalize(courseCode).toUpperCase();
  const label = normalize(semesterLabel);
  const normalizedBatch = normalizeBatchValue(batch);
  if (!teacherId || !code || !label || !normalizedBatch) return null;
  const course = await Course.findOne({
    code,
    semesterLabel: label,
    batch: { $in: getBatchAliases(normalizedBatch) },
    teacherId,
  });
  if (course) await reconcileCourseEnrollments(course);
  return course;
};

const reconcileCourseEnrollments = async (teacherCourse) => {
  const sourceCourses = await Course.find({
    _id: { $ne: teacherCourse._id },
    code: teacherCourse.code,
    semesterLabel: teacherCourse.semesterLabel,
    batch: { $in: getBatchAliases(teacherCourse.batch) },
    teacherId: null,
  });

  for (const sourceCourse of sourceCourses) {
    const enrollments = await StudentCourse.find({
      courseId: sourceCourse._id,
      semesterLabel: teacherCourse.semesterLabel,
    });

    for (const enrollment of enrollments) {
      const existing = await StudentCourse.findOne({
        studentId: enrollment.studentId,
        courseId: teacherCourse._id,
        semesterLabel: teacherCourse.semesterLabel,
      });
      if (existing) await StudentCourse.deleteOne({ _id: enrollment._id });
      else {
        enrollment.courseId = teacherCourse._id;
        await enrollment.save();
      }
    }

    const [attendanceRows, ctRows] = await Promise.all([
      Attendance.find({ courseId: sourceCourse._id, semesterLabel: teacherCourse.semesterLabel }),
      CtMark.find({ courseId: sourceCourse._id, semesterLabel: teacherCourse.semesterLabel }),
    ]);

    for (const row of attendanceRows) {
      const existing = await Attendance.findOne({ studentId: row.studentId, courseId: teacherCourse._id, semesterLabel: row.semesterLabel });
      if (existing) await Attendance.deleteOne({ _id: row._id });
      else {
        row.courseId = teacherCourse._id;
        row.teacherId = teacherCourse.teacherId;
        row.batch = teacherCourse.batch;
        await row.save();
      }
    }
    for (const row of ctRows) {
      const existing = await CtMark.findOne({ studentId: row.studentId, courseId: teacherCourse._id, semesterLabel: row.semesterLabel });
      if (existing) await CtMark.deleteOne({ _id: row._id });
      else {
        row.courseId = teacherCourse._id;
        row.teacherId = teacherCourse.teacherId;
        row.batch = teacherCourse.batch;
        await row.save();
      }
    }

    await Course.deleteOne({ _id: sourceCourse._id });
  }
};

const getEnrolledCourseStudents = async (course, batch, section) => {
  const normalizedBatch = normalizeBatchValue(batch);
  const normalizedSection = normalize(section).toUpperCase();
  if (!course || !normalizedBatch || !normalizedSection || !batchesMatch(course.batch, normalizedBatch)) {
    return [];
  }

  const rows = await StudentCourse.find({
    courseId: course._id,
    semesterLabel: course.semesterLabel,
    status: "active",
  }).populate({
    path: "studentId",
    match: { batch: toBatchMongoMatch(normalizedBatch), section: normalizedSection },
    populate: { path: "userId", select: "name" },
  });

  return rows
    .filter((row) => row.studentId && row.studentId.userId)
    .map((row) => ({
      rollId: row.studentId.studentId,
      studentId: row.studentId.studentId,
      studentName: row.studentId.userId.name || "Student",
      studentRef: row.studentId._id,
    }))
    .sort((left, right) => left.studentId.localeCompare(right.studentId, undefined, { numeric: true }));
};

const normalizeTeacherRecords = (recordsInput, enrolledStudents, valueName) => {
  const byStudentRef = new Map();
  const byStudentId = new Map();

  recordsInput.forEach((record) => {
    const ref = normalize(record.studentRef);
    const studentId = normalize(record.studentId);
    const value = valueName === "status" ? normalize(record.status).toUpperCase() : Number(record.marks ?? record.score);
    if (ref) byStudentRef.set(ref, value);
    if (studentId) byStudentId.set(studentId, value);
  });

  const missing = [];
  const items = enrolledStudents.map((student) => {
    const value = byStudentRef.get(String(student.studentRef)) ?? byStudentId.get(student.studentId);
    const isValid = valueName === "status" ? ["P", "A"].includes(value) : Number.isFinite(value) && value >= 0 && value <= 20;
    if (!isValid) missing.push(student.studentId);
    return { ...student, [valueName]: value };
  });

  return { items, missing };
};

const getTeacherSectionStudents = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["teacher"])) return;
    if (!ctx.teacher) return res.status(404).json({ success: false, message: "Teacher profile not found." });

    const courseCode = normalize(req.query.courseCode || req.query.code).toUpperCase();
    const semesterLabel = normalize(req.query.semesterLabel || req.query.semester);
    const section = normalize(req.query.section).toUpperCase();
    const batchRaw = normalize(req.query.batch);

    if (!courseCode || !semesterLabel || !batchRaw || !section) {
      return res.status(400).json({ success: false, message: "courseCode, semesterLabel, batch and section are required." });
    }

    const course = await getTeacherCourse(ctx.teacher._id, courseCode, semesterLabel, batchRaw);
    if (!course) return res.status(404).json({ success: false, message: "This course is not assigned to the signed-in teacher for the selected batch and semester." });

    const items = await getEnrolledCourseStudents(course, batchRaw, section);
    return res.status(200).json({
      success: true,
      data: {
        course: toTeacherCourseItem(course),
        section,
        batch: normalizeBatchValue(batchRaw),
        items,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not load section students.", error: error.message });
  }
};

const checkTeacherAttendanceSession = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["teacher"])) return;
    if (!ctx.teacher) return res.status(404).json({ success: false, message: "Teacher profile not found." });

    const courseCode = normalize(req.query.courseCode || req.query.code).toUpperCase();
    const semesterLabel = normalize(req.query.semesterLabel || req.query.semester);
    const batch = normalizeBatchValue(req.query.batch);
    const section = normalize(req.query.section).toUpperCase();
    const date = normalize(req.query.date);

    if (!courseCode || !semesterLabel || !batch || !section || !date) {
      return res.status(400).json({
        success: false,
        message: "courseCode, semesterLabel, batch, section and date are required.",
      });
    }

    const course = await getTeacherCourse(ctx.teacher._id, courseCode, semesterLabel, batch);
    if (!course) {
      return res.status(200).json({ success: true, data: { exists: false } });
    }

    const existing = await TeacherAttendanceSession.findOne({
      courseId: course._id,
      teacherId: ctx.teacher._id,
      section,
      date,
    });

    return res.status(200).json({
      success: true,
      data: {
        exists: !!existing,
        session: existing
          ? {
              id: existing._id,
              courseCode: existing.courseCode,
              courseName: existing.courseName,
              section: existing.section,
              date: existing.date,
              presentCount: existing.presentCount,
              absentCount: existing.absentCount,
              savedAt: existing.updatedAt,
            }
          : null,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not check attendance session.", error: error.message });
  }
};

const saveTeacherAttendanceSession = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["teacher"])) return;
    if (!ctx.teacher) return res.status(404).json({ success: false, message: "Teacher profile not found." });

    const courseCode = normalize(req.body.courseCode || req.body.code).toUpperCase();
    const semesterLabel = normalize(req.body.semesterLabel || req.body.semester);
    const batch = normalizeBatchValue(req.body.batch);
    const section = normalize(req.body.section).toUpperCase();
    const date = normalize(req.body.date);
    const recordsInput = Array.isArray(req.body.records) ? req.body.records : [];

    if (!courseCode || !semesterLabel || !batch || !section || !date) {
      return res.status(400).json({
        success: false,
        message: "courseCode, semesterLabel, batch, section and date are required.",
      });
    }

    const course = await getTeacherCourse(ctx.teacher._id, courseCode, semesterLabel, batch);
    if (!course) {
      return res.status(404).json({ success: false, message: "This course is not assigned to the signed-in teacher for the selected batch and semester." });
    }

    const enrolledStudents = await getEnrolledCourseStudents(course, batch, section);
    if (!enrolledStudents.length) {
      return res.status(400).json({ success: false, message: "No enrolled students were found for this course, batch, and section." });
    }

    const { items: normalizedRecords, missing } = normalizeTeacherRecords(recordsInput, enrolledStudents, "status");
    if (missing.length) {
      return res.status(400).json({
        success: false,
        message: "Every enrolled student must be marked Present or Absent before saving.",
        data: { missingStudentIds: missing.slice(0, 5) },
      });
    }

    const presentCount = normalizedRecords.filter((row) => row.status === "P").length;
    const absentCount = normalizedRecords.filter((row) => row.status === "A").length;

    const duplicate = await TeacherAttendanceSession.findOne({
      courseId: course._id,
      teacherId: ctx.teacher._id,
      section,
      date,
    });
    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: "Attendance for this course, section, and date has already been saved.",
      });
    }

    const session = await TeacherAttendanceSession.create({
      courseId: course._id,
      teacherId: ctx.teacher._id,
      courseCode: course.code,
      courseName: course.name,
      semesterLabel,
      batch,
      section,
      date,
      records: normalizedRecords,
      presentCount,
      absentCount,
      savedByUserId: ctx.user._id,
    });

    await Promise.all(
      normalizedRecords.map(async (row) => {
        const attendanceRow = await Attendance.findOne({
          studentId: row.studentRef,
          courseId: course._id,
          semesterLabel,
        });

        const classStates = attendanceRow && Array.isArray(attendanceRow.classStates)
          ? attendanceRow.classStates.slice()
          : [];
        classStates.push(row.status);

        const present = classStates.filter((state) => state === "P").length;
        const absent = classStates.filter((state) => state === "A").length;
        const held = present + absent;
        const percentage = held ? Math.round((present / held) * 100) : 0;
        const predictedMark = getAttendanceMark(percentage, course.credit, course.courseType);
        const risk = getAttendanceRisk(percentage, held);

        return Attendance.findOneAndUpdate(
          { studentId: row.studentRef, courseId: course._id, semesterLabel },
          {
            $set: {
              classStates,
              classesHeld: held,
              attended: present,
              percentage,
              predictedMark,
              teacherId: ctx.teacher._id,
              batch,
              section,
              publishedByTeacher: true,
              risk,
            },
          },
          { upsert: true, setDefaultsOnInsert: true }
        );
      })
    );

    return res.status(201).json({
      success: true,
      message: "Attendance saved successfully.",
      data: {
        id: session._id,
        courseCode: session.courseCode,
        courseName: session.courseName,
        semesterLabel: session.semesterLabel,
        section: session.section,
        date: session.date,
        presentCount: session.presentCount,
        absentCount: session.absentCount,
        totalCount: session.records.length,
        savedAt: session.createdAt,
      },
    });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Attendance for this course, section, and date has already been saved.",
      });
    }
    return res.status(500).json({ success: false, message: "Could not save attendance.", error: error.message });
  }
};

const getTeacherCtMarksBySection = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["teacher"])) return;
    if (!ctx.teacher) return res.status(404).json({ success: false, message: "Teacher profile not found." });

    const courseCode = normalize(req.query.courseCode || req.query.code).toUpperCase();
    const semesterLabel = normalize(req.query.semesterLabel || req.query.semester);
    const batchRaw = normalize(req.query.batch);
    const section = normalize(req.query.section).toUpperCase();

    if (!courseCode || !semesterLabel || !batchRaw || !section) {
      return res.status(400).json({
        success: false,
        message: "courseCode, semesterLabel, batch and section are required.",
      });
    }

    const course = await getTeacherCourse(ctx.teacher._id, courseCode, semesterLabel, batchRaw);
    if (!course) {
      return res.status(404).json({ success: false, message: "This course is not assigned to the signed-in teacher for the selected batch and semester." });
    }

    const sectionItems = await getEnrolledCourseStudents(course, batchRaw, section);
    const studentRefs = sectionItems.map((item) => item.studentRef);

    const ctRows = studentRefs.length
      ? await CtMark.find({
          studentId: { $in: studentRefs },
          courseId: course._id,
          semesterLabel,
        })
      : [];

    const ctByStudentRef = new Map();
    ctRows.forEach((row) => {
      ctByStudentRef.set(String(row.studentId), {
        ct1: row.ct1,
        ct2: row.ct2,
        ct3: row.ct3,
        ct4: row.ct4,
        ct5: row.ct5,
      });
    });

    const items = sectionItems.map((item) => {
      const marks = item.studentRef
        ? ctByStudentRef.get(String(item.studentRef)) || { ct1: 0, ct2: 0, ct3: 0, ct4: 0, ct5: 0 }
        : { ct1: 0, ct2: 0, ct3: 0, ct4: 0, ct5: 0 };
      return {
        rollId: item.rollId,
        studentId: item.studentId,
        studentName: item.studentName,
        studentRef: item.studentRef,
        ct: [marks.ct1, marks.ct2, marks.ct3, marks.ct4, marks.ct5],
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        exists: true,
        course: {
          id: course._id,
          code: course.code,
          name: course.name,
          credit: course.credit,
          courseType: course.courseType,
        },
        policy: getCtPolicy(course.courseType, course.credit),
        semesterLabel,
        section,
        batch: normalizeBatchValue(batchRaw),
        items,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not load teacher CT marks.", error: error.message });
  }
};

// Returns the complete class result sheet for one of the signed-in teacher's
// course offerings.  The student list is always derived from StudentCourse;
// attendance and CT documents only enrich those enrolled students.
const getTeacherStudentResults = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["teacher"])) return;
    if (!ctx.teacher) return res.status(404).json({ success: false, message: "Teacher profile not found." });

    const courseCode = normalize(req.query.courseCode || req.query.code).toUpperCase();
    const semesterLabel = normalize(req.query.semesterLabel || req.query.semester);
    const batchRaw = normalize(req.query.batch);
    const section = normalize(req.query.section).toUpperCase();

    if (!courseCode || !semesterLabel || !batchRaw || !section) {
      return res.status(400).json({
        success: false,
        message: "courseCode, semesterLabel, batch and section are required.",
      });
    }

    const course = await getTeacherCourse(ctx.teacher._id, courseCode, semesterLabel, batchRaw);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: "This course is not assigned to the signed-in teacher for the selected batch and semester.",
      });
    }

    const enrolledStudents = await getEnrolledCourseStudents(course, batchRaw, section);
    const studentRefs = enrolledStudents.map((student) => student.studentRef);
    const baseFilter = {
      studentId: { $in: studentRefs },
      courseId: course._id,
      semesterLabel,
    };

    const [attendanceRows, ctRows, savedSessionCount] = await Promise.all([
      studentRefs.length ? Attendance.find(baseFilter) : [],
      studentRefs.length ? CtMark.find(baseFilter) : [],
      TeacherAttendanceSession.countDocuments({
        courseId: course._id,
        teacherId: ctx.teacher._id,
        section,
      }),
    ]);

    const attendanceByStudent = new Map(attendanceRows.map((row) => [String(row.studentId), row]));
    const ctByStudent = new Map(ctRows.map((row) => [String(row.studentId), row]));
    // Session count is the source of truth for the section. The fallback keeps
    // reports useful for attendance saved before attendance-session records
    // were introduced.
    const totalClasses = savedSessionCount || attendanceRows.reduce((highest, row) => Math.max(highest, Number(row.classesHeld || 0)), 0);
    const attendanceMaxMark = getAttendanceMaxMark(course.credit, course.courseType);
    const ctPolicy = getCtPolicy(course.courseType, course.credit);

    const items = enrolledStudents.map((student) => {
      const attendance = attendanceByStudent.get(String(student.studentRef));
      const ctRow = ctByStudent.get(String(student.studentRef));
      const present = Math.min(Number(attendance?.attended || 0), totalClasses);
      const percentage = totalClasses ? Math.round((present / totalClasses) * 100) : 0;
      const ct = [ctRow?.ct1, ctRow?.ct2, ctRow?.ct3, ctRow?.ct4, ctRow?.ct5]
        .map((value) => Number(value || 0))
        .slice(0, ctPolicy.totalCt);
      const ctTotal = ct.slice().sort((left, right) => right - left).slice(0, ctPolicy.bestCount).reduce((sum, value) => sum + value, 0);

      return {
        rollId: student.rollId,
        studentId: student.studentId,
        studentName: student.studentName,
        attendance: {
          recorded: Boolean(attendance),
          present,
          totalClasses,
          percentage,
          mark: getAttendanceMark(percentage, course.credit, course.courseType),
          maxMark: attendanceMaxMark,
        },
        ct: {
          recorded: Boolean(ctRow),
          marks: ct,
          total: ctTotal,
          maxMarks: ctPolicy.maxMarks,
          performance: ctRow ? getCtPerformance(ctTotal, ctPolicy.maxMarks) : "not recorded",
        },
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        course: toTeacherCourseItem(course),
        semesterLabel,
        batch: normalizeBatchValue(batchRaw),
        section,
        totalClasses,
        attendanceMaxMark,
        ctPolicy,
        items,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not load the student results sheet.", error: error.message });
  }
};

const saveTeacherCtMarksBySection = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["teacher"])) return;
    if (!ctx.teacher) return res.status(404).json({ success: false, message: "Teacher profile not found." });

    const courseCode = normalize(req.body.courseCode || req.body.code).toUpperCase();
    const semesterLabel = normalize(req.body.semesterLabel || req.body.semester);
    const batchRaw = normalizeBatchValue(req.body.batch);
    const section = normalize(req.body.section).toUpperCase();
    const ctNumber = Number(req.body.ctNumber);
    const recordsInput = Array.isArray(req.body.records) ? req.body.records : [];

    if (!courseCode || !semesterLabel || !batchRaw || !section || !Number.isFinite(ctNumber)) {
      return res.status(400).json({
        success: false,
        message: "courseCode, semesterLabel, batch, section, ctNumber and records are required.",
      });
    }

    if (![1, 2, 3, 4, 5].includes(ctNumber)) {
      return res.status(400).json({ success: false, message: "ctNumber must be between 1 and 5." });
    }

    const course = await getTeacherCourse(ctx.teacher._id, courseCode, semesterLabel, batchRaw);
    if (!course) {
      return res.status(404).json({ success: false, message: "This course is not assigned to the signed-in teacher for the selected batch and semester." });
    }

    const policy = getCtPolicy(course.courseType, course.credit);
    if (ctNumber > policy.totalCt) {
      return res.status(400).json({
        success: false,
        message: `CT-${ctNumber} is not valid for this course policy (${policy.label}).`,
      });
    }

    const enrolledStudents = await getEnrolledCourseStudents(course, batchRaw, section);
    if (!enrolledStudents.length) {
      return res.status(400).json({ success: false, message: "No enrolled students were found for this course, batch, and section." });
    }

    const { items: submittedRecords, missing } = normalizeTeacherRecords(recordsInput, enrolledStudents, "marks");
    if (missing.length) {
      return res.status(400).json({
        success: false,
        message: "Incomplete CT sheet. Every student in the section must have a CT mark.",
        data: { missingStudentIds: missing.slice(0, 5) },
      });
    }

    const updates = await Promise.all(
      submittedRecords.map(async (submitted) => {
        const studentRef = submitted.studentRef;
        const existing = await CtMark.findOne({
          studentId: studentRef,
          courseId: course._id,
          semesterLabel,
        });

        const values = [
          Number(existing ? existing.ct1 : 0),
          Number(existing ? existing.ct2 : 0),
          Number(existing ? existing.ct3 : 0),
          Number(existing ? existing.ct4 : 0),
          Number(existing ? existing.ct5 : 0),
        ];
        values[ctNumber - 1] = clamp(submitted.marks, 0, 20);

        const activeValues = values.slice(0, policy.totalCt);
        const sorted = activeValues.slice().sort((a, b) => b - a);
        const total = sorted.slice(0, policy.bestCount).reduce((sum, value) => sum + value, 0);
        const performance = getCtPerformance(total, policy.maxMarks);

        const updated = await CtMark.findOneAndUpdate(
          { studentId: studentRef, courseId: course._id, semesterLabel },
          {
            $set: {
              ct1: values[0],
              ct2: values[1],
              ct3: values[2],
              ct4: values[3],
              ct5: values[4],
              totalCt: policy.totalCt,
              bestCount: policy.bestCount,
              maxMarks: policy.maxMarks,
              total,
              teacherId: ctx.teacher._id,
              batch: batchRaw,
              section,
              publishedByTeacher: true,
              performance,
            },
          },
          { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
        );

        return {
          rollId: submitted.rollId,
          studentId: submitted.studentId,
          studentName: submitted.studentName,
          studentRef,
          ct: [updated.ct1, updated.ct2, updated.ct3, updated.ct4, updated.ct5],
          marks: submitted.marks,
          skipped: false,
        };
      })
    );

    return res.status(200).json({
      success: true,
      message: `CT-${ctNumber} marks saved successfully.`,
      data: {
        course: {
          id: course._id,
          code: course.code,
          name: course.name,
          credit: course.credit,
          courseType: course.courseType,
        },
        policy,
        semesterLabel,
        section,
        batch: normalizeBatchValue(batchRaw),
        ctNumber,
        items: updates,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not save teacher CT marks.", error: error.message });
  }
};

const { analyzeCourseFeasibility, generateAiCoaching } = require("../services/ai.service");

const getStudentAiSuggestions = async (req, res) => {
  try {
    const ctx = await withContext(req);
    if (!ensureRole(res, ctx.user, ["student"])) return;
    if (!ctx.student) {
      return res.status(404).json({ success: false, message: "Student profile not found." });
    }

    const semesterLabel = normalize(req.query.semesterLabel || req.query.semester || "");

    // 1. Get student's enrolled courses
    const studentCourseQuery = { studentId: ctx.student._id };
    if (semesterLabel) studentCourseQuery.semesterLabel = semesterLabel;

    const studentCourses = await StudentCourse.find(studentCourseQuery).populate("courseId");
    if (!studentCourses.length) {
      return res.status(200).json({ success: true, data: { items: [] } });
    }

    // 2. Fetch corresponding attendance & CT marks for these courses
    const courseIds = studentCourses.map((sc) => sc.courseId?._id).filter(Boolean);

    const [attendanceRecords, ctRecords] = await Promise.all([
      Attendance.find({
        studentId: ctx.student._id,
        courseId: { $in: courseIds },
      }).lean(),
      CtMark.find({
        studentId: ctx.student._id,
        courseId: { $in: courseIds },
      }).lean(),
    ]);

    const attendanceMap = new Map();
    attendanceRecords.forEach((att) => {
      const key = `${att.courseId.toString()}_${att.semesterLabel}`;
      attendanceMap.set(key, att);
    });

    const ctMap = new Map();
    ctRecords.forEach((ct) => {
      const key = `${ct.courseId.toString()}_${ct.semesterLabel}`;
      ctMap.set(key, ct);
    });

    // 3. Process each course and analyze feasibility
    const items = await Promise.all(
      studentCourses.map(async (sc) => {
        const course = sc.courseId;
        if (!course) return null;

        const key = `${course._id.toString()}_${sc.semesterLabel}`;
        const att = attendanceMap.get(key);
        const ct = ctMap.get(key);

        // Extract published CT scores
        let ctScores = [];
        if (ct) {
          const raw = [ct.ct1, ct.ct2, ct.ct3, ct.ct4];
          const totalPublishedCt = Number(ct.totalCt || 4);
          ctScores = raw.slice(0, totalPublishedCt).filter((val) => typeof val === "number" && val > 0);
        }

        // Attendance stats
        const attended = att ? Number(att.attended || 0) : 0;
        const classesHeld = att ? Number(att.classesHeld || 0) : 0;
        const totalClasses = Number(course.totalClasses || 39);

        // Run feasibility analysis (300 Marks Scheme: 60 CT best 3 of 4, 30 Attendance, 210 Final)
        const analysis = analyzeCourseFeasibility({
          course: {
            code: course.code,
            name: course.name,
            credit: course.credit,
            teacherName: course.teacherName,
            totalClasses,
          },
          ctScores,
          totalCt: 4,
          attended,
          classesHeld,
          totalClasses,
        });

        // Add AI guidance (Gemini if key set, else heuristic)
        const aiGuidance = await generateAiCoaching(analysis);

        return {
          id: sc._id,
          semesterLabel: sc.semesterLabel,
          ...analysis,
          aiGuidance,
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: {
        items: items.filter(Boolean),
      },
    });
  } catch (error) {
    console.error("Failed to generate AI suggestions:", error);
    return res.status(500).json({
      success: false,
      message: "Could not generate AI suggestions.",
      error: error.message,
    });
  }
};

module.exports = {
  getStudentAiSuggestions,
  getStudentCourses,
  addStudentCourse,
  updateStudentCourse,
  deleteStudentCourse,
  clearStudentSemesterData,
  getStudentAttendance,
  saveStudentAttendance,
  getStudentCtMarks,
  saveStudentCtMarks,
  getSemesterSetup,
  saveSemesterSetup,
  getSemesterCgpa,
  saveSemesterCgpa,
  getStudentCumulativeCgpa,
  getStudentRanking,
  getStudentAssignedAdvisor,
  getAdvisorStudentsByBatch,
  getAdvisorStudentReport,
  getAdvisorPerformanceWatchlist,
  getNotices,
  createNotice,
  getAdminAdvisors,
  getAdvisorAssignments,
  getAdminStudentsByBatch,
  createAdvisorAssignment,
  getMessages,
  sendMessage,
  getTeacherCourses,
  saveTeacherCourse,
  updateTeacherCourse,
  deleteTeacherCourse,
  getTeacherSectionStudents,
  checkTeacherAttendanceSession,
  saveTeacherAttendanceSession,
  getTeacherCtMarksBySection,
  getTeacherStudentResults,
  saveTeacherCtMarksBySection,
};
