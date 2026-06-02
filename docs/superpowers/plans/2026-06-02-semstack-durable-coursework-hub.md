# SemStack Durable Coursework Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make SemStack ready for daily use by adding a production-safe database path, user-owned subjects, editable links, folders, schedule events, and phone install support.

**Architecture:** Keep the current Express plus single-file frontend architecture. Introduce focused model files for subjects, links, folders, folder items, and events. Keep the SQLite/sql.js local fallback, but add a Postgres adapter for production through `DATABASE_URL`.

**Tech Stack:** Node.js, Express, JWT, bcryptjs, Postgres via `pg`, existing sql.js fallback, vanilla JavaScript, Tailwind CDN, Vercel.

---

## Scope Check

The approved design spans several subsystems. This plan implements them as one phased release because they share the same data model and dashboard payload. The only production blocker is live database provisioning: deployment can happen only after `DATABASE_URL` is configured in Vercel, or the server should keep the current temporary fallback until that variable exists.

## File Structure

- Modify `package.json`: add `pg`, smoke-test scripts, and a migration script command.
- Modify `models/database.js`: add Postgres support while preserving the current SQLite/sql.js local adapter.
- Create `models/defaultSubjects.js`: central source of the five seeded subjects and default folder names.
- Create `models/Subject.js`: user-owned subjects, subject links, default seeding, update helpers.
- Create `models/Folder.js`: subject folders and folder items.
- Create `models/Event.js`: schedule events.
- Modify `models/Task.js`: keep behavior but align ordering and field names with new dashboard payload.
- Modify `models/Note.js`: keep behavior.
- Modify `server.js`: use user-owned subjects, add links/folders/events routes, and return richer dashboard data.
- Modify `index.html`: add folders, settings, schedule panels, and embed fallback messaging.
- Create `manifest.webmanifest`: install metadata.
- Create `icons/semstack-icon.svg`: install icon.
- Create `sw.js`: app-shell service worker.
- Create `scripts/migrate.js`: initialize production/local schema.
- Create `scripts/api-smoke-test.js`: end-to-end API verification.

---

## Task 1: Add Test Harness Before Changing Behavior

**Files:**
- Modify: `package.json`
- Create: `scripts/api-smoke-test.js`

- [ ] **Step 1: Add script entries**

Add these scripts to `package.json`:

```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js",
    "migrate": "node scripts/migrate.js",
    "test:api": "node scripts/api-smoke-test.js"
  }
}
```

- [ ] **Step 2: Create the first smoke test**

Create `scripts/api-smoke-test.js` with this structure:

```js
const assert = require("node:assert/strict");

const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000";
const unique = Date.now().toString(36);
const email = `smoke-${unique}@example.com`;
const password = "Passw0rd!";

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${path} failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

(async () => {
  const registered = await request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  assert.ok(registered.token);

  const headers = { Authorization: `Bearer ${registered.token}` };
  const dashboard = await request("/api/dashboard", { headers });
  assert.equal(dashboard.subjects.length, 5);

  const createdTask = await request("/api/tasks", {
    method: "POST",
    headers,
    body: JSON.stringify({ subjectId: "IT314", text: "Smoke test task" }),
  });
  assert.ok(createdTask.task.id);

  const updatedTask = await request(`/api/tasks/${createdTask.task.id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ completed: true }),
  });
  assert.equal(Boolean(updatedTask.task.completed), true);

  const note = await request("/api/notes/IT314", {
    method: "PUT",
    headers,
    body: JSON.stringify({ content: "Smoke note" }),
  });
  assert.equal(note.note.content, "Smoke note");

  console.log(JSON.stringify({ ok: true, email, subjects: dashboard.subjects.length }));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 3: Run the baseline smoke test**

Run the server in a separate terminal:

```powershell
$env:PORT='3000'; npm start
```

Run:

```powershell
npm run test:api
```

Expected: JSON with `"ok":true`.

- [ ] **Step 4: Commit**

```powershell
git add package.json scripts/api-smoke-test.js
git commit -m "Add API smoke test harness"
```

---

## Task 2: Add Postgres-Capable Database Adapter

**Files:**
- Modify: `package.json`
- Modify: `models/database.js`
- Create: `scripts/migrate.js`

- [ ] **Step 1: Install Postgres dependency**

Run:

