/**
 * AI CGPA Determination and Prediction Service
 * 
 * Determines Semester GPA and Cumulative Final CGPA based on:
 * 1. Attendance Marks
 * 2. Class Test (CT) Marks
 * 3. Term Final Exam Marks
 * 
 * Provides diagnostic and predictive recommendations via:
 * - Local Ollama LLM (http://localhost:11434) [100% Free]
 * - Google Gemini API (if GEMINI_API_KEY is configured) [Free tier]
 * - Built-in Intelligent Academic Rule Engine [Zero dependencies / 100% offline fallback]
 */

const getGradeDetails = (percentage) => {
  const score = Number(percentage || 0);
  if (score >= 80) return { point: 4.0, letter: "A+", remarks: "Outstanding" };
  if (score >= 75) return { point: 3.75, letter: "A", remarks: "Excellent" };
  if (score >= 70) return { point: 3.5, letter: "A-", remarks: "Very Good" };
  if (score >= 65) return { point: 3.25, letter: "B+", remarks: "Good" };
  if (score >= 60) return { point: 3.0, letter: "B", remarks: "Satisfactory" };
  if (score >= 55) return { point: 2.75, letter: "B-", remarks: "Above Average" };
  if (score >= 50) return { point: 2.5, letter: "C+", remarks: "Average" };
  if (score >= 45) return { point: 2.25, letter: "C", remarks: "Below Average" };
  if (score >= 40) return { point: 2.0, letter: "D", remarks: "Pass" };
  return { point: 0.0, letter: "F", remarks: "Fail" };
};

/**
 * Standard university maximum marks allocation:
 * Theory course (e.g. 3 credits = 300 total marks):
 * - Attendance: 10 * credit (e.g. 30 marks = 10%)
 * - CT: 20 * credit (e.g. 60 marks = 20%)
 * - Term Final: 70 * credit (e.g. 210 marks = 70%)
 * - Total: 100 * credit (e.g. 300 marks = 100%)
 * 
 * Lab course (e.g. 1.5 credits = 150 total marks):
 * - Attendance: 10 * credit (15 marks = 10%)
 * - Continuous Assessment / Lab Quizzes / Reports: 30 * credit (45 marks = 30%)
 * - Lab Final / Viva: 60 * credit (90 marks = 60%)
 */
const getCourseMaxMarks = (credit, courseType = "theory") => {
  const c = Number(credit || 0);
  const isLab = String(courseType || "").toLowerCase() === "lab";

  if (isLab) {
    const attendanceMax = Math.round(c * 10);
    const ctMax = Math.round(c * 30);
    const termMax = Math.round(c * 60);
    return {
      attendanceMax,
      ctMax,
      termMax,
      totalMax: attendanceMax + ctMax + termMax || Math.round(c * 100) || 100,
    };
  }

  const attendanceMax = Math.round(c * 10);
  const ctMax = Math.round(c * 20);
  const termMax = Math.round(c * 70);
  return {
    attendanceMax,
    ctMax,
    termMax,
    totalMax: attendanceMax + ctMax + termMax || Math.round(c * 100) || 100,
  };
};

/**
 * Deterministically computes marks, grade points, semester GPA, and final CGPA.
 */
