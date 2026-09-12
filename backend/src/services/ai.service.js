/**
 * AI Suggestion & CGPA Prediction Engine
 * 
 * Evaluation Scheme (300 Marks Total):
 * - CT: 4 CTs total, best 3 count (max 60 marks, 20 per CT)
 * - Attendance: Out of 30 marks, evaluated against course total classes
 * - Term Final Exam: Out of 210 marks
 * Total = 300 marks
 * 
 * Grade Cutoffs:
 * - 4.00 (A+): >= 80% (240 marks)
 * - 3.75 (A):  >= 75% (225 marks)
 * - 3.50 (A-): >= 70% (210 marks)
 * - 3.25 (B+): >= 65% (195 marks)
 * - 3.00 (B):  >= 60% (180 marks)
 * - 2.75 (B-): >= 55% (165 marks)
 * - 2.50 (C+): >= 50% (150 marks)
 * - 2.25 (C):  >= 45% (135 marks)
 * - 2.00 (D):  >= 40% (120 marks)
 * - 0.00 (F):  < 40%
 */

const GRADE_TIERS = [
  { grade: "A+", gpa: 4.0, percentage: 80, minTotalMark: 240 },
  { grade: "A",  gpa: 3.75, percentage: 75, minTotalMark: 225 },
  { grade: "A-", gpa: 3.5, percentage: 70, minTotalMark: 210 },
  { grade: "B+", gpa: 3.25, percentage: 65, minTotalMark: 195 },
  { grade: "B",  gpa: 3.0, percentage: 60, minTotalMark: 180 },
  { grade: "B-", gpa: 2.75, percentage: 55, minTotalMark: 165 },
  { grade: "C+", gpa: 2.5, percentage: 50, minTotalMark: 150 },
  { grade: "C",  gpa: 2.25, percentage: 45, minTotalMark: 135 },
  { grade: "D",  gpa: 2.0, percentage: 40, minTotalMark: 120 },
];

/**
 * Attendance Slab Mark Calculation (out of 30)
 */
function getAttendanceMarkForPercentage(percentage) {
  if (percentage >= 90) return 30;
  if (percentage >= 85) return 27;
  if (percentage >= 80) return 24;
  if (percentage >= 75) return 21;
  if (percentage >= 70) return 18;
  if (percentage >= 65) return 15;
  if (percentage >= 60) return 12;
  return 0;
}

/**
 * Find minimum attendance days needed out of remaining classes to hit target attendance mark
 */
function findMinClassesNeeded(currentAttended, classesHeld, totalClasses, targetAttendanceMark) {
  const remainingClasses = Math.max(0, totalClasses - classesHeld);
  if (remainingClasses === 0) {
    const currentPercent = classesHeld > 0 ? (currentAttended / classesHeld) * 100 : 0;
    return getAttendanceMarkForPercentage(currentPercent) >= targetAttendanceMark ? 0 : null;
  }

  for (let added = 0; added <= remainingClasses; added++) {
    const finalAttended = currentAttended + added;
    const finalPercent = (finalAttended / totalClasses) * 100;
    if (getAttendanceMarkForPercentage(finalPercent) >= targetAttendanceMark) {
      return added;
    }
  }
  return null;
}

/**
 * Calculates Best 3 of 4 CT marks
 */
function calculateBest3(scores, remainingCount = 0, assumedRemainingScore = 0) {
  // Fill hypothetical remaining CTs
  const allScores = [...scores];
  for (let i = 0; i < remainingCount; i++) {
    allScores.push(assumedRemainingScore);
  }
  allScores.sort((a, b) => b - a);
  const best3 = allScores.slice(0, 3);
  return best3.reduce((sum, val) => sum + val, 0);
}

/**
 * Computes maximum possible marks in remaining CTs given scores obtained so far
 */
function getMaxPossibleCtScore(existingScores, totalCtCount = 4) {
  const remainingCount = Math.max(0, totalCtCount - existingScores.length);
  return calculateBest3(existingScores, remainingCount, 20);
}

/**
 * Solves minimum CT scores needed across remaining CTs
 */
function solveMinCtRequired(existingScores, targetCtTotal, totalCtCount = 4) {
  const remainingCount = Math.max(0, totalCtCount - existingScores.length);
  if (remainingCount === 0) {
    const currentBest3 = calculateBest3(existingScores);
    return currentBest3 >= targetCtTotal ? { possible: true, minAveragePerRemainingCt: 0, targetBest3: currentBest3 } : { possible: false };
  }

  // Binary search or fine-grained step for minimal equal score per remaining CT
  for (let score = 0; score <= 20; score += 0.5) {
    const testTotal = calculateBest3(existingScores, remainingCount, score);
    if (testTotal >= targetCtTotal) {
      return {
        possible: true,
        minPerRemainingCt: score,
        neededTotalAcrossRemaining: score * remainingCount,
        projectedBest3: testTotal,
      };
    }
  }

  return { possible: false };
}

