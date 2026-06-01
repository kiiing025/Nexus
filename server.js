require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const { initDb } = require("./models/database");
const User = require("./models/User");
const Task = require("./models/Task");
const Note = require("./models/Note");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "semstack-dev-secret-change-me";
const TOKEN_TTL = "7d";

const subjects = [
  {
    id: "IT311",
    year: "3rd Year",
    semester: "3rd Year - 1st Semester",
    code: "IT311",
    name: "Information Assurance and Security",
    accent: "#fb7185",
    links: {
      // Paste your real resource URLs here later.
      syllabus: "#",
      drive: "#",
      github: "#",
    },
  },
  {
    id: "IT313",
    year: "3rd Year",
    semester: "3rd Year - 1st Semester",
    code: "IT313",
    name: "Mobile Programming",
    accent: "#34d399",
    links: {
      syllabus: "#",
      drive: "#",
      github: "#",
    },
  },
  {
    id: "IT314",
    year: "3rd Year",
    semester: "3rd Year - 1st Semester",
    code: "IT314",
    name: "Software Engineering",
    accent: "#818cf8",
    links: {
      syllabus: "#",
      drive: "#",
      github: "#",
    },
  },
  {
    id: "IT315",
    year: "3rd Year",
    semester: "3rd Year - 1st Semester",
    code: "IT315",
    name: "IT Elective 1",
    accent: "#c084fc",
    links: {
      syllabus: "#",
      drive: "#",
      github: "#",
    },
  },
  {
    id: "IT413",
    year: "4th Year",
    semester: "4th Year - 1st Semester",
    code: "IT413",
    name: "Social and Professional Issues",
    accent: "#f59e0b",
    links: {
      syllabus: "#",
      drive: "#",
      github: "#",
    },
  },
];

const subjectIds = new Set(subjects.map((subject) => subject.id));
const dbReady = initDb();

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(__dirname));

app.use("/api", async (req, res, next) => {
  try {
    await dbReady;
    return next();
  } catch (error) {
    return next(error);
  }
});

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function publicUser(user) {
  return { id: user.id, email: user.email };
}

function validateSubject(subjectId) {
  return typeof subjectId === "string" && subjectIds.has(subjectId);
}

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token) {
    return res.status(401).json({ error: "Missing authorization token." });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(payload.sub);
    if (!user) {
      return res.status(401).json({ error: "Invalid authorization token." });
    }
    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired authorization token." });
  }
}

app.post("/api/auth/register", async (req, res, next) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }

    const existing = await User.findByEmail(email);
    if (existing) {
      return res.status(409).json({ error: "An account with that email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ email, passwordHash });
    return res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const user = await User.findByEmail(email);

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    return res.json({
      token: signToken(user),
      user: publicUser(user),
    });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/dashboard", requireAuth, async (req, res, next) => {
  try {
    const tasks = await Task.allForUser(req.user.id);
    const notes = await Note.allForUser(req.user.id);
    return res.json({ user: publicUser(req.user), subjects, tasks, notes });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/tasks", requireAuth, async (req, res, next) => {
  try {
    const subjectId = String(req.body.subjectId || "").trim();
    const text = String(req.body.text || "").trim();

    if (!validateSubject(subjectId)) {
      return res.status(400).json({ error: "Invalid subject." });
    }
    if (!text) {
      return res.status(400).json({ error: "Task text is required." });
    }

    const task = await Task.create({ userId: req.user.id, subjectId, text });
    return res.status(201).json({ task });
  } catch (error) {
    return next(error);
  }
});

app.put("/api/tasks/:id", requireAuth, async (req, res, next) => {
  try {
    const task = await Task.update({
      id: Number(req.params.id),
      userId: req.user.id,
      completed: req.body.completed,
      text: req.body.text,
    });

    if (!task) {
      return res.status(404).json({ error: "Task not found." });
    }
    return res.json({ task });
  } catch (error) {
    return next(error);
  }
});

app.delete("/api/tasks/:id", requireAuth, async (req, res, next) => {
  try {
    const deleted = await Task.delete({ id: Number(req.params.id), userId: req.user.id });
    if (!deleted) {
      return res.status(404).json({ error: "Task not found." });
    }
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

app.put("/api/notes/:subjectId", requireAuth, async (req, res, next) => {
  try {
    const subjectId = String(req.params.subjectId || "").trim();
    const content = String(req.body.content || "");

    if (!validateSubject(subjectId)) {
      return res.status(400).json({ error: "Invalid subject." });
    }

    const note = await Note.upsert({ userId: req.user.id, subjectId, content });
    return res.json({ note });
  } catch (error) {
    return next(error);
  }
});

app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: "Unexpected server error." });
});

async function start() {
  await dbReady;
  app.listen(PORT, () => {
    console.log(`SemStack running at http://localhost:${PORT}`);
  });
}

if (require.main === module) {
  start().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = app;
