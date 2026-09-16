import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, dataItems, formatDate } from "../lib/api";
import { SEMESTERS } from "../lib/constants";
import {
  Card,
  DataTable,
  EmptyState,
  PageTitle,
  RiskBadge,
  Spinner,
  Toast,
  useToast,
} from "../components/ui";

export function AdvisorAssignmentPage() {
  const [teachers, setTeachers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [students, setStudents] = useState([]);
  const [batch, setBatch] = useState("2022");
  const [form, setForm] = useState({
    batch: "2022",
    teacherId: "",
    teacherName: "",
    startSerial: "2204001",
    endSerial: "2204010",
  });
  const [loading, setLoading] = useState(true);
  const { toast, show, close } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const [teacherPayload, assignmentPayload] = await Promise.all([
        api("/portal/admin/teachers"),
        api("/portal/admin/assignments"),
      ]);
      const teacherItems = dataItems(teacherPayload);
      setTeachers(teacherItems);
      setAssignments(dataItems(assignmentPayload));
      if (!form.teacherId && teacherItems[0]) {
        setForm((prev) => ({
          ...prev,
          teacherId: teacherItems[0].id,
          teacherName: teacherItems[0].name,
        }));
      }
    } catch (error) {
      show(error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const loadStudents = async (nextBatch) => {
    try {
      const payload = await api(
        `/portal/admin/students?batch=${encodeURIComponent(nextBatch)}`,
      );
      setStudents(dataItems(payload));
    } catch (error) {
      setStudents([]);
      show(error.message, "error");
    }
  };

  const toggleAdvisor = async (teacher) => {
    try {
      await api(`/portal/admin/teachers/${teacher.id}/advisor`, {
        method: "PUT",
        body: { isAdvisor: !teacher.isAdvisor, batchFocus: teacher.batchFocus || "" },
      });
      show(
        teacher.isAdvisor
          ? `${teacher.name} is no longer assigned as an advisor.`
          : `${teacher.name} is now assigned as an advisor.`,
        teacher.isAdvisor ? "warning" : "success",
      );
      load();
    } catch (error) {
      show(error.message, "error");
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    loadStudents(batch);
  }, [batch]);

  const submit = async (event) => {
    event.preventDefault();
    try {
      const teacher = teachers.find((item) => item.id === form.teacherId);
      if (!teacher) {
        throw new Error("Please select a teacher.");
      }
      await api("/portal/admin/assignments", {
        method: "POST",
        body: {
          batch: form.batch,
          teacherId: form.teacherId,
          advisorName: teacher.name,
          startSerial: Number(form.startSerial),
          endSerial: Number(form.endSerial),
        },
      });
      show("Teacher advisor assignment saved.");
      load();
      loadStudents(batch);
    } catch (error) {
      show(error.message, "error");
    }
  };

  return (
    <>
      <PageTitle
        title="Teacher management"
        subtitle="Manage teacher advisor access and assign advisor ranges within each batch."
      />
      <Card>
        <h2>Teacher advisor status</h2>
        {loading ? (
          <Spinner />
        ) : (
          <DataTable
            columns={["Teacher Name", "Role", "Advisor", "Action"]}
            empty="No teachers registered."
          >
            {teachers.map((teacher) => (
              <tr key={teacher.id}>
                <td>{teacher.name}</td>
                <td>Teacher</td>
                <td>
                  <span className={`badge ${teacher.isAdvisor ? "priority-urgent" : "priority-normal"}`}>
                    {teacher.isAdvisor ? "ON" : "OFF"}
                  </span>
                </td>
                <td>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => toggleAdvisor(teacher)}
                  >
                    {teacher.isAdvisor ? "Remove advisor" : "Make advisor"}
                  </button>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>
      <Card className="space-top">
        <h2>Assign advisor range by teacher</h2>
        <form onSubmit={submit} className="form-grid">
          <Label label="Batch">
            <input
              value={form.batch}
              onChange={(event) =>
                setForm({ ...form, batch: event.target.value })
              }
              required
            />
          </Label>
          <Label label="Teacher">
            <select
              value={form.teacherId}
              onChange={(event) => {
                const teacher = teachers.find((item) => item.id === event.target.value);
                setForm({
                  ...form,
                  teacherId: event.target.value,
                  teacherName: teacher ? teacher.name : "",
                });
              }}
              required
            >
              <option value="">Select a teacher</option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.name} · {teacher.department || "Department"}
                </option>
              ))}
            </select>
          </Label>
          <Label label="Student ID / serial start">
            <input
              type="number"
              value={form.startSerial}
              onChange={(event) =>
                setForm({ ...form, startSerial: event.target.value })
              }
              required
            />
          </Label>
          <Label label="Student ID / serial end">
            <input
              type="number"
              value={form.endSerial}
              onChange={(event) =>
                setForm({ ...form, endSerial: event.target.value })
              }
              required
            />
          </Label>
          <div className="form-full">
            <button className="btn btn-primary">Save advisor assignment</button>
          </div>
        </form>
        <p className="helper">
          Only teachers with advisor permission can be assigned advisee ranges. The backend still validates that each assignment contains exactly 10 students and does not overlap.
        </p>
      </Card>
      <section className="two-column space-top">
        <Card>
          <div className="card-heading">
            <h2>Students by batch</h2>
            <input
              value={batch}
              onChange={(event) => setBatch(event.target.value)}
              aria-label="Batch"
              placeholder="2022"
            />
          </div>
          <DataTable
            columns={["#", "Student ID", "Name", "Advisor"]}
            empty="No students in this batch."
          >
            {students.map((student) => (
              <tr key={student.studentId}>
                <td>{student.serial}</td>
                <td>{student.studentId}</td>
                <td>{student.name}</td>
                <td>{student.assignedAdvisor || "Unassigned"}</td>
              </tr>
            ))}
          </DataTable>
        </Card>
        <Card>
          <h2>Recent assignment history</h2>
          <DataTable
            columns={["Date", "Teacher", "Batch", "Student range", "Status"]}
            empty="No advisor assignments exist."
          >
            {assignments.map((item) => (
              <tr key={item.id || item._id}>
                <td>{formatDate(item.createdAt)}</td>
                <td>{item.advisorName}</td>
                <td>{item.batch}</td>
                <td>
                  {item.startSerial} – {item.endSerial}
                </td>
                <td className="capitalize">{item.status}</td>
              </tr>
            ))}
          </DataTable>
        </Card>
      </section>
      <Toast {...toast} onClose={close} />
    </>
  );
}

export function AdvisorRankingPage() {
  const [students, setStudents] = useState([]);
  const [batches, setBatches] = useState([]);
  const [batch, setBatch] = useState("");
  const [loading, setLoading] = useState(true);
  const { toast, show, close } = useToast();
  const navigate = useNavigate();
  const load = async (requestedBatch = batch) => {
    setLoading(true);
    try {
      const payload = await api(
        `/portal/teacher/advisor/students${requestedBatch ? `?batch=${encodeURIComponent(requestedBatch)}` : ""}`,
      );
      const data = payload.data || {};
      setStudents(data.items || []);
      setBatches(data.batches || []);
      if (!requestedBatch && data.batches?.[0]) setBatch(data.batches[0]);
    } catch (error) {
      show(error.message, "error");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load("");
  }, []);
  useEffect(() => {
    if (batch) load(batch);
  }, [batch]);
  return (
    <>
      <PageTitle
        title="Assigned students ranking"
        subtitle="Students are ordered by their current CGPA within your assigned batch."
        actions={
          <input
            value={batch}
            onChange={(event) => setBatch(event.target.value)}
            aria-label="Batch"
            placeholder="2022"
            style={{ minWidth: 120 }}
          />
        }
      />
      <Card>
        {loading ? (
          <Spinner />
        ) : (
          <DataTable
            columns={[
              "Rank",
              "Student",
              "Batch",
              "Current CGPA",
              "Overall CGPA",
              "",
            ]}
            empty="No assigned students were found."
          >
            {students.map((student) => (
              <tr key={student.userId || student.studentId}>
                <td>{student.rank}</td>
                <td>
                  <strong>{student.name}</strong>
                  <small>{student.studentId}</small>
                </td>
                <td>{student.batch}</td>
                <td>{Number(student.currentCgpa || 0).toFixed(2)}</td>
                <td>{Number(student.overallCgpa || 0).toFixed(2)}</td>
                <td>
                  <button
                    className="text-button"
                    onClick={() =>
                      navigate(
                        `/teacher/advisor-report?studentUserId=${encodeURIComponent(student.userId)}&studentId=${encodeURIComponent(student.studentId)}`,
                      )
                    }
                  >
                    View report
                  </button>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>
      <Toast {...toast} onClose={close} />
    </>
  );
}

export function AdvisorStudentReportPage() {
  const [params] = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const { toast, show, close } = useToast();
  useEffect(() => {
    const query = new URLSearchParams();
    if (params.get("studentUserId"))
      query.set("studentUserId", params.get("studentUserId"));
    if (params.get("studentId"))
      query.set("studentId", params.get("studentId"));
    api(`/portal/teacher/advisor/student-report?${query}`)
      .then((response) => setData(response.data || {}))
      .catch((error) => show(error.message, "error"))
      .finally(() => setLoading(false));
  }, []);
  if (loading) return <Spinner />;
  if (!data) return <EmptyState>Student report is unavailable.</EmptyState>;
  const summary = data.performanceSummary || {};
  return (
    <>
      <PageTitle
        title="Student academic report"
        subtitle={`${data.student?.name || "Student"} · ${data.student?.studentId || ""}`}
      />
      <section className="stat-grid">
        <ReportStat
          label="Overall CGPA"
          value={Number(data.overallCgpa || 0).toFixed(2)}
        />
        <ReportStat
          label="Class rank"
          value={
            data.ranking?.rank
              ? `${data.ranking.rank} / ${data.ranking.classSize}`
              : "—"
          }
        />
        <ReportStat
          label="Current CGPA"
          value={Number(data.currentSemesterCgpa || 0).toFixed(2)}
        />
        <ReportStat
          label="Average attendance"
          value={`${summary.avgAttendance || 0}%`}
        />
      </section>
      <section className="two-column space-top">
        <Card>
          <h2>Current semester attendance</h2>
          <DataTable
            columns={["Course", "Attendance", "Predicted", "Risk"]}
            empty="No attendance data."
          >
            {(data.currentSemesterAttendance || []).map((item) => (
              <tr key={item.courseCode}>
                <td>
                  {item.courseCode}
                  <small>{item.courseName}</small>
                </td>
                <td>{item.percentage}%</td>
                <td>{item.predictedMark}</td>
                <td>
                  <RiskBadge value={item.risk} />
                </td>
              </tr>
            ))}
          </DataTable>
        </Card>
        <Card>
          <h2>Current semester CT marks</h2>
          <DataTable
            columns={["Course", "Score", "Performance"]}
            empty="No CT data."
          >
            {(data.currentSemesterCtMarks || []).map((item) => (
              <tr key={item.courseCode}>
                <td>
                  {item.courseCode}
                  <small>{item.courseName}</small>
                </td>
                <td>
                  {item.total} / {item.maxMarks}
                </td>
                <td className="capitalize">{item.performance}</td>
              </tr>
            ))}
          </DataTable>
        </Card>
      </section>
      <section className="two-column space-top">
        <Card>
          <h2>Semester history</h2>
          <DataTable
            columns={["Semester", "CGPA", "Trend"]}
            empty="No CGPA history."
          >
            {(data.semesterCgpa || []).map((item) => (
              <tr key={item.semesterLabel}>
                <td>{item.semesterLabel}</td>
                <td>{item.cgpa}</td>
                <td className="capitalize">{item.trend}</td>
              </tr>
            ))}
          </DataTable>
        </Card>
        <Card>
          <h2>Performance summary</h2>
          <p>
            <strong>Standing:</strong> {summary.standing || "—"}
          </p>
          <p>
            <strong>CT average:</strong> {summary.avgCtPercent || 0}%
          </p>
          <p className="alert">
            {summary.suggestion || "No recommendation available."}
          </p>
        </Card>
      </section>
      <Toast {...toast} onClose={close} />
    </>
  );
}

export function AdvisorWatchlistPage() {
  const [students, setStudents] = useState([]);
  const [form, setForm] = useState({
    toUserId: "",
    subject: "Performance follow-up",
    content:
      "Please meet me this week regarding your current semester performance and improvement plan.",
  });
  const [loading, setLoading] = useState(true);
  const { toast, show, close } = useToast();
  const load = () => {
    setLoading(true);
    api("/portal/teacher/advisor/watchlist")
      .then((payload) => setStudents(dataItems(payload)))
      .catch((error) => show(error.message, "error"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);
  const submit = async (event) => {
    event.preventDefault();
    try {
      await api("/portal/messages", {
        method: "POST",
        body: { ...form, toRole: "student", channel: "sms" },
      });
      show("Follow-up SMS sent.");
    } catch (error) {
      show(error.message, "error");
    }
  };
  return (
    <>
      <PageTitle
        title="Performance watchlist"
        subtitle="Students need follow-up when any current academic risk is high."
      />
      <section className="two-column">
        <Card>
          <h2>At-risk students</h2>
          {loading ? (
            <Spinner />
          ) : (
            <DataTable
              columns={["Student", "CGPA", "Attendance", "CT", "Risk"]}
              empty="No students meet the high-risk threshold."
            >
              {students.map((student) => (
                <tr key={student.userId}>
                  <td>
                    <strong>{student.name}</strong>
                    <small>
                      {student.studentId} · Batch {student.batch}
                    </small>
                  </td>
                  <td>{student.currentCgpa}</td>
                  <td>{student.attendancePercent}%</td>
                  <td>{student.ctPercent}%</td>
                  <td>
                    <RiskBadge value={`Score ${student.riskScore}`} />
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </Card>
        <Card>
          <h2>Send a follow-up SMS</h2>
          <form onSubmit={submit} className="form-stack">
            <Label label="Student">
              <select
                value={form.toUserId}
                onChange={(event) =>
                  setForm({ ...form, toUserId: event.target.value })
                }
                required
              >
                <option value="">Select an at-risk student</option>
                {students.map((student) => (
                  <option key={student.userId} value={student.userId}>
                    {student.name} · {student.studentId}
                  </option>
                ))}
              </select>
            </Label>
            <Label label="Subject">
              <input
                value={form.subject}
                onChange={(event) =>
                  setForm({ ...form, subject: event.target.value })
                }
                required
              />
            </Label>
            <Label label="Message">
              <textarea
                rows="5"
                value={form.content}
                onChange={(event) =>
                  setForm({ ...form, content: event.target.value })
                }
                required
              />
            </Label>
            <button className="btn btn-primary">Send SMS</button>
          </form>
        </Card>
      </section>
      <Toast {...toast} onClose={close} />
    </>
  );
}

export function MessagesPage({ role }) {
  const [messages, setMessages] = useState([]);
  const [recipients, setRecipients] = useState([]);
  const [advisor, setAdvisor] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({
    toUserId: "",
    toName: "",
    subject: role === "teacher" ? "Meeting schedule" : "Meeting request",
    content: "",
  });
  const [loading, setLoading] = useState(true);
  const { toast, show, close } = useToast();
  const load = async () => {
    setLoading(true);
    try {
      const requests = [api("/portal/messages")];
      if (role === "teacher") requests.push(api("/portal/teacher/advisor/students"));
      else requests.push(api("/portal/student/advisor"));
      const [messagePayload, recipientPayload] = await Promise.all(requests);
      setMessages(dataItems(messagePayload));
      if (role === "teacher") setRecipients(recipientPayload.data?.items || []);
      else {
        const value = recipientPayload.data?.advisor || null;
        setAdvisor(value);
        setForm((previous) => ({
          ...previous,
          toUserId: value?.advisorUserId ? String(value.advisorUserId) : "",
          toName: value?.advisorName || "",
        }));
      }
    } catch (error) {
      show(error.message, "error");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, [role]);
  const submit = async (event) => {
    event.preventDefault();
    try {
      await api("/portal/messages", {
        method: "POST",
        body: {
          ...form,
          toRole: role === "teacher" ? "student" : "teacher",
          channel: role === "teacher" ? "sms" : "portal",
        },
      });
      setForm((previous) => ({ ...previous, content: "" }));
      show("Message sent.");
      load();
    } catch (error) {
      show(error.message, "error");
    }
  };
  return (
    <>
      <PageTitle
        title={
          role === "teacher"
            ? "Advisor SMS inbox & reply"
            : "Send message to advisor"
        }
        subtitle="Keep academic communication in one place."
      />
      <section className="two-column">
        <Card>
          <h2>{role === "teacher" ? "Student messages" : "Recent messages"}</h2>
          {loading ? (
            <Spinner />
          ) : (
            <DataTable
              columns={[
                "Date",
                role === "teacher" ? "Student" : "Direction",
                "Subject",
                "Status",
              ]}
              empty="No messages yet."
            >
              {messages.map((message) => (
                <tr
                  key={message.id}
                  className="clickable-row"
                  onClick={() => setSelected(message)}
                >
                  <td>{formatDate(message.date)}</td>
                  <td>
                    {role === "teacher"
                      ? message.fromName
                      : `${message.from} → ${message.to}`}
                  </td>
                  <td>{message.subject}</td>
                  <td className="capitalize">{message.status}</td>
                </tr>
              ))}
            </DataTable>
          )}
        </Card>
        <Card>
          <h2>
            {role === "teacher" ? "Reply / send SMS" : "New advisor message"}
          </h2>
          <form onSubmit={submit} className="form-stack">
            {role === "teacher" ? (
              <Label label="Student">
                <select
                  value={form.toUserId}
                  onChange={(event) =>
                    setForm({ ...form, toUserId: event.target.value })
                  }
                  required
                >
                  <option value="">Select an assigned student</option>
                  {recipients.map((student) => (
                    <option key={student.userId} value={student.userId}>
                      {student.name} · {student.studentId}
                    </option>
                  ))}
                </select>
              </Label>
            ) : (
              <Label label="Advisor">
                <input
                  value={advisor?.advisorName || "No advisor has been assigned"}
                  readOnly
                />
              </Label>
            )}
            <Label label="Subject">
              <input
                value={form.subject}
                onChange={(event) =>
                  setForm({ ...form, subject: event.target.value })
                }
                required
              />
            </Label>
            <Label label="Message">
              <textarea
                rows="6"
                value={form.content}
                onChange={(event) =>
                  setForm({ ...form, content: event.target.value })
                }
                required
                placeholder="Write your message…"
              />
            </Label>
            <button
              className="btn btn-primary"
              disabled={role === "student" && !advisor?.advisorName}
            >
              Send message
            </button>
          </form>
        </Card>
      </section>
      <Card className="space-top">
        <h2>Message details</h2>
        {selected ? (
          <article className="notice-detail">
            <p>
              <strong>{selected.subject}</strong>
            </p>
            <p className="muted">
              {selected.fromName} to {selected.toName} ·{" "}
              {formatDate(selected.date)}
            </p>
            <p className="pre-wrap alert">{selected.message}</p>
          </article>
        ) : (
          <EmptyState>Select a message to view its full content.</EmptyState>
        )}
      </Card>
      <Toast {...toast} onClose={close} />
    </>
  );
}

function Label({ label, children }) {
  return (
    <label className="form-group">
      <span>{label}</span>
      {children}
    </label>
  );
}
function ReportStat({ label, value }) {
  return (
    <Card className="stat-card">
      <p>{label}</p>
      <strong>{value}</strong>
    </Card>
  );
}