/**
 * Analyze Course and produce Grade Targets & Feasibility
 */
function analyzeCourseFeasibility(courseData) {
  const {
    course,
    ctScores = [],      // e.g. [16, 14]
    totalCt = 4,        // default 4 CTs
    attended = 0,
    classesHeld = 0,
    totalClasses = 39,
  } = courseData;

  const remainingCtCount = Math.max(0, totalCt - ctScores.length);
  const remainingClasses = Math.max(0, totalClasses - classesHeld);

  // Current CT Best 3
  const currentCtBest3 = calculateBest3(ctScores, 0, 0);
  // Max possible CT
  const maxPossibleCt = getMaxPossibleCtScore(ctScores, totalCt);

  // Current attendance % & marks
  const currentAttendancePct = classesHeld > 0 ? (attended / classesHeld) * 100 : 0;
  const currentAttendanceMark = getAttendanceMarkForPercentage(currentAttendancePct);

  // Max possible attendance marks if student attends ALL remaining classes
  const maxAttendedPossible = attended + remainingClasses;
  const maxPossibleAttendancePct = totalClasses > 0 ? (maxAttendedPossible / totalClasses) * 100 : 0;
  const maxPossibleAttendanceMark = getAttendanceMarkForPercentage(maxPossibleAttendancePct);

  // Term Final is out of 210
  const maxFinalMark = 210;

  // Max possible total in course out of 300
  const absoluteMaxMarks = maxPossibleCt + maxPossibleAttendanceMark + maxFinalMark;
  const maxAchievablePct = (absoluteMaxMarks / 300) * 100;

  // Determine highest achievable grade
  const bestAchievableTier = GRADE_TIERS.find((t) => absoluteMaxMarks >= t.minTotalMark) || GRADE_TIERS[GRADE_TIERS.length - 1];

  // Build target tiers:
  // If 4.00 is possible: show 4.00, 3.75, 3.50
  // If 4.00 is not possible: show Best Achievable, and whichever of 3.75 or 3.50 is still possible
  // If best is below 3.50: show Best Achievable only
  let selectedTiers = [];
  const gpa4Tier = GRADE_TIERS.find((t) => t.gpa === 4.0);
  const gpa375Tier = GRADE_TIERS.find((t) => t.gpa === 3.75);
  const gpa350Tier = GRADE_TIERS.find((t) => t.gpa === 3.5);

  if (absoluteMaxMarks >= gpa4Tier.minTotalMark) {
    selectedTiers = [gpa4Tier, gpa375Tier, gpa350Tier];
  } else if (absoluteMaxMarks >= gpa375Tier.minTotalMark) {
    selectedTiers = [gpa375Tier, gpa350Tier];
  } else if (absoluteMaxMarks >= gpa350Tier.minTotalMark) {
    selectedTiers = [gpa350Tier];
  } else {
    selectedTiers = [bestAchievableTier];
  }

  // Ensure bestAchievableTier is in selectedTiers as the lead option
  if (!selectedTiers.some((t) => t.gpa === bestAchievableTier.gpa)) {
    selectedTiers.unshift(bestAchievableTier);
  }

  // Compute roadmaps for each selected tier
  const targets = selectedTiers.map((tier) => {
    return computeTargetRoadmap({
      tier,
      ctScores,
      totalCt,
      attended,
      classesHeld,
      totalClasses,
      maxPossibleCt,
      maxPossibleAttendanceMark,
      maxFinalMark,
    });
  });

  return {
    course: {
      code: course.code,
      name: course.name,
      credit: course.credit,
      teacherName: course.teacherName || "",
      totalClasses,
    },
    progress: {
      completedCts: ctScores.length,
      totalCts: totalCt,
      remainingCts: remainingCtCount,
      ctScores,
      currentCtBest3,
      maxPossibleCt,
      classesHeld,
      attended,
      remainingClasses,
      currentAttendancePct: Math.round(currentAttendancePct * 10) / 10,
      currentAttendanceMark,
      maxPossibleAttendanceMark,
      absoluteMaxMarks: Math.round(absoluteMaxMarks * 10) / 10,
      maxAchievablePct: Math.round(maxAchievablePct * 10) / 10,
      bestAchievableGpa: bestAchievableTier.gpa,
      bestAchievableGrade: bestAchievableTier.grade,
      is4Achievable: absoluteMaxMarks >= 240,
    },
    targets,
  };
}

