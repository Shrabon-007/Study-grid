import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { PortalLayout, ProtectedRoute } from "./components/ui";
import { LoginPage, RegisterPage } from "./pages/AuthPages";
import { DashboardPage, NoticesPage, SettingsPage } from "./pages/SharedPages";
import { AttendancePage, CtMarksPage, CumulativeCgpaPage, RunningCgpaPage, SemesterCgpaPage, StudentCoursesPage } from "./pages/StudentPages";
import { AiCgpaPredictorPage } from "./pages/AiCgpaPredictorPage";
import { AdvisorAssignmentPage, AdvisorRankingPage, AdvisorStudentReportPage, AdvisorWatchlistPage, MessagesPage } from "./pages/AdminAdvisorPages";
import { TeacherAttendancePage, TeacherCoursesPage, TeacherCtMarksPage, TeacherStudentResultsPage } from "./pages/TeacherPages";

function RolePage({ role, children }) { return <ProtectedRoute role={role}><PortalLayout>{children}</PortalLayout></ProtectedRoute>; }
function LegacyRedirect({ to }) { return <Navigate to={to} replace />; }
function LegacyPageRedirect() {
  const { legacy } = useParams();
  const to = {
    "login.html": "/login",
    "student-login.html": "/login?role=student",
    "advisor-login.html": "/login?role=advisor",
    "admin-login.html": "/login?role=admin",
    "teacher-login.html": "/login?role=teacher",
    "student-register.html": "/register",
    "advisor-register.html": "/register",
    "admin-register.html": "/register",
    "teacher-register.html": "/register",
    "advisor-student-profile.html": "/advisor/ranking",
  }[legacy];
  return <Navigate to={to || "/login"} replace />;
}

