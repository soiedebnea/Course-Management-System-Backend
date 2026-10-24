# Course Management System — Backend

Node.js + Express 5 + **MongoDB (Mongoose)** REST API with JWT auth, progress tracking and file management.
The React frontend lives in its own project (`../frontend`).

```
backend/
├── server.js              # Express, MongoDB connection, error handler
├── auth.js                # Register/login (JWT), history, auth middleware
├── routes.js              # Courses, lessons, enrollments, progress
├── files.js               # File upload/list/download/delete, JSON course import
├── models.js              # User, Course, Enrollment, File
├── seed.js                # Demo users + sample courses
├── sample-courses.json    # Example for bulk import
├── package.json
├── .env.example           # Copy to .env
├── .gitignore
├── README.md
└── uploads/               # Auto-created on first run
```

## Features
- Register / log in as a **student** or **instructor** (JWT)
- Instructors: create, edit and delete courses and lessons; see enrolled students and their progress
- Students: enroll / unenroll, mark lessons complete, track progress per course
- File management: upload, list, download and delete course files; bulk-import courses from JSON

## Requirements
- Node.js 18 or newer
- MongoDB, either local or a MongoDB Atlas connection string

## Setup
```bash
npm install
cp .env.example .env     # then set MONGO_URI and JWT_SECRET
npm run seed             # optional: demo users and sample courses
npm run dev              # or: npm start
```
You should see `MongoDB connected` and `API on http://localhost:5000`.
Check it: `http://localhost:5000/api/health` returns `{"ok":true}`.

| Script | What it does |
|---|---|
| `npm run dev` | Start with auto-restart (nodemon) |
| `npm start` | Start normally |
| `npm run seed` | Create demo users and load `sample-courses.json` (re-running replaces the demo courses) |

**Demo accounts** (after seeding), both with password `password123`:
- `instructor@example.com`
- `student@example.com`

## Environment variables (`.env`)
| Name | Description |
|---|---|
| `PORT` | Server port (default 5000) |
| `MONGO_URI` | MongoDB connection string, e.g. `mongodb://127.0.0.1:27017/course_management` |
| `JWT_SECRET` | Long random secret used to sign tokens |
| `CLIENT_URL` | Frontend address allowed by CORS; several can be comma separated. In development any localhost port is accepted. |
| `MAX_FILE_MB` | Max upload size in MB (default 25) |

Restart the server after editing `.env`.

## Data model (MongoDB collections)
| Collection | Main fields |
|---|---|
| `users` | name, email (unique), hashed password, role |
| `courses` | title, description, instructor, **lessons[]** (embedded: title, content, duration) |
| `enrollments` | student, course, completedLessons[]; unique per student and course |
| `files` | course, optional lesson, originalName, storedName, mimeType, size, uploadedBy |

Progress = completed lessons ÷ the course's current number of lessons.

## API
Protected routes need `Authorization: Bearer <token>`.

**Auth** (`auth.js`)
- `POST /api/auth/register` — `{ name, email, password, role }`
- `POST /api/auth/login` — `{ email, password }`
- `GET  /api/auth/me`
- `GET  /api/auth/history` — student: enrollments with progress; instructor: own courses

**Courses and lessons** (`routes.js`)
- `GET  /api/courses?search=` — public list
- `GET  /api/courses/:id` — course with lessons
- `GET  /api/courses/mine/list` — instructor's own courses
- `POST /api/courses` — instructor
- `PUT / DELETE /api/courses/:id` — owner only
- `POST /api/courses/:id/lessons` — owner only
- `PUT / DELETE /api/courses/:id/lessons/:lessonId` — owner only
- `GET  /api/courses/:id/students` — enrolled students with progress (owner)

**Enrollments and progress** (`routes.js`, students only)
- `GET    /api/enrollments/me`
- `POST   /api/enrollments` — `{ courseId }`
- `POST   /api/enrollments/:courseId/lessons/:lessonId/toggle` — complete / undo
- `DELETE /api/enrollments/:courseId`

**Files** (`files.js`)
- `GET    /api/files/course/:courseId` — list (owner or enrolled student)
- `POST   /api/files/course/:courseId` — upload, `multipart/form-data`: `file` + optional `lessonId` (owner)
- `GET    /api/files/:id/download` — download (owner or enrolled student)
- `DELETE /api/files/:id` — delete (owner)
- `POST   /api/files/import` — bulk import courses from JSON (instructor), format in `sample-courses.json`

## File management notes
- Allowed types: png, jpg, gif, webp, pdf, doc/docx, ppt/pptx, xls/xlsx, txt, md, csv, mp4. Edit `ALLOWED` in `files.js` to change this.
- Files are saved in `uploads/` under a random name; MongoDB stores only the details.
- Downloads need a login token, so file links cannot be opened anonymously.
- Deleting a course removes its files. Deleting a lesson keeps its files and detaches them from the lesson.

## Troubleshooting
| Problem | Fix |
|---|---|
| `MongoDB connection failed` and the server exits | Start MongoDB, or fix `MONGO_URI` |
| Login or register fails with a server error | `JWT_SECRET` is missing in `.env` |
| Browser shows a CORS error | Set `CLIENT_URL` to the exact frontend address and restart |
| "File type … is not allowed" | Add the extension to `ALLOWED` in `files.js` |
| "File is too large" | Raise `MAX_FILE_MB` |
| Courses page is empty | Run `npm run seed` |

## Before you deploy
- Use a new, long random `JWT_SECRET`, and never commit `.env`.
- Anyone can sign up as an instructor. Restrict that for real use (for example, admin approval).
- Local disk is lost on many hosts. Move uploads to S3 or similar (only the storage calls in `files.js` change).
- Set `NODE_ENV=production` and `CLIENT_URL` to your real frontend address.
- Uploads are not virus-scanned.