/**
 * Computes the specific roadmap to hit target marks
 */
function computeTargetRoadmap({
  tier,
  ctScores,
  totalCt,
  attended,
  classesHeld,
  totalClasses,
  maxPossibleCt,
  maxPossibleAttendanceMark,
  maxFinalMark,
}) {
  const targetMark = tier.minTotalMark; // 240, 225, 210, etc.
  const remainingCtCount = Math.max(0, totalCt - ctScores.length);
  const remainingClasses = Math.max(0, totalClasses - classesHeld);

  // Strategy: 
  // We want to give realistic, balanced minimums.
  // We balance CT target, Attendance target, and Final exam target.
  // Realistic priority: Aim for safe attendance (at least 80% or 90% if achievable),
  // which saves burden on final exam.

  // Target Attendance Mark:
  let attendanceMarkTarget = maxPossibleAttendanceMark;
  let minClassesToAttend = findMinClassesNeeded(attended, classesHeld, totalClasses, attendanceMarkTarget);

  // Target CT:
  let targetCt = maxPossibleCt;
  // What remains for Final Exam:
  let neededForFinal = targetMark - (targetCt + attendanceMarkTarget);

  if (neededForFinal < 0) {
    // We have surplus; we can relax final or CT
    neededForFinal = 0;
  }

  // If neededForFinal > 210, this target is impossible with current attendance/CT ceiling
  if (neededForFinal > maxFinalMark) {
    return {
      tier,
      achievable: false,
      message: `Mathematically unreachable. Even with full marks in remaining components, maximum possible is ${maxPossibleCt + maxPossibleAttendanceMark + maxFinalMark}.`,
    };
  }

  // Solve CT requirements:
  // Can we relax CT below maxPossibleCt while keeping final exam <= 189 (90%)?
  let ctSolver = solveMinCtRequired(ctScores, targetCt, totalCt);

  // Final exam marks needed out of 210 and percentage
  const finalScoreNeeded = Math.max(0, Math.ceil(neededForFinal * 10) / 10);
  const finalPercentageNeeded = Math.round((finalScoreNeeded / maxFinalMark) * 100);

  return {
    gpa: tier.gpa,
    grade: tier.grade,
    targetTotalMarks: targetMark,
    achievable: true,
    requirements: {
      ct: {
        remainingCts: remainingCtCount,
        minTotalBest3Ct: targetCt,
        minScorePerRemainingCt: remainingCtCount > 0 ? (ctSolver.minPerRemainingCt || 0) : null,
        description: remainingCtCount > 0
          ? `Score at least ${ctSolver.minPerRemainingCt || 0}/20 in each of the remaining ${remainingCtCount} CT(s).`
          : `CT completed (${targetCt}/60 marks secured).`,
      },
      attendance: {
        targetAttendanceMark: attendanceMarkTarget,
        minClassesToAttend: minClassesToAttend ?? 0,
        remainingClasses,
        projectedAttendancePct: totalClasses > 0
          ? Math.round(((attended + (minClassesToAttend ?? 0)) / totalClasses) * 100)
          : 0,
        description: remainingClasses > 0
          ? `Attend at least ${minClassesToAttend ?? 0} of the remaining ${remainingClasses} classes.`
          : `All classes held (${attended}/${classesHeld} attended).`,
      },
      termFinal: {
        minScoreNeeded: finalScoreNeeded,
        maxScore: maxFinalMark,
        percentageNeeded: finalPercentageNeeded,
        description: `Score at least ${finalScoreNeeded} out of ${maxFinalMark} (${finalPercentageNeeded}%) in the Term Final exam.`,
      },
    },
  };
}

/**
 * Generate Smart Heuristic Advisory Coaching (Zero-cost, local)
 */
