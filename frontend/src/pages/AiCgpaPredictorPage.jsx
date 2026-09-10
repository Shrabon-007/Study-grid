import { useEffect, useMemo, useState } from "react";
import { api, dataItems } from "../lib/api";
import { SEMESTERS } from "../lib/constants";
import { Card, DataTable, EmptyState, PageTitle, Spinner, Toast, useToast } from "../components/ui";

const gradeDetails = (percentage) => {
  const score = Number(percentage || 0);
  if (score >= 80) return { point: 4.0, letter: "A+" };
  if (score >= 75) return { point: 3.75, letter: "A" };
  if (score >= 70) return { point: 3.5, letter: "A-" };
  if (score >= 65) return { point: 3.25, letter: "B+" };
  if (score >= 60) return { point: 3.0, letter: "B" };
  if (score >= 55) return { point: 2.75, letter: "B-" };
  if (score >= 50) return { point: 2.5, letter: "C+" };
  if (score >= 45) return { point: 2.25, letter: "C" };
  if (score >= 40) return { point: 2.0, letter: "D" };
  return { point: 0.0, letter: "F" };
};

export function AiCgpaPredictorPage() {
  const [semester, setSemester] = useState(SEMESTERS[0]);
  const [targetCgpa, setTargetCgpa] = useState(3.6);
  const [courses, setCourses] = useState([]);
  const [pastSemesters, setPastSemesters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const { toast, show, close } = useToast();

  const loadContext = async (targetSem = semester) => {
    setLoading(true);
    try {
      const response = await api(`/portal/student/ai-cgpa-context?semesterLabel=${encodeURIComponent(targetSem)}`);
      const data = response.data || {};
      setCourses(data.courses || []);
      setPastSemesters(data.pastSemesters || []);
      if (data.targetCgpa) setTargetCgpa(data.targetCgpa);
      if (data.semesterLabel) setSemester(data.semesterLabel);

      // Auto-evaluate immediately so the student gets an instant baseline
      if (data.courses && data.courses.length > 0) {
        evaluate(data.courses, data.targetCgpa || 3.6, targetSem, false);
      } else {
        setAiResult(null);
      }
    } catch (err) {
      show(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContext(semester);
  }, [semester]);

  const updateCourseMark = (index, field, value) => {
    setCourses((prev) =>
      prev.map((c, i) => {
        if (i !== index) return c;
        const numVal = Math.max(0, Number(value || 0));
        const updated = { ...c, [field]: numVal };

        const att = field === "attendanceMark" ? numVal : Number(c.attendanceMark || 0);
        const ct = field === "ctMark" ? numVal : Number(c.ctMark || 0);
        const term = field === "termFinalMark" ? numVal : Number(c.termFinalMark || 0);

        const total = att + ct + term;
        const totalMax = c.totalMax || (c.credit * 100) || 100;
        const pct = totalMax > 0 ? Number(((total / totalMax) * 100).toFixed(1)) : 0;
        const gr = gradeDetails(pct);

        return {
          ...updated,
          totalMark: total,
          percentage: pct,
          gradePoint: gr.point,
          letterGrade: gr.letter,
        };
      })
    );
  };

  const evaluate = async (currentCourses = courses, target = targetCgpa, sem = semester, notify = true) => {
    if (!currentCourses || currentCourses.length === 0) return;
    setEvaluating(true);
    try {
      const response = await api("/portal/student/ai-cgpa-evaluate", {
        method: "POST",
        body: {
          semesterLabel: sem,
          targetCgpa: Number(target),
          courses: currentCourses,
        },
      });
      setAiResult(response.data || null);
      if (notify) show("Final CGPA determined with AI successfully!");
    } catch (err) {
      show(err.message, "error");
    } finally {
      setEvaluating(false);
    }
  };

  const saveMarks = async () => {
    if (!courses || courses.length === 0) return show("No courses to save.", "error");
    setSaving(true);
    try {
      await api("/portal/student/term-marks", {
        method: "POST",
        body: {
          semesterLabel: semester,
          items: courses.map((c) => ({
            courseId: c.courseId,
            attendanceMark: c.attendanceMark,
            ctMark: c.ctMark,
            termFinalMark: c.termFinalMark,
          })),
        },
      });
      show("Attendance, CT, and Term marks saved to database.");
    } catch (err) {
      show(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const saveToSemesterHistory = async () => {
    if (!aiResult) return;
    try {
      await api("/portal/student/semester-cgpa", {
        method: "PUT",
        body: {
          semester,
          cgpa: Number(aiResult.semesterGpa.toFixed(2)),
          note: `Determined by AI Predictor: Att (${aiResult.componentSummary?.attendance?.percentage}%), CT (${aiResult.componentSummary?.ct?.percentage}%), Term (${aiResult.componentSummary?.termFinal?.percentage}%).`,
        },
      });
      show(`Semester GPA ${aiResult.semesterGpa.toFixed(2)} saved to your official CGPA history!`);
    } catch (err) {
      show(err.message, "error");
    }
  };

  // Auto-forecast term marks based on existing CT and attendance trend
  const autoForecastTermMarks = () => {
    const forecasted = courses.map((c) => {
      const attRatio = c.attendanceMax > 0 ? c.attendanceMark / c.attendanceMax : 0.8;
      const ctRatio = c.ctMax > 0 ? c.ctMark / c.ctMax : 0.75;
      const combinedTrend = (attRatio * 0.3) + (ctRatio * 0.7);
      const projectedTerm = Math.round(c.termMax * combinedTrend);

      const total = c.attendanceMark + c.ctMark + projectedTerm;
      const totalMax = c.totalMax || (c.credit * 100) || 100;
      const pct = totalMax > 0 ? Number(((total / totalMax) * 100).toFixed(1)) : 0;
      const gr = gradeDetails(pct);

      return {
        ...c,
        termFinalMark: projectedTerm,
        totalMark: total,
        percentage: pct,
        gradePoint: gr.point,
        letterGrade: gr.letter,
      };
    });

    setCourses(forecasted);
    evaluate(forecasted, targetCgpa, semester, true);
  };

  // Goal-seek: calculate needed term marks to hit target CGPA
  const optimizeForTarget = () => {
    const target = Number(targetCgpa);
    // Target percentage roughly corresponding to target GPA
    const targetPct = target >= 4.0 ? 82 : target >= 3.75 ? 76 : target >= 3.5 ? 71 : target >= 3.25 ? 66 : target >= 3.0 ? 61 : 55;

    const optimized = courses.map((c) => {
      const neededTotal = Math.round((targetPct / 100) * c.totalMax);
      const alreadyEarned = c.attendanceMark + c.ctMark;
      const neededTerm = Math.max(0, Math.min(c.termMax, neededTotal - alreadyEarned));

      const total = c.attendanceMark + c.ctMark + neededTerm;
      const totalMax = c.totalMax || (c.credit * 100) || 100;
      const pct = totalMax > 0 ? Number(((total / totalMax) * 100).toFixed(1)) : 0;
      const gr = gradeDetails(pct);

      return {
        ...c,
        termFinalMark: neededTerm,
        totalMark: total,
        percentage: pct,
        gradePoint: gr.point,
        letterGrade: gr.letter,
      };
    });

    setCourses(optimized);
    evaluate(optimized, targetCgpa, semester, true);
  };

  // Real-time live GPA calculation from current course states
  const liveSummary = useMemo(() => {
    const credits = courses.reduce((acc, c) => acc + Number(c.credit || 0), 0);
    const weightedPoints = courses.reduce((acc, c) => acc + (Number(c.gradePoint || 0) * Number(c.credit || 0)), 0);
    const gpa = credits > 0 ? weightedPoints / credits : 0;

    let finalCgpa = gpa;
    if (pastSemesters.length > 0) {
      const pastSum = pastSemesters.reduce((acc, s) => acc + Number(s.cgpa || 0), 0);
      finalCgpa = (pastSum + gpa) / (pastSemesters.length + 1);
    }

    return {
      credits,
      gpa: Number(gpa.toFixed(2)),
      finalCgpa: Number(finalCgpa.toFixed(2)),
    };
  }, [courses, pastSemesters]);

  const displayGpa = aiResult ? aiResult.semesterGpa.toFixed(2) : liveSummary.gpa.toFixed(2);
  const displayCgpa = aiResult ? aiResult.cumulativeCgpa.toFixed(2) : liveSummary.finalCgpa.toFixed(2);
  const comp = aiResult?.componentSummary || {
    attendance: { percentage: 0 },
    ct: { percentage: 0 },
    termFinal: { percentage: 0 },
  };

  return (
    <>
      <PageTitle
        title="AI CGPA Predictor & Determination"
        subtitle="Determine and predict final CGPA from Attendance Marks, CT Marks, and Term Final Exam Marks."
        actions={
          <div className="semester-action-bar">
            <select
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
              aria-label="Semester"
            >
              {SEMESTERS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        }
      />

      {/* KPI Stat Cards */}
      <section className="stat-grid ai-stat-grid">
        <Card className="stat-card highlight-card">
          <p>Projected Semester GPA</p>
          <div className="stat-value-wrap">
            <strong>{displayGpa}</strong>
            <span className="badge priority-normal">Scale: 4.00</span>
          </div>
          <small className="muted">Calculated from Attendance + CT + Term</small>
        </Card>

        <Card className="stat-card">
          <p>Final Cumulative CGPA</p>
          <div className="stat-value-wrap">
            <strong>{displayCgpa}</strong>
            {targetCgpa && (
              <span className={`badge ${Number(displayCgpa) >= Number(targetCgpa) ? "risk-safe" : "risk-watch"}`}>
                Target: {Number(targetCgpa).toFixed(2)}
              </span>
            )}
          </div>
          <small className="muted">Combined with {pastSemesters.length} prior semester(s)</small>
        </Card>

        <Card className="stat-card">
          <p>Enrolled Credits</p>
          <strong>{liveSummary.credits}</strong>
          <small className="muted">{courses.length} registered course(s)</small>
        </Card>

        <Card className="stat-card">
          <p>Target CGPA Goal</p>
          <input
            type="number"
            min="2.0"
            max="4.0"
            step="0.05"
            value={targetCgpa}
            onChange={(e) => setTargetCgpa(Number(e.target.value))}
            className="target-cgpa-input"
          />
          <small className="muted">Used for AI Goal-Seek & Planning</small>
        </Card>
      </section>

      {/* 3-Component Contribution Bar */}
      <Card className="space-top component-meter-card">
        <div className="card-heading">
          <div>
            <h2>3-Component Performance Distribution</h2>
            <p className="muted">
              Course Mark = Attendance Marks (10%) + CT Marks (20%) + Term Final Marks (70%)
            </p>
          </div>
        </div>
        <div className="component-bars">
          <div className="comp-bar-item">
            <div className="comp-bar-label">
              <span>Attendance Marks</span>
              <strong>{comp.attendance.percentage}%</strong>
            </div>
            <progress className="entry-progress att-bar" value={comp.attendance.percentage} max="100" />
          </div>
          <div className="comp-bar-item">
            <div className="comp-bar-label">
              <span>Class Test (CT) Marks</span>
              <strong>{comp.ct.percentage}%</strong>
            </div>
            <progress className="entry-progress ct-bar" value={comp.ct.percentage} max="100" />
          </div>
          <div className="comp-bar-item">
            <div className="comp-bar-label">
              <span>Term Final Exam Marks</span>
              <strong>{comp.termFinal.percentage}%</strong>
            </div>
            <progress className="entry-progress term-bar" value={comp.termFinal.percentage} max="100" />
          </div>
        </div>
      </Card>

      {/* Action Controls */}
      <div className="button-row space-top ai-action-bar">
        <button
          className="btn btn-primary"
          onClick={() => evaluate(courses, targetCgpa, semester, true)}
          disabled={evaluating || courses.length === 0}
        >
          {evaluating ? "AI Evaluating…" : "⚡ Determine Final CGPA with AI"}
        </button>
        <button
          className="btn btn-outline"
          onClick={autoForecastTermMarks}
          disabled={evaluating || courses.length === 0}
        >
          🎯 Auto-Forecast Term Marks
        </button>
        <button
          className="btn btn-outline"
          onClick={optimizeForTarget}
          disabled={evaluating || courses.length === 0}
        >
          🎯 Optimize for Target ({Number(targetCgpa).toFixed(2)})
        </button>
        <button
          className="btn btn-outline"
          onClick={saveMarks}
          disabled={saving || courses.length === 0}
        >
          {saving ? "Saving…" : "💾 Save Marks to Database"}
        </button>
        <button
          className="btn btn-outline"
          onClick={saveToSemesterHistory}
          disabled={!aiResult}
        >
          📝 Save GPA to Semester History
        </button>
      </div>

      {/* Course Evaluation Table */}
      <Card className="space-top">
        <div className="card-heading">
          <div>
            <h2>Course Marks Breakdown</h2>
            <p className="muted">
              Edit any mark to see live CGPA recalculation. Sliders adjust Term Final Exam marks.
            </p>
          </div>
          <button className="btn btn-outline btn-sm" onClick={() => loadContext(semester)}>
            Reload Published
          </button>
        </div>

        {loading ? (
          <Spinner label="Loading course marks…" />
        ) : courses.length === 0 ? (
          <EmptyState>
            No active courses registered for {semester}. Please register courses in the Courses tab first.
          </EmptyState>
        ) : (
          <DataTable
            columns={[
              "Course",
              "Cr",
              "Attendance Mark",
              "CT Mark",
              "Term Final Mark",
              "Total Score",
              "Grade",
            ]}
          >
            {courses.map((course, index) => (
              <tr key={course.courseId || index}>
                <td>
                  <strong>{course.code}</strong>
                  <small>{course.name}</small>
                </td>
                <td>{course.credit}</td>

                {/* Attendance Mark Column */}
                <td>
                  <div className="inline-mark-cell">
                    <input
                      type="number"
                      min="0"
                      max={course.attendanceMax}
                      step="0.5"
                      value={course.attendanceMark}
                      onChange={(e) => updateCourseMark(index, "attendanceMark", e.target.value)}
                      className="mark-input"
                    />
                    <small className="muted">/ {course.attendanceMax}</small>
                  </div>
                </td>

                {/* CT Mark Column */}
                <td>
                  <div className="inline-mark-cell">
                    <input
                      type="number"
                      min="0"
                      max={course.ctMax}
                      step="0.5"
                      value={course.ctMark}
                      onChange={(e) => updateCourseMark(index, "ctMark", e.target.value)}
                      className="mark-input"
                    />
                    <small className="muted">/ {course.ctMax}</small>
                  </div>
                </td>

                {/* Term Final Mark Column (Input + Slider) */}
                <td>
                  <div className="term-mark-cell">
                    <div className="inline-mark-cell">
                      <input
                        type="number"
                        min="0"
                        max={course.termMax}
                        step="0.5"
                        value={course.termFinalMark}
                        onChange={(e) => updateCourseMark(index, "termFinalMark", e.target.value)}
                        className="mark-input"
                      />
                      <small className="muted">/ {course.termMax}</small>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max={course.termMax}
                      step="1"
                      value={course.termFinalMark}
                      onChange={(e) => updateCourseMark(index, "termFinalMark", e.target.value)}
                      className="term-range-slider"
                    />
                  </div>
                </td>

                {/* Total Score */}
                <td>
                  <strong>{course.totalMark}</strong>
                  <small className="muted">{course.percentage}%</small>
                </td>

                {/* Letter Grade */}
                <td>
                  <span className={`grade-pill grade-${course.letterGrade.replace("+", "plus").replace("-", "minus")}`}>
                    {course.letterGrade} ({course.gradePoint.toFixed(2)})
                  </span>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>

      {/* AI Academic Advisor Insights Card */}
      {aiResult && aiResult.aiInsights && (
        <Card className="space-top ai-insights-card">
          <div className="card-heading">
            <div className="ai-badge-row">
              <span className="action-icon ai-avatar-icon">AI</span>
              <div>
                <h2>AI Academic Advisor Analysis</h2>
                <small className="muted">
                  Powered by {aiResult.aiInsights.engine || "Academic AI"}
                </small>
              </div>
            </div>
          </div>

          <div className="ai-verdict-box alert">
            <p><strong>Verdict:</strong> {aiResult.aiInsights.verdict}</p>
          </div>

          <div className="two-column space-top">
            <div>
              <h3>Component Impact Diagnosis</h3>
              <p className="muted">{aiResult.aiInsights.componentImpact}</p>

              {aiResult.aiInsights.courseHighlights && aiResult.aiInsights.courseHighlights.length > 0 && (
                <div className="course-highlights-box space-top">
                  {aiResult.aiInsights.courseHighlights.map((hl, i) => (
                    <div key={i} className={`highlight-pill ${hl.type}`}>
                      <strong>{hl.code}:</strong> {hl.message}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3>Strategic Action Plan</h3>
              <ul className="ai-recommendations-list">
                {aiResult.aiInsights.recommendations?.map((rec, i) => (
                  <li key={i}>{rec}</li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}

      <Toast {...toast} onClose={close} />
    </>
  );
}
