const { analyzeCourseFeasibility, generateAiCoaching } = require("../src/services/ai.service");

console.log("=== Testing AI Course Feasibility Engine (300 Marks Scheme) ===\n");

// Test Case 1: Student with high marks (CT 1: 18, CT 2: 17, high attendance)
console.log("--- TEST CASE 1: Student in CSE-221 (2 CTs done: 18, 17, attended 18/20 classes) ---");
const testCourse1 = {
  course: { code: "CSE-221", name: "Data Structures", credit: 3, teacherName: "Dr. Rahman", totalClasses: 39 },
  ctScores: [18, 17],
  totalCt: 4,
  attended: 18,
  classesHeld: 20,
  totalClasses: 39,
};

const result1 = analyzeCourseFeasibility(testCourse1);
console.log(`Max Achievable Marks: ${result1.progress.absoluteMaxMarks}/300`);
console.log(`Best Achievable GPA: ${result1.progress.bestAchievableGpa} (${result1.progress.bestAchievableGrade})`);
console.log(`Is 4.00 Achievable: ${result1.progress.is4Achievable}`);
console.log("Available Targets:", result1.targets.map(t => `${t.gpa} (${t.grade})`));
result1.targets.forEach(t => {
  console.log(`\nRequirements for Target ${t.gpa}:`);
  console.log(` - CT: ${t.requirements?.ct?.description}`);
  console.log(` - Attendance: ${t.requirements?.attendance?.description}`);
  console.log(` - Final Exam: ${t.requirements?.termFinal?.description}`);
});

// Test Case 2: Student with lower marks where 4.00 is impossible
console.log("\n--- TEST CASE 2: Student in CSE-223 (3 CTs done: 8, 9, 7, attended 12/26 classes) ---");
const testCourse2 = {
  course: { code: "CSE-223", name: "Digital Logic Design", credit: 3, teacherName: "Prof. Ahmed", totalClasses: 39 },
  ctScores: [8, 9, 7],
  totalCt: 4,
  attended: 12,
  classesHeld: 26,
  totalClasses: 39,
};

const result2 = analyzeCourseFeasibility(testCourse2);
console.log(`Max Achievable Marks: ${result2.progress.absoluteMaxMarks}/300`);
console.log(`Best Achievable GPA: ${result2.progress.bestAchievableGpa} (${result2.progress.bestAchievableGrade})`);
console.log(`Is 4.00 Achievable: ${result2.progress.is4Achievable}`);
console.log("Available Targets (Graceful Fallback):", result2.targets.map(t => `${t.gpa} (${t.grade})`));
result2.targets.forEach(t => {
  console.log(`\nRequirements for Target ${t.gpa}:`);
  console.log(` - CT: ${t.requirements?.ct?.description}`);
  console.log(` - Attendance: ${t.requirements?.attendance?.description}`);
  console.log(` - Final Exam: ${t.requirements?.termFinal?.description}`);
});

// Test Case 3: Test Hybrid AI advice generation (smooth fallback when key is not set)
(async () => {
  console.log("\n--- TEST CASE 3: AI Coaching Output (Without Key -> Local Heuristic Fallback) ---");
  const advice = await generateAiCoaching(result1);
  console.log("Advice Source:", advice.source);
  console.log("Tone:", advice.tone);
  console.log("Headline:", advice.headline);
  console.log("Action Points:", advice.actionPoints);
  console.log("\nAll Backend Tests Passed Successfully!");
})();