function generateHeuristicAdvice(courseAnalysis) {
  const { course, progress, targets } = courseAnalysis;
  const bestTarget = targets.find((t) => t.achievable);

  let statusTone = "optimistic";
  let headlines = [];
  let actionPoints = [];

  if (progress.is4Achievable) {
    statusTone = "excellent";
    headlines.push(`GPA 4.00 (A+) is fully achievable in ${course.code}!`);
    actionPoints.push(`Maintain strong focus on the remaining ${progress.remainingCts} CT(s) to maximize your top-3 buffer.`);
  } else {
    statusTone = "warning";
    headlines.push(`GPA 4.00 is out of reach in ${course.code}, but your best possible result is ${progress.bestAchievableGpa} (${progress.bestAchievableGrade}).`);
    actionPoints.push(`Focus 100% of your energy on securing the remaining points to lock in ${progress.bestAchievableGpa}.`);
  }

  if (bestTarget && bestTarget.requirements) {
    const { ct, attendance, termFinal } = bestTarget.requirements;
    if (attendance.minClassesToAttend > 0) {
      actionPoints.push(`Attendance requirement: You must attend at least ${attendance.minClassesToAttend} more class(es) to avoid losing critical attendance marks.`);
    }
    if (ct.minScorePerRemainingCt && ct.remainingCts > 0) {
      actionPoints.push(`CT target: Target at least ${ct.minScorePerRemainingCt}/20 in upcoming CTs.`);
    }
    actionPoints.push(`Final Exam: You need ${termFinal.minScoreNeeded}/210 marks (${termFinal.percentageNeeded}%). Plan your syllabus revision early.`);
  }

  return {
    source: "local-heuristic",
    tone: statusTone,
    headline: headlines.join(" "),
    actionPoints,
  };
}

/**
 * Hybrid AI Advisory: Tries Gemini API if key is present; falls back smoothly to local heuristics
 */
async function generateAiCoaching(courseAnalysis) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === "" || apiKey === "replace_with_free_gemini_api_key") {
    return generateHeuristicAdvice(courseAnalysis);
  }

  try {
    const prompt = `
You are an expert academic advisor for university engineering students.
Review this student's course performance data and produce concise, encouraging, and highly specific tactical guidance.

Course: ${courseAnalysis.course.code} - ${courseAnalysis.course.name}
Total Course Marks: 300 (CT 60 max best 3 of 4, Attendance 30 max, Final Exam 210 max)
Current CTs: Completed ${courseAnalysis.progress.completedCts}/${courseAnalysis.progress.totalCts}, Scores: [${courseAnalysis.progress.ctScores.join(", ")}], Best 3 so far: ${courseAnalysis.progress.currentCtBest3}/60
Attendance: Attended ${courseAnalysis.progress.attended}/${courseAnalysis.progress.classesHeld} held, Remaining classes: ${courseAnalysis.progress.remainingClasses}, Total classes: ${courseAnalysis.course.totalClasses}
Maximum Achievable Total Marks: ${courseAnalysis.progress.absoluteMaxMarks}/300
Best Achievable GPA: ${courseAnalysis.progress.bestAchievableGpa} (${courseAnalysis.progress.bestAchievableGrade})
Is 4.00 Achievable: ${courseAnalysis.progress.is4Achievable ? "YES" : "NO"}

Targets Computed:
${courseAnalysis.targets.map(t => `- Target GPA ${t.gpa} (${t.grade}): CT Needed: ${t.requirements?.ct?.description || 'N/A'}, Attendance Needed: ${t.requirements?.attendance?.description || 'N/A'}, Final Needed: ${t.requirements?.termFinal?.description || 'N/A'}`).join("\n")}

Respond ONLY with valid JSON in this exact structure:
{
  "headline": "Short 1-sentence assessment summarizing feasibility",
  "actionPoints": [
    "Specific CT action point",
    "Specific attendance action point",
    "Specific term final exam action point"
  ]
}
`;

    // Direct fetch to Google Gemini 1.5 Flash endpoint
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.3 },
      }),
      signal: AbortSignal.timeout(5000), // 5s timeout to guarantee swift UI response
    });

    if (!response.ok) {
      console.warn(`Gemini API returned status ${response.status}. Falling back to local heuristic advice.`);
      return generateHeuristicAdvice(courseAnalysis);
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return generateHeuristicAdvice(courseAnalysis);

    const parsed = JSON.parse(rawText);
    return {
      source: "gemini-ai",
      tone: courseAnalysis.progress.is4Achievable ? "excellent" : "warning",
      headline: parsed.headline,
      actionPoints: parsed.actionPoints || [],
    };
  } catch (error) {
    console.warn("Gemini API request failed or timed out. Gracefully falling back to local heuristic advice.", error.message);
    return generateHeuristicAdvice(courseAnalysis);
  }
}

module.exports = {
  GRADE_TIERS,
  getAttendanceMarkForPercentage,
  findMinClassesNeeded,
  calculateBest3,
  getMaxPossibleCtScore,
  solveMinCtRequired,
  analyzeCourseFeasibility,
  generateHeuristicAdvice,
  generateAiCoaching,
};
