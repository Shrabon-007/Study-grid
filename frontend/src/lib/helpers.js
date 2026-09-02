export const courseFromLink = (item) => ({
  id: item.id || item._id,
  semesterLabel: item.semesterLabel || item.semester || "Level-1 Term-1",
  code: item.course?.code || item.code || "",
  name: item.course?.name || item.name || "",
  credit: Number(item.course?.credit ?? item.credit ?? 0),
  courseType: item.course?.courseType || item.courseType || "theory",
  teacherName: item.course?.teacherName || item.teacherName || "",
});

export const getCtPolicy = (courseType, credit) => {
  if (courseType === "lab" || Number(credit) <= 1.5) return { count: 0, best: 0, maximum: 0 };
  if (Number(credit) >= 4) return { count: 5, best: 4, maximum: 80 };
  if (Number(credit) >= 3) return { count: 4, best: 3, maximum: 60 };
  if (Number(credit) >= 2) return { count: 3, best: 2, maximum: 40 };
  return { count: 0, best: 0, maximum: 0 };
};

export const attendanceMark = (percentage, credit, courseType) => {
  const maximum = Number(credit) * 10;
  if (percentage >= 90) return maximum;
  if (percentage >= 85) return maximum * .9;
  if (percentage >= 80) return maximum * .8;
  if (percentage >= 75) return maximum * .7;
  if (percentage >= 70) return maximum * .6;
  if (percentage >= 65) return maximum * .5;
  if (percentage >= 60) return maximum * .4;
  return 0;
};

export const gradePoint = (mark) => {
  const score = Number(mark);
  if (score >= 80) return 4;
  if (score >= 75) return 3.75;
  if (score >= 70) return 3.5;
  if (score >= 65) return 3.25;
  if (score >= 60) return 3;
  if (score >= 55) return 2.75;
  if (score >= 50) return 2.5;
  if (score >= 45) return 2.25;
  if (score >= 40) return 2;
  return 0;
};
