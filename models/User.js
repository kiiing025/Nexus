const { getDb } = require("./database");

function normalizeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    password_hash: row.password_hash,
    role: row.role || "user",
    status: row.status || "active",
    moderation_reason: row.moderation_reason || row.moderationReason || "",
    flagged_at: row.flagged_at || row.flaggedAt || null,
    suspended_at: row.suspended_at || row.suspendedAt || null,
    created_at: row.created_at || row.createdAt,
    last_login_at: row.last_login_at || row.lastLoginAt || null,
  };
}

function normalizeAdminUser(row) {
  return {
    id: row.id,
    email: row.email,
    role: row.role || "user",
    status: row.status || "active",
    moderationReason: row.moderationReason || row.moderation_reason || "",
    flaggedAt: row.flaggedAt || row.flagged_at || null,
    suspendedAt: row.suspendedAt || row.suspended_at || null,
    createdAt: row.createdAt || row.created_at,
    lastLoginAt: row.lastLoginAt || row.last_login_at || null,
    subjectCount: Number(row.subjectCount || 0),
    taskCount: Number(row.taskCount || 0),
    eventCount: Number(row.eventCount || 0),
  };
}

function numberValue(row) {
  return Number(row?.count || 0);
}

class User {
  static async create({ email, passwordHash, role = "user" }) {
    const db = await getDb();
    const result = await db.run(
      "INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)",
      email.toLowerCase(),
      passwordHash,
      role,
    );
    return this.findById(result.lastID);
  }

  static async findByEmail(email) {
    const db = await getDb();
    const row = await db.get("SELECT * FROM users WHERE email = ?", email.toLowerCase());
    return normalizeUser(row);
  }

  static async findById(id) {
    const db = await getDb();
    const row = await db.get(
      "SELECT id, email, role, status, moderation_reason, flagged_at, suspended_at, created_at, last_login_at FROM users WHERE id = ?",
      id,
    );
    return normalizeUser(row);
  }

  static async markLogin(id) {
    const db = await getDb();
    await db.run("UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?", id);
    return this.findById(id);
  }

  static async ensureAdmin({ email, passwordHash }) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail || !passwordHash) return null;

    const existing = await this.findByEmail(normalizedEmail);
    const db = await getDb();
    if (existing) {
      await db.run(
        "UPDATE users SET password_hash = ?, role = 'admin' WHERE email = ?",
        passwordHash,
        normalizedEmail,
      );
      return this.findByEmail(normalizedEmail);
    }

    return this.create({ email: normalizedEmail, passwordHash, role: "admin" });
  }

  static async adminUsers() {
    const db = await getDb();
    const rows = await db.all(
      `SELECT
        u.id,
        u.email,
        u.role,
        u.status,
        u.moderation_reason AS "moderationReason",
        u.flagged_at AS "flaggedAt",
        u.suspended_at AS "suspendedAt",
        u.created_at AS "createdAt",
        u.last_login_at AS "lastLoginAt",
        (SELECT COUNT(*) FROM subjects s WHERE s.user_id = u.id) AS "subjectCount",
        (SELECT COUNT(*) FROM tasks t WHERE t.user_id = u.id) AS "taskCount",
        (SELECT COUNT(*) FROM events e WHERE e.user_id = u.id) AS "eventCount"
       FROM users u
       ORDER BY u.created_at DESC, u.id DESC`,
    );
    return rows.map(normalizeAdminUser);
  }

  static async adminOverview() {
    const db = await getDb();
    const [totalUsers, adminUsers, totalSubjects, totalTasks, totalEvents] = await Promise.all([
      db.get("SELECT COUNT(*) AS count FROM users"),
      db.get("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'"),
      db.get("SELECT COUNT(*) AS count FROM subjects"),
      db.get("SELECT COUNT(*) AS count FROM tasks"),
      db.get("SELECT COUNT(*) AS count FROM events"),
    ]);
    const users = await this.adminUsers();

    return {
      metrics: {
        totalUsers: numberValue(totalUsers),
        totalAdmins: numberValue(adminUsers),
        regularUsers: Math.max(numberValue(totalUsers) - numberValue(adminUsers), 0),
        totalSubjects: numberValue(totalSubjects),
        totalTasks: numberValue(totalTasks),
        totalEvents: numberValue(totalEvents),
      },
      recentRegistrations: users.slice(0, 6),
    };
  }
}

module.exports = User;
