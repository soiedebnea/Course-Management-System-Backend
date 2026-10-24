const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { Schema } = mongoose;

// ---------- User ----------
const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6 },
    role: { type: String, enum: ['student', 'instructor'], default: 'student' },
  },
  { timestamps: true }
);
userSchema.pre('save', async function () {
  if (this.isModified('password')) this.password = await bcrypt.hash(this.password, 10);
});
userSchema.methods.matches = function (plain) {
  return bcrypt.compare(plain, this.password);
};

// ---------- Course (lessons embedded) ----------
const lessonSchema = new Schema({
  title: { type: String, required: true, trim: true },
  content: { type: String, default: '' },
  duration: { type: Number, default: 0 }, // minutes
});
const courseSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    instructor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    lessons: [lessonSchema],
  },
  { timestamps: true }
);

// ---------- Enrollment (progress tracking) ----------
const enrollmentSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    completedLessons: [{ type: Schema.Types.ObjectId }], // lesson _ids
  },
  { timestamps: true }
);
enrollmentSchema.index({ student: 1, course: 1 }, { unique: true });

// ---------- File (metadata only; bytes live in /uploads) ----------
const fileSchema = new Schema(
  {
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    lesson: { type: Schema.Types.ObjectId, default: null }, // optional: attach to a lesson
    originalName: { type: String, required: true },
    storedName: { type: String, required: true },
    mimeType: String,
    size: Number, // bytes
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

// Progress = completed lessons that still exist / total lessons
function progress(course, completedLessons) {
  const ids = new Set(course.lessons.map((l) => String(l._id)));
  const done = completedLessons.filter((id) => ids.has(String(id))).length;
  const total = ids.size;
  return { done, total, progress: total ? Math.round((done / total) * 100) : 0 };
}

module.exports = {
  User: mongoose.model('User', userSchema),
  Course: mongoose.model('Course', courseSchema),
  Enrollment: mongoose.model('Enrollment', enrollmentSchema),
  File: mongoose.model('File', fileSchema),
  progress,
};