```powershell
npm install pg
```

Expected: `package.json` includes `"pg"`.

- [ ] **Step 2: Extend `models/database.js`**

Keep the current sql.js adapter, then add a Postgres branch when `DATABASE_URL` is present. The exported interface must remain:

```js
module.exports = {
  getDb,
  initDb,
};
```

The adapter must support:

```js
await db.exec(sql);
await db.run(sql, ...params);
await db.get(sql, ...params);
await db.all(sql, ...params);
```

For Postgres, convert `?` placeholders to `$1`, `$2`, and so on:

```js
function toPostgresPlaceholders(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}
```

For Postgres `run`, return:

```js
{
  lastID: row?.id || row?.last_insert_rowid || 0,
  changes: result.rowCount || 0
}
```

Use `RETURNING id` in insert model queries that need `lastID`.

- [ ] **Step 3: Add schema creation for new tables**

Update `initDb()` so it creates these tables. Use dialect-specific primary-key syntax and keep the column names identical across dialects.

```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  subject_id TEXT NOT NULL,
  year TEXT NOT NULL,
  semester TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  accent TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, subject_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS subject_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  subject_id TEXT NOT NULL,
  syllabus TEXT NOT NULL DEFAULT '',
  drive TEXT NOT NULL DEFAULT '',
  github TEXT NOT NULL DEFAULT '',
  messenger TEXT NOT NULL DEFAULT '',
  meeting TEXT NOT NULL DEFAULT '',
  instructor TEXT NOT NULL DEFAULT '',
  custom TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, subject_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  subject_id TEXT NOT NULL,
  text TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  subject_id TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, subject_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  subject_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS folder_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  folder_id INTEGER NOT NULL,
  subject_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'link',
  due_at TEXT,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  subject_id TEXT NOT NULL,
  folder_item_id INTEGER,
  title TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'Task',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (folder_item_id) REFERENCES folder_items(id) ON DELETE SET NULL
);
```

For Postgres, replace `INTEGER PRIMARY KEY AUTOINCREMENT` with `SERIAL PRIMARY KEY`. Add indexes:

```sql
CREATE INDEX IF NOT EXISTS idx_subjects_user_subject ON subjects(user_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_subject_links_user_subject ON subject_links(user_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user_subject ON tasks(user_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_notes_user_subject ON notes(user_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_folders_user_subject ON folders(user_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_folder_items_user_folder ON folder_items(user_id, folder_id);
CREATE INDEX IF NOT EXISTS idx_events_user_subject ON events(user_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_events_user_starts ON events(user_id, starts_at);
```

- [ ] **Step 4: Create migration script**

Create `scripts/migrate.js`:

```js
const { initDb } = require("../models/database");

initDb()
  .then(() => {
    console.log("SemStack database schema is ready.");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
```

- [ ] **Step 5: Verify migration**

Run:

```powershell
npm run migrate
```

Expected: `SemStack database schema is ready.`

- [ ] **Step 6: Run API smoke test**

Run:

```powershell
npm run test:api
```

Expected: JSON with `"ok":true`.

- [ ] **Step 7: Commit**

```powershell
git add package.json package-lock.json models/database.js scripts/migrate.js
git commit -m "Add Postgres-capable database adapter"
```

---

## Task 3: Move Subjects and Links Into User-Owned Data

**Files:**
- Create: `models/defaultSubjects.js`
- Create: `models/Subject.js`
- Modify: `server.js`
- Modify: `scripts/api-smoke-test.js`

- [ ] **Step 1: Create default subject definitions**

Create `models/defaultSubjects.js`:

```js
const defaultSubjects = [
  { id: "IT311", year: "3rd Year", semester: "3rd Year - 1st Semester", code: "IT311", name: "Information Assurance and Security", accent: "#fb7185" },
  { id: "IT313", year: "3rd Year", semester: "3rd Year - 1st Semester", code: "IT313", name: "Mobile Programming", accent: "#34d399" },
  { id: "IT314", year: "3rd Year", semester: "3rd Year - 1st Semester", code: "IT314", name: "Software Engineering", accent: "#818cf8" },
  { id: "IT315", year: "3rd Year", semester: "3rd Year - 1st Semester", code: "IT315", name: "IT Elective 1", accent: "#c084fc" },
  { id: "IT413", year: "4th Year", semester: "4th Year - 1st Semester", code: "IT413", name: "Social and Professional Issues", accent: "#f59e0b" },
];

const defaultFolders = ["Modules", "Lectures", "Assignments", "Projects", "Links", "Exams"];

module.exports = {
  defaultSubjects,
  defaultFolders,
};
```

