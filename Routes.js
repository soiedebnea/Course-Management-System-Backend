// Courses, lessons, enrollments and progress tracking
const router = require('express').Router();
const { Course, Enrollment, File, progress } = require('./models');
const { protect, role } = require('./auth');
const { removeStored } = require('./files');

const summary = (c) => ({
  _id: c._id,
  title: c.title,
  description: c.description,
  instructor: c.instructor,
  lessonCount: c.lessons.length,
});

// ================= COURSES =================
router.get('/courses/mine/list', protect, role('instructor'), async (req, res) => {
  const courses = await Course.find({ instructor: req.user._id }).sort('-createdAt');
  res.json(courses.map(summary));
});

router.get('/courses', async (req, res) => {
  const q = req.query.search
    ? { title: new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }
    : {};
  const courses = await Course.find(q).populate('instructor', 'name').sort('-createdAt');
  res.json(courses.map(summary));
});

router.get('/courses/:id', async (req, res) => {
  const course = await Course.findById(req.params.id).populate('instructor', 'name');
  if (!course) return res.status(404).json({ message: 'Course not found' });
  res.json(course);
});

router.post('/courses', protect, role('instructor'), async (req, res) => {
  const course = await Course.create({ title: req.body.title, description: req.body.description, instructor: req.user._id });
  res.status(201).json(course);
});

// Loads the course and checks ownership; sends the error itself and returns null on failure
async function ownCourse(req, res) {
  const course = await Course.findById(req.params.id);
  if (!course) { res.status(404).json({ message: 'Course not found' }); return null; }
  if (String(course.instructor) !== String(req.user._id)) {
    res.status(403).json({ message: 'Only the course owner can do this' });
    return null;
  }
  return course;
}

router.put('/courses/:id', protect, role('instructor'), async (req, res) => {
  const course = await ownCourse(req, res);
  if (!course) return;
  if (req.body.title !== undefined) course.title = req.body.title;
  if (req.body.description !== undefined) course.description = req.body.description;
  await course.save();
  res.json(course);
});

router.delete('/courses/:id', protect, role('instructor'), async (req, res) => {
  const course = await ownCourse(req, res);
  if (!course) return;
  const files = await File.find({ course: course._id });
  files.forEach((f) => removeStored(f.storedName));
  await File.deleteMany({ course: course._id });
  await Enrollment.deleteMany({ course: course._id });
  await course.deleteOne();
  res.json({ message: 'Course deleted' });
});

// ================= LESSONS =================
router.post('/courses/:id/lessons', protect, role('instructor'), async (req, res) => {
  const course = await ownCourse(req, res);
  if (!course) return;
  course.lessons.push({ title: req.body.title, content: req.body.content, duration: req.body.duration });
  await course.save();
  res.status(201).json(course);
});

router.put('/courses/:id/lessons/:lessonId', protect, role('instructor'), async (req, res) => {
  const course = await ownCourse(req, res);
  if (!course) return;
  const lesson = course.lessons.id(req.params.lessonId);
  if (!lesson) return res.status(404).json({ message: 'Lesson not found' });
  ['title', 'content', 'duration'].forEach((k) => req.body[k] !== undefined && (lesson[k] = req.body[k]));
  await course.save();
  res.json(course);
});

router.delete('/courses/:id/lessons/:lessonId', protect, role('instructor'), async (req, res) => {
  const course = await ownCourse(req, res);
  if (!course) return;
  course.lessons.pull(req.params.lessonId);
  await course.save();
  await File.updateMany({ course: course._id, lesson: req.params.lessonId }, { lesson: null }); // keep files, detach
  res.json(course);
});

// Enrolled students + progress (owner)
router.get('/courses/:id/students', protect, role('instructor'), async (req, res) => {
  const course = await ownCourse(req, res);
  if (!course) return;
  const list = await Enrollment.find({ course: course._id }).populate('student', 'name email');
  res.json(list.map((e) => ({ enrollmentId: e._id, student: e.student, enrolledAt: e.createdAt, ...progress(course, e.completedLessons) })));
});

// ================= ENROLLMENTS (students) =================
router.use('/enrollments', protect, role('student'));

router.get('/enrollments/me', async (req, res) => {
  const list = await Enrollment.find({ student: req.user._id }).populate({ path: 'course', populate: { path: 'instructor', select: 'name' } });
  res.json(
    list.filter((e) => e.course).map((e) => ({
      _id: e._id,
      course: { _id: e.course._id, title: e.course.title, description: e.course.description, instructor: e.course.instructor },
      completedLessons: e.completedLessons,
      ...progress(e.course, e.completedLessons),
    }))
  );
});

router.post('/enrollments', async (req, res) => {
  const course = await Course.findById(req.body.courseId);
  if (!course) return res.status(404).json({ message: 'Course not found' });
  try {
    res.status(201).json(await Enrollment.create({ student: req.user._id, course: course._id }));
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'Already enrolled' });
    throw err;
  }
});

// Mark a lesson complete / incomplete
router.post('/enrollments/:courseId/lessons/:lessonId/toggle', async (req, res) => {
  const e = await Enrollment.findOne({ student: req.user._id, course: req.params.courseId }).populate('course');
  if (!e) return res.status(404).json({ message: 'You are not enrolled in this course' });
  if (!e.course.lessons.id(req.params.lessonId)) return res.status(404).json({ message: 'Lesson not found' });
  const id = req.params.lessonId;
  if (e.completedLessons.some((l) => String(l) === id)) e.completedLessons = e.completedLessons.filter((l) => String(l) !== id);
  else e.completedLessons.push(id);
  await e.save();
  res.json({ completedLessons: e.completedLessons, ...progress(e.course, e.completedLessons) });
});

router.delete('/enrollments/:courseId', async (req, res) => {
  await Enrollment.deleteOne({ student: req.user._id, course: req.params.courseId });
  res.json({ message: 'Unenrolled' });
});

module.exports = router;