const { computeCgpaMetrics, determineCgpaAndInsights, getCourseMaxMarks } = require("../src/services/ai.service");

async function runVerification() {
  console.log("=== Testing AI CGPA Service Calculations ===");

  // 1. Test Course Max Marks
  const theoryMaxes = getCourseMaxMarks(3, "theory");
  console.log("3-Credit Theory Maxes:", theoryMaxes);
  if (theoryMaxes.attendanceMax !== 30 || theoryMaxes.ctMax !== 60 || theoryMaxes.termMax !== 210) {
    throw new Error("Invalid theory max marks calculation");
  }

  // 2. Test Computation Metrics
  const sampleCourses = [
    {
      code: "CSE-221",
      name: "Data Structures",
      credit: 3,
      courseType: "theory",
      attendanceMark: 28, // ~93% (out of 30)
      ctMark: 52,         // ~86% (out of 60)
      termFinalMark: 170, // ~81% (out of 210)
      // Total: 250 / 300 = 83.33% => Grade A+ (4.0)
    },
    {
      code: "CSE-222",
      name: "Data Structures Lab",
      credit: 1.5,
      courseType: "lab",
      attendanceMark: 14, // (out of 15)
      ctMark: 38,         // (out of 45)
      termFinalMark: 72,  // (out of 90)
      // Total: 124 / 150 = 82.67% => Grade A+ (4.0)
    },
    {
      code: "MATH-221",
      name: "Linear Algebra",
      credit: 3,
      courseType: "theory",
      attendanceMark: 22, // (out of 30)
      ctMark: 44,         // (out of 60)
      termFinalMark: 152, // (out of 210)
      // Total: 218 / 300 = 72.67% => Grade A- (3.5)
    },
  ];

  const pastSemesters = [
    { semesterLabel: "Level-1 Term-1", cgpa: 3.65 },
    { semesterLabel: "Level-1 Term-2", cgpa: 3.72 },
  ];

  const metrics = computeCgpaMetrics({
    courses: sampleCourses,
    pastSemesters,
    targetCgpa: 3.7,
  });

  console.log("\nCalculated Metrics:");
  console.log(`- Total Credits: ${metrics.totalCredits}`);
  console.log(`- Semester GPA: ${metrics.semesterGpa}`);
  console.log(`- Cumulative Final CGPA: ${metrics.cumulativeCgpa}`);
  console.log(`- Attendance Overall: ${metrics.componentSummary.attendance.percentage}%`);
  console.log(`- CT Overall: ${metrics.componentSummary.ct.percentage}%`);
  console.log(`- Term Final Overall: ${metrics.componentSummary.termFinal.percentage}%`);

  if (!metrics.semesterGpa || !metrics.cumulativeCgpa) {
    throw new Error("GPA or Cumulative CGPA is missing or 0");
  }

  // 3. Test Full AI Determination & Insights (Ollama / Local Engine)
  console.log("\nTesting AI Determination & Insights...");
  const result = await determineCgpaAndInsights({
    courses: sampleCourses,
    pastSemesters,
    targetCgpa: 3.7,
  });

  console.log(`- AI Engine Used: ${result.aiInsights.engine}`);
  console.log(`- AI Verdict: ${result.aiInsights.verdict}`);
  console.log(`- Component Impact: ${result.aiInsights.componentImpact}`);
  console.log(`- Recommendations (${result.aiInsights.recommendations.length}):`);
  result.aiInsights.recommendations.forEach((rec, i) => console.log(`   ${i + 1}. ${rec}`));

  if (!result.aiInsights.verdict || result.aiInsights.recommendations.length === 0) {
    throw new Error("AI Insights missing verdict or recommendations");
  }

  console.log("\n[SUCCESS] AI CGPA Determination and Prediction verified successfully!");
}

runVerification().catch((err) => {
  console.error("[ERROR]", err);
  process.exit(1);
});