- [ ] **Step 2: Create `Subject` model**

Create `models/Subject.js` and export a class with these methods:

```js
Subject.ensureDefaultsForUser(userId);
Subject.allForUser(userId);
Subject.findForUser({ userId, subjectId });
Subject.linksForUserSubject({ userId, subjectId });
Subject.updateLinksForUser({ userId, subjectId, links });
```

`allForUser` must return subject objects with the current frontend shape:

```js
{
  id,
  year,
  semester,
  code,
  name,
  accent,
  links: {
    syllabus,
    drive,
    github,
    messenger,
    meeting,
    instructor,
    custom
  }
}
```

- [ ] **Step 3: Seed on register and dashboard load**

In `server.js`, after user creation:

```js
await Subject.ensureDefaultsForUser(user.id);
```

In `/api/dashboard`, before reading tasks:

```js
await Subject.ensureDefaultsForUser(req.user.id);
const subjects = await Subject.allForUser(req.user.id);
```

- [ ] **Step 4: Add links routes**

Add `GET /api/subjects/:subjectId/links`. It must validate the subject belongs to `req.user.id`, return `404` if it does not, and otherwise return `{ links }`.

Add `PUT /api/subjects/:subjectId/links`. It must validate the subject belongs to `req.user.id`, accept only the keys `syllabus`, `drive`, `github`, `messenger`, `meeting`, `instructor`, and `custom`, coerce missing values to `""`, save through `Subject.updateLinksForUser`, and return `{ links }`.

- [ ] **Step 5: Extend smoke test**

Add to `scripts/api-smoke-test.js` after dashboard fetch:

```js
const links = await request("/api/subjects/IT314/links", {
  method: "PUT",
  headers,
  body: JSON.stringify({
    syllabus: "https://example.com/syllabus",
    drive: "https://example.com/drive",
    github: "https://github.com/example/repo",
    messenger: "https://m.me/example",
    meeting: "https://meet.google.com/abc-defg-hij",
    instructor: "mailto:instructor@example.com",
    custom: "https://example.com/custom",
  }),
});
assert.equal(links.links.github, "https://github.com/example/repo");
```

- [ ] **Step 6: Run smoke test**

Run:

```powershell
npm run test:api
```

Expected: JSON with `"ok":true`.

- [ ] **Step 7: Commit**

```powershell
git add models/defaultSubjects.js models/Subject.js server.js scripts/api-smoke-test.js
git commit -m "Add user-owned subjects and links"
```

---

## Task 4: Add Folders, Folder Items, and Events API

**Files:**
- Create: `models/Folder.js`
- Create: `models/Event.js`
- Modify: `server.js`
- Modify: `scripts/api-smoke-test.js`

- [ ] **Step 1: Create folder model**

Create `models/Folder.js` and export a class with these methods:

```js
Folder.ensureDefaultsForUserSubject({ userId, subjectId });
Folder.allForUser(userId);
Folder.allForUserSubject({ userId, subjectId });
Folder.create({ userId, subjectId, name });
Folder.update({ id, userId, name });
Folder.delete({ id, userId });
Folder.createItem({ userId, folderId, title, description, url, type, dueAt, completed });
Folder.updateItem({ id, userId, title, description, url, type, dueAt, completed });
Folder.deleteItem({ id, userId });
```

- [ ] **Step 2: Create event model**

Create `models/Event.js` and export a class with these methods:

```js
Event.allForUser(userId);
Event.create({ userId, subjectId, title, startsAt, type, folderItemId });
Event.update({ id, userId, subjectId, title, startsAt, type, folderItemId });
Event.delete({ id, userId });
```

- [ ] **Step 3: Add API routes**

Add these authenticated routes. Each route must check ownership with `user_id`; create and update routes must validate the target subject or parent folder belongs to `req.user.id`.

