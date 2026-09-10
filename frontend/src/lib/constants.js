export const SEMESTERS = [
  "Level-1 Term-1",
  "Level-1 Term-2",
  "Level-2 Term-1",
  "Level-2 Term-2",
  "Level-3 Term-1",
  "Level-3 Term-2",
  "Level-4 Term-1",
  "Level-4 Term-2",
];

export const ROLE_LABELS = {
  admin: "Admin",
  advisor: "Advisor",
  student: "Student",
  teacher: "Teacher",
};

export const DASHBOARD_PATHS = {
  admin: "/admin/dashboard",
  advisor: "/advisor/dashboard",
  student: "/student/dashboard",
  teacher: "/teacher/dashboard",
};

export const NAV_ITEMS = {
  student: [
    ["Dashboard", "/student/dashboard"], ["Courses", "/student/courses"],
    ["Attendance", "/student/attendance"], ["Marks", "/student/ct-marks"],
    ["CGPA", "/student/semester-cgpa"], ["Running CGPA", "/student/running-cgpa"],
    ["AI CGPA Predictor", "/student/ai-cgpa"],
    ["Notices", "/student/notices"], ["Messages", "/student/messages"], ["Settings", "/student/settings"],
  ],
  advisor: [
    ["Dashboard", "/advisor/dashboard"], ["Student ranking", "/advisor/ranking"],
    ["Watchlist", "/advisor/watchlist"], ["Messages", "/advisor/messages"],
    ["Notices", "/advisor/notices"], ["Settings", "/advisor/settings"],
  ],
  admin: [
    ["Dashboard", "/admin/dashboard"], ["Assign advisor", "/admin/assign-advisor"],
    ["Notices", "/admin/notices"], ["Settings", "/admin/settings"],
  ],
  teacher: [
    ["Dashboard", "/teacher/dashboard"], ["Courses", "/teacher/courses"],
    ["Attendance", "/teacher/attendance"], ["CT marks", "/teacher/ct-marks"],
    ["Student results", "/teacher/student-results"],
    ["Notices", "/teacher/notices"], ["Settings", "/teacher/settings"],
  ],
};
