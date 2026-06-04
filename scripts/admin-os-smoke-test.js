const assert = require("node:assert/strict");

const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000";
const unique = Date.now().toString(36);
const userEmail = `admin-os-${unique}@example.com`;
const templateCode = `IT${unique.slice(-3).toUpperCase().replace(/[^A-Z0-9]/g, "9")}`;
const password = "Passw0rd!";
const adminEmail = process.env.SMOKE_ADMIN_EMAIL || process.env.ADMIN_EMAIL || "admin@semstack.test";
const adminPassword = process.env.SMOKE_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || "AdminPassw0rd!";

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
    body: JSON.stringify({ email: userEmail, password }),
  });
  assert.ok(registered.token);
  const userHeaders = { Authorization: `Bearer ${registered.token}` };

  const subject = await request("/api/subjects", {
    method: "POST",
    headers: userHeaders,
    body: JSON.stringify({
      code: "IT314",
      name: "Software Engineering",
      semester: "1st Semester",
      accent: "#6366f1",
    }),
  });
  assert.equal(subject.subject.id, "IT314");

  const task = await request("/api/tasks", {
    method: "POST",
    headers: userHeaders,
    body: JSON.stringify({ subjectId: "IT314", text: "Build prototype" }),
  });
  await request(`/api/tasks/${task.task.id}`, {
    method: "PUT",
    headers: userHeaders,
    body: JSON.stringify({ completed: true }),
  });
  await request("/api/activity/ping", { method: "POST", headers: userHeaders });

  const adminLogin = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: adminEmail, password: adminPassword }),
  });
  assert.equal(adminLogin.user.role, "admin");
  const adminHeaders = { Authorization: `Bearer ${adminLogin.token}` };

  const os = await request("/api/admin/os", { headers: adminHeaders });
  assert.equal(os.health.database, "sqlite");
  assert.ok(os.kpis.totalRegistered >= 2);
  assert.ok(os.kpis.weeklyActiveUsers >= 1);
  assert.ok(os.kpis.globalSubjects >= 1);
  assert.ok(os.kpis.globalTasks >= 1);
  assert.ok(os.kpis.averageCompletionRate >= 1);
  assert.ok(os.live.activeUsers >= 1);
  assert.ok(Array.isArray(os.activity.users));
  assert.ok(os.activity.users.some((user) => user.email === userEmail));
  assert.ok(Array.isArray(os.activity.stream));
  assert.ok(os.activity.stream.some((item) => item.action === "marked_task_complete"));
  assert.ok(Array.isArray(os.featureEngagement));
  assert.ok(Array.isArray(os.peakActivity.days));
  assert.equal(os.peakActivity.days.length, 7);

  const template = await request("/api/admin/templates", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      code: templateCode,
      name: "Admin Template Studio",
      semester: "2nd Semester",
      accent: "#38bdf8",
      tasks: ["Read course guide", "Submit first activity"],
    }),
  });
  assert.equal(template.template.code, templateCode);
  assert.equal(template.template.tasks.length, 2);

  const templates = await request("/api/admin/templates", { headers: adminHeaders });
  assert.ok(templates.templates.some((item) => item.code === templateCode));

  const users = await request("/api/admin/users", { headers: adminHeaders });
  const target = users.users.find((user) => user.email === userEmail);
  assert.ok(target);

  const moderation = await request(`/api/admin/users/${target.id}/status`, {
    method: "PUT",
    headers: adminHeaders,
    body: JSON.stringify({ status: "flagged", reason: "Smoke test moderation" }),
  });
  assert.equal(moderation.user.status, "flagged");

  const updatedUsers = await request("/api/admin/users", { headers: adminHeaders });
  assert.equal(updatedUsers.users.find((user) => user.id === target.id).status, "flagged");

  console.log(JSON.stringify({ ok: true, email: userEmail, activeUsers: os.live.activeUsers }));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
