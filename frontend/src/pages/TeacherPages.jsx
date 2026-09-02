import { useEffect, useState } from "react";
import { api, dataItems } from "../lib/api";
import { SEMESTERS } from "../lib/constants";
import { Card, DataTable, EmptyState, PageTitle, Spinner, Toast, useToast } from "../components/ui";

const today = () => new Date().toISOString().slice(0, 10);
const loadTeacherCourses = async () => dataItems(await api("/portal/teacher/courses"));

export function TeacherCoursesPage() {
  const [courses, setCourses] = useState([]); const [editing, setEditing] = useState(null); const [form, setForm] = useState(emptyTeacherCourse()); const [loading, setLoading] = useState(true); const { toast, show, close } = useToast();
  const load = async () => { setLoading(true); try { setCourses(await loadTeacherCourses()); } catch (error) { show(error.message, "error"); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  const save = async (event) => { event.preventDefault(); try { await api(editing ? `/portal/teacher/courses/${editing.id}` : "/portal/teacher/courses", { method: editing ? "PUT" : "POST", body: { ...form, code: form.code.trim().toUpperCase(), name: form.name.trim(), credit: Number(form.credit) } }); setEditing(null); setForm(emptyTeacherCourse()); show(editing ? "Course updated." : "Course added."); load(); } catch (error) { show(error.message, "error"); } };
  const edit = (course) => { setEditing(course); setForm(course); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const remove = async (course) => { if (!window.confirm(`Delete ${course.code}? This also removes linked student enrollment and marks.`)) return; try { await api(`/portal/teacher/courses/${course.id}`, { method: "DELETE" }); show("Course removed."); load(); } catch (error) { show(error.message, "error"); } };
  return <><PageTitle title="My courses" subtitle="Create the course offerings that connect you with students in a batch." /><section className="two-column"><Card><h2>{editing ? "Edit course" : "Add new course"}</h2><form onSubmit={save} className="form-grid"><Field label="Batch"><input value={form.batch} onChange={(event) => setForm({ ...form, batch: event.target.value })} required placeholder="62" /></Field><Field label="Semester"><select value={form.semesterLabel} onChange={(event) => setForm({ ...form, semesterLabel: event.target.value })}>{SEMESTERS.map((value) => <option key={value}>{value}</option>)}</select></Field><Field label="Course ID"><input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} required placeholder="CSE-321" /></Field><Field label="Credit"><select value={form.credit} onChange={(event) => setForm({ ...form, credit: event.target.value })}>{["0.75", "1.5", "2", "3", "4"].map((value) => <option key={value}>{value}</option>)}</select></Field><Field label="Course name"><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required placeholder="Database Systems" /></Field><div className="form-full button-row"><button className="btn btn-primary">{editing ? "Save course" : "Add course"}</button>{editing && <button type="button" className="btn btn-outline" onClick={() => { setEditing(null); setForm(emptyTeacherCourse()); }}>Cancel</button>}</div></form></Card><Card><h2>Course preview</h2><dl className="definition-list"><div><dt>Batch</dt><dd>{form.batch || "—"}</dd></div><div><dt>Semester</dt><dd>{form.semesterLabel}</dd></div><div><dt>Course</dt><dd>{form.code || "—"} {form.name && `· ${form.name}`}</dd></div><div><dt>Credit</dt><dd>{form.credit}</dd></div></dl><p className="helper">Courses are saved in the database and linked to your teacher account.</p></Card></section><Card className="space-top"><h2>My added courses</h2>{loading ? <Spinner /> : <DataTable columns={["Batch", "Semester", "Code", "Course", "Credit", "Actions"]} empty="No teacher courses have been added.">{courses.map((course) => <tr key={course.id}><td>{course.batch}</td><td>{course.semesterLabel}</td><td>{course.code}</td><td>{course.name}</td><td>{course.credit}</td><td className="button-cell"><button className="text-button" onClick={() => edit(course)}>Edit</button><button className="text-button danger-text" onClick={() => remove(course)}>Delete</button></td></tr>)}</DataTable>}</Card><Toast {...toast} onClose={close} /></>;
}

export function TeacherAttendancePage() {
  const [courses, setCourses] = useState([]); const [setup, setSetup] = useState({ courseId: "", section: "A", date: today() }); const [session, setSession] = useState(null); const [loading, setLoading] = useState(false); const { toast, show, close } = useToast();
  useEffect(() => { loadTeacherCourses().then((items) => { setCourses(items); setSetup((value) => value.courseId || !items[0] ? value : { ...value, courseId: items[0].id }); }).catch((error) => show(error.message, "error")); }, []);
  const activeCourse = courses.find((course) => course.id === setup.courseId) || courses[0];
  const start = async (event) => { event.preventDefault(); if (!activeCourse) return show("Add a teacher course before starting attendance.", "error"); setLoading(true); try { const query = new URLSearchParams({ courseCode: activeCourse.code, semesterLabel: activeCourse.semesterLabel, batch: activeCourse.batch, section: setup.section }); const payload = await api(`/portal/teacher/attendance/students?${query}`); const students = dataItems(payload); if (!students.length) return show("No enrolled students were found for this course, batch, and section.", "error"); setSession({ course: activeCourse, section: setup.section, date: setup.date, activeIndex: 0, students: students.map((student) => ({ ...student, status: "" })) }); } catch (error) { show(error.message, "error"); } finally { setLoading(false); } };
  const setStatus = (rollId, status) => setSession((value) => ({ ...value, students: value.students.map((student) => student.rollId === rollId ? { ...student, status } : student) }));
  const markAndAdvance = (status) => setSession((value) => { const current = value.students[value.activeIndex]; if (!current) return value; return { ...value, students: value.students.map((student, index) => index === value.activeIndex ? { ...student, status } : student), activeIndex: Math.min(value.activeIndex + 1, value.students.length) }; });
  const goBack = () => setSession((value) => ({ ...value, activeIndex: Math.max(0, value.activeIndex - 1) }));
  const save = async () => { if (session.students.some((student) => !["P", "A"].includes(student.status))) return show("Mark every student Present or Absent before saving.", "error"); try { await api("/portal/teacher/attendance", { method: "POST", body: { courseCode: session.course.code, courseName: session.course.name, semesterLabel: session.course.semesterLabel, batch: session.course.batch, credit: session.course.credit, section: session.section, date: session.date, records: session.students } }); show("Attendance saved successfully."); setSession(null); } catch (error) { show(error.message, "error"); } };
  return <><PageTitle title="Take attendance" subtitle="Select a course offering, batch, section, and date. Only enrolled students are loaded." /><Card>{!session ? <form onSubmit={start} className="form-grid"><Field label="Course"><select value={setup.courseId} onChange={(event) => setSetup({ ...setup, courseId: event.target.value })} required>{courses.length ? courses.map((course) => <option key={course.id} value={course.id}>{course.code} · Batch {course.batch}</option>) : <option value="">Add a course first</option>}</select></Field><Field label="Batch"><input value={activeCourse?.batch || ""} readOnly placeholder="Select a course" /></Field><Field label="Section"><input value={setup.section} onChange={(event) => setSetup({ ...setup, section: event.target.value.toUpperCase() })} required placeholder="A" /></Field><Field label="Date"><input type="date" value={setup.date} onChange={(event) => setSetup({ ...setup, date: event.target.value })} required /></Field><div className="form-full"><button className="btn btn-primary" disabled={loading}>{loading ? "Loading class…" : "Start attendance"}</button></div></form> : <AttendanceSession session={session} setStatus={setStatus} markAndAdvance={markAndAdvance} goBack={goBack} save={save} cancel={() => setSession(null)} />}</Card><Toast {...toast} onClose={close} /></>;
}

export function TeacherCtMarksPage() {
  const [courses, setCourses] = useState([]); const [setup, setSetup] = useState({ courseId: "", section: "A", ctNumber: "1" }); const [session, setSession] = useState(null); const [loading, setLoading] = useState(false); const { toast, show, close } = useToast();
  useEffect(() => { loadTeacherCourses().then((items) => { setCourses(items); setSetup((value) => value.courseId || !items[0] ? value : { ...value, courseId: items[0].id }); }).catch((error) => show(error.message, "error")); }, []);
  const activeCourse = courses.find((course) => course.id === setup.courseId) || courses[0];
  const ctCount = Number(activeCourse?.credit) >= 4 ? 5 : Number(activeCourse?.credit) >= 3 ? 4 : Number(activeCourse?.credit) >= 2 ? 3 : 0;
  const start = async (event) => { event.preventDefault(); if (!activeCourse) return show("Add a teacher course before entering CT marks.", "error"); setLoading(true); try { const query = new URLSearchParams({ courseCode: activeCourse.code, semesterLabel: activeCourse.semesterLabel, batch: activeCourse.batch, section: setup.section }); const payload = await api(`/portal/teacher/ct-marks?${query}`); const students = dataItems(payload); if (!students.length) return show("No enrolled students were found for this course, batch, and section.", "error"); setSession({ course: activeCourse, section: setup.section, ctNumber: Number(setup.ctNumber), activeIndex: 0, students: students.map((student) => ({ ...student, marks: student.ct?.[Number(setup.ctNumber) - 1] ?? 0 })) }); } catch (error) { show(error.message, "error"); } finally { setLoading(false); } };
  const update = (rollId, marks) => setSession((value) => ({ ...value, students: value.students.map((student) => student.rollId === rollId ? { ...student, marks: Math.max(0, Math.min(20, Number(marks))) } : student) }));
  const saveAndAdvance = (marks) => setSession((value) => { const current = value.students[value.activeIndex]; if (!current) return value; return { ...value, students: value.students.map((student, index) => index === value.activeIndex ? { ...student, marks: Math.max(0, Math.min(20, Number(marks))) } : student), activeIndex: Math.min(value.activeIndex + 1, value.students.length) }; });
  const goBack = () => setSession((value) => ({ ...value, activeIndex: Math.max(0, value.activeIndex - 1) }));
  const save = async () => { try { await api("/portal/teacher/ct-marks", { method: "PUT", body: { courseCode: session.course.code, semesterLabel: session.course.semesterLabel, batch: session.course.batch, section: session.section, ctNumber: session.ctNumber, records: session.students } }); show("CT marks saved successfully."); setSession(null); } catch (error) { show(error.message, "error"); } };
  return <><PageTitle title="Update CT marks" subtitle="Select a course offering, batch, and section. Only enrolled students are loaded." /><Card>{!session ? <form onSubmit={start} className="form-grid"><Field label="Course"><select value={setup.courseId} onChange={(event) => setSetup({ ...setup, courseId: event.target.value, ctNumber: "1" })} required>{courses.length ? courses.map((course) => <option key={course.id} value={course.id}>{course.code} · Batch {course.batch}</option>) : <option value="">Add a course first</option>}</select></Field><Field label="Batch"><input value={activeCourse?.batch || ""} readOnly placeholder="Select a course" /></Field><Field label="Section"><input value={setup.section} onChange={(event) => setSetup({ ...setup, section: event.target.value.toUpperCase() })} required placeholder="A" /></Field><Field label="CT"><select value={setup.ctNumber} onChange={(event) => setSetup({ ...setup, ctNumber: event.target.value })} disabled={!ctCount}>{ctCount ? Array.from({ length: ctCount }, (_, index) => <option key={index + 1} value={index + 1}>CT {index + 1}</option>) : <option value="">No CT for this course</option>}</select></Field><div className="form-full"><button className="btn btn-primary" disabled={loading || !ctCount}>{loading ? "Loading class…" : "Start CT entry"}</button></div></form> : <CtSession session={session} update={update} saveAndAdvance={saveAndAdvance} goBack={goBack} save={save} cancel={() => setSession(null)} />}</Card><Toast {...toast} onClose={close} /></>;
}

export function TeacherStudentResultsPage() {
  const [courses, setCourses] = useState([]);
  const [setup, setSetup] = useState({ courseId: "", section: "A" });
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState("studentId");
  const { toast, show, close } = useToast();

  useEffect(() => {
    loadTeacherCourses()
      .then((items) => {
        setCourses(items);
        setSetup((value) => value.courseId || !items[0] ? value : { ...value, courseId: items[0].id });
      })
      .catch((error) => show(error.message, "error"));
  }, []);

  const activeCourse = courses.find((course) => course.id === setup.courseId) || courses[0];
  const loadResults = async (event) => {
    event.preventDefault();
    if (!activeCourse) return show("Add a teacher course before viewing student results.", "error");
    setLoading(true);
    try {
      const query = new URLSearchParams({
        courseCode: activeCourse.code,
        semesterLabel: activeCourse.semesterLabel,
        batch: activeCourse.batch,
        section: setup.section,
      });
      const response = await api(`/portal/teacher/student-results?${query}`);
      setResults(response.data || null);
    } catch (error) {
      show(error.message, "error");
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  const sortedStudents = [...(results?.items || [])].sort((left, right) => {
    if (sortBy === "attendanceMark") return right.attendance.mark - left.attendance.mark || left.studentId.localeCompare(right.studentId, undefined, { numeric: true });
    if (sortBy === "ctMark") return right.ct.total - left.ct.total || left.studentId.localeCompare(right.studentId, undefined, { numeric: true });
    if (sortBy === "performance") {
      const rank = { strong: 3, average: 2, low: 1, "not recorded": 0 };
      return (rank[right.ct.performance] || 0) - (rank[left.ct.performance] || 0)
        || right.attendance.mark - left.attendance.mark
        || left.studentId.localeCompare(right.studentId, undefined, { numeric: true });
    }
    return left.studentId.localeCompare(right.studentId, undefined, { numeric: true });
  });

  const ctColumns = Array.from({ length: Number(results?.ctPolicy?.totalCt || 0) }, (_, index) => `CT ${index + 1}`);
  const columns = ["Student ID", "Student", "Present", "Total classes", "Attendance", "Attendance mark", ...ctColumns, "CT result", "CT performance"];

  return <>
    <PageTitle title="Student attendance & CT results" subtitle="Choose a course and section to review every enrolled student's attendance and CT performance." />
    <Card>
      <form onSubmit={loadResults} className="form-grid">
        <Field label="Course"><select value={setup.courseId} onChange={(event) => { setSetup({ ...setup, courseId: event.target.value }); setResults(null); }} required>{courses.length ? courses.map((course) => <option key={course.id} value={course.id}>{course.code} · Batch {course.batch}</option>) : <option value="">Add a course first</option>}</select></Field>
        <Field label="Batch"><input value={activeCourse?.batch || ""} readOnly placeholder="Select a course" /></Field>
        <Field label="Section"><input value={setup.section} onChange={(event) => { setSetup({ ...setup, section: event.target.value.toUpperCase() }); setResults(null); }} required placeholder="A" /></Field>
        <Field label="Sort students"><select value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="studentId">Student ID</option><option value="attendanceMark">Attendance mark (high to low)</option><option value="ctMark">CT result (high to low)</option><option value="performance">CT performance (best first)</option></select></Field>
        <div className="form-full button-row"><button className="btn btn-primary" disabled={loading}>{loading ? "Loading results…" : "View class results"}</button>{results && <button type="button" className="btn btn-outline" onClick={() => window.print()}>Print results</button>}</div>
      </form>
    </Card>
    {loading ? <Spinner label="Loading student results…" /> : results && <Card className="space-top">
      <div className="card-heading"><div><h2>{results.course?.code} · Section {results.section}</h2><p className="muted">{results.course?.name} · Batch {results.batch} · {sortedStudents.length} enrolled student{sortedStudents.length === 1 ? "" : "s"}</p></div><div className="muted"><strong>{results.totalClasses}</strong> total class{results.totalClasses === 1 ? "" : "es"}<small>CT policy: {results.ctPolicy?.label}</small></div></div>
      <DataTable columns={columns} empty="No students are enrolled in this course and section yet.">{sortedStudents.map((student) => <tr key={student.studentId}><td><strong>{student.studentId}</strong></td><td>{student.studentName}</td><td>{student.attendance.present}</td><td>{student.attendance.totalClasses}</td><td>{student.attendance.percentage}%</td><td>{displayMark(student.attendance.mark)} / {displayMark(student.attendance.maxMark)}</td>{student.ct.marks.map((mark, index) => <td key={index}>{displayMark(mark)} / 20</td>)}<td>{student.ct.recorded ? `${displayMark(student.ct.total)} / ${displayMark(student.ct.maxMarks)}` : "Not recorded"}</td><td className="capitalize">{student.ct.performance}</td></tr>)}</DataTable>
    </Card>}
    <Toast {...toast} onClose={close} />
  </>;
}

function AttendanceSession({ session, setStatus, markAndAdvance, goBack, save, cancel }) {
  const marked = session.students.filter((student) => ["P", "A"].includes(student.status)).length;
  const current = session.students[session.activeIndex];
  if (!current) return <SessionSummary type="attendance" session={session} setStatus={setStatus} save={save} cancel={cancel} />;
  return <><SessionHeader title={`${session.course.code} · Section ${session.section}`} subtitle={`${session.date} · Student ${session.activeIndex + 1} of ${session.students.length}`} marked={marked} total={session.students.length} cancel={cancel} /><section className="sequential-entry"><p className="eyebrow">Current student</p><strong className="student-roll">ID {current.rollId}</strong><h2>{current.studentName}</h2><p className="muted">Student ID: {current.studentId}</p><div className="button-row sequential-actions">{session.activeIndex > 0 && <button className="btn btn-outline" onClick={goBack}>Previous ID</button>}<button className="btn btn-present" onClick={() => markAndAdvance("P")}>Present</button><button className="btn btn-absent" onClick={() => markAndAdvance("A")}>Absent</button></div></section></>;
}

function CtSession({ session, update, saveAndAdvance, goBack, save, cancel }) {
  const [mark, setMark] = useState(session.students[session.activeIndex]?.marks ?? 0);
  const current = session.students[session.activeIndex];
  useEffect(() => { setMark(session.students[session.activeIndex]?.marks ?? 0); }, [session.activeIndex, session.students]);
  if (!current) return <SessionSummary type="ct" session={session} update={update} save={save} cancel={cancel} />;
  const max = Number(session.course.credit) <= 1.5 ? 15 : 20;
  return <><SessionHeader title={`${session.course.code} · Section ${session.section} · CT ${session.ctNumber}`} subtitle={`Student ${session.activeIndex + 1} of ${session.students.length}`} marked={session.activeIndex} total={session.students.length} cancel={cancel} /><section className="sequential-entry"><p className="eyebrow">Current student</p><strong className="student-roll">ID {current.rollId}</strong><h2>{current.studentName}</h2><p className="muted">Student ID: {current.studentId}</p><label className="form-group entry-mark"><span>CT mark (0–{max})</span><input autoFocus type="number" min="0" max={max} step=".5" value={mark} onChange={(event) => setMark(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); saveAndAdvance(mark); } }} /></label><div className="button-row sequential-actions">{session.activeIndex > 0 && <button className="btn btn-outline" onClick={goBack}>Previous ID</button>}<button className="btn btn-primary" onClick={() => saveAndAdvance(mark)}>Save & Next ID</button></div></section></>;
}

function SessionHeader({ title, subtitle, marked, total, cancel }) { return <div className="card-heading"><div><h2>{title}</h2><p className="muted">{subtitle}</p><progress className="entry-progress" value={marked} max={total} /><small>{marked} of {total} completed</small></div><button className="btn btn-outline" onClick={cancel}>Cancel session</button></div>; }
function SessionSummary({ type, session, setStatus, update, save, cancel }) { return <><SessionHeader title={type === "attendance" ? "Attendance complete" : "CT entry complete"} subtitle="Review any row before saving the final session." marked={session.students.length} total={session.students.length} cancel={cancel} /><DataTable columns={type === "attendance" ? ["Roll", "Student ID", "Student", "Status"] : ["Roll", "Student ID", "Student", "Marks"]}>{session.students.map((student) => <tr key={student.rollId}><td>{student.rollId}</td><td>{student.studentId}</td><td>{student.studentName}</td>{type === "attendance" ? <td><select value={student.status} onChange={(event) => setStatus(student.rollId, event.target.value)} className={`status-select status-${student.status}`}><option value="P">Present</option><option value="A">Absent</option></select></td> : <td><input className="table-input" type="number" min="0" max="20" step=".5" value={student.marks} onChange={(event) => update(student.rollId, event.target.value)} /></td>}</tr>)}</DataTable><div className="button-row space-top"><button className="btn btn-outline" onClick={() => window.print()}>Print summary</button><button className="btn btn-primary" onClick={save}>{type === "attendance" ? "Save attendance" : "Save CT marks"}</button></div></>; }
function Field({ label, children }) { return <label className="form-group"><span>{label}</span>{children}</label>; }
function displayMark(value) { const mark = Number(value || 0); return Number.isInteger(mark) ? String(mark) : mark.toFixed(1); }
function emptyTeacherCourse() { return { batch: "62", semesterLabel: "Level-3 Term-1", code: "", name: "", credit: "3" }; }
