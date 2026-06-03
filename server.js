require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const { getDb, initDb } = require("./models/database");
const User = require("./models/User");
const Subject = require("./models/Subject");
const Folder = require("./models/Folder");
const Event = require("./models/Event");
const Task = require("./models/Task");
const Note = require("./models/Note");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "semstack-dev-secret-change-me";
const TOKEN_TTL = "7d";

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

async function findUserSubject(userId, subjectId) {
  if (typeof subjectId !== "string" || !subjectId.trim()) return null;
  await Subject.ensureDefaultsForUser(userId);
  return Subject.findForUser({ userId, subjectId: subjectId.trim() });
}

async function ensureUserCoursework(userId) {
  await Subject.ensureDefaultsForUser(userId);
  const subjects = await Subject.allForUser(userId);
  for (const subject of subjects) {
    await Folder.ensureDefaultsForUserSubject({ userId, subjectId: subject.id });
  }
  return subjects;
}

function requiredText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(value) {
  return typeof value === "string" ? value.trim() : "";
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
    await ensureUserCoursework(user.id);
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

app.get("/api/health", async (req, res, next) => {
  try {
    const db = await getDb();
    return res.json({ ok: true, database: db.dialect });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/dashboard", requireAuth, async (req, res, next) => {
  try {
    const subjects = await ensureUserCoursework(req.user.id);
    const tasks = await Task.allForUser(req.user.id);
    const notes = await Note.allForUser(req.user.id);
    const folders = await Folder.allForUser(req.user.id);
    const events = await Event.allForUser(req.user.id);
    return res.json({ user: publicUser(req.user), subjects, tasks, notes, folders, events });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/tasks", requireAuth, async (req, res, next) => {
  try {
    const subjectId = String(req.body.subjectId || "").trim();
    const text = String(req.body.text || "").trim();

    if (!(await findUserSubject(req.user.id, subjectId))) {
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

    if (!(await findUserSubject(req.user.id, subjectId))) {
      return res.status(400).json({ error: "Invalid subject." });
    }

    const note = await Note.upsert({ userId: req.user.id, subjectId, content });
    return res.json({ note });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/subjects/:subjectId/links", requireAuth, async (req, res, next) => {
  try {
    const subjectId = String(req.params.subjectId || "").trim();
    if (!(await findUserSubject(req.user.id, subjectId))) {
      return res.status(404).json({ error: "Subject not found." });
    }

    const links = await Subject.linksForUserSubject({ userId: req.user.id, subjectId });
    return res.json({ links });
  } catch (error) {
    return next(error);
  }
});

app.put("/api/subjects/:subjectId/links", requireAuth, async (req, res, next) => {
  try {
    const subjectId = String(req.params.subjectId || "").trim();
    if (!(await findUserSubject(req.user.id, subjectId))) {
      return res.status(404).json({ error: "Subject not found." });
    }

    const linksBody = req.body?.links && typeof req.body.links === "object" ? req.body.links : req.body || {};
    const links = await Subject.updateLinksForUser({
      userId: req.user.id,
      subjectId,
      links: linksBody,
    });
    return res.json({ links });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/subjects/:subjectId/folders", requireAuth, async (req, res, next) => {
  try {
    const subjectId = String(req.params.subjectId || "").trim();
    if (!(await findUserSubject(req.user.id, subjectId))) {
      return res.status(404).json({ error: "Subject not found." });
    }

    await Folder.ensureDefaultsForUserSubject({ userId: req.user.id, subjectId });
    const folders = await Folder.allForUserSubject({ userId: req.user.id, subjectId });
    return res.json({ folders });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/folders", requireAuth, async (req, res, next) => {
  try {
    const subjectId = String(req.body.subjectId || "").trim();
    const name = requiredText(req.body.name);
    if (!(await findUserSubject(req.user.id, subjectId))) {
      return res.status(400).json({ error: "Invalid subject." });
    }
    if (!name) {
      return res.status(400).json({ error: "Folder name is required." });
    }

    const folder = await Folder.create({ userId: req.user.id, subjectId, name });
    return res.status(201).json({ folder });
  } catch (error) {
    return next(error);
  }
});

app.put("/api/folders/:id", requireAuth, async (req, res, next) => {
  try {
    const folder = await Folder.update({
      id: Number(req.params.id),
      userId: req.user.id,
      name: req.body.name,
    });
    if (!folder) {
      return res.status(404).json({ error: "Folder not found." });
    }
    return res.json({ folder });
  } catch (error) {
    return next(error);
  }
});

app.delete("/api/folders/:id", requireAuth, async (req, res, next) => {
  try {
    const deleted = await Folder.delete({ id: Number(req.params.id), userId: req.user.id });
    if (!deleted) {
      return res.status(404).json({ error: "Folder not found." });
    }
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

app.post("/api/folder-items", requireAuth, async (req, res, next) => {
  try {
    const title = requiredText(req.body.title);
    const folderId = Number(req.body.folderId);
    if (!title) {
      return res.status(400).json({ error: "Folder item title is required." });
    }

    const item = await Folder.createItem({
      userId: req.user.id,
      folderId,
      title,
      description: optionalText(req.body.description),
      url: optionalText(req.body.url),
      type: optionalText(req.body.type) || "link",
      dueAt: optionalText(req.body.dueAt) || null,
      completed: Boolean(req.body.completed),
    });
    if (!item) {
      return res.status(404).json({ error: "Folder not found." });
    }
    return res.status(201).json({ item });
  } catch (error) {
    return next(error);
  }
});

app.put("/api/folder-items/:id", requireAuth, async (req, res, next) => {
  try {
    const item = await Folder.updateItem({
      id: Number(req.params.id),
      userId: req.user.id,
      title: req.body.title,
      description: req.body.description,
      url: req.body.url,
      type: req.body.type,
      dueAt: req.body.dueAt,
      completed: req.body.completed,
    });
    if (!item) {
      return res.status(404).json({ error: "Folder item not found." });
    }
    return res.json({ item });
  } catch (error) {
    return next(error);
  }
});

app.delete("/api/folder-items/:id", requireAuth, async (req, res, next) => {
  try {
    const deleted = await Folder.deleteItem({ id: Number(req.params.id), userId: req.user.id });
    if (!deleted) {
      return res.status(404).json({ error: "Folder item not found." });
    }
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

app.get("/api/events", requireAuth, async (req, res, next) => {
  try {
    const events = await Event.allForUser(req.user.id);
    return res.json({ events });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/events", requireAuth, async (req, res, next) => {
  try {
    const subjectId = String(req.body.subjectId || "").trim();
    const title = requiredText(req.body.title);
    const startsAt = requiredText(req.body.startsAt);
    const folderItemId = req.body.folderItemId ? Number(req.body.folderItemId) : null;

    if (!(await findUserSubject(req.user.id, subjectId))) {
      return res.status(400).json({ error: "Invalid subject." });
    }
    if (!title || !startsAt) {
      return res.status(400).json({ error: "Event title and date are required." });
    }
    if (folderItemId && !(await Folder.findItemForUser({ id: folderItemId, userId: req.user.id }))) {
      return res.status(404).json({ error: "Folder item not found." });
    }

    const event = await Event.create({
      userId: req.user.id,
      subjectId,
      title,
      startsAt,
      type: optionalText(req.body.type) || "Task",
      folderItemId,
    });
    return res.status(201).json({ event });
  } catch (error) {
    return next(error);
  }
});

app.put("/api/events/:id", requireAuth, async (req, res, next) => {
  try {
    const subjectId = req.body.subjectId ? String(req.body.subjectId).trim() : undefined;
    const folderItemId = req.body.folderItemId === undefined ? undefined : req.body.folderItemId ? Number(req.body.folderItemId) : null;

    if (subjectId && !(await findUserSubject(req.user.id, subjectId))) {
      return res.status(400).json({ error: "Invalid subject." });
    }
    if (folderItemId && !(await Folder.findItemForUser({ id: folderItemId, userId: req.user.id }))) {
      return res.status(404).json({ error: "Folder item not found." });
    }

    const event = await Event.update({
      id: Number(req.params.id),
      userId: req.user.id,
      subjectId,
      title: req.body.title,
      startsAt: req.body.startsAt,
      type: req.body.type,
      folderItemId,
    });
    if (!event) {
      return res.status(404).json({ error: "Event not found." });
    }
    return res.json({ event });
  } catch (error) {
    return next(error);
  }
});

app.delete("/api/events/:id", requireAuth, async (req, res, next) => {
  try {
    const deleted = await Event.delete({ id: Number(req.params.id), userId: req.user.id });
    if (!deleted) {
      return res.status(404).json({ error: "Event not found." });
    }
    return res.status(204).send();
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
