const crypto = require("crypto");
const { getDb } = require("./database");
const User = require("./User");

const ACTIVE_WINDOW_MS = 2 * 60 * 1000;
const IDLE_WINDOW_MS = 15 * 60 * 1000;

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function countValue(row) {
  return Number(row?.count || 0);
}

function normalizeBoolean(value) {
  return value === true || value === 1 || value === "1";
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function sessionStatus(lastPingAt) {
  const date = toDate(lastPingAt);
  if (!date) return { status: "Offline", idleMinutes: null };
  const age = Date.now() - date.getTime();
  if (age <= ACTIVE_WINDOW_MS) return { status: "Active", idleMinutes: 0 };
  if (age <= IDLE_WINDOW_MS) return { status: "Idle", idleMinutes: Math.max(1, Math.round(age / 60000)) };
  return { status: "Offline", idleMinutes: Math.max(16, Math.round(age / 60000)) };
}

function normalizeTemplate(template, tasks = []) {
  return {
    id: template.id,
    code: template.code,
    name: template.name,
    semester: template.semester,
    accent: template.accent,
    isActive: normalizeBoolean(template.isActive ?? template.is_active),
    createdBy: template.createdBy || template.created_by || null,
    createdAt: template.createdAt || template.created_at,
    updatedAt: template.updatedAt || template.updated_at,
    tasks: tasks.map((task) => ({
      id: task.id,
      title: task.title,
      folderName: task.folderName || task.folder_name || "",
      sortOrder: Number(task.sortOrder || task.sort_order || 0),
    })),
  };
}

function normalizeLog(row) {
  let metadata = {};
  try {
    metadata = row.metadata ? JSON.parse(row.metadata) : {};
  } catch {
    metadata = {};
  }

  return {
    id: row.id,
    userId: row.userId || row.user_id || null,
    email: row.email || "system",
    action: row.action,
    entityType: row.entityType || row.entity_type || "",
    entityId: row.entityId || row.entity_id || "",
    metadata,
    createdAt: row.createdAt || row.created_at,
  };
}

class AdminOps {
  static createSessionKey() {
    return crypto.randomUUID();
  }

  static async createSession({ userId, sessionKey = this.createSessionKey(), req }) {
    const db = await getDb();
    await db.run(
      `INSERT INTO user_sessions (user_id, session_key, status, ip_address, user_agent)
       VALUES (?, ?, 'active', ?, ?)
       ON CONFLICT(session_key)
       DO UPDATE SET user_id = excluded.user_id, status = 'active', last_ping_at = CURRENT_TIMESTAMP`,
      userId,
      sessionKey,
      req?.ip || "",
      req?.headers?.["user-agent"] || "",
    );
    return sessionKey;
  }

  static async ping({ userId, sessionKey, req }) {
    const key = sessionKey || `legacy-${userId}`;
    const db = await getDb();
    await db.run(
      `INSERT INTO user_sessions (user_id, session_key, status, ip_address, user_agent, last_ping_at)
       VALUES (?, ?, 'active', ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(session_key)
       DO UPDATE SET status = 'active', last_ping_at = CURRENT_TIMESTAMP`,
      userId,
      key,
      req?.ip || "",
      req?.headers?.["user-agent"] || "",
    );
    return { ok: true, sessionKey: key };
  }

  static async logActivity({ userId, action, entityType = "", entityId = "", metadata = {}, featureKey = "" }) {
    const db = await getDb();
    await db.run(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, metadata)
       VALUES (?, ?, ?, ?, ?)`,
      userId || null,
      action,
      entityType,
      String(entityId || ""),
      JSON.stringify(metadata || {}),
    );

    if (featureKey && userId) {
      const date = todayKey();
      await db.run(
        `INSERT INTO feature_usage_daily (user_id, feature_key, usage_count, date)
         VALUES (?, ?, 1, ?)
         ON CONFLICT(user_id, feature_key, date)
         DO UPDATE SET usage_count = feature_usage_daily.usage_count + 1`,
        userId,
        featureKey,
        date,
      );
    }
  }

  static async templates() {
    const db = await getDb();
    const templates = await db.all(
      `SELECT id, code, name, semester, accent, is_active AS "isActive", created_by AS "createdBy",
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM global_subject_templates
       ORDER BY code ASC`,
    );
    const tasks = await db.all(
      `SELECT id, subject_template_id AS "subjectTemplateId", title, folder_name AS "folderName", sort_order AS "sortOrder"
       FROM global_task_templates
       ORDER BY sort_order ASC, id ASC`,
    );
    const tasksByTemplate = new Map();
    for (const task of tasks) {
      const list = tasksByTemplate.get(task.subjectTemplateId) || [];
      list.push(task);
      tasksByTemplate.set(task.subjectTemplateId, list);
    }
    return templates.map((template) => normalizeTemplate(template, tasksByTemplate.get(template.id) || []));
  }

  static async createTemplate({ code, name, semester, accent, tasks = [], createdBy }) {
    const normalizedCode = String(code || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, "");
    if (!normalizedCode) {
      const error = new Error("Template code is required.");
      error.status = 400;
      throw error;
    }

    const db = await getDb();
    const result = await db.run(
      `INSERT INTO global_subject_templates (code, name, semester, accent, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      normalizedCode,
      String(name || normalizedCode).trim() || normalizedCode,
      String(semester || "1st Semester").trim() || "1st Semester",
      /^#[0-9A-F]{6}$/i.test(String(accent || "")) ? accent : "#38bdf8",
      createdBy || null,
    );

    const templateId = result.lastID;
    for (const [index, task] of tasks.entries()) {
      const title = typeof task === "string" ? task : task?.title;
      if (!String(title || "").trim()) continue;
      await db.run(
        `INSERT INTO global_task_templates (subject_template_id, title, folder_name, sort_order)
         VALUES (?, ?, ?, ?)`,
        templateId,
        String(title).trim(),
        typeof task === "object" && task?.folderName ? String(task.folderName).trim() : "",
        index,
      );
    }

    await this.logActivity({
      userId: createdBy,
      action: "created_template",
      entityType: "global_subject_template",
      entityId: templateId,
      metadata: { code: normalizedCode },
      featureKey: "templates",
    });

    return this.findTemplate(templateId);
  }

  static async findTemplate(id) {
    const templates = await this.templates();
    return templates.find((template) => Number(template.id) === Number(id)) || null;
  }

  static async updateTemplate({ id, code, name, semester, accent, isActive, tasks, adminId }) {
    const existing = await this.findTemplate(id);
    if (!existing) return null;

    const db = await getDb();
    await db.run(
      `UPDATE global_subject_templates
       SET code = ?, name = ?, semester = ?, accent = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      String(code || existing.code).trim().toUpperCase(),
      String(name || existing.name).trim(),
      String(semester || existing.semester).trim(),
      /^#[0-9A-F]{6}$/i.test(String(accent || "")) ? accent : existing.accent,
      isActive === undefined ? (existing.isActive ? 1 : 0) : isActive ? 1 : 0,
      id,
    );

    if (Array.isArray(tasks)) {
      await db.run("DELETE FROM global_task_templates WHERE subject_template_id = ?", id);
      for (const [index, task] of tasks.entries()) {
        const title = typeof task === "string" ? task : task?.title;
        if (!String(title || "").trim()) continue;
        await db.run(
          `INSERT INTO global_task_templates (subject_template_id, title, folder_name, sort_order)
           VALUES (?, ?, ?, ?)`,
          id,
          String(title).trim(),
          typeof task === "object" && task?.folderName ? String(task.folderName).trim() : "",
          index,
        );
      }
    }

    await this.logActivity({
      userId: adminId,
      action: "updated_template",
      entityType: "global_subject_template",
      entityId: id,
      featureKey: "templates",
    });

    return this.findTemplate(id);
  }

  static async deleteTemplate({ id, adminId }) {
    const db = await getDb();
    const result = await db.run("DELETE FROM global_subject_templates WHERE id = ?", id);
    if (result.changes > 0) {
      await this.logActivity({
        userId: adminId,
        action: "deleted_template",
        entityType: "global_subject_template",
        entityId: id,
        featureKey: "templates",
      });
    }
    return result.changes > 0;
  }

  static async updateUserStatus({ userId, status, reason = "", adminId }) {
    const allowed = new Set(["active", "flagged", "suspended"]);
    const nextStatus = allowed.has(status) ? status : "active";
    const db = await getDb();
    await db.run(
      `UPDATE users
       SET status = ?,
           moderation_reason = ?,
           flagged_at = CASE WHEN ? = 'flagged' THEN CURRENT_TIMESTAMP ELSE flagged_at END,
           suspended_at = CASE WHEN ? = 'suspended' THEN CURRENT_TIMESTAMP ELSE suspended_at END
       WHERE id = ? AND role != 'admin'`,
      nextStatus,
      String(reason || "").trim(),
      nextStatus,
      nextStatus,
      userId,
    );
    const user = await User.findById(userId);
    if (user) {
      await this.logActivity({
        userId: adminId,
        action: `${nextStatus}_user`,
        entityType: "user",
        entityId: userId,
        metadata: { reason },
        featureKey: "moderation",
      });
    }
    return user ? {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      moderationReason: user.moderation_reason,
      flaggedAt: user.flagged_at,
      suspendedAt: user.suspended_at,
    } : null;
  }

  static async recentActivity(limit = 24) {
    const db = await getDb();
    const rows = await db.all(
      `SELECT l.id, l.user_id AS "userId", u.email, l.action, l.entity_type AS "entityType",
              l.entity_id AS "entityId", l.metadata, l.created_at AS "createdAt"
       FROM activity_logs l
       LEFT JOIN users u ON u.id = l.user_id
       ORDER BY l.created_at DESC, l.id DESC
       LIMIT ?`,
      limit,
    );
    return rows.map(normalizeLog);
  }

  static async featureEngagement() {
    const db = await getDb();
    const date = todayKey();
    const rows = await db.all(
      `SELECT feature_key AS "featureKey", SUM(usage_count) AS count
       FROM feature_usage_daily
       WHERE date = ?
       GROUP BY feature_key
       ORDER BY count DESC, feature_key ASC`,
      date,
    );
    return rows.map((row) => ({ featureKey: row.featureKey, count: Number(row.count || 0) }));
  }

  static async sessionUsers() {
    const db = await getDb();
    const rows = await db.all(
      `SELECT s.user_id AS "userId", u.email, u.role, u.status AS "accountStatus",
              s.status, s.started_at AS "startedAt", s.last_ping_at AS "lastPingAt"
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
       ORDER BY s.last_ping_at DESC`,
    );

    const byUser = new Map();
    for (const row of rows) {
      if (byUser.has(row.userId)) continue;
      const computed = sessionStatus(row.lastPingAt);
      byUser.set(row.userId, {
        userId: row.userId,
        email: row.email,
        role: row.role,
        accountStatus: row.accountStatus,
        status: computed.status,
        idleMinutes: computed.idleMinutes,
        startedAt: row.startedAt,
        lastActiveAt: row.lastPingAt,
      });
    }
    return [...byUser.values()];
  }

  static async peakActivity() {
    const logs = await this.recentActivity(500);
    const days = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const date = new Date();
      date.setDate(date.getDate() - offset);
      const key = date.toISOString().slice(0, 10);
      days.push({
        key,
        label: new Intl.DateTimeFormat("en", { weekday: "short" }).format(date),
        count: logs.filter((log) => String(log.createdAt || "").slice(0, 10) === key).length,
      });
    }
    const max = Math.max(...days.map((day) => day.count), 1);
    return {
      days: days.map((day) => ({ ...day, load: Math.round((day.count / max) * 100) })),
    };
  }

  static async osSnapshot(database) {
    const db = await getDb();
    const completedTaskSql =
      db.dialect === "postgres"
        ? "SELECT COUNT(*) AS count FROM tasks WHERE completed::text IN ('true', 't', '1')"
        : "SELECT COUNT(*) AS count FROM tasks WHERE completed = 1";
    const [totalUsers, totalSubjects, totalTasks, completedTasks, totalTemplates, flaggedUsers] = await Promise.all([
      db.get("SELECT COUNT(*) AS count FROM users"),
      db.get("SELECT COUNT(*) AS count FROM subjects"),
      db.get("SELECT COUNT(*) AS count FROM tasks"),
      db.get(completedTaskSql),
      db.get("SELECT COUNT(*) AS count FROM global_subject_templates"),
      db.get("SELECT COUNT(*) AS count FROM users WHERE status IN ('flagged', 'suspended')"),
    ]);
    const users = await User.adminUsers();
    const sessions = await this.sessionUsers();
    const activity = await this.recentActivity();
    const featureEngagement = await this.featureEngagement();
    const peakActivity = await this.peakActivity();
    const totalTaskCount = countValue(totalTasks);
    const completedTaskCount = countValue(completedTasks);
    const weekAgo = Date.now() - 7 * 86400000;
    const weeklyActiveUsers = users.filter((user) => {
      const lastLogin = toDate(user.lastLoginAt);
      return lastLogin && lastLogin.getTime() >= weekAgo;
    }).length;

    return {
      health: { ok: true, database },
      kpis: {
        totalRegistered: countValue(totalUsers),
        weeklyActiveUsers,
        globalSubjects: countValue(totalSubjects),
        globalTasks: totalTaskCount,
        averageCompletionRate: totalTaskCount ? Math.round((completedTaskCount / totalTaskCount) * 100) : 0,
        totalTemplates: countValue(totalTemplates),
        flaggedUsers: countValue(flaggedUsers),
      },
      live: {
        activeUsers: sessions.filter((session) => session.status === "Active").length,
        idleUsers: sessions.filter((session) => session.status === "Idle").length,
        offlineTrackedUsers: sessions.filter((session) => session.status === "Offline").length,
      },
      activity: {
        users: sessions,
        stream: activity,
      },
      featureEngagement,
      peakActivity,
    };
  }
}

module.exports = AdminOps;
