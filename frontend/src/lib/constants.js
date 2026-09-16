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
  student: "Student",
  teacher: "Teacher",
};

export const DASHBOARD_PATHS = {
  admin: "/admin/dashboard",
  student: "/student/dashboard",
  teacher: "/teacher/dashboard",
};

export const NAV_ITEMS = {
  student: [
    ["Dashboard", "/student/dashboard"], ["Courses", "/student/courses"],
    ["Attendance", "/student/attendance"], ["Marks", "/student/ct-marks"],
    ["CGPA", "/student/semester-cgpa"], ["Running CGPA", "/student/running-cgpa"],
    ["Notices", "/student/notices"], ["Messages", "/student/messages"], ["Settings", "/student/settings"],
  ],
  admin: [
    ["Dashboard", "/admin/dashboard"], ["Teacher management", "/admin/assign-advisor"],
    ["Notices", "/admin/notices"], ["Settings", "/admin/settings"],
  ],
  teacher: [
    ["Dashboard", "/teacher/dashboard"], ["Courses", "/teacher/courses"],
    ["Attendance", "/teacher/attendance"], ["CT marks", "/teacher/ct-marks"],
    ["Student results", "/teacher/student-results"],
    ["Notices", "/teacher/notices"], ["Settings", "/teacher/settings"],
  ],
};

/* Extra nav items shown only for teachers who are also advisors */
export const ADVISOR_NAV_ITEMS = [
  ["Student ranking", "/teacher/advisor-ranking"],
  ["Watchlist", "/teacher/advisor-watchlist"],
  ["Advisor messages", "/teacher/advisor-messages"],
];
