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
