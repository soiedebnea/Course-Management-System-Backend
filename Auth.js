const router = require('express').Router();
const jwt = require('jsonwebtoken');
const { User, Course, Enrollment, progress } = require('./models');

const sign = (u) => jwt.sign({ id: u._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
const shape = (u) => ({ id: u._id, name: u.name, email: u.email, role: u.role });

// ---------- middleware ----------
async function protect(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Please log in' });
    const { id } = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(id).select('-password');
    if (!req.user) return res.status(401).json({ message: 'User no longer exists' });
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
}
const role = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ message: 'Not allowed for your role' });

// ---------- routes ----------
router.post('/register', async (req, res) => {
  const { name, email, password, role: r } = req.body;
  if (await User.findOne({ email })) return res.status(400).json({ message: 'Email already registered' });
  const user = await User.create({ name, email, password, role: r === 'instructor' ? 'instructor' : 'student' });
  res.status(201).json({ token: sign(user), user: shape(user) });
});

router.post('/login', async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (!user || !(await user.matches(req.body.password || '')))
    return res.status(401).json({ message: 'Wrong email or password' });
  res.json({ token: sign(user), user: shape(user) });
});

router.get('/me', protect, (req, res) => res.json({ user: shape(req.user) }));

// Learning history: a student's enrollments with progress, or an instructor's courses
router.get('/history', protect, async (req, res) => {
  if (req.user.role === 'instructor') {
    const courses = await Course.find({ instructor: req.user._id }).sort('-createdAt');
    return res.json(courses.map((c) => ({ _id: c._id, title: c.title, lessonCount: c.lessons.length, createdAt: c.createdAt })));
  }
  const list = await Enrollment.find({ student: req.user._id }).populate('course').sort('-updatedAt');
  res.json(
    list.filter((e) => e.course).map((e) => ({
      _id: e._id,
      course: { _id: e.course._id, title: e.course.title },
      enrolledAt: e.createdAt,
      lastActivity: e.updatedAt,
      ...progress(e.course, e.completedLessons),
    }))
  );
});

module.exports = { router, protect, role };