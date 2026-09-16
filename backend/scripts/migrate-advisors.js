/**
 * migrate-advisors.js
 *
 * One-time migration: converts existing "advisor" users to "teacher" users
 * with isAdvisor=true on their Teacher profile.
 *
 * Usage:
 *   node scripts/migrate-advisors.js
 *
 * Run this ONCE after deploying the advisor-merge changes.
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const User = require("../src/models/user.model");
const Advisor = require("../src/models/advisor.model");
const Teacher = require("../src/models/teacher.model");

async function migrate() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB.");

  const advisorUsers = await User.find({ role: "advisor" });
  console.log(`Found ${advisorUsers.length} advisor user(s) to migrate.`);

  let migrated = 0;
  let skipped = 0;

  for (const user of advisorUsers) {
    const advisor = await Advisor.findOne({ userId: user._id });
    if (!advisor) {
      console.log(`  SKIP: ${user.name} (${user.email}) — no advisor profile found.`);
      skipped++;
      continue;
    }

    // Check if a teacher profile already exists
    let teacher = await Teacher.findOne({ userId: user._id });
    if (teacher) {
      // Teacher profile exists — just set isAdvisor
      teacher.isAdvisor = true;
      teacher.batchFocus = advisor.batchFocus || teacher.batchFocus || "";
      await teacher.save();
      console.log(`  UPDATE: ${user.name} — existing teacher profile, set isAdvisor=true.`);
    } else {
      // Create a new teacher profile from advisor data
      const teacherId = advisor.advisorId || `ADV-${user._id.toString().slice(-6).toUpperCase()}`;
      const username = user.email.split("@")[0];

      teacher = await Teacher.create({
        userId: user._id,
        teacherId,
        username,
        department: advisor.department || "Unknown",
        isAdvisor: true,
        batchFocus: advisor.batchFocus || "",
      });
      console.log(`  CREATE: ${user.name} — new teacher profile (teacherId: ${teacherId}).`);
    }

    // Change user role from "advisor" to "teacher"
    user.role = "teacher";
    await user.save();
    migrated++;
  }

  console.log(`\nMigration complete: ${migrated} migrated, ${skipped} skipped.`);
  await mongoose.disconnect();
}

migrate().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
