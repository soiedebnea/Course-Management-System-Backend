require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
// CLIENT_URL may hold several origins, comma separated. In development any localhost port is accepted.
const allowed = (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map((s) => s.trim());
const localDev = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
app.use(
  cors({
    origin: (origin, cb) =>
      cb(null, !origin || allowed.includes(origin) || (process.env.NODE_ENV !== 'production' && localDev.test(origin))),
  })
);
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', require('./auth').router);
app.use('/api/files', require('./files').router);
app.use('/api', require('./routes'));

app.use((req, res) => res.status(404).json({ message: 'Route not found' }));

// Central error handler
app.use((err, req, res, next) => {
  console.error(err.message);
  const status = ['ValidationError', 'MulterError', 'CastError'].includes(err.name) ? 400 : err.status || 500;
  if (err.code === 'LIMIT_FILE_SIZE') err.message = 'File is too large';
  if (err.name === 'CastError') err.message = 'Invalid id';
  res.status(status).json({ message: err.message || 'Server error' });
});

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    const port = process.env.PORT || 5000;
    app.listen(port, () => console.log(`API on http://localhost:${port}`));
  })
  .catch((e) => {
    console.error('MongoDB connection failed:', e.message);
    process.exit(1);
  });