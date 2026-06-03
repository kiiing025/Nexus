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
  const health = await request("/api/health");
  assert.equal(health.ok, true);
  assert.match(health.database, /^(sqlite|postgres)$/);

  const registered = await request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  assert.ok(registered.token);

  const headers = { Authorization: `Bearer ${registered.token}` };
  const dashboard = await request("/api/dashboard", { headers });
  assert.equal(dashboard.subjects.length, 0);
  assert.ok(Array.isArray(dashboard.folders));
  assert.ok(Array.isArray(dashboard.events));
  assert.equal(dashboard.folders.length, 0);
  assert.equal(dashboard.events.length, 0);

  const customSubject = await request("/api/subjects", {
    method: "POST",
    headers,
    body: JSON.stringify({
      code: "IT499",
      name: "Capstone Studio",
      semester: "2nd Semester",
      accent: "#14b8a6",
    }),
  });
  assert.equal(customSubject.subject.id, "IT499");
  assert.equal(customSubject.subject.year, "Coursework");
  assert.equal(customSubject.subject.semester, "2nd Semester");
  assert.equal(customSubject.folders.length, 6);

  const customTask = await request("/api/tasks", {
    method: "POST",
    headers,
    body: JSON.stringify({ subjectId: "IT499", text: "Custom subject task" }),
  });
  assert.ok(customTask.task.id);

  await request("/api/notes/IT499", {
    method: "PUT",
    headers,
    body: JSON.stringify({ content: "Custom subject note" }),
  });

  await request("/api/events", {
    method: "POST",
    headers,
    body: JSON.stringify({
      subjectId: "IT499",
      title: "Custom subject performance",
      startsAt: "2026-06-05T09:00:00.000Z",
      type: "Performance",
    }),
  });

  await request("/api/subjects/IT499", { method: "DELETE", headers });
  const afterCustomDelete = await request("/api/dashboard", { headers });
  assert.equal(afterCustomDelete.subjects.some((subject) => subject.id === "IT499"), false);
  assert.equal(afterCustomDelete.tasks.some((task) => task.subjectId === "IT499"), false);
  assert.equal(afterCustomDelete.notes.some((note) => note.subjectId === "IT499"), false);
  assert.equal(afterCustomDelete.folders.some((folder) => folder.subjectId === "IT499"), false);
  assert.equal(afterCustomDelete.events.some((event) => event.subjectId === "IT499"), false);

  const courseworkSubject = await request("/api/subjects", {
    method: "POST",
    headers,
    body: JSON.stringify({
      code: "IT314",
      name: "Software Engineering",
      semester: "1st Semester",
      accent: "#6366f1",
    }),
  });
  assert.equal(courseworkSubject.subject.id, "IT314");
  assert.equal(courseworkSubject.subject.year, "Coursework");
  assert.equal(courseworkSubject.subject.semester, "1st Semester");
  assert.equal(courseworkSubject.folders.length, 6);

  const links = await request("/api/subjects/IT314/links", {
    method: "PUT",
    headers,
    body: JSON.stringify({
      links: {
        syllabus: "https://example.com/syllabus",
        drive: "https://example.com/drive",
        github: "https://github.com/example/repo",
        messenger: "https://m.me/example",
        meeting: "https://meet.google.com/abc-defg-hij",
        instructor: "mailto:instructor@example.com",
        custom: "https://example.com/custom",
      },
    }),
  });
  assert.equal(links.links.github, "https://github.com/example/repo");

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

  const folder = await request("/api/folders", {
    method: "POST",
    headers,
    body: JSON.stringify({ subjectId: "IT314", name: "Defense Prep" }),
  });
  assert.ok(folder.folder.id);

  const updatedFolder = await request(`/api/folders/${folder.folder.id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ name: "Defense Prep Updated" }),
  });
  assert.equal(updatedFolder.folder.name, "Defense Prep Updated");

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

  const updatedItem = await request(`/api/folder-items/${item.item.id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ completed: true }),
  });
  assert.equal(updatedItem.item.completed, true);

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

  const updatedEvent = await request(`/api/events/${event.event.id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ title: "System Prototype Defense Updated" }),
  });
  assert.equal(updatedEvent.event.title, "System Prototype Defense Updated");

  await request(`/api/events/${event.event.id}`, { method: "DELETE", headers });
  await request(`/api/folder-items/${item.item.id}`, { method: "DELETE", headers });
  await request(`/api/folders/${folder.folder.id}`, { method: "DELETE", headers });

  console.log(JSON.stringify({ ok: true, email, initialSubjects: dashboard.subjects.length }));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
