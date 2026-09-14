import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { api, dataItems, formatDate } from "../lib/api";
import { DASHBOARD_PATHS, ROLE_LABELS } from "../lib/constants";
import {
  Card,
  DataTable,
  EmptyState,
  NoticeBadge,
  PageTitle,
  Spinner,
  Toast,
  useToast,
} from "../components/ui";
import { useAuth } from "../context/AuthContext";

const dashboardActions = {
  student: [
    [
      "Courses",
      "Manage your running-semester courses",
      "/student/courses",
      "CR",
    ],
    [
      "Attendance",
      "Track attendance and predicted marks",
      "/student/attendance",
      "AT",
    ],
    ["CT Marks", "Review CT performance", "/student/ct-marks", "CT"],
    ["Semester CGPA", "Save result history", "/student/semester-cgpa", "CG"],
    [
      "Message advisor",
      "Request a meeting or send a question",
      "/student/messages",
      "MS",
    ],
  ],
  advisor: [
    ["Student ranking", "Review assigned students", "/advisor/ranking", "RK"],
    [
      "Watchlist",
      "Follow up with at-risk students",
      "/advisor/watchlist",
      "WL",
    ],
    ["Messages", "Reply to student messages", "/advisor/messages", "MS"],
  ],
  admin: [
    [
      "Assign advisor",
      "Assign an advisor to a student range",
      "/admin/assign-advisor",
      "AS",
    ],
    ["Post notice", "Share an academic notice", "/admin/notices", "NT"],
  ],
  teacher: [
    [
      "My courses",
      "Create and organize course lists",
      "/teacher/courses",
      "CR",
    ],
    [
      "Take attendance",
      "Record a section attendance session",
      "/teacher/attendance",
      "AT",
    ],
    ["Update CT marks", "Enter section CT marks", "/teacher/ct-marks", "CT"],
    [
      "Student results",
      "Review attendance and CT results for a section",
      "/teacher/student-results",
      "RS",
    ],
  ],
};