export default function App() {
  return <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/register" element={<RegisterPage />} />
    <Route path="/student/dashboard" element={<RolePage role="student"><DashboardPage role="student" /></RolePage>} />
    <Route path="/student/courses" element={<RolePage role="student"><StudentCoursesPage /></RolePage>} />
    <Route path="/student/attendance" element={<RolePage role="student"><AttendancePage /></RolePage>} />
    <Route path="/student/ct-marks" element={<RolePage role="student"><CtMarksPage /></RolePage>} />
    <Route path="/student/ai-predictor" element={<RolePage role="student"><AiCgpaPredictorPage /></RolePage>} />
    <Route path="/student/semester-cgpa" element={<RolePage role="student"><SemesterCgpaPage /></RolePage>} />
    <Route path="/student/running-cgpa" element={<RolePage role="student"><RunningCgpaPage /></RolePage>} />
    <Route path="/student/cumulative-cgpa" element={<RolePage role="student"><CumulativeCgpaPage /></RolePage>} />
    <Route path="/student/notices" element={<RolePage role="student"><NoticesPage role="student" /></RolePage>} />
    <Route path="/student/messages" element={<RolePage role="student"><MessagesPage role="student" /></RolePage>} />
    <Route path="/student/settings" element={<RolePage role="student"><SettingsPage role="student" /></RolePage>} />
    <Route path="/advisor/dashboard" element={<RolePage role="advisor"><DashboardPage role="advisor" /></RolePage>} />
    <Route path="/advisor/ranking" element={<RolePage role="advisor"><AdvisorRankingPage /></RolePage>} />
    <Route path="/advisor/student-report" element={<RolePage role="advisor"><AdvisorStudentReportPage /></RolePage>} />
    <Route path="/advisor/watchlist" element={<RolePage role="advisor"><AdvisorWatchlistPage /></RolePage>} />
    <Route path="/advisor/messages" element={<RolePage role="advisor"><MessagesPage role="advisor" /></RolePage>} />
    <Route path="/advisor/notices" element={<RolePage role="advisor"><NoticesPage role="advisor" /></RolePage>} />
    <Route path="/advisor/settings" element={<RolePage role="advisor"><SettingsPage role="advisor" /></RolePage>} />
    <Route path="/admin/dashboard" element={<RolePage role="admin"><DashboardPage role="admin" /></RolePage>} />
    <Route path="/admin/assign-advisor" element={<RolePage role="admin"><AdvisorAssignmentPage /></RolePage>} />
    <Route path="/admin/notices" element={<RolePage role="admin"><NoticesPage role="admin" admin /></RolePage>} />
    <Route path="/admin/settings" element={<RolePage role="admin"><SettingsPage role="admin" /></RolePage>} />
    <Route path="/teacher/dashboard" element={<RolePage role="teacher"><DashboardPage role="teacher" /></RolePage>} />
    <Route path="/teacher/courses" element={<RolePage role="teacher"><TeacherCoursesPage /></RolePage>} />
    <Route path="/teacher/attendance" element={<RolePage role="teacher"><TeacherAttendancePage /></RolePage>} />
    <Route path="/teacher/ct-marks" element={<RolePage role="teacher"><TeacherCtMarksPage /></RolePage>} />
    <Route path="/teacher/student-results" element={<RolePage role="teacher"><TeacherStudentResultsPage /></RolePage>} />
    <Route path="/teacher/notices" element={<RolePage role="teacher"><NoticesPage role="teacher" /></RolePage>} />
    <Route path="/teacher/settings" element={<RolePage role="teacher"><SettingsPage role="teacher" /></RolePage>} />
    <Route path="/student-dashboard.html" element={<LegacyRedirect to="/student/dashboard" />} />
    <Route path="/student-courses.html" element={<LegacyRedirect to="/student/courses" />} />
    <Route path="/student-attendance.html" element={<LegacyRedirect to="/student/attendance" />} />
    <Route path="/student-ct-marks.html" element={<LegacyRedirect to="/student/ct-marks" />} />
    <Route path="/student-semester-cgpa.html" element={<LegacyRedirect to="/student/semester-cgpa" />} />
    <Route path="/student-running-semester-cgpa.html" element={<LegacyRedirect to="/student/running-cgpa" />} />
    <Route path="/student-cumulative-cgpa.html" element={<LegacyRedirect to="/student/cumulative-cgpa" />} />
    <Route path="/student-notices.html" element={<LegacyRedirect to="/student/notices" />} />
    <Route path="/student-message-advisor.html" element={<LegacyRedirect to="/student/messages" />} />
    <Route path="/student-settings.html" element={<LegacyRedirect to="/student/settings" />} />
    <Route path="/advisor-dashboard.html" element={<LegacyRedirect to="/advisor/dashboard" />} />
    <Route path="/advisor-student-ranking.html" element={<LegacyRedirect to="/advisor/ranking" />} />
    <Route path="/advisor-danger-zone.html" element={<LegacyRedirect to="/advisor/watchlist" />} />
    <Route path="/advisor-messages.html" element={<LegacyRedirect to="/advisor/messages" />} />
    <Route path="/advisor-notices.html" element={<LegacyRedirect to="/advisor/notices" />} />
    <Route path="/advisor-settings.html" element={<LegacyRedirect to="/advisor/settings" />} />
    <Route path="/admin-dashboard.html" element={<LegacyRedirect to="/admin/dashboard" />} />
    <Route path="/admin-assign-advisor.html" element={<LegacyRedirect to="/admin/assign-advisor" />} />
    <Route path="/admin-notices.html" element={<LegacyRedirect to="/admin/notices" />} />
    <Route path="/admin-settings.html" element={<LegacyRedirect to="/admin/settings" />} />
    <Route path="/teacher-dashboard.html" element={<LegacyRedirect to="/teacher/dashboard" />} />
    <Route path="/teacher-courses.html" element={<LegacyRedirect to="/teacher/courses" />} />
    <Route path="/teacher-attendance.html" element={<LegacyRedirect to="/teacher/attendance" />} />
    <Route path="/teacher-ct-marks.html" element={<LegacyRedirect to="/teacher/ct-marks" />} />
    <Route path="/teacher-student-results.html" element={<LegacyRedirect to="/teacher/student-results" />} />
    <Route path="/teacher-notices.html" element={<LegacyRedirect to="/teacher/notices" />} />
    <Route path="/teacher-settings.html" element={<LegacyRedirect to="/teacher/settings" />} />
    <Route path="/:legacy" element={<LegacyPageRedirect />} />
    <Route path="*" element={<Navigate to="/login" replace />} />
  </Routes>;
}