const computeCgpaMetrics = ({ courses = [], pastSemesters = [], targetCgpa = 3.5 }) => {
  let totalCredits = 0;
  let totalGradePointsWeighted = 0;
  let totalEarnedAttendance = 0;
  let totalMaxAttendance = 0;
  let totalEarnedCt = 0;
  let totalMaxCt = 0;
  let totalEarnedTerm = 0;
  let totalMaxTerm = 0;

  const evaluatedCourses = courses.map((course) => {
    const credit = Number(course.credit || 0);
    const maxes = getCourseMaxMarks(credit, course.courseType);

    const attendanceMark = Math.max(0, Math.min(maxes.attendanceMax, Number(course.attendanceMark || 0)));
    const ctMark = Math.max(0, Math.min(maxes.ctMax, Number(course.ctMark || 0)));
    const termFinalMark = Math.max(0, Math.min(maxes.termMax, Number(course.termFinalMark || 0)));

    const totalMark = attendanceMark + ctMark + termFinalMark;
    const totalMax = maxes.totalMax || (credit * 100) || 100;
    const percentage = totalMax > 0 ? Number(((totalMark / totalMax) * 100).toFixed(2)) : 0;
    const grade = getGradeDetails(percentage);

    if (credit > 0) {
      totalCredits += credit;
      totalGradePointsWeighted += grade.point * credit;

      totalEarnedAttendance += attendanceMark;
      totalMaxAttendance += maxes.attendanceMax;
      totalEarnedCt += ctMark;
      totalMaxCt += maxes.ctMax;
      totalEarnedTerm += termFinalMark;
      totalMaxTerm += maxes.termMax;
    }

    return {
      courseId: course.courseId || course.id,
      code: course.code,
      name: course.name,
      credit,
      courseType: course.courseType || "theory",
      attendanceMark: Number(attendanceMark.toFixed(1)),
      attendanceMax: maxes.attendanceMax,
      ctMark: Number(ctMark.toFixed(1)),
      ctMax: maxes.ctMax,
      termFinalMark: Number(termFinalMark.toFixed(1)),
      termMax: maxes.termMax,
      totalMark: Number(totalMark.toFixed(1)),
      totalMax,
      percentage,
      gradePoint: grade.point,
      letterGrade: grade.letter,
      remarks: grade.remarks,
    };
  });

  const semesterGpa = totalCredits > 0 ? Number((totalGradePointsWeighted / totalCredits).toFixed(2)) : 0.0;

  // Calculate Cumulative CGPA incorporating previous semesters
  let cumulativeCgpa = semesterGpa;
  let completedSemesterCount = 0;

  if (Array.isArray(pastSemesters) && pastSemesters.length > 0) {
    const pastSum = pastSemesters.reduce((acc, sem) => acc + Number(sem.cgpa || 0), 0);
    completedSemesterCount = pastSemesters.length;
    cumulativeCgpa = Number(((pastSum + semesterGpa) / (completedSemesterCount + 1)).toFixed(2));
  }

  // Component breakdown percentages
  const attendanceRatio = totalMaxAttendance > 0 ? Number(((totalEarnedAttendance / totalMaxAttendance) * 100).toFixed(1)) : 0;
  const ctRatio = totalMaxCt > 0 ? Number(((totalEarnedCt / totalMaxCt) * 100).toFixed(1)) : 0;
  const termRatio = totalMaxTerm > 0 ? Number(((totalEarnedTerm / totalMaxTerm) * 100).toFixed(1)) : 0;

  return {
    evaluatedCourses,
    totalCredits,
    semesterGpa,
    cumulativeCgpa,
    completedSemesterCount,
    targetCgpa: Number(targetCgpa || 0),
    componentSummary: {
      attendance: { earned: totalEarnedAttendance, max: totalMaxAttendance, percentage: attendanceRatio },
      ct: { earned: totalEarnedCt, max: totalMaxCt, percentage: ctRatio },
      termFinal: { earned: totalEarnedTerm, max: totalMaxTerm, percentage: termRatio },
    },
  };
};

/**
 * Built-in Intelligent Rule-Based & Statistical AI Engine
 * Operates offline with zero dependencies and deterministic precision.
 */
