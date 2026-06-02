const { getDb } = require("./database");

function normalizeEvent(row) {
  return {
    id: row.id,
    subjectId: row.subjectId,
    folderItemId: row.folderItemId || null,
    title: row.title,
    startsAt: row.startsAt,
    type: row.type || "Task",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

class Event {
  static async allForUser(userId) {
    const db = await getDb();
    const rows = await db.all(
      `SELECT id, subject_id AS "subjectId", folder_item_id AS "folderItemId", title, starts_at AS "startsAt",
              type, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM events
       WHERE user_id = ?
       ORDER BY starts_at ASC, id ASC`,
      userId,
    );
    return rows.map(normalizeEvent);
  }

  static async findForUser({ id, userId }) {
    const db = await getDb();
    const row = await db.get(
      `SELECT id, subject_id AS "subjectId", folder_item_id AS "folderItemId", title, starts_at AS "startsAt",
              type, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM events
       WHERE id = ? AND user_id = ?`,
      id,
      userId,
    );
    return row ? normalizeEvent(row) : null;
  }

  static async create({ userId, subjectId, title, startsAt, type, folderItemId }) {
    const db = await getDb();
    const result = await db.run(
      `INSERT INTO events (user_id, subject_id, folder_item_id, title, starts_at, type)
       VALUES (?, ?, ?, ?, ?, ?)`,
      userId,
      subjectId,
      folderItemId || null,
      title,
      startsAt,
      type || "Task",
    );
    return this.findForUser({ id: result.lastID, userId });
  }

  static async update({ id, userId, subjectId, title, startsAt, type, folderItemId }) {
    const existing = await this.findForUser({ id, userId });
    if (!existing) return null;

    const db = await getDb();
    await db.run(
      `UPDATE events
       SET subject_id = ?, folder_item_id = ?, title = ?, starts_at = ?, type = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
      typeof subjectId === "string" && subjectId.trim() ? subjectId.trim() : existing.subjectId,
      folderItemId === undefined ? existing.folderItemId : folderItemId || null,
      typeof title === "string" && title.trim() ? title.trim() : existing.title,
      typeof startsAt === "string" && startsAt.trim() ? startsAt.trim() : existing.startsAt,
      typeof type === "string" && type.trim() ? type.trim() : existing.type,
      id,
      userId,
    );
    return this.findForUser({ id, userId });
  }

  static async delete({ id, userId }) {
    const db = await getDb();
    const result = await db.run("DELETE FROM events WHERE id = ? AND user_id = ?", id, userId);
    return result.changes > 0;
  }
}

module.exports = Event;