export function DashboardPage({ role }) {
  const { session } = useAuth();
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api("/portal/notices")
      .then((response) => setNotices(dataItems(response).slice(0, 6)))
      .catch(() => setNotices([]))
      .finally(() => setLoading(false));
  }, []);
  const profile = session?.profile || {};
  const summary =
    role === "student"
      ? `${profile.department || "Department"} · Batch ${profile.batch || "—"}`
      : role === "teacher"
        ? `${profile.department || "Department"} · ${profile.teacherId || "Teacher"}`
        : role === "advisor"
          ? `${profile.department || "Department"} · Advisor ${profile.advisorId || ""}`
          : "Manage Study Grid operations";
  return (
    <>
      <section className="hero-card">
        <div className="avatar avatar-hero">
          {session?.name?.slice(0, 1)?.toUpperCase() || "U"}
        </div>
        <div>
          <p className="eyebrow">{ROLE_LABELS[role]} workspace</p>
          <h1>{session?.name || `${ROLE_LABELS[role]} User`}</h1>
          <p>{summary}</p>
        </div>
      </section>
      <PageTitle title="Quick actions" subtitle="Choose a task to continue." />
      <section className="action-grid">
        {dashboardActions[role].map(([title, body, to, symbol]) => (
          <Link key={to} className="action-card" to={to}>
            <span className="action-icon">{symbol}</span>
            <h2>{title}</h2>
            <p>{body}</p>
            <span className="action-link">
              Open <span aria-hidden>→</span>
            </span>
          </Link>
        ))}
      </section>
      <Card className="space-top">
        <div className="card-heading">
          <div>
            <h2>Latest notices</h2>
            <p className="muted">Notices shared with your role.</p>
          </div>
          <Link className="text-link" to={`/${role}/notices`}>
            View all
          </Link>
        </div>
        {loading ? (
          <Spinner />
        ) : (
          <DataTable
            columns={["Date", "Title", "Priority", "Audience"]}
            empty="No notices are available."
          >
            {notices.map((notice) => (
              <tr key={notice.id || notice._id}>
                <td>{formatDate(notice.createdAt || notice.date)}</td>
                <td>{notice.title}</td>
                <td>
                  <NoticeBadge priority={notice.priority} />
                </td>
                <td>{notice.target || "All"}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>
    </>
  );
}

export function NoticesPage({ role, admin = false }) {
  const [notices, setNotices] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const { toast, show, close } = useToast();
  const [form, setForm] = useState({
    title: "",
    target: "all",
    priority: "normal",
    content: "",
  });
  const load = () => {
    setLoading(true);
    api("/portal/notices")
      .then((response) => {
        const items = dataItems(response);
        setNotices(items);
        setSelected(items[0] || null);
      })
      .catch((error) => show(error.message, "error"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);
  const submit = async (event) => {
    event.preventDefault();
    try {
      await api("/portal/admin/notices", { method: "POST", body: form });
      setForm({ title: "", target: "all", priority: "normal", content: "" });
      show("Notice published.");
      load();
    } catch (error) {
      show(error.message, "error");
    }
  };
  return (
    <>
      <PageTitle
        title={admin ? "Notice management" : `${ROLE_LABELS[role]} notices`}
        subtitle={
          admin
            ? "Create notices for the academic community."
            : "Open a notice to see its complete details."
        }
      />
      {admin && (
        <Card className="space-bottom">
          <h2>Create and send notice</h2>
          <form onSubmit={submit} className="form-grid form-grid-wide">
            <label className="form-group">
              <span>Title</span>
              <input
                value={form.title}
                onChange={(event) =>
                  setForm({ ...form, title: event.target.value })
                }
                required
                placeholder="Advising session schedule"
              />
            </label>
            <label className="form-group">
              <span>Audience</span>
              <select
                value={form.target}
                onChange={(event) =>
                  setForm({ ...form, target: event.target.value })
                }
              >
                <option value="all">All users</option>
                <option value="student">Students</option>
                <option value="advisor">Advisors</option>
                <option value="teacher">Teachers</option>
              </select>
            </label>
            <label className="form-group">
              <span>Priority</span>
              <select
                value={form.priority}
                onChange={(event) =>
                  setForm({ ...form, priority: event.target.value })
                }
              >
                <option value="normal">Normal</option>
                <option value="important">Important</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
            <label className="form-group form-full">
              <span>Message</span>
              <textarea
                rows="4"
                value={form.content}
                onChange={(event) =>
                  setForm({ ...form, content: event.target.value })
                }
                required
                placeholder="Write the notice details…"
              />
            </label>
            <div className="form-full">
              <button className="btn btn-primary">Publish notice</button>
            </div>
          </form>
        </Card>
      )}
      <section className="split-panel">
        <Card>
          <h2>{admin ? "Recent notices" : "Notice list"}</h2>
          {loading ? (
            <Spinner />
          ) : (
            <DataTable
              columns={["Date", "Title", "Priority"]}
              empty="No notices are available."
            >
              {notices.map((notice) => (
                <tr
                  key={notice.id || notice._id}
                  className="clickable-row"
                  onClick={() => setSelected(notice)}
                >
                  <td>{formatDate(notice.createdAt || notice.date)}</td>
                  <td>{notice.title}</td>
                  <td>
                    <NoticeBadge priority={notice.priority} />
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </Card>
        {!admin && (
          <Card>
            <h2>Notice details</h2>
            {selected ? (
              <article className="notice-detail">
                <div className="card-heading">
                  <NoticeBadge priority={selected.priority} />
                  <span>{formatDate(selected.createdAt || selected.date)}</span>
                </div>
                <h3>{selected.title}</h3>
                <p className="pre-wrap">
                  {selected.content ||
                    selected.message ||
                    "No details provided."}
                </p>
              </article>
            ) : (
              <EmptyState>Select a notice to read it.</EmptyState>
            )}
          </Card>
        )}
      </section>
      <Toast {...toast} onClose={close} />
    </>
  );
}

export function SettingsPage({ role }) {
  const { session, setSession } = useAuth();
  const [form, setForm] = useState({
    name: "",
    email: "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
    studentId: "",
    batch: "",
    level: "1",
    term: "1",
    section: "A",
    advisorId: "",
    batchFocus: "",
    teacherId: "",
    username: "",
    department: "",
  });
  const [loading, setLoading] = useState(true);
  const { toast, show, close } = useToast();
  useEffect(() => {
    api("/auth/me")
      .then((response) => {
        const { user = {}, profile = {} } = response.data || {};
        setForm((prev) => ({
          ...prev,
          name: user.name || "",
          email: user.email || "",
          studentId: profile.studentId || "",
          batch: profile.batch || "",
          level: profile.level || "1",
          term: profile.term || "1",
          section: profile.section || "A",
          advisorId: profile.advisorId || "",
          batchFocus: profile.batchFocus || "",
          teacherId: profile.teacherId || "",
          username: profile.username || "",
          department: profile.department || "",
        }));
      })
      .catch((error) => show(error.message, "error"))
      .finally(() => setLoading(false));
  }, []);
  const change = (name) => (event) =>
    setForm({ ...form, [name]: event.target.value });
  const submit = async (event) => {
    event.preventDefault();
    try {
      const response = await api("/auth/me", { method: "PUT", body: form });
      const { user = {}, profile = {} } = response.data || {};
      setSession({
        ...session,
        name: user.name || form.name,
        email: user.email || form.email,
        profile,
      });
      setForm((prev) => ({
        ...prev,
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      }));
      show("Account settings saved.");
    } catch (error) {
      show(error.message, "error");
    }
  };
  if (loading) return <Spinner />;
  return (
    <>
      <PageTitle
        title="Account settings"
        subtitle="Keep your contact and profile information up to date."
      />
      <Card>
        <form onSubmit={submit} className="form-grid">
          <label className="form-group">
            <span>Full name</span>
            <input value={form.name} onChange={change("name")} required />
          </label>
          <label className="form-group">
            <span>Email</span>
            <input
              type="email"
              value={form.email}
              onChange={change("email")}
              required
            />
          </label>
          {role === "student" && (
            <>
              <label className="form-group">
                <span>Student ID</span>
                <input
                  value={form.studentId}
                  onChange={change("studentId")}
                  required
                />
              </label>
              <label className="form-group">
                <span>Batch</span>
                <input value={form.batch} onChange={change("batch")} required />
              </label>
              <label className="form-group">
                <span>Level</span>
                <input
                  type="number"
                  min="1"
                  max="8"
                  value={form.level}
                  onChange={change("level")}
                  required
                />
              </label>
              <label className="form-group">
                <span>Term</span>
                <select value={form.term} onChange={change("term")}>
                  <option value="1">Term 1</option>
                  <option value="2">Term 2</option>
                </select>
              </label>
              <label className="form-group">
                <span>Section</span>
                <input
                  value={form.section}
                  onChange={change("section")}
                  required
                />
              </label>
            </>
          )}
          {role === "advisor" && (
            <>
              <label className="form-group">
                <span>Advisor ID</span>
                <input
                  value={form.advisorId}
                  onChange={change("advisorId")}
                  required
                />
              </label>
              <label className="form-group">
                <span>Batch focus</span>
                <input
                  value={form.batchFocus}
                  onChange={change("batchFocus")}
                />
              </label>
            </>
          )}
          {role === "teacher" && (
            <>
              <label className="form-group">
                <span>Teacher ID</span>
                <input
                  value={form.teacherId}
                  onChange={change("teacherId")}
                  required
                />
              </label>
              <label className="form-group">
                <span>Username</span>
                <input
                  value={form.username}
                  onChange={change("username")}
                  required
                />
              </label>
            </>
          )}
          {role !== "admin" && (
            <label className="form-group">
              <span>Department</span>
              <input
                value={form.department}
                onChange={change("department")}
                required
              />
            </label>
          )}
          <div className="form-divider form-full">
            Change password{" "}
            <span>Leave these blank to keep the existing password.</span>
          </div>
          <label className="form-group">
            <span>Current password</span>
            <input
              type="password"
              value={form.currentPassword}
              onChange={change("currentPassword")}
            />
          </label>
          <label className="form-group">
            <span>New password</span>
            <input
              type="password"
              value={form.newPassword}
              onChange={change("newPassword")}
              minLength="6"
            />
          </label>
          <label className="form-group">
            <span>Confirm new password</span>
            <input
              type="password"
              value={form.confirmPassword}
              onChange={change("confirmPassword")}
            />
          </label>
          <div className="form-full">
            <button className="btn btn-primary">Save changes</button>
          </div>
        </form>
      </Card>
      <Toast {...toast} onClose={close} />
    </>
  );
}