- `GET /api/subjects/:subjectId/folders`: returns `{ folders }`.
- `POST /api/folders`: accepts `{ subjectId, name }`, returns `{ folder }`.
- `PUT /api/folders/:id`: accepts `{ name }`, returns `{ folder }`.
- `DELETE /api/folders/:id`: returns `204`.
- `POST /api/folder-items`: accepts `{ folderId, title, description, url, type, dueAt, completed }`, returns `{ item }`.
- `PUT /api/folder-items/:id`: accepts `{ title, description, url, type, dueAt, completed }`, returns `{ item }`.
- `DELETE /api/folder-items/:id`: returns `204`.
- `GET /api/events`: returns `{ events }`.
- `POST /api/events`: accepts `{ subjectId, title, startsAt, type, folderItemId }`, returns `{ event }`.
- `PUT /api/events/:id`: accepts `{ subjectId, title, startsAt, type, folderItemId }`, returns `{ event }`.
- `DELETE /api/events/:id`: returns `204`.

- [ ] **Step 4: Add dashboard payload fields**

Update `/api/dashboard` response to include:

```js
return res.json({
  user: publicUser(req.user),
  subjects,
  tasks,
  notes,
  folders,
  events,
});
```

- [ ] **Step 5: Extend smoke test**

Add create/update/delete checks for one folder, one folder item, and one event.

Use:

```js
const folder = await request("/api/folders", {
  method: "POST",
  headers,
  body: JSON.stringify({ subjectId: "IT314", name: "Defense Prep" }),
});
assert.ok(folder.folder.id);

const item = await request("/api/folder-items", {
  method: "POST",
  headers,
  body: JSON.stringify({
    folderId: folder.folder.id,
    title: "Prototype checklist",
    description: "Screens, API, and demo script",
    url: "https://example.com/prototype",
    type: "project",
    dueAt: "2026-07-02T10:30:00.000Z",
    completed: false,
  }),
});
assert.ok(item.item.id);

const event = await request("/api/events", {
  method: "POST",
  headers,
  body: JSON.stringify({
    subjectId: "IT314",
    title: "System Prototype Defense",
    startsAt: "2026-07-02T10:30:00.000Z",
    type: "Major",
    folderItemId: item.item.id,
  }),
});
assert.ok(event.event.id);
```

- [ ] **Step 6: Run smoke test**

Run:

```powershell
npm run test:api
```

Expected: JSON with `"ok":true`.

- [ ] **Step 7: Commit**

```powershell
git add models/Folder.js models/Event.js server.js scripts/api-smoke-test.js
git commit -m "Add folders and schedule events API"
```

---

## Task 5: Add Frontend Panels for Links, Folders, and Schedule

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add client state fields**

In the `state` object, add:

```js
folders: [],
events: [],
activePanel: null,
activeSubjectId: null,
activeFolderId: null,
```

- [ ] **Step 2: Store dashboard folders and events**

In `loadDashboard()`, add:

```js
state.folders = payload.folders || [];
state.events = payload.events || [];
```

- [ ] **Step 3: Add subject folder strip**

Inside each subject card, render folder buttons for that subject:

```html
<div class="folder-strip" data-subject-folders="${subject.id}">
  <!-- folder buttons -->
</div>
```

Each folder button calls:

```js
openFolderPanel(subject.id, folder.id);
```

- [ ] **Step 4: Add settings panel**

Add a modal or mobile bottom-sheet panel with inputs for:

```js
["syllabus", "drive", "github", "messenger", "meeting", "instructor", "custom"]
```

On save, call:

```js
await api(`/api/subjects/${subjectId}/links`, {
  method: "PUT",
  body: JSON.stringify(nextLinks),
});
```

- [ ] **Step 5: Add folder panel**

The folder panel must list folder items and include a form with:

```js
{
  title,
  description,
  url,
  type,
  dueAt
}
```

Create items with `POST /api/folder-items`.

- [ ] **Step 6: Add schedule panel**

Use `state.events` to populate the right calendar/schedule area. Add a compact event creation form with subject, title, date/time, and type. Create with `POST /api/events`.

- [ ] **Step 7: Add embed fallback**

When opening a resource, render the iframe plus fallback text:

```html
<p class="embed-fallback">If this resource blocks embedded viewing, open it directly.</p>
```

Keep the external open button visible.

- [ ] **Step 8: Run browser smoke test**

Use the existing Puppeteer-style test command used in prior work and verify:

- dashboard renders
- 5 subject cards render
- link settings can save
- folder panel can create an item
- schedule panel can create an event
- mobile filter closes drawer
- no horizontal scroll

- [ ] **Step 9: Commit**

```powershell
git add index.html
git commit -m "Add coursework panels to dashboard UI"
```

---

## Task 6: Add PWA Install Support

**Files:**
- Modify: `index.html`
- Create: `manifest.webmanifest`
- Create: `sw.js`
- Create: `icons/semstack-icon.svg`

- [ ] **Step 1: Add manifest links**

In `index.html` head:

```html
<link rel="manifest" href="/manifest.webmanifest" />
<meta name="theme-color" content="#edf6fb" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-title" content="SemStack" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
```

- [ ] **Step 2: Create manifest**

Create `manifest.webmanifest`:

```json
{
  "name": "SemStack",
  "short_name": "SemStack",
  "description": "Personal IT coursework dashboard.",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#edf6fb",
  "theme_color": "#edf6fb",
  "icons": [
    {
      "src": "/icons/semstack-icon.svg",
      "sizes": "any",
      "type": "image/svg+xml",
      "purpose": "any maskable"
    }
  ]
}
```

- [ ] **Step 3: Create SVG app icon**

Create `icons/semstack-icon.svg`:

```xml
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="112" fill="#edf6fb"/>
  <circle cx="256" cy="256" r="150" fill="none" stroke="#111315" stroke-width="32"/>
  <path d="M146 256a110 110 0 0 0 220 0" fill="none" stroke="#111315" stroke-width="32" stroke-linecap="round"/>
  <path d="M188 206h136M188 258h104M188 310h150" fill="none" stroke="#111315" stroke-width="26" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 4: Create service worker**

Create `sw.js`:

```js
const CACHE_NAME = "semstack-shell-v1";
const SHELL = ["/", "/index.html", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/")) return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
```

- [ ] **Step 5: Register service worker**

In `index.html`:

```js
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
```

- [ ] **Step 6: Verify manifest**

Run:

```powershell
npx vercel build --prod --yes
```

Expected: build exits 0.

- [ ] **Step 7: Commit**

```powershell
git add index.html manifest.webmanifest sw.js
git commit -m "Add PWA install shell"
```

---

## Task 7: Production Deployment Gate

**Files:**
- Modify: none unless deployment config needs env guidance

- [ ] **Step 1: Confirm database provider**

Set a live Postgres `DATABASE_URL` in Vercel production. If no live database is available, do not deploy the production-required database change. Keep the current temporary fallback live and deploy only UI/PWA changes.

- [ ] **Step 2: Pull Vercel env**

Run:

```powershell
npx vercel pull --yes --environment=production
```

Expected: Vercel project settings are available locally.

- [ ] **Step 3: Run production build**

Run:

```powershell
npx vercel build --prod --yes
```

Expected: build exits 0.

- [ ] **Step 4: Deploy**

Run:

```powershell
npx vercel deploy --prod --yes
```

Expected: production deployment is `READY` and aliases `https://nexus-blush-tau-46.vercel.app`.

- [ ] **Step 5: Verify live API**

Run:

```powershell
$env:SMOKE_BASE_URL='https://nexus-blush-tau-46.vercel.app'
npm run test:api
Remove-Item Env:\SMOKE_BASE_URL
```

Expected: JSON with `"ok":true`.

- [ ] **Step 6: Verify live browser**

Run the existing browser smoke flow against:

```text
https://nexus-blush-tau-46.vercel.app
```

Expected:

- desktop renders
- iPhone viewport renders
- no horizontal scroll
- folder panel works
- link settings save
- event creation works

- [ ] **Step 7: Commit deployment notes if needed**

If deployment docs are added:

```powershell
git add docs
git commit -m "Document SemStack production database setup"
```

## Self-Review

- Spec coverage: durable database is covered in Tasks 2 and 7; user-owned subjects and editable links in Task 3; folders and events in Task 4; frontend panels in Task 5; PWA in Task 6; verification in Task 7.
- Placeholder scan: no task uses incomplete placeholder language.
- Type consistency: subject IDs remain string course codes; folder and event primary keys are numeric; frontend state names match API payload fields.
- Scope note: the only external dependency is the live `DATABASE_URL`. The implementation can be built and tested locally before that, but production durability waits on the live database variable.
