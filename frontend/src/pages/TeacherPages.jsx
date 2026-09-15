import { useCallback, useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { api, dataItems } from "../lib/api";
import { SEMESTERS } from "../lib/constants";
import {
  Card,
  DataTable,
  EmptyState,
  PageTitle,
  Spinner,
  Toast,
  useToast,
} from "../components/ui";

/* ─── Excel parsing utility ─── */
const STUDENT_ID_HEADERS = [
  "student id",
  "studentid",
  "id",
  "student_id",
  "roll",
  "roll no",
  "rollno",
];
const MARKS_HEADERS = ["marks", "mark", "score", "obtained", "obtained marks"];
const CT_NO_HEADERS = ["ct no", "ct", "ct number", "ct_no", "ctnumber"];

function findColumn(headers, candidates) {
  for (let i = 0; i < headers.length; i++) {
    const h = String(headers[i] || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, "");
    if (candidates.includes(h)) return i;
  }
  return -1;
}

function stripIdPrefix(raw) {
  return String(raw || "")
    .replace(/^(id[-_ ]?)/i, "")
    .trim();
}

/* Normalize an ID for fuzzy matching: strip all separators, lowercase */
function normalizeId(raw) {
  return String(raw || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

function parseExcelCtMarks(fileBuffer, selectedCtNumber) {
  const workbook = XLSX.read(fileBuffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (rows.length < 2)
    return { error: "The file appears to be empty or has no data rows." };

  const headers = rows[0].map((h) => String(h || "").trim());
  const idCol = findColumn(headers, STUDENT_ID_HEADERS);
  const marksCol = findColumn(headers, MARKS_HEADERS);
  if (idCol === -1)
    return {
      error: `Could not find a Student ID column. Expected headers: ${STUDENT_ID_HEADERS.slice(0, 3).join(", ")}`,
    };
  if (marksCol === -1)
    return {
      error: `Could not find a Marks column. Expected headers: ${MARKS_HEADERS.slice(0, 3).join(", ")}`,
    };

  const ctCol = findColumn(headers, CT_NO_HEADERS);
  const parsed = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row.length) continue;
    if (ctCol !== -1) {
      const rowCt = Number(row[ctCol]);
      if (Number.isFinite(rowCt) && rowCt !== selectedCtNumber) continue;
    }
    const rawId = stripIdPrefix(row[idCol]);
    const rawMarks = Number(row[marksCol]);
    if (!rawId) continue;
    parsed.push({
      studentId: rawId,
      marks: Number.isFinite(rawMarks)
        ? Math.max(0, Math.min(20, rawMarks))
        : 0,
    });
  }
  if (!parsed.length)
    return {
      error:
        "No valid data rows found after parsing. Check the file format and CT number.",
    };
  return { records: parsed };
}

const today = () => new Date().toISOString().slice(0, 10);
const loadTeacherCourses = async () =>
  dataItems(await api("/portal/teacher/courses"));

export function TeacherCoursesPage() {
  const [courses, setCourses] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyTeacherCourse());
  const [loading, setLoading] = useState(true);
  const { toast, show, close } = useToast();
  const load = async () => {
    setLoading(true);
    try {
      setCourses(await loadTeacherCourses());
    } catch (error) {
      show(error.message, "error");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);
  const save = async (event) => {
    event.preventDefault();
    try {
      await api(
        editing
          ? `/portal/teacher/courses/${editing.id}`
          : "/portal/teacher/courses",
        {
          method: editing ? "PUT" : "POST",
          body: {
            ...form,
            code: form.code.trim().toUpperCase(),
            name: form.name.trim(),
            credit: Number(form.credit),
          },
        },
      );
      setEditing(null);
      setForm(emptyTeacherCourse());
      show(editing ? "Course updated." : "Course added.");
      load();
    } catch (error) {
      show(error.message, "error");
    }
  };
  const edit = (course) => {
    setEditing(course);
    setForm(course);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const remove = async (course) => {
    if (
      !window.confirm(
        `Delete ${course.code}? This also removes linked student enrollment and marks.`,
      )
    )
      return;
    try {
      await api(`/portal/teacher/courses/${course.id}`, { method: "DELETE" });
      show("Course removed.");
      load();
    } catch (error) {
      show(error.message, "error");
    }
  };
  return (
    <>
      <PageTitle
        title="My courses"
        subtitle="Create the course offerings that connect you with students in a batch."
      />
      <section className="two-column">
        <Card>
          <h2>{editing ? "Edit course" : "Add new course"}</h2>
          <form onSubmit={save} className="form-grid">
            <Field label="Batch">
              <input
                value={form.batch}
                onChange={(event) =>
                  setForm({ ...form, batch: event.target.value })
                }
                required
                placeholder="62"
              />
            </Field>
            <Field label="Semester">
              <select
                value={form.semesterLabel}
                onChange={(event) =>
                  setForm({ ...form, semesterLabel: event.target.value })
                }
              >
                {SEMESTERS.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </Field>
            <Field label="Course ID">
              <input
                value={form.code}
                onChange={(event) =>
                  setForm({ ...form, code: event.target.value })
                }
                required
                placeholder="CSE-321"
              />
            </Field>
            <Field label="Credit">
              <select
                value={form.credit}
                onChange={(event) =>
                  setForm({ ...form, credit: event.target.value })
                }
              >
                {["0.75", "1.5", "2", "3", "4"].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </Field>
            <Field label="Course name">
              <input
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                required
                placeholder="Database Systems"
              />
            </Field>
            <div className="form-full button-row">
              <button className="btn btn-primary">
                {editing ? "Save course" : "Add course"}
              </button>
              {editing && (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    setEditing(null);
                    setForm(emptyTeacherCourse());
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </Card>
        <Card>
          <h2>Course preview</h2>
          <dl className="definition-list">
            <div>
              <dt>Batch</dt>
              <dd>{form.batch || "—"}</dd>
            </div>
            <div>
              <dt>Semester</dt>
              <dd>{form.semesterLabel}</dd>
            </div>
            <div>
              <dt>Course</dt>
              <dd>
                {form.code || "—"} {form.name && `· ${form.name}`}
              </dd>
            </div>
            <div>
              <dt>Credit</dt>
              <dd>{form.credit}</dd>
            </div>
          </dl>
          <p className="helper">
            Courses are saved in the database and linked to your teacher
            account.
          </p>
        </Card>
      </section>
      <Card className="space-top">
        <h2>My added courses</h2>
        {loading ? (
          <Spinner />
        ) : (
          <DataTable
            columns={[
              "Batch",
              "Semester",
              "Code",
              "Course",
              "Credit",
              "Actions",
            ]}
            empty="No teacher courses have been added."
          >
            {courses.map((course) => (
              <tr key={course.id}>
                <td>{course.batch}</td>
                <td>{course.semesterLabel}</td>
                <td>{course.code}</td>
                <td>{course.name}</td>
                <td>{course.credit}</td>
                <td className="button-cell">
                  <button className="text-button" onClick={() => edit(course)}>
                    Edit
                  </button>
                  <button
                    className="text-button danger-text"
                    onClick={() => remove(course)}
                  >
                    Delete
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

export function TeacherAttendancePage() {
  const [courses, setCourses] = useState([]);
  const [setup, setSetup] = useState({
    courseId: "",
    section: "A",
    date: today(),
  });
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(false);
  const { toast, show, close } = useToast();
  useEffect(() => {
    loadTeacherCourses()
      .then((items) => {
        setCourses(items);
        setSetup((value) =>
          value.courseId || !items[0]
            ? value
            : { ...value, courseId: items[0].id },
        );
      })
      .catch((error) => show(error.message, "error"));
  }, []);
  const activeCourse =
    courses.find((course) => course.id === setup.courseId) || courses[0];
  const start = async (event) => {
    event.preventDefault();
    if (!activeCourse)
      return show("Add a teacher course before starting attendance.", "error");
    setLoading(true);
    try {
      const query = new URLSearchParams({
        courseCode: activeCourse.code,
        semesterLabel: activeCourse.semesterLabel,
        batch: activeCourse.batch,
        section: setup.section,
      });
      const payload = await api(`/portal/teacher/attendance/students?${query}`);
      const students = dataItems(payload);
      if (!students.length)
        return show(
          "No enrolled students were found for this course, batch, and section.",
          "error",
        );
      setSession({
        course: activeCourse,
        section: setup.section,
        date: setup.date,
        activeIndex: 0,
        students: students.map((student) => ({ ...student, status: "" })),
      });
    } catch (error) {
      show(error.message, "error");
    } finally {
      setLoading(false);
    }
  };
  const setStatus = (rollId, status) =>
    setSession((value) => ({
      ...value,
      students: value.students.map((student) =>
        student.rollId === rollId ? { ...student, status } : student,
      ),
    }));
  const markAndAdvance = (status) =>
    setSession((value) => {
      const current = value.students[value.activeIndex];
      if (!current) return value;
      return {
        ...value,
        students: value.students.map((student, index) =>
          index === value.activeIndex ? { ...student, status } : student,
        ),
        activeIndex: Math.min(value.activeIndex + 1, value.students.length),
      };
    });
  const goBack = () =>
    setSession((value) => ({
      ...value,
      activeIndex: Math.max(0, value.activeIndex - 1),
    }));
  const save = async () => {
    if (
      session.students.some((student) => !["P", "A"].includes(student.status))
    )
      return show(
        "Mark every student Present or Absent before saving.",
        "error",
      );
    try {
      await api("/portal/teacher/attendance", {
        method: "POST",
        body: {
          courseCode: session.course.code,
          courseName: session.course.name,
          semesterLabel: session.course.semesterLabel,
          batch: session.course.batch,
          credit: session.course.credit,
          section: session.section,
          date: session.date,
          records: session.students,
        },
      });
      show("Attendance saved successfully.");
      setSession(null);
    } catch (error) {
      show(error.message, "error");
    }
  };
  return (
    <>
      <PageTitle
        title="Take attendance"
        subtitle="Select a course offering, batch, section, and date. Only enrolled students are loaded."
      />
      <Card>
        {!session ? (
          <form onSubmit={start} className="form-grid">
            <Field label="Course">
              <select
                value={setup.courseId}
                onChange={(event) =>
                  setSetup({ ...setup, courseId: event.target.value })
                }
                required
              >
                {courses.length ? (
                  courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.code} · Batch {course.batch}
                    </option>
                  ))
                ) : (
                  <option value="">Add a course first</option>
                )}
              </select>
            </Field>
            <Field label="Batch">
              <input
                value={activeCourse?.batch || ""}
                readOnly
                placeholder="Select a course"
              />
            </Field>
            <Field label="Section">
              <input
                value={setup.section}
                onChange={(event) =>
                  setSetup({
                    ...setup,
                    section: event.target.value.toUpperCase(),
                  })
                }
                required
                placeholder="A"
              />
            </Field>
            <Field label="Date">
              <input
                type="date"
                value={setup.date}
                onChange={(event) =>
                  setSetup({ ...setup, date: event.target.value })
                }
                required
              />
            </Field>
            <div className="form-full">
              <button className="btn btn-primary" disabled={loading}>
                {loading ? "Loading class…" : "Start attendance"}
              </button>
            </div>
          </form>
        ) : (
          <AttendanceSession
            session={session}
            setStatus={setStatus}
            markAndAdvance={markAndAdvance}
            goBack={goBack}
            save={save}
            cancel={() => setSession(null)}
          />
        )}
      </Card>
      <Toast {...toast} onClose={close} />
    </>
  );
}

export function TeacherCtMarksPage() {
  const [courses, setCourses] = useState([]);
  const [setup, setSetup] = useState({
    courseId: "",
    section: "A",
    ctNumber: "1",
  });
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(false);
  const { toast, show, close } = useToast();
  useEffect(() => {
    loadTeacherCourses()
      .then((items) => {
        setCourses(items);
        setSetup((value) =>
          value.courseId || !items[0]
            ? value
            : { ...value, courseId: items[0].id },
        );
      })
      .catch((error) => show(error.message, "error"));
  }, []);
  const activeCourse =
    courses.find((course) => course.id === setup.courseId) || courses[0];
  const ctCount =
    Number(activeCourse?.credit) >= 4
      ? 5
      : Number(activeCourse?.credit) >= 3
        ? 4
        : Number(activeCourse?.credit) >= 2
          ? 3
          : 0;

  /* Shared: fetch enrolled students for the active course + section */
  const fetchEnrolledStudents = async () => {
    if (!activeCourse) {
      show("Add a teacher course before entering CT marks.", "error");
      return null;
    }
    const query = new URLSearchParams({
      courseCode: activeCourse.code,
      semesterLabel: activeCourse.semesterLabel,
      batch: activeCourse.batch,
      section: setup.section,
    });
    const payload = await api(`/portal/teacher/ct-marks?${query}`);
    const students = dataItems(payload);
    if (!students.length) {
      show(
        "No enrolled students were found for this course, batch, and section.",
        "error",
      );
      return null;
    }
    return students;
  };

  /* Manual one-by-one entry (existing) */
  const start = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      const students = await fetchEnrolledStudents();
      if (!students) return;
      setSession({
        course: activeCourse,
        section: setup.section,
        ctNumber: Number(setup.ctNumber),
        activeIndex: 0,
        students: students.map((student) => ({
          ...student,
          marks: student.ct?.[Number(setup.ctNumber) - 1] ?? 0,
        })),
      });
    } catch (error) {
      show(error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  /* Excel import: parse file → match students → jump to review */
  const handleExcelImport = async (parsedRecords) => {
    setLoading(true);
    try {
      const students = await fetchEnrolledStudents();
      if (!students) return;
      const ctNum = Number(setup.ctNumber);

      /* Build lookup maps keyed by multiple ID formats for robust matching.
         Excel IDs may differ from DB IDs in separators, prefixes, or casing
         (e.g. "2022360001" vs "2022-3-60-001"). */
      const marksByExact = new Map();
      const marksByNormalized = new Map();
      parsedRecords.forEach((record) => {
        marksByExact.set(record.studentId, record.marks);
        marksByNormalized.set(normalizeId(record.studentId), record.marks);
      });

      const matched = [];
      const updatedStudents = students.map((student) => {
        const rawId = stripIdPrefix(student.studentId);
        /* Try exact match first (original and stripped), then normalized */
        let importedMark =
          marksByExact.get(rawId) ?? marksByExact.get(student.studentId);
        if (importedMark === undefined) {
          importedMark = marksByNormalized.get(normalizeId(student.studentId));
        }
        if (importedMark !== undefined) matched.push(rawId);
        return {
          ...student,
          marks:
            importedMark !== undefined
              ? importedMark
              : (student.ct?.[ctNum - 1] ?? 0),
        };
      });

      /* Jump straight to the review screen (activeIndex = past-the-end) */
      setSession({
        course: activeCourse,
        section: setup.section,
        ctNumber: ctNum,
        activeIndex: updatedStudents.length,
        students: updatedStudents,
      });
      show(
        `Imported marks for ${matched.length} of ${updatedStudents.length} students. Review and save.`,
      );
    } catch (error) {
      show(error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const update = (rollId, marks) =>
    setSession((value) => ({
      ...value,
      students: value.students.map((student) =>
        student.rollId === rollId
          ? { ...student, marks: Math.max(0, Math.min(20, Number(marks))) }
          : student,
      ),
    }));
  const saveAndAdvance = (marks) =>
    setSession((value) => {
      const current = value.students[value.activeIndex];
      if (!current) return value;
      return {
        ...value,
        students: value.students.map((student, index) =>
          index === value.activeIndex
            ? { ...student, marks: Math.max(0, Math.min(20, Number(marks))) }
            : student,
        ),
        activeIndex: Math.min(value.activeIndex + 1, value.students.length),
      };
    });
  const goBack = () =>
    setSession((value) => ({
      ...value,
      activeIndex: Math.max(0, value.activeIndex - 1),
    }));
  const save = async () => {
    try {
      await api("/portal/teacher/ct-marks", {
        method: "PUT",
        body: {
          courseCode: session.course.code,
          semesterLabel: session.course.semesterLabel,
          batch: session.course.batch,
          section: session.section,
          ctNumber: session.ctNumber,
          records: session.students,
        },
      });
      show("CT marks saved successfully.");
      setSession(null);
    } catch (error) {
      show(error.message, "error");
    }
  };
  return (
    <>
      <PageTitle
        title="Update CT marks"
        subtitle="Select a course offering, batch, and section. Enter marks one-by-one or import from Excel."
      />
      <Card>
        {!session ? (
          <>
            <form onSubmit={start} className="form-grid">
              <Field label="Course">
                <select
                  value={setup.courseId}
                  onChange={(event) =>
                    setSetup({
                      ...setup,
                      courseId: event.target.value,
                      ctNumber: "1",
                    })
                  }
                  required
                >
                  {courses.length ? (
                    courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.code} · Batch {course.batch}
                      </option>
                    ))
                  ) : (
                    <option value="">Add a course first</option>
                  )}
                </select>
              </Field>
              <Field label="Batch">
                <input
                  value={activeCourse?.batch || ""}
                  readOnly
                  placeholder="Select a course"
                />
              </Field>
              <Field label="Section">
                <input
                  value={setup.section}
                  onChange={(event) =>
                    setSetup({
                      ...setup,
                      section: event.target.value.toUpperCase(),
                    })
                  }
                  required
                  placeholder="A"
                />
              </Field>
              <Field label="CT">
                <select
                  value={setup.ctNumber}
                  onChange={(event) =>
                    setSetup({ ...setup, ctNumber: event.target.value })
                  }
                  disabled={!ctCount}
                >
                  {ctCount ? (
                    Array.from({ length: ctCount }, (_, index) => (
                      <option key={index + 1} value={index + 1}>
                        CT {index + 1}
                      </option>
                    ))
                  ) : (
                    <option value="">No CT for this course</option>
                  )}
                </select>
              </Field>
              <div className="form-full">
                <button
                  className="btn btn-primary"
                  disabled={loading || !ctCount}
                >
                  {loading ? "Loading class…" : "Start CT entry (one-by-one)"}
                </button>
              </div>
            </form>
            <ExcelImportSection
              ctNumber={Number(setup.ctNumber)}
              ctCount={ctCount}
              loading={loading}
              onImport={handleExcelImport}
              show={show}
            />
          </>
        ) : (
          <CtSession
            session={session}
            update={update}
            saveAndAdvance={saveAndAdvance}
            goBack={goBack}
            save={save}
            cancel={() => setSession(null)}
          />
        )}
      </Card>
      <Toast {...toast} onClose={close} />
    </>
  );
}

export function TeacherStudentResultsPage() {
  const [courses, setCourses] = useState([]);
  const [setup, setSetup] = useState({ courseId: "", section: "A" });
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState("studentId");
  const { toast, show, close } = useToast();

  /* ─── Voice verification state ─── */
  const [voice, setVoice] = useState({
    ctIndex: -1,       // which CT column (0-based), -1 = inactive
    studentIdx: 0,     // current student being spoken
    status: "idle",    // idle | speaking | paused | completed
  });
  const [speechSpeed, setSpeechSpeed] = useState(0.82);
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  /* Cancel any ongoing speech when results change or component unmounts */
  useEffect(() => {
    return () => { window.speechSynthesis?.cancel(); };
  }, [results]);

  useEffect(() => {
    loadTeacherCourses()
      .then((items) => {
        setCourses(items);
        setSetup((value) =>
          value.courseId || !items[0]
            ? value
            : { ...value, courseId: items[0].id },
        );
      })
      .catch((error) => show(error.message, "error"));
  }, []);

  const activeCourse =
    courses.find((course) => course.id === setup.courseId) || courses[0];
  const loadResults = async (event) => {
    event.preventDefault();
    if (!activeCourse)
      return show(
        "Add a teacher course before viewing student results.",
        "error",
      );
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
      setVoice({ ctIndex: -1, studentIdx: 0, status: "idle" });
    } catch (error) {
      show(error.message, "error");
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  const sortedStudents = [...(results?.items || [])].sort((left, right) => {
    if (sortBy === "attendanceMark")
      return (
        right.attendance.mark - left.attendance.mark ||
        left.studentId.localeCompare(right.studentId, undefined, {
          numeric: true,
        })
      );
    if (sortBy === "ctMark")
      return (
        right.ct.total - left.ct.total ||
        left.studentId.localeCompare(right.studentId, undefined, {
          numeric: true,
        })
      );
    if (sortBy === "performance") {
      const rank = { strong: 3, average: 2, low: 1, "not recorded": 0 };
      return (
        (rank[right.ct.performance] || 0) - (rank[left.ct.performance] || 0) ||
        right.attendance.mark - left.attendance.mark ||
        left.studentId.localeCompare(right.studentId, undefined, {
          numeric: true,
        })
      );
    }
    return left.studentId.localeCompare(right.studentId, undefined, {
      numeric: true,
    });
  });

  const totalCt = Number(results?.ctPolicy?.totalCt || 0);

  /* Voice verification callbacks */
  const startVerification = useCallback((ctIdx) => {
    window.speechSynthesis?.cancel();
    setVoice({ ctIndex: ctIdx, studentIdx: 0, status: "speaking" });
  }, []);

  const handleSpeakerClick = useCallback((ctIdx) => {
    const v = voiceRef.current;
    // If clicking same CT that's already active & speaking/paused, don't restart
    if (v.ctIndex === ctIdx && (v.status === "speaking" || v.status === "paused")) return;
    startVerification(ctIdx);
  }, [startVerification]);

  /* Build column headers with 🔊 buttons for CT columns */
  const ctColumns = Array.from({ length: totalCt }, (_, index) => ({
    key: `ct-${index}`,
    label: (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 0 }}>
        CT {index + 1}
        <button
          type="button"
          className={`ct-speak-btn${voice.ctIndex === index && voice.status === "speaking" ? " speaking" : ""}`}
          onClick={(e) => { e.stopPropagation(); handleSpeakerClick(index); }}
          title={`Verify CT ${index + 1} marks by voice`}
        >
          🔊
        </button>
      </span>
    ),
  }));

  const columns = [
    "Student ID",
    "Student",
    "Present",
    "Total classes",
    "Attendance",
    "Attendance mark",
    ...ctColumns,
    "CT result",
    "CT performance",
  ];

  return (
    <>
      <PageTitle
        title="Student attendance & CT results"
        subtitle="Choose a course and section to review every enrolled student's attendance and CT performance."
      />
      <Card>
        <form onSubmit={loadResults} className="form-grid">
          <Field label="Course">
            <select
              value={setup.courseId}
              onChange={(event) => {
                setSetup({ ...setup, courseId: event.target.value });
                setResults(null);
              }}
              required
            >
              {courses.length ? (
                courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.code} · Batch {course.batch}
                  </option>
                ))
              ) : (
                <option value="">Add a course first</option>
              )}
            </select>
          </Field>
          <Field label="Batch">
            <input
              value={activeCourse?.batch || ""}
              readOnly
              placeholder="Select a course"
            />
          </Field>
          <Field label="Section">
            <input
              value={setup.section}
              onChange={(event) => {
                setSetup({
                  ...setup,
                  section: event.target.value.toUpperCase(),
                });
                setResults(null);
              }}
              required
              placeholder="A"
            />
          </Field>
          <Field label="Sort students">
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
            >
              <option value="studentId">Student ID</option>
              <option value="attendanceMark">
                Attendance mark (high to low)
              </option>
              <option value="ctMark">CT result (high to low)</option>
              <option value="performance">CT performance (best first)</option>
            </select>
          </Field>
          <div className="form-full button-row">
            <button className="btn btn-primary" disabled={loading}>
              {loading ? "Loading results…" : "View class results"}
            </button>
            {results && (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => window.print()}
              >
                Print results
              </button>
            )}
          </div>
        </form>
      </Card>
      {loading ? (
        <Spinner label="Loading student results…" />
      ) : (
        results && (
          <Card className="space-top">
            <div className="card-heading">
              <div>
                <h2>
                  {results.course?.code} · Section {results.section}
                </h2>
                <p className="muted">
                  {results.course?.name} · Batch {results.batch} ·{" "}
                  {sortedStudents.length} enrolled student
                  {sortedStudents.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="muted">
                <strong>{results.totalClasses}</strong> total class
                {results.totalClasses === 1 ? "" : "es"}
                <small>CT policy: {results.ctPolicy?.label}</small>
              </div>
            </div>
            {/* Voice verification control bar */}
            {voice.ctIndex >= 0 && voice.status !== "idle" && (
              <CtVoiceVerifier
                students={sortedStudents}
                ctIndex={voice.ctIndex}
                voice={voice}
                setVoice={setVoice}
                voiceRef={voiceRef}
                speechSpeed={speechSpeed}
                setSpeechSpeed={setSpeechSpeed}
              />
            )}
            <DataTable
              columns={columns}
              empty="No students are enrolled in this course and section yet."
            >
              {sortedStudents.map((student, rowIdx) => (
                <tr
                  key={student.studentId}
                  className={
                    voice.ctIndex >= 0 &&
                    voice.status === "speaking" &&
                    rowIdx === voice.studentIdx
                      ? "voice-active-row"
                      : ""
                  }
                >
                  <td>
                    <strong>{student.studentId}</strong>
                  </td>
                  <td>{student.studentName}</td>
                  <td>{student.attendance.present}</td>
                  <td>{student.attendance.totalClasses}</td>
                  <td>{student.attendance.percentage}%</td>
                  <td>
                    {displayMark(student.attendance.mark)} /{" "}
                    {displayMark(student.attendance.maxMark)}
                  </td>
                  {student.ct.marks.map((mark, index) => (
                    <td key={index}>{displayMark(mark)} / 20</td>
                  ))}
                  <td>
                    {student.ct.recorded
                      ? `${displayMark(student.ct.total)} / ${displayMark(student.ct.maxMarks)}`
                      : "Not recorded"}
                  </td>
                  <td className="capitalize">{student.ct.performance}</td>
                </tr>
              ))}
            </DataTable>
          </Card>
        )
      )}
      <Toast {...toast} onClose={close} />
    </>
  );
}

/* ─── Voice Verification Engine ─── */

function extractRollNumber(studentId) {
  // "2604003" → 3, "2604010" → 10, "2604100" → 100
  const digits = String(studentId || "").replace(/[^0-9]/g, "");
  // Take trailing digits and strip leading zeros
  const match = digits.match(/(\d{1,3})$/);
  if (!match) return studentId;
  return String(Number(match[1]));
}

function markToSpeech(mark) {
  if (mark === null || mark === undefined || mark === "") return "missing";
  const num = Number(mark);
  if (!Number.isFinite(num) && String(mark).trim() === "") return "missing";
  if (!Number.isFinite(num)) return "missing";
  return String(num);
}

function CtVoiceVerifier({ students, ctIndex, voice, setVoice, voiceRef, speechSpeed, setSpeechSpeed }) {
  const timerRef = useRef(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      clearTimeout(timerRef.current);
      window.speechSynthesis?.cancel();
    };
  }, []);

  /* Speak a single student, then advance */
  const speakStudent = useCallback((idx) => {
    if (!isMounted.current) return;
    if (idx >= students.length) {
      setVoice((v) => ({ ...v, status: "completed", studentIdx: students.length }));
      return;
    }
    const student = students[idx];
    const rawMark = student.ct?.marks?.[ctIndex];
    const markText = markToSpeech(rawMark);
    const rollNum = extractRollNumber(student.studentId);
    const text = `ID ${rollNum}, mark ${markText}.`;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = speechSpeed;
    utterance.pitch = 1.0;
    utterance.onend = () => {
      if (!isMounted.current) return;
      // Pause between students so teacher can check
      timerRef.current = setTimeout(() => {
        if (!isMounted.current) return;
        const v = voiceRef.current;
        if (v.status !== "speaking") return; // paused or stopped
        const next = idx + 1;
        setVoice((prev) => ({ ...prev, studentIdx: next }));
        speakStudent(next);
      }, 900);
    };
    utterance.onerror = (e) => {
      if (e.error === "canceled" || e.error === "interrupted") return;
      // On error, try to continue
      if (isMounted.current) {
        const next = idx + 1;
        setVoice((prev) => ({ ...prev, studentIdx: next }));
        speakStudent(next);
      }
    };

    setVoice((prev) => ({ ...prev, studentIdx: idx, status: "speaking" }));
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, [students, ctIndex, setVoice, voiceRef]);

  /* Start / restart when ctIndex or status transitions to speaking at student 0 */
  useEffect(() => {
    if (voice.status === "speaking" && voice.studentIdx === 0) {
      speakStudent(0);
    }
  }, [voice.ctIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePause = () => {
    window.speechSynthesis?.pause();
    clearTimeout(timerRef.current);
    setVoice((v) => ({ ...v, status: "paused" }));
  };

  const handleResume = () => {
    setVoice((v) => ({ ...v, status: "speaking" }));
    if (window.speechSynthesis?.paused) {
      window.speechSynthesis.resume();
    } else {
      // If speech already ended while paused, continue from current student
      speakStudent(voiceRef.current.studentIdx);
    }
  };

  const handleNext = () => {
    window.speechSynthesis?.cancel();
    clearTimeout(timerRef.current);
    const next = Math.min(voice.studentIdx + 1, students.length);
    if (next >= students.length) {
      setVoice((v) => ({ ...v, status: "completed", studentIdx: students.length }));
    } else {
      setVoice((v) => ({ ...v, studentIdx: next, status: "speaking" }));
      speakStudent(next);
    }
  };

  const handleStop = () => {
    window.speechSynthesis?.cancel();
    clearTimeout(timerRef.current);
    setVoice({ ctIndex: -1, studentIdx: 0, status: "idle" });
  };

  const handleDismiss = () => {
    setVoice({ ctIndex: -1, studentIdx: 0, status: "idle" });
  };

  /* Completion view */
  if (voice.status === "completed") {
    const missingCount = students.filter((s) => {
      const m = s.ct?.marks?.[ctIndex];
      return m === null || m === undefined || m === "" || (typeof m === "number" && !Number.isFinite(m));
    }).length;
    return (
      <div className="voice-complete">
        <span className="voice-icon">✅</span>
        <span>
          CT-{ctIndex + 1} Verification Completed — {students.length} / {students.length} students checked
        </span>
        {missingCount > 0 && (
          <span className="voice-missing">
            ⚠ {missingCount} missing mark{missingCount > 1 ? "s" : ""}
          </span>
        )}
        <button className="btn-dismiss" onClick={handleDismiss}>Dismiss</button>
      </div>
    );
  }

  /* Active verification bar */
  const progress = Math.min(voice.studentIdx + 1, students.length);
  return (
    <div className="voice-verify-bar">
      <div className="voice-verify-label">
        <span className="voice-icon">🔊</span>
        <span>Verifying CT-{ctIndex + 1}</span>
      </div>
      <div className="voice-verify-controls">
        {voice.status === "paused" ? (
          <button className="voice-verify-btn" onClick={handleResume} title="Resume">▶</button>
        ) : (
          <button className="voice-verify-btn" onClick={handlePause} title="Pause">⏸</button>
        )}
        <button className="voice-verify-btn" onClick={handleNext} title="Next student">⏭</button>
        <button className="voice-verify-btn btn-stop" onClick={handleStop} title="Stop verification">⏹</button>
        <select
          className="voice-speed-select"
          value={speechSpeed}
          onChange={(e) => setSpeechSpeed(Number(e.target.value))}
          title="Speech speed"
        >
          <option value={0.6}>Slow</option>
          <option value={0.82}>Normal</option>
          <option value={1.1}>Fast</option>
          <option value={1.5}>Very Fast</option>
        </select>
      </div>
      <div className="voice-progress">
        <progress value={progress} max={students.length} />
        <span>{progress} / {students.length}</span>
      </div>
    </div>
  );
}

function AttendanceSession({
  session,
  setStatus,
  markAndAdvance,
  goBack,
  save,
  cancel,
}) {
  const marked = session.students.filter((student) =>
    ["P", "A"].includes(student.status),
  ).length;
  const current = session.students[session.activeIndex];
  if (!current)
    return (
      <SessionSummary
        type="attendance"
        session={session}
        setStatus={setStatus}
        save={save}
        cancel={cancel}
      />
    );
  return (
    <>
      <SessionHeader
        title={`${session.course.code} · Section ${session.section}`}
        subtitle={`${session.date} · Student ${session.activeIndex + 1} of ${session.students.length}`}
        marked={marked}
        total={session.students.length}
        cancel={cancel}
      />
      <section className="sequential-entry">
        <p className="eyebrow">Current student</p>
        <strong className="student-roll">ID {current.rollId}</strong>
        <h2>{current.studentName}</h2>
        <p className="muted">Student ID: {current.studentId}</p>
        <div className="button-row sequential-actions">
          {session.activeIndex > 0 && (
            <button className="btn btn-outline" onClick={goBack}>
              Previous ID
            </button>
          )}
          <button
            className="btn btn-present"
            onClick={() => markAndAdvance("P")}
          >
            Present
          </button>
          <button
            className="btn btn-absent"
            onClick={() => markAndAdvance("A")}
          >
            Absent
          </button>
        </div>
      </section>
    </>
  );
}

function CtSession({ session, update, saveAndAdvance, goBack, save, cancel }) {
  const [mark, setMark] = useState(
    session.students[session.activeIndex]?.marks ?? 0,
  );
  const current = session.students[session.activeIndex];
  useEffect(() => {
    setMark(session.students[session.activeIndex]?.marks ?? 0);
  }, [session.activeIndex, session.students]);
  if (!current)
    return (
      <SessionSummary
        type="ct"
        session={session}
        update={update}
        save={save}
        cancel={cancel}
      />
    );
  const max = Number(session.course.credit) <= 1.5 ? 15 : 20;
  return (
    <>
      <SessionHeader
        title={`${session.course.code} · Section ${session.section} · CT ${session.ctNumber}`}
        subtitle={`Student ${session.activeIndex + 1} of ${session.students.length}`}
        marked={session.activeIndex}
        total={session.students.length}
        cancel={cancel}
      />
      <section className="sequential-entry">
        <p className="eyebrow">Current student</p>
        <strong className="student-roll">ID {current.rollId}</strong>
        <h2>{current.studentName}</h2>
        <p className="muted">Student ID: {current.studentId}</p>
        <label className="form-group entry-mark">
          <span>CT mark (0–{max})</span>
          <input
            autoFocus
            type="number"
            min="0"
            max={max}
            step=".5"
            value={mark}
            onChange={(event) => setMark(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                saveAndAdvance(mark);
              }
            }}
          />
        </label>
        <div className="button-row sequential-actions">
          {session.activeIndex > 0 && (
            <button className="btn btn-outline" onClick={goBack}>
              Previous ID
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={() => saveAndAdvance(mark)}
          >
            Save & Next ID
          </button>
        </div>
      </section>
    </>
  );
}

function SessionHeader({ title, subtitle, marked, total, cancel }) {
  return (
    <div className="card-heading">
      <div>
        <h2>{title}</h2>
        <p className="muted">{subtitle}</p>
        <progress className="entry-progress" value={marked} max={total} />
        <small>
          {marked} of {total} completed
        </small>
      </div>
      <button className="btn btn-outline" onClick={cancel}>
        Cancel session
      </button>
    </div>
  );
}
function SessionSummary({ type, session, setStatus, update, save, cancel }) {
  return (
    <>
      <SessionHeader
        title={
          type === "attendance" ? "Attendance complete" : "CT entry complete"
        }
        subtitle="Review any row before saving the final session."
        marked={session.students.length}
        total={session.students.length}
        cancel={cancel}
      />
      <DataTable
        columns={
          type === "attendance"
            ? ["Roll", "Student ID", "Student", "Status"]
            : ["Roll", "Student ID", "Student", "Marks"]
        }
      >
        {session.students.map((student) => (
          <tr key={student.rollId}>
            <td>{student.rollId}</td>
            <td>{student.studentId}</td>
            <td>{student.studentName}</td>
            {type === "attendance" ? (
              <td>
                <select
                  value={student.status}
                  onChange={(event) =>
                    setStatus(student.rollId, event.target.value)
                  }
                  className={`status-select status-${student.status}`}
                >
                  <option value="P">Present</option>
                  <option value="A">Absent</option>
                </select>
              </td>
            ) : (
              <td>
                <input
                  className="table-input"
                  type="number"
                  min="0"
                  max="20"
                  step=".5"
                  value={student.marks}
                  onChange={(event) =>
                    update(student.rollId, event.target.value)
                  }
                />
              </td>
            )}
          </tr>
        ))}
      </DataTable>
      <div className="button-row space-top">
        <button className="btn btn-outline" onClick={() => window.print()}>
          Print summary
        </button>
        <button className="btn btn-primary" onClick={save}>
          {type === "attendance" ? "Save attendance" : "Save CT marks"}
        </button>
      </div>
    </>
  );
}
function ExcelImportSection({ ctNumber, ctCount, loading, onImport, show }) {
  const fileRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [parseResult, setParseResult] = useState(null);

  const processFile = (selectedFile) => {
    if (!selectedFile) return;
    setFile(selectedFile);
    setParseResult(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = parseExcelCtMarks(
        new Uint8Array(event.target.result),
        ctNumber,
      );
      setParseResult(result);
      if (result.error) show(result.error, "error");
    };
    reader.readAsArrayBuffer(selectedFile);
  };

  const handleFileChange = (event) => {
    processFile(event.target.files?.[0]);
    if (fileRef.current) fileRef.current.value = "";
  };
  const handleDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    processFile(event.dataTransfer.files?.[0]);
  };
  const handleDragOver = (event) => {
    event.preventDefault();
    setDragging(true);
  };
  const handleDragLeave = () => setDragging(false);
  const clearFile = () => {
    setFile(null);
    setParseResult(null);
  };

  const applyImport = () => {
    if (!parseResult?.records?.length)
      return show("No valid records found in the file.", "error");
    onImport(parseResult.records);
  };

  const formatSize = (bytes) =>
    bytes < 1024
      ? `${bytes} B`
      : bytes < 1048576
        ? `${(bytes / 1024).toFixed(1)} KB`
        : `${(bytes / 1048576).toFixed(1)} MB`;

  return (
    <>
      <div className="import-divider">or import from Excel</div>
      {!file ? (
        <div
          className={`excel-import-zone${dragging ? " dragging" : ""}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileChange}
          />
          <div className="upload-icon">↑</div>
          <strong>Drop your Excel file here, or click to browse</strong>
          <small>
            Supports .xlsx, .xls, .csv · Columns: Student ID, Marks (CT No
            optional)
          </small>
        </div>
      ) : (
        <>
          <div className="excel-file-info">
            <div className="file-icon">XLS</div>
            <div className="file-details">
              <strong>{file.name}</strong>
              <small>{formatSize(file.size)}</small>
            </div>
            <button
              type="button"
              className="file-remove"
              onClick={clearFile}
              title="Remove file"
            >
              ✕
            </button>
          </div>
          {parseResult?.records && (
            <>
              <div className="excel-match-summary">
                <span className="match-badge total">
                  {parseResult.records.length} rows parsed
                </span>
                <span className="match-badge matched">
                  CT {ctNumber} marks found
                </span>
              </div>
              <div className="button-row" style={{ marginTop: ".75rem" }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={applyImport}
                  disabled={loading || !ctCount}
                >
                  {loading
                    ? "Loading students…"
                    : `Apply & review CT ${ctNumber} marks`}
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={clearFile}
                >
                  Choose different file
                </button>
              </div>
            </>
          )}
          {parseResult?.error && (
            <div className="excel-unmatched-list">{parseResult.error}</div>
          )}
        </>
      )}
    </>
  );
}

function Field({ label, children }) {
  return (
    <label className="form-group">
      <span>{label}</span>
      {children}
    </label>
  );
}
function displayMark(value) {
  const mark = Number(value || 0);
  return Number.isInteger(mark) ? String(mark) : mark.toFixed(1);
}
function emptyTeacherCourse() {
  return {
    batch: "62",
    semesterLabel: "Level-3 Term-1",
    code: "",
    name: "",
    credit: "3",
  };
}
