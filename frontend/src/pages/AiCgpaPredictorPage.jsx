import { useEffect, useState } from "react";
import { api, dataItems } from "../lib/api";
import { SEMESTERS } from "../lib/constants";
import { Card, EmptyState, PageTitle, Spinner, Toast, useToast } from "../components/ui";

export function AiCgpaPredictorPage() {
  const [courses, setCourses] = useState([]);
  const [semester, setSemester] = useState(SEMESTERS[0]);
  const [loading, setLoading] = useState(true);
  const [selectedTargets, setSelectedTargets] = useState({}); // { [courseId]: targetGpa }
  const { toast, show, close } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const response = await api(`/portal/student/ai-suggestions?semesterLabel=${encodeURIComponent(semester)}`);
      const items = dataItems(response);
      setCourses(items);

      // Default selected target to the highest achievable target for each course
      const initialTargets = {};
      items.forEach((item) => {
        const topTarget = item.targets?.find((t) => t.achievable) || item.targets?.[0];
        if (topTarget) {
          initialTargets[item.id] = topTarget.gpa;
        }
      });
      setSelectedTargets(initialTargets);
    } catch (error) {
      show(error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [semester]);

  const handleSelectTarget = (courseId, gpa) => {
    setSelectedTargets((prev) => ({ ...prev, [courseId]: gpa }));
  };

  return (
    <>
      <PageTitle
        title="AI CGPA Predictor & Study Roadmap"
        subtitle="Real-time mathematical feasibility & AI strategic recommendations to hit GPA 4.00, 3.75, 3.50, or your best achievable grade."
        actions={
          <div className="semester-select-wrapper">
            <select
              aria-label="Filter by semester"
              className="semester-dropdown"
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
            >
              {SEMESTERS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button className="btn btn-outline" onClick={load}>
              Refresh Analysis
            </button>
          </div>
        }
      />

      {loading ? (
        <Spinner label="Analyzing course feasibility and generating AI suggestions…" />
      ) : courses.length === 0 ? (
        <Card>
          <EmptyState>
            No courses found for {semester}. Enroll in courses first to get personalized AI roadmaps.
          </EmptyState>
        </Card>
      ) : (
        <div className="ai-cards-grid">
          {courses.map((item) => {
            const course = item.course || {};
            const progress = item.progress || {};
            const targets = item.targets || [];
            const aiGuidance = item.aiGuidance || {};
            const currentSelectedGpa = selectedTargets[item.id] || targets[0]?.gpa;
            const currentTarget = targets.find((t) => t.gpa === currentSelectedGpa) || targets[0];

            return (
              <Card key={item.id} className="ai-course-card">
                {/* Course Header Banner */}
                <div className="ai-card-header">
                  <div>
                    <div className="ai-badge-row">
                      <span className="course-code-badge">{course.code}</span>
                      <span className="credit-badge">{course.credit} Credits</span>
                      {course.teacherName && (
                        <span className="teacher-badge">👨‍🏫 {course.teacherName}</span>
                      )}
                    </div>
                    <h2 className="ai-course-title">{course.name}</h2>
                  </div>

                  <div className="ai-max-gpa-badge-wrap">
                    <span className="ai-gpa-label">Max Achievable</span>
                    <span
                      className={`ai-gpa-pill ${
                        progress.is4Achievable ? "gpa-pill-4" : "gpa-pill-sub4"
                      }`}
                    >
                      {progress.bestAchievableGpa?.toFixed(2)} ({progress.bestAchievableGrade})
                    </span>
                  </div>
                </div>

                {/* Progress Snapshot Grid */}
                <div className="ai-progress-stats">
                  <div className="stat-box">
                    <small>CT Progress (Best 3 of 4)</small>
                    <strong>
                      {progress.completedCts}/4 Done
                    </strong>
                    <span className="sub-stat">
                      {progress.ctScores?.length ? `[${progress.ctScores.join(", ")}]` : "No CTs published"}
                    </span>
                  </div>

                  <div className="stat-box">
                    <small>Attendance Rate</small>
                    <strong>{progress.currentAttendancePct}%</strong>
                    <span className="sub-stat">
                      {progress.attended}/{progress.classesHeld} classes ({progress.remainingClasses} left)
                    </span>
                  </div>

                  <div className="stat-box">
                    <small>Marks Ceiling</small>
                    <strong>{progress.absoluteMaxMarks}/300</strong>
                    <span className="sub-stat">
                      {progress.is4Achievable ? "4.00 within reach" : "Capped below 4.00"}
                    </span>
                  </div>
                </div>

                {/* Target Selection Switcher */}
                <div className="ai-targets-section">
                  <h3 className="section-subtitle">Select Target Grade:</h3>
                  <div className="target-pills">
                    {targets.map((t) => {
                      const isSelected = t.gpa === currentSelectedGpa;
                      const isBest = t.gpa === progress.bestAchievableGpa;
                      return (
                        <button
                          key={t.gpa}
                          type="button"
                          className={`target-pill-btn ${isSelected ? "selected" : ""} ${
                            isBest ? "is-best" : ""
                          }`}
                          onClick={() => handleSelectTarget(item.id, t.gpa)}
                        >
                          <span className="pill-grade">{t.grade}</span>
                          <span className="pill-gpa">{t.gpa.toFixed(2)}</span>
                          {isBest && <small className="best-tag">Highest Possible</small>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Requirements Breakdown for Selected Target */}
                {currentTarget && currentTarget.requirements ? (
                  <div className="requirements-panel">
                    <h3 className="requirements-title">
                      🎯 Minimum Path for {currentTarget.grade} ({currentTarget.gpa.toFixed(2)} GPA /{" "}
                      {currentTarget.targetTotalMarks}+ marks)
                    </h3>

                    <div className="requirements-grid">
                      {/* CT Requirement */}
                      <div className="req-card req-ct">
                        <div className="req-icon">📝</div>
                        <div className="req-body">
                          <h4>Class Tests (CT)</h4>
                          <p>{currentTarget.requirements.ct.description}</p>
                          {currentTarget.requirements.ct.remainingCts > 0 && (
                            <div className="metric-callout">
                              Target: <strong>{currentTarget.requirements.ct.minScorePerRemainingCt}/20 min</strong>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Attendance Requirement */}
                      <div className="req-card req-att">
                        <div className="req-icon">📅</div>
                        <div className="req-body">
                          <h4>Lecture Attendance</h4>
                          <p>{currentTarget.requirements.attendance.description}</p>
                          {currentTarget.requirements.attendance.remainingClasses > 0 && (
                            <div className="metric-callout">
                              Must Attend:{" "}
                              <strong>
                                {currentTarget.requirements.attendance.minClassesToAttend} of{" "}
                                {currentTarget.requirements.attendance.remainingClasses} remaining
                              </strong>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Term Final Requirement */}
                      <div className="req-card req-final">
                        <div className="req-icon">🎓</div>
                        <div className="req-body">
                          <h4>Term Final Exam</h4>
                          <p>{currentTarget.requirements.termFinal.description}</p>
                          <div className="metric-callout">
                            Score Needed:{" "}
                            <strong>
                              {currentTarget.requirements.termFinal.minScoreNeeded} / 210 (
                              {currentTarget.requirements.termFinal.percentageNeeded}%)
                            </strong>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="unreachable-banner">
                    ⚠️ This target is mathematically unreachable with current marks.
                  </div>
                )}

                {/* AI Coaching & Strategic Advice Box */}
                {aiGuidance && (
                  <div className={`ai-coaching-box tone-${aiGuidance.tone || "optimistic"}`}>
                    <div className="coaching-header">
                      <span className="sparkle-icon">✨</span>
                      <h4>AI Strategic Coach & Guidance</h4>
                      <span className="source-tag">
                        {aiGuidance.source === "gemini-ai" ? "Powered by Gemini AI" : "Smart Academic Advisor"}
                      </span>
                    </div>
                    {aiGuidance.headline && <p className="coaching-headline">{aiGuidance.headline}</p>}
                    {aiGuidance.actionPoints && aiGuidance.actionPoints.length > 0 && (
                      <ul className="action-points-list">
                        {aiGuidance.actionPoints.map((point, idx) => (
                          <li key={idx}>👉 {point}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Toast {...toast} onClose={close} />
    </>
  );
}
