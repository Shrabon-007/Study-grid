const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../models/user.model");
const Student = require("../models/student.model");
const Advisor = require("../models/advisor.model");
const Admin = require("../models/admin.model");
const Teacher = require("../models/teacher.model");

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

const signToken = (user) => {
  return jwt.sign(
    {
      sub: user._id.toString(),
      role: user.role,
      email: user.email,
      name: user.name,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    }
  );
};

const register = async (req, res) => {
  try {
    const role = String(req.body.role || "").trim().toLowerCase();
    const name = String(req.body.name || "").trim();
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");

    if (!role || !name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "role, name, email and password are required.",
      });
    }

    if (!["admin", "advisor", "student", "teacher"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid role.",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters.",
      });
    }

    // Validate teacher-specific details before creating the user. This prevents
    // a partial account from being created when the teacher profile is invalid.
    let teacherProfile = null;
    if (role === "teacher") {
      const teacherId = String(req.body.teacherId || "").trim().toUpperCase();
      const username = normalizeEmail(req.body.username);
      const department = String(req.body.department || "").trim();

      if (!teacherId || !username || !department) {
        return res.status(400).json({
          success: false,
          message: "teacherId, username and department are required for teacher registration.",
        });
      }

      const [existingTeacherId, existingUsername] = await Promise.all([
        Teacher.findOne({ teacherId }),
        Teacher.findOne({ username }),
      ]);

      if (existingTeacherId) {
        return res.status(409).json({ success: false, message: "Teacher ID already exists." });
      }

      if (existingUsername) {
        return res.status(409).json({
          success: false,
          message: "Teacher username already exists.",
        });
      }

      teacherProfile = { teacherId, username, department };
    }

    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.create({
      role,
      name,
      email,
      passwordHash,
    });

    if (role === "student") {
      const studentId = String(req.body.studentId || "").trim();
      const batch = String(req.body.batch || "").trim();
      const department = String(req.body.department || "").trim();
      const level = Number(req.body.level || 1);
      const term = Number(req.body.term || 1);
      const section = String(req.body.section || "A").trim().toUpperCase();

      if (!studentId || !batch || !department || !Number.isInteger(level) || level < 1 || ![1, 2].includes(term) || !section) {
        await User.deleteOne({ _id: user._id });
        return res.status(400).json({
          success: false,
          message: "studentId, batch, level, term, section and department are required for student registration.",
        });
      }

      const existsStudentId = await Student.findOne({ studentId });
      if (existsStudentId) {
        await User.deleteOne({ _id: user._id });
        return res.status(409).json({
          success: false,
          message: "Student ID already exists.",
        });
      }

      await Student.create({
        userId: user._id,
        studentId,
        batch,
        level,
        term,
        section,
        department,
      });
    }

    if (role === "advisor") {
      const advisorId = String(req.body.advisorId || "").trim();
      const department = String(req.body.department || "").trim();
      const batchFocus = String(req.body.batchFocus || "").trim();

      if (!advisorId || !department) {
        await User.deleteOne({ _id: user._id });
        return res.status(400).json({
          success: false,
          message: "advisorId and department are required for advisor registration.",
        });
      }

      const existsAdvisorId = await Advisor.findOne({ advisorId });
      if (existsAdvisorId) {
        await User.deleteOne({ _id: user._id });
        return res.status(409).json({
          success: false,
          message: "Advisor ID already exists.",
        });
      }

      await Advisor.create({
        userId: user._id,
        advisorId,
        department,
        batchFocus,
      });
    }

    if (role === "admin") {
      await Admin.create({ userId: user._id });
    }

    if (role === "teacher") {
      try {
        await Teacher.create({ userId: user._id, ...teacherProfile });
      } catch (error) {
        // A unique-index race or database failure must not leave a login-only
        // user account without the required teachers collection document.
        await User.deleteOne({ _id: user._id });
        if (error && error.code === 11000) {
          return res.status(409).json({
            success: false,
            message: "Teacher ID or username already exists.",
          });
        }
        throw error;
      }
    }

    return res.status(201).json({
      success: true,
      message: "Registration successful.",
      data: {
        user: {
          id: user._id,
          role: user.role,
          name: user.name,
          email: user.email,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Registration failed.",
      error: error.message,
    });
  }
};

const login = async (req, res) => {
  try {
    const role = String(req.body.role || "").trim().toLowerCase();
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");

    if (!role || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "role, email and password are required.",
      });
    }

    const user = await User.findOne({ email, role });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials.",
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials.",
      });
    }

    let profile = null;

    if (user.role === "student") {
      profile = await Student.findOne({ userId: user._id }).select("studentId batch level term section department advisorId");
    }

    if (user.role === "advisor") {
      profile = await Advisor.findOne({ userId: user._id }).select("advisorId department batchFocus");
    }

    if (user.role === "admin") {
      profile = await Admin.findOne({ userId: user._id }).select("_id userId createdAt");
    }

    if (user.role === "teacher") {
      profile = await Teacher.findOne({ userId: user._id }).select("teacherId username department");
      if (!profile) {
        return res.status(401).json({
          success: false,
          message: "Invalid credentials.",
        });
      }
    }

    user.lastLoginAt = new Date();
    await user.save();

    const token = signToken(user);

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      data: {
        token,
        user: {
          id: user._id,
          role: user.role,
          name: user.name,
          email: user.email,
        },
        profile,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Login failed.",
      error: error.message,
    });
  }
};

