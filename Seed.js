// Usage: npm run seed  (creates demo users and loads sample-courses.json)
require('dotenv').config();
const mongoose = require('mongoose');
const { User, Course } = require('./models');
const sample = require('./sample-courses.json');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);

  let teacher = await User.findOne({ email: 'instructor@example.com' });
  if (!teacher) teacher = await User.create({ name: 'Demo Instructor', email: 'instructor@example.com', password: 'password123', role: 'instructor' });
  if (!(await User.findOne({ email: 'student@example.com' })))
    await User.create({ name: 'Demo Student', email: 'student@example.com', password: 'password123', role: 'student' });

  await Course.deleteMany({ instructor: teacher._id }); // re-running replaces the demo courses
  await Course.insertMany(sample.courses.map((c) => ({ ...c, instructor: teacher._id })));

  console.log(`Seeded ${sample.courses.length} courses.`);
  console.log('Instructor: instructor@example.com / password123');
  console.log('Student:    student@example.com / password123');
  await mongoose.disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });