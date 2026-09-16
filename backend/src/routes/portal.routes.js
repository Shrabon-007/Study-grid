const express = require("express");

const { authGuard } = require("../middleware/auth.middleware");
const {
  getStudentCourses,
  addStudentCourse,
  updateStudentCourse,
  deleteStudentCourse,
  clearStudentSemesterData,
  getStudentAttendance,
  saveStudentAttendance,
  getStudentCtMarks,
  saveStudentCtMarks,
  getStudentAiSuggestions,
  getGroundedChat,
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
} = require("../controllers/portal.controller");

const router = express.Router();

router.use(authGuard);

router.get("/student/courses", getStudentCourses);
router.post("/student/courses", addStudentCourse);
router.put("/student/courses/:courseId", updateStudentCourse);
router.delete("/student/courses/:courseId", deleteStudentCourse);
router.delete("/student/semester-data", clearStudentSemesterData);

router.get("/student/attendance", getStudentAttendance);
router.put("/student/attendance", saveStudentAttendance);

router.get("/student/ct-marks", getStudentCtMarks);
router.put("/student/ct-marks", saveStudentCtMarks);

router.get("/student/ai-suggestions", getStudentAiSuggestions);
router.post("/ai/chat", getGroundedChat);

router.get("/student/semester-setup", getSemesterSetup);
router.put("/student/semester-setup", saveSemesterSetup);

router.get("/student/semester-cgpa", getSemesterCgpa);
router.put("/student/semester-cgpa", saveSemesterCgpa);
router.get("/student/cumulative-cgpa", getStudentCumulativeCgpa);
router.get("/student/ranking", getStudentRanking);
router.get("/student/advisor", getStudentAssignedAdvisor);
router.get("/advisor/students", getAdvisorStudentsByBatch);
router.get("/advisor/student-report", getAdvisorStudentReport);
router.get("/advisor/performance-watchlist", getAdvisorPerformanceWatchlist);

router.get("/notices", getNotices);
router.post("/admin/notices", createNotice);

router.get("/admin/advisors", getAdminAdvisors);
router.get("/admin/assignments", getAdvisorAssignments);
router.get("/admin/students", getAdminStudentsByBatch);
router.post("/admin/assignments", createAdvisorAssignment);

router.get("/messages", getMessages);
router.post("/messages", sendMessage);

router.get("/teacher/courses", getTeacherCourses);
router.post("/teacher/courses", saveTeacherCourse);
router.put("/teacher/courses/:courseId", updateTeacherCourse);
router.delete("/teacher/courses/:courseId", deleteTeacherCourse);
router.get("/teacher/attendance/students", getTeacherSectionStudents);
router.get("/teacher/attendance/check", checkTeacherAttendanceSession);
router.post("/teacher/attendance", saveTeacherAttendanceSession);
router.get("/teacher/ct-marks", getTeacherCtMarksBySection);
router.put("/teacher/ct-marks", saveTeacherCtMarksBySection);
router.get("/teacher/student-results", getTeacherStudentResults);

module.exports = router;
