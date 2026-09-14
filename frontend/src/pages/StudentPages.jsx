import { useEffect, useMemo, useState } from "react";
import { api, dataItems } from "../lib/api";
import { SEMESTERS } from "../lib/constants";
import { courseFromLink, gradePoint } from "../lib/helpers";
import {
  Card,
  DataTable,
  EmptyState,
  PageTitle,
  Spinner,
  Toast,
  useToast,
} from "../components/ui";

const normalizeCourses = (items) =>
  dataItems(items)
    .map(courseFromLink)
    .filter((course) => course.code);
const courseKey = (course) => `${course.semesterLabel}__${course.code}`;

export function StudentCoursesPage() {
  const [courses, setCourses] = useState([]);
  const [setup, setSetup] = useState({
    semester: SEMESTERS[0],
    totalCredit: 15,
    targetCgpa: 3.7,
  });
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyCourse());
  const [loading, setLoading] = useState(true);
  const { toast, show, close } = useToast();
  const load = async () => {
    setLoading(true);
    try {
      const [coursePayload, setupPayload] = await Promise.all([
        api("/portal/student/courses"),
        api("/portal/student/semester-setup"),
      ]);
      setCourses(normalizeCourses(coursePayload));
      const item = dataItems(setupPayload)[0];
      if (item)
        setSetup({
          semester: item.semesterLabel || item.semester || SEMESTERS[0],
          totalCredit: item.totalCredit || 0,
          targetCgpa: item.targetCgpa || 0,
        });
    } catch (error) {
      show(error.message, "error");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);
  const editCourse = (course) => {
    setEditing(course);
    setForm({ ...course });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const saveCourse = async (event) => {
    event.preventDefault();
    try {
      const body = {
        ...form,
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        credit: Number(form.credit),
        semesterLabel: setup.semester,
      };
      if (editing)
        await api(`/portal/student/courses/${editing.id}`, {
          method: "PUT",
          body,
        });
      else await api("/portal/student/courses", { method: "POST", body });
      setForm(emptyCourse());
      setEditing(null);
      show(editing ? "Course updated." : "Course added.");
      load();
    } catch (error) {
      show(error.message, "error");
    }
  };
  const deleteCourse = async (course) => {
    if (!window.confirm(`Delete ${course.code}?`)) return;
    try {
      await api(`/portal/student/courses/${course.id}`, { method: "DELETE" });
      show("Course deleted.");
      load();
    } catch (error) {
      show(error.message, "error");
    }
  };
  const saveSetup = async (event) => {
    event.preventDefault();
    try {
      await api("/portal/student/semester-setup", {
        method: "PUT",
        body: {
          semester: setup.semester,
          totalCredit: Number(setup.totalCredit),
          targetCgpa: Number(setup.targetCgpa),
        },
      });
      show("Semester setup saved.");
    } catch (error) {
      show(error.message, "error");
    }
  };
  const clearSemester = async () => {
    if (!window.confirm(`Clear all saved data for ${setup.semester}?`)) return;
    try {
      await api("/portal/student/semester-data", {
        method: "DELETE",
        body: { semesterLabel: setup.semester },
      });
      show("Semester data cleared.");
      load();
    } catch (error) {
      show(error.message, "error");
    }
  };
  const scoped = courses.filter(
    (course) => course.semesterLabel === setup.semester,
  );
  return (
    <>
      <PageTitle
        title="Course registration"
        subtitle="Register your courses. Matching course code, batch, and semester automatically connects you to the course teacher."
      />
      <section className="two-column">
        <Card>
          <h2>{editing ? "Edit registration" : "Register a course"}</h2>
          <form onSubmit={saveCourse} className="form-grid">
            <Input
              label="Course code"
              value={form.code}
              onChange={(value) => setForm({ ...form, code: value })}
              required
              placeholder="CSE-221"
            />
            <Input
              label="Course name"
              value={form.name}
              onChange={(value) => setForm({ ...form, name: value })}
              required
              placeholder="Data Structures"
            />
            <Select
              label="Course type"
              value={form.courseType}
              onChange={(value) => setForm({ ...form, courseType: value })}
              options={[
                ["theory", "Theory"],
                ["lab", "Lab"],
              ]}
            />
            <Select
              label="Credit"
              value={form.credit}
              onChange={(value) => setForm({ ...form, credit: value })}
              options={(form.courseType === "lab"
                ? ["0.75", "1.5"]
                : ["2", "3", "4"]
              ).map((value) => [value, value])}
            />
            <div className="form-full button-row">
              <button className="btn btn-primary">
                {editing ? "Save changes" : "Register course"}
              </button>
              {editing && (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    setEditing(null);
                    setForm(emptyCourse());
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </Card>
        <Card>
          <h2>Semester setup</h2>
          <form onSubmit={saveSetup} className="form-stack">
            <Select
              label="Current semester"
              value={setup.semester}
              onChange={(value) => setSetup({ ...setup, semester: value })}
              options={SEMESTERS.map((value) => [value, value])}
            />
            <Input
              label="Total credits"
              type="number"
              value={setup.totalCredit}
              onChange={(value) => setSetup({ ...setup, totalCredit: value })}
              min="0"
            />
            <Input
              label="Target CGPA"
              type="number"
              value={setup.targetCgpa}
              onChange={(value) => setSetup({ ...setup, targetCgpa: value })}
              min="0"
              max="4"
              step="0.01"
            />
            <button className="btn btn-outline">Save semester setup</button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={clearSemester}
            >
              Clear current semester data
            </button>
          </form>
        </Card>
      </section>
      <Card className="space-top">
        <div className="card-heading">
          <h2>Registered courses</h2>
          <span className="muted">{scoped.length}/10 courses</span>
        </div>
        {loading ? (
          <Spinner />
        ) : (
          <DataTable
            columns={["Code", "Course", "Type", "Credit", "Teacher", "Actions"]}
            empty="No courses have been registered for this semester."
          >
            {scoped.map((course) => (
              <tr key={course.id}>
                <td>{course.code}</td>
                <td>{course.name}</td>
                <td className="capitalize">{course.courseType}</td>
                <td>{course.credit}</td>
                <td>{course.teacherName || "Awaiting teacher assignment"}</td>
                <td className="button-cell">
                  <button
                    className="text-button"
                    onClick={() => editCourse(course)}
                  >
                    Edit
                  </button>
                  <button
                    className="text-button danger-text"
                    onClick={() => deleteCourse(course)}
                  >
                    Remove
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

export function AttendancePage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const { toast, show, close } = useToast();
  const load = async () => {
    setLoading(true);
    try {
      setItems(dataItems(await api("/portal/student/attendance")));
    } catch (error) {
      show(error.message, "error");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);
  return (
    <>
      <PageTitle
        title="Attendance records"
        subtitle="Your teacher publishes attendance. This page is view-only."
      />
      {loading ? (
        <Spinner />
      ) : (
        <Card>
          <div className="card-heading">
            <div>
              <h2>Published attendance</h2>
              <p className="muted">
                Marks follow the credit-based attendance policy: 90% or above
                earns credit × 10 marks.
              </p>
            </div>
            <button className="btn btn-outline" onClick={load}>
              Refresh
            </button>
          </div>
          <DataTable
            columns={[
              "Course",
              "Credit",
              "Present",
              "Total classes",
              "Attendance",
              "Marks",
            ]}
            empty="No attendance has been published by your teacher yet."
          >
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.course?.code || "Course"}</strong>
                  <small>{item.course?.name || ""}</small>
                </td>
                <td>{item.course?.credit || 0}</td>
                <td>{item.attended}</td>
                <td>{item.classesHeld}</td>
                <td>{item.percentage}%</td>
                <td>
                  {Number(item.predictedMark || 0).toFixed(2)} /{" "}
                  {Number(item.maxMark || 0).toFixed(2)}
                </td>
              </tr>
            ))}
          </DataTable>
        </Card>
      )}
      <Toast {...toast} onClose={close} />
    </>
  );
}

export function CtMarksPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const { toast, show, close } = useToast();
  const load = async () => {
    setLoading(true);
    try {
      setItems(dataItems(await api("/portal/student/ct-marks")));
    } catch (error) {
      show(error.message, "error");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);
  return (
    <>
      <PageTitle
        title="CT marks"
        subtitle="Your teacher publishes CT marks. This page is view-only."
      />
      {loading ? (
        <Spinner />
      ) : (
        <Card>
          <div className="card-heading">
            <div>
              <h2>Published CT marks</h2>
              <p className="muted">
                A 3-credit theory course has 4 CTs; a 2-credit theory course has
                3 CTs.
              </p>
            </div>
            <button className="btn btn-outline" onClick={load}>
              Refresh
            </button>
          </div>
          <DataTable
            columns={[
              "Course",
              "Credit",
              "CT count",
              "Published marks",
              "Best total",
              "Performance",
            ]}
            empty="No CT marks have been published by your teacher yet."
          >
            {items.map((item) => {
              const count = Number(item.totalCt || 0);
              const marks = (item.ct || []).slice(0, count);
              return (
                <tr key={item.id}>
                  <td>
                    <strong>{item.course?.code || "Course"}</strong>
                    <small>{item.course?.name || ""}</small>
                  </td>
                  <td>{item.course?.credit || 0}</td>
                  <td>{count}</td>
                  <td>
                    {count
                      ? marks
                          .map((mark, index) => `CT ${index + 1}: ${mark}`)
                          .join(" · ")
                      : "Not applicable"}
                  </td>
                  <td>
                    {item.total} / {item.maxMarks}
                  </td>
                  <td className="capitalize">{item.performance}</td>
                </tr>
              );
            })}
          </DataTable>
        </Card>
      )}
      <Toast {...toast} onClose={close} />
    </>
  );
}

export function SemesterCgpaPage() {
  const [entries, setEntries] = useState([]);
  const [form, setForm] = useState({
    semester: SEMESTERS[0],
    cgpa: "",
    note: "",
  });
  const [loading, setLoading] = useState(true);
  const { toast, show, close } = useToast();
  const load = () => {
    setLoading(true);
    api("/portal/student/semester-cgpa")
      .then((response) => setEntries(dataItems(response)))
      .catch((error) => show(error.message, "error"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);
  const submit = async (event) => {
    event.preventDefault();
    try {
      await api("/portal/student/semester-cgpa", {
        method: "PUT",
        body: {
          semester: form.semester,
          cgpa: Number(form.cgpa),
          note: form.note,
        },
      });
      show("Semester CGPA saved.");
      setForm({ ...form, cgpa: "", note: "" });
      load();
    } catch (error) {
      show(error.message, "error");
    }
  };
  const average = entries.length
    ? (
        entries.reduce((sum, item) => sum + Number(item.cgpa || 0), 0) /
        entries.length
      ).toFixed(2)
    : "0.00";
  return (
    <>
      <PageTitle
        title="Semester CGPA update"
        subtitle="Save a CGPA result for each completed semester."
      />
      <section className="two-column">
        <Card>
          <h2>Update semester result</h2>
          <form onSubmit={submit} className="form-stack">
            <Select
              label="Semester"
              value={form.semester}
              onChange={(value) => setForm({ ...form, semester: value })}
              options={SEMESTERS.map((value) => [value, value])}
            />
            <Input
              label="CGPA"
              type="number"
              min="0"
              max="4"
              step=".01"
              value={form.cgpa}
              onChange={(value) => setForm({ ...form, cgpa: value })}
              required
              placeholder="3.62"
            />
            <label className="form-group">
              <span>Note</span>
              <textarea
                rows="4"
                value={form.note}
                onChange={(event) =>
                  setForm({ ...form, note: event.target.value })
                }
                placeholder="What helped or hurt this result?"
              />
            </label>
            <button className="btn btn-primary">Save semester CGPA</button>
          </form>
        </Card>
        <Card>
          <h2>Performance guidance</h2>
          <p>
            Your current average across saved semesters is{" "}
            <strong>{average}</strong>.
          </p>
          <p className="muted">
            Use the note field to preserve useful context for each result, then
            see the running total on the Overall CGPA page.
          </p>
        </Card>
      </section>
      <Card className="space-top">
        <h2>Semester-wise history</h2>
        {loading ? (
          <Spinner />
        ) : (
          <DataTable
            columns={["Semester", "CGPA", "Trend", "Note"]}
            empty="No semester results are saved yet."
          >
            {entries.map((entry) => (
              <tr key={entry.id || entry._id}>
                <td>{entry.semesterLabel || entry.semester}</td>
                <td>{Number(entry.cgpa).toFixed(2)}</td>
                <td className="capitalize">{entry.trend || "stable"}</td>
                <td>{entry.note || "—"}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>
      <Toast {...toast} onClose={close} />
    </>
  );
}

export function RunningCgpaPage() {
  const [courses, setCourses] = useState([]);
  const [semester, setSemester] = useState(SEMESTERS[0]);
  const [rows, setRows] = useState([]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const { toast, show, close } = useToast();
  useEffect(() => {
    api("/portal/student/courses")
      .then((payload) => {
        const all = normalizeCourses(payload);
        setCourses(all);
        const initial = all
          .filter((course) => course.semesterLabel === semester)
          .map((course) => ({ ...course, mark: "" }));
        setRows(initial);
      })
      .catch((error) => show(error.message, "error"))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    setRows(
      courses
        .filter((course) => course.semesterLabel === semester)
        .map((course) => ({ ...course, mark: "" })),
    );
  }, [semester]);
  const weighted = useMemo(() => {
    const valid = rows.filter((row) => Number(row.credit) > 0);
    const credits = valid.reduce((sum, row) => sum + Number(row.credit), 0);
    return {
      credits,
      cgpa: credits
        ? valid.reduce(
            (sum, row) => sum + gradePoint(row.mark) * Number(row.credit),
            0,
          ) / credits
        : 0,
    };
  }, [rows]);
  const save = async (event) => {
    event.preventDefault();
    if (!weighted.credits)
      return show("Add a course with positive credit first.", "error");
    try {
      await api("/portal/student/semester-cgpa", {
        method: "PUT",
        body: {
          semester,
          cgpa: Number(weighted.cgpa.toFixed(2)),
          note: note || "Calculated from running semester grades.",
        },
      });
      show("Calculated semester CGPA saved.");
    } catch (error) {
      show(error.message, "error");
    }
  };
  const updateRow = (index, changes) =>
    setRows((items) =>
      items.map((item, position) =>
        position === index ? { ...item, ...changes } : item,
      ),
    );
  return (
    <>
      <PageTitle
        title="Running semester CGPA calculator"
        subtitle="Estimate CGPA from course marks before the official result is published."
      />
      {loading ? (
        <Spinner />
      ) : (
        <Card>
          <form onSubmit={save}>
            <div className="form-grid">
              <Select
                label="Semester"
                value={semester}
                onChange={setSemester}
                options={SEMESTERS.map((value) => [value, value])}
              />
              <label className="form-group">
                <span>Calculated CGPA</span>
                <output className="readonly-output">
                  {weighted.cgpa.toFixed(2)}
                </output>
              </label>
            </div>
            <DataTable
              columns={["Course", "Credit", "Mark (%)", "Grade point", ""]}
              empty="No courses are available for this semester."
            >
              {rows.map((row, index) => (
                <tr key={`${row.code}-${index}`}>
                  <td>
                    <input
                      className="table-input"
                      value={row.name}
                      onChange={(event) =>
                        updateRow(index, { name: event.target.value })
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="table-input"
                      type="number"
                      min="0"
                      step=".25"
                      value={row.credit}
                      onChange={(event) =>
                        updateRow(index, { credit: event.target.value })
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="table-input"
                      type="number"
                      min="0"
                      max="100"
                      value={row.mark}
                      onChange={(event) =>
                        updateRow(index, { mark: event.target.value })
                      }
                    />
                  </td>
                  <td>{gradePoint(row.mark).toFixed(2)}</td>
                  <td>
                    <button
                      type="button"
                      className="text-button danger-text"
                      onClick={() =>
                        setRows(
                          rows.filter((_, position) => position !== index),
                        )
                      }
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </DataTable>
            <div className="button-row space-top">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() =>
                  setRows([
                    ...rows,
                    { code: "CUSTOM", name: "New course", credit: 3, mark: "" },
                  ])
                }
              >
                Add course row
              </button>
            </div>
            <label className="form-group space-top">
              <span>Optional note</span>
              <textarea
                rows="3"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
            <div className="card-heading">
              <p className="muted">{weighted.credits} total credits</p>
              <button className="btn btn-primary">
                Calculate and save semester CGPA
              </button>
            </div>
          </form>
        </Card>
      )}
      <Toast {...toast} onClose={close} />
    </>
  );
}

export function CumulativeCgpaPage() {
  const [data, setData] = useState(null);
  const [ranking, setRanking] = useState(null);
  const [loading, setLoading] = useState(true);
  const { toast, show, close } = useToast();
  useEffect(() => {
    Promise.all([
      api("/portal/student/cumulative-cgpa"),
      api("/portal/student/ranking").catch(() => null),
    ])
      .then(([cumulative, rank]) => {
        setData(cumulative.data || {});
        setRanking(rank?.data || null);
      })
      .catch((error) => show(error.message, "error"))
      .finally(() => setLoading(false));
  }, []);
  if (loading) return <Spinner />;
  const timeline = data?.timeline || [];
  return (
    <>
      <PageTitle
        title="Overall CGPA, trend, and ranking"
        subtitle="See your academic progress at a glance."
      />
      <section className="stat-grid">
        <Stat
          label="Overall CGPA"
          value={Number(data?.cumulativeCgpa || 0).toFixed(2)}
        />
        <Stat label="Completed semesters" value={data?.semesterCount || 0} />
        <Stat
          label="Class ranking"
          value={ranking?.rank ? `${ranking.rank} / ${ranking.classSize}` : "—"}
        />
        <Stat
          label="Latest semester"
          value={
            ranking?.latestSemesterCgpa
              ? Number(ranking.latestSemesterCgpa).toFixed(2)
              : "—"
          }
        />
      </section>
      <Card className="space-top">
        <h2>CGPA timeline</h2>
        <DataTable
          columns={["Semester", "Semester CGPA", "Cumulative CGPA"]}
          empty="Save semester results to build your timeline."
        >
          {timeline.map((item) => (
            <tr key={item.semesterLabel}>
              <td>{item.semesterLabel}</td>
              <td>{Number(item.semesterCgpa).toFixed(2)}</td>
              <td>{Number(item.cumulativeCgpa).toFixed(2)}</td>
            </tr>
          ))}
        </DataTable>
      </Card>
      <section className="two-column space-top">
        <CourseIssue
          title="Short courses"
          items={data?.shortCourses}
          empty="No short courses detected."
        />
        <CourseIssue
          title="Backlog courses"
          items={data?.backlogCourses}
          empty="No backlog courses detected."
        />
      </section>
      <Toast {...toast} onClose={close} />
    </>
  );
}

function CourseIssue({ title, items = [], empty }) {
  return (
    <Card>
      <h2>{title}</h2>
      {items.length ? (
        <DataTable columns={["Code", "Course", "Score", "Attendance"]}>
          {items.map((item) => (
            <tr key={item.courseCode}>
              <td>{item.courseCode}</td>
              <td>{item.courseName}</td>
              <td>{item.scorePercent}%</td>
              <td>{item.attendancePercent}%</td>
            </tr>
          ))}
        </DataTable>
      ) : (
        <EmptyState>{empty}</EmptyState>
      )}
    </Card>
  );
}
function Stat({ label, value }) {
  return (
    <Card className="stat-card">
      <p>{label}</p>
      <strong>{value}</strong>
    </Card>
  );
}
function Input({ label, value, onChange, ...props }) {
  return (
    <label className="form-group">
      <span>{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        {...props}
      />
    </label>
  );
}
function Select({ label, value, onChange, options }) {
  return (
    <label className="form-group">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
function emptyCourse() {
  return { code: "", name: "", courseType: "theory", credit: "3" };
}
