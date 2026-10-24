// File management: upload / list / download / delete course files, plus JSON course import
const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Course, Enrollment, File } = require('./models');
const { protect, role } = require('./auth');

// ---------- storage (uploads/ is auto-created) ----------
const uploadDir = path.join(__dirname, 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const ALLOWED = [
  '.png', '.jpg', '.jpeg', '.gif', '.webp',
  '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.txt', '.md', '.csv', '.mp4',
];
const maxMb = Number(process.env.MAX_FILE_MB) || 25;

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    // random name on disk: user-supplied names never touch the file system
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: maxMb * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED.includes(ext)) return cb(null, true);
    cb(Object.assign(new Error(`File type ${ext || '(none)'} is not allowed`), { status: 400 }));
  },
}).single('file');

const removeStored = (storedName) => fs.unlink(path.join(uploadDir, storedName), () => {});
const shape = (f) => ({ _id: f._id, lesson: f.lesson, originalName: f.originalName, mimeType: f.mimeType, size: f.size, createdAt: f.createdAt });

// Owning instructor, or enrolled student (read only)
async function access(user, courseId) {
  const course = await Course.findById(courseId);
  if (!course) return { course: null };
  if (user.role === 'instructor') {
    const owner = String(course.instructor) === String(user._id);
    return { course, owner, canRead: owner };
  }
  const enrolled = await Enrollment.exists({ student: user._id, course: course._id });
  return { course, owner: false, canRead: !!enrolled };
}

router.use(protect);

// ---------- JSON course import (instructor) ----------
// Body: { "courses": [ { title, description, lessons: [ { title, content, duration } ] } ] }
router.post('/import', role('instructor'), async (req, res) => {
  const list = Array.isArray(req.body) ? req.body : req.body.courses;
  if (!Array.isArray(list) || !list.length) return res.status(400).json({ message: 'Expected a "courses" array' });
  if (list.length > 50) return res.status(400).json({ message: 'Import at most 50 courses at a time' });

  const docs = list.map((c) => ({
    title: c.title,
    description: c.description,
    instructor: req.user._id,
    lessons: (Array.isArray(c.lessons) ? c.lessons : []).map((l) => ({ title: l.title, content: l.content, duration: l.duration })),
  }));
  const bad = docs.findIndex((d) => !d.title || d.lessons.some((l) => !l.title));
  if (bad >= 0) return res.status(400).json({ message: `Course ${bad + 1} is missing a title, or has a lesson without one` });

  const created = await Course.insertMany(docs);
  res.status(201).json({ imported: created.length, courses: created.map((c) => ({ _id: c._id, title: c.title, lessonCount: c.lessons.length })) });
});

// ---------- list ----------
router.get('/course/:courseId', async (req, res) => {
  const { course, canRead } = await access(req.user, req.params.courseId);
  if (!course) return res.status(404).json({ message: 'Course not found' });
  if (!canRead) return res.status(403).json({ message: 'Enroll in this course to see its files' });
  const list = await File.find({ course: course._id }).sort('-createdAt');
  res.json(list.map(shape));
});

// ---------- upload (owner). Ownership is checked BEFORE multer writes to disk ----------
router.post(
  '/course/:courseId',
  async (req, res, next) => {
    const { course, owner } = await access(req.user, req.params.courseId);
    if (!course) return res.status(404).json({ message: 'Course not found' });
    if (!owner) return res.status(403).json({ message: 'Only the course owner can upload files' });
    req.course = course;
    next();
  },
  upload,
  async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'No file received' });
    const lessonId = req.body.lessonId || null;
    if (lessonId && !req.course.lessons.id(lessonId)) {
      removeStored(req.file.filename);
      return res.status(400).json({ message: 'Lesson not found in this course' });
    }
    const f = await File.create({
      course: req.course._id,
      lesson: lessonId,
      originalName: req.file.originalname,
      storedName: req.file.filename,
      mimeType: req.file.mimetype,
      size: req.file.size,
      uploadedBy: req.user._id,
    });
    res.status(201).json(shape(f));
  }
);

// ---------- download (owner or enrolled student) ----------
router.get('/:id/download', async (req, res) => {
  const f = await File.findById(req.params.id);
  if (!f) return res.status(404).json({ message: 'File not found' });
  const { canRead } = await access(req.user, f.course);
  if (!canRead) return res.status(403).json({ message: 'You do not have access to this file' });
  const full = path.join(uploadDir, f.storedName);
  if (!fs.existsSync(full)) return res.status(404).json({ message: 'File is missing on the server' });
  res.download(full, f.originalName);
});

// ---------- delete (owner) ----------
router.delete('/:id', async (req, res) => {
  const f = await File.findById(req.params.id);
  if (!f) return res.status(404).json({ message: 'File not found' });
  const { owner } = await access(req.user, f.course);
  if (!owner) return res.status(403).json({ message: 'Only the course owner can delete files' });
  removeStored(f.storedName);
  await f.deleteOne();
  res.json({ message: 'File deleted' });
});

module.exports = { router, removeStored };