const generateLocalAiInsights = (metrics) => {
  const { semesterGpa, cumulativeCgpa, targetCgpa, componentSummary, evaluatedCourses } = metrics;
  const gap = targetCgpa ? Number((semesterGpa - targetCgpa).toFixed(2)) : 0;

  // Identify strongest and weakest component
  const components = [
    { name: "Attendance", percent: componentSummary.attendance.percentage },
    { name: "Class Test (CT)", percent: componentSummary.ct.percentage },
    { name: "Term Final Exam", percent: componentSummary.termFinal.percentage },
  ].sort((a, b) => b.percent - a.percent);

  const strongestComp = components[0];
  const weakestComp = components[2];

  // Identify critical course (lowest percentage) and star course (highest percentage)
  const sortedCourses = [...evaluatedCourses].sort((a, b) => a.percentage - b.percentage);
  const lowestCourse = sortedCourses[0];
  const highestCourse = sortedCourses[sortedCourses.length - 1];

  // Verdict text
  let verdict = "";
  if (gap >= 0.1) {
    verdict = `Outstanding performance! Your projected semester GPA of ${semesterGpa.toFixed(2)} exceeds your target of ${targetCgpa.toFixed(2)} by +${gap.toFixed(2)}. Your overall CGPA reaches ${cumulativeCgpa.toFixed(2)}.`;
  } else if (gap >= -0.05 && gap < 0.1) {
    verdict = `On track! Your projected semester GPA is ${semesterGpa.toFixed(2)}, very close to your target of ${targetCgpa.toFixed(2)}. Your overall CGPA is estimated at ${cumulativeCgpa.toFixed(2)}.`;
  } else {
    verdict = `Action required: Your projected GPA of ${semesterGpa.toFixed(2)} is ${Math.abs(gap).toFixed(2)} below your target (${targetCgpa.toFixed(2)}). Boosting your term final preparation can bridge this gap.`;
  }

  // Component impact analysis
  const componentImpact = `${strongestComp.name} is your strongest contributor at ${strongestComp.percent}%, providing a solid scoring foundation. However, ${weakestComp.name} is your lowest area at ${weakestComp.percent}%, making it the primary factor dragging your GPA down.`;

  // Specific course highlights
  const courseHighlights = [];
  if (lowestCourse) {
    courseHighlights.push({
      type: "at_risk",
      code: lowestCourse.code,
      name: lowestCourse.name,
      message: `${lowestCourse.code} has your lowest score (${lowestCourse.percentage}% · Grade: ${lowestCourse.letterGrade}). Prioritize revision for its term final component to prevent a GPA drop.`,
    });
  }
  if (highestCourse && highestCourse.code !== lowestCourse?.code) {
    courseHighlights.push({
      type: "strength",
      code: highestCourse.code,
      name: highestCourse.name,
      message: `Excellent command in ${highestCourse.code} with ${highestCourse.percentage}% (${highestCourse.letterGrade} / ${highestCourse.gradePoint.toFixed(2)}). Maintain this benchmark.`,
    });
  }

  // Actionable recommendations
  const recommendations = [];
  if (weakestComp.name === "Term Final Exam") {
    recommendations.push("Your term exam mark is the heaviest weighting (70%). Allocating 2 extra hours of daily problem-solving can elevate your overall grade by 0.25–0.50 points.");
  } else if (weakestComp.name === "Class Test (CT)") {
    recommendations.push("CT scores have reduced your safety cushion. You will need at least 75%+ in term final exams to offset lost CT marks.");
  } else {
    recommendations.push("Keep attendance above 90% to guarantee full attendance marks (10% free boost) for all courses.");
  }

  if (lowestCourse && lowestCourse.percentage < 60) {
    recommendations.push(`Form a targeted study group or consult the course instructor for ${lowestCourse.code} before final submissions.`);
  }

  recommendations.push(`To reach or sustain ${targetCgpa.toFixed(2)} CGPA, ensure every 3-credit theory course scores at least 75% overall.`);

  return {
    engine: "local-academic-ai",
    verdict,
    componentImpact,
    courseHighlights,
    recommendations,
  };
};

/**
 * Connect to Local Ollama AI daemon (http://localhost:11434)
 */