const me = async (req, res) => {
  try {
    const userId = req.auth.sub;

    const user = await User.findById(userId).select("_id role name email createdAt lastLoginAt");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    let profile = null;

    if (user.role === "student") {
      profile = await Student.findOne({ userId: user._id }).select("studentId batch level term section department advisorId");
    }

    if (user.role === "advisor") {
      profile = await Advisor.findOne({ userId: user._id }).select("advisorId department batchFocus");
    }

    if (user.role === "admin") {
      profile = await Admin.findOne({ userId: user._id }).select("_id userId createdAt");
    }

    if (user.role === "teacher") {
      profile = await Teacher.findOne({ userId: user._id }).select("teacherId username department");
    }

    return res.status(200).json({
      success: true,
      data: {
        user,
        profile,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Could not fetch profile.",
      error: error.message,
    });
  }
};

const updateMe = async (req, res) => {
  try {
    const userId = req.auth.sub;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const name = String(req.body.name || "").trim();
    const email = normalizeEmail(req.body.email);
    const currentPassword = String(req.body.currentPassword || "");
    const newPassword = String(req.body.newPassword || "");
    const confirmPassword = String(req.body.confirmPassword || "");

    if (name) {
      user.name = name;
    }

    if (email && email !== user.email) {
      const emailOwner = await User.findOne({ email, _id: { $ne: user._id } });
      if (emailOwner) {
        return res.status(409).json({
          success: false,
          message: "Another account already uses this email.",
        });
      }
      user.email = email;
    }

    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({
          success: false,
          message: "Current password is required to set a new password.",
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: "New password must be at least 6 characters.",
        });
      }

      if (confirmPassword && confirmPassword !== newPassword) {
        return res.status(400).json({
          success: false,
          message: "New password and confirm password do not match.",
        });
      }

      const ok = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!ok) {
        return res.status(401).json({
          success: false,
          message: "Current password is incorrect.",
        });
      }

      user.passwordHash = await bcrypt.hash(newPassword, 10);
    }

    if (user.role === "student") {
      const student = await Student.findOne({ userId: user._id });
      if (student) {
        const studentId = String(req.body.studentId || "").trim();
        const batch = String(req.body.batch || "").trim();
        const department = String(req.body.department || "").trim();
        const level = Number(req.body.level || student.level || 1);
        const term = Number(req.body.term || student.term || 1);
        const section = String(req.body.section || student.section || "A").trim().toUpperCase();

        if (studentId && studentId !== student.studentId) {
          const studentIdOwner = await Student.findOne({ studentId, _id: { $ne: student._id } });
          if (studentIdOwner) {
            return res.status(409).json({
              success: false,
              message: "Student ID already exists.",
            });
          }
          student.studentId = studentId;
        }

        if (batch) student.batch = batch;
        if (Number.isInteger(level) && level >= 1) student.level = level;
        if ([1, 2].includes(term)) student.term = term;
        if (section) student.section = section;
        if (department) student.department = department;
        await student.save();
      }
    }

    if (user.role === "advisor") {
      const advisor = await Advisor.findOne({ userId: user._id });
      if (advisor) {
        const advisorId = String(req.body.advisorId || "").trim();
        const department = String(req.body.department || "").trim();
        const batchFocus = String(req.body.batchFocus || "").trim();

        if (advisorId && advisorId !== advisor.advisorId) {
          const advisorIdOwner = await Advisor.findOne({ advisorId, _id: { $ne: advisor._id } });
          if (advisorIdOwner) {
            return res.status(409).json({
              success: false,
              message: "Advisor ID already exists.",
            });
          }
          advisor.advisorId = advisorId;
        }

        if (department) advisor.department = department;
        if (req.body.batchFocus !== undefined) advisor.batchFocus = batchFocus;
        await advisor.save();
      }
    }

    if (user.role === "teacher") {
      const teacher = await Teacher.findOne({ userId: user._id });
      if (teacher) {
        const teacherId = String(req.body.teacherId || "").trim().toUpperCase();
        const username = normalizeEmail(req.body.username);
        const department = String(req.body.department || "").trim();

        if (teacherId && teacherId !== teacher.teacherId) {
          const teacherIdOwner = await Teacher.findOne({ teacherId, _id: { $ne: teacher._id } });
          if (teacherIdOwner) {
            return res.status(409).json({ success: false, message: "Teacher ID already exists." });
          }
          teacher.teacherId = teacherId;
        }

        if (username && username !== teacher.username) {
          const usernameOwner = await Teacher.findOne({ username, _id: { $ne: teacher._id } });
          if (usernameOwner) {
            return res.status(409).json({
              success: false,
              message: "Teacher username already exists.",
            });
          }
          teacher.username = username;
        }

        if (department) teacher.department = department;
        await teacher.save();
      }
    }

    await user.save();

    let profile = null;
    if (user.role === "student") {
      profile = await Student.findOne({ userId: user._id }).select("studentId batch level term section department advisorId");
    }
    if (user.role === "advisor") {
      profile = await Advisor.findOne({ userId: user._id }).select("advisorId department batchFocus");
    }
    if (user.role === "admin") {
      profile = await Admin.findOne({ userId: user._id }).select("_id userId createdAt");
    }
    if (user.role === "teacher") {
      profile = await Teacher.findOne({ userId: user._id }).select("teacherId username department");
    }

    const token = signToken(user);

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully.",
      data: {
        token,
        user: {
          id: user._id,
          role: user.role,
          name: user.name,
          email: user.email,
        },
        profile,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Could not update profile.",
      error: error.message,
    });
  }
};

const logout = async (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Logout successful on client side.",
  });
};

module.exports = {
  register,
  login,
  me,
  updateMe,
  logout,
};