const queryOllamaAi = async (metrics) => {
  const baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  const model = process.env.OLLAMA_MODEL || "llama3";

  const prompt = `You are an expert university academic advisor AI. A student has submitted their course marks for the semester, which consist of three components: Attendance Marks, Class Test (CT) Marks, and Term Final Exam Marks.
Here are the exact numbers:
- Projected Semester GPA: ${metrics.semesterGpa.toFixed(2)}
- Target CGPA: ${metrics.targetCgpa.toFixed(2)}
- Updated Cumulative CGPA: ${metrics.cumulativeCgpa.toFixed(2)}
- Attendance Component: ${metrics.componentSummary.attendance.percentage}% (${metrics.componentSummary.attendance.earned}/${metrics.componentSummary.attendance.max})
- CT Component: ${metrics.componentSummary.ct.percentage}% (${metrics.componentSummary.ct.earned}/${metrics.componentSummary.ct.max})
- Term Final Component: ${metrics.componentSummary.termFinal.percentage}% (${metrics.componentSummary.termFinal.earned}/${metrics.componentSummary.termFinal.max})
- Courses breakdown:
${metrics.evaluatedCourses.map((c) => `  * ${c.code} (${c.name}, ${c.credit} cr): Att=${c.attendanceMark}/${c.attendanceMax}, CT=${c.ctMark}/${c.ctMax}, Term=${c.termFinalMark}/${c.termMax} => Total=${c.totalMark}/${c.totalMax} (${c.percentage}%, Grade ${c.letterGrade})`).join("\n")}

Respond ONLY with a valid JSON object (no markdown, no code block fences, just the raw JSON object) with this exact structure:
{
  "verdict": "string: 2 sentences summarizing the CGPA outcome vs target",
  "componentImpact": "string: 2 sentences analyzing which of the 3 components (attendance, CT, term final) influenced the grade most",
  "recommendations": ["string: recommendation 1", "string: recommendation 2", "string: recommendation 3"]
}`;

  const response = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      format: "json",
    }),
    signal: AbortSignal.timeout(6000), // 6-second timeout so requests never hang
  });

  if (!response.ok) {
    throw new Error(`Ollama returned status ${response.status}`);
  }

  const data = await response.json();
  const rawText = data.response || "{}";
  const cleaned = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(cleaned);

  return {
    engine: `ollama (${model})`,
    verdict: parsed.verdict || "",
    componentImpact: parsed.componentImpact || "",
    courseHighlights: generateLocalAiInsights(metrics).courseHighlights,
    recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
  };
};

/**
 * Connect to Google Gemini API (if GEMINI_API_KEY is available)
 */
const queryGeminiAi = async (metrics) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("No GEMINI_API_KEY configured");

  const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const prompt = `You are an expert university academic advisor. Analyze these student grades:
Semester GPA: ${metrics.semesterGpa.toFixed(2)}, Target: ${metrics.targetCgpa.toFixed(2)}, Cumulative CGPA: ${metrics.cumulativeCgpa.toFixed(2)}.
Attendance: ${metrics.componentSummary.attendance.percentage}%, CT: ${metrics.componentSummary.ct.percentage}%, Term Final: ${metrics.componentSummary.termFinal.percentage}%.
Courses:
${metrics.evaluatedCourses.map((c) => `${c.code}: Att=${c.attendanceMark}/${c.attendanceMax}, CT=${c.ctMark}/${c.ctMax}, Term=${c.termFinalMark}/${c.termMax} => Total=${c.percentage}% (${c.letterGrade})`).join(", ")}

Respond with JSON only:
{
  "verdict": "2 sentence summary",
  "componentImpact": "2 sentence component analysis",
  "recommendations": ["advice 1", "advice 2", "advice 3"]
}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    }),
    signal: AbortSignal.timeout(6000),
  });

  if (!response.ok) throw new Error(`Gemini returned status ${response.status}`);
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  const parsed = JSON.parse(text);

  return {
    engine: `gemini (${model})`,
    verdict: parsed.verdict || "",
    componentImpact: parsed.componentImpact || "",
    courseHighlights: generateLocalAiInsights(metrics).courseHighlights,
    recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
  };
};

/**
 * Main evaluation entry point:
 * Tries Ollama -> Tries Gemini -> Seamlessly falls back to local intelligent engine.
 */
const determineCgpaAndInsights = async ({ courses, pastSemesters, targetCgpa }) => {
  const metrics = computeCgpaMetrics({ courses, pastSemesters, targetCgpa });

  let aiInsights = null;

  // 1. Attempt Ollama if available
  try {
    aiInsights = await queryOllamaAi(metrics);
  } catch {
    // 2. Attempt Gemini if Ollama is not running
    if (process.env.GEMINI_API_KEY) {
      try {
        aiInsights = await queryGeminiAi(metrics);
      } catch {
        // Fall back below
      }
    }
  }

  // 3. Robust fallback to local academic rule engine
  if (!aiInsights || !aiInsights.verdict) {
    aiInsights = generateLocalAiInsights(metrics);
  }

  return {
    ...metrics,
    aiInsights,
  };
};

module.exports = {
  getGradeDetails,
  getCourseMaxMarks,
  computeCgpaMetrics,
  determineCgpaAndInsights,
};
