const { getDb } = require("./database");

class Task {
  static async allForUser(userId) {
    const db = await getDb();
    return db.all(
      `SELECT id, subject_id AS "subjectId", text, completed, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM tasks
       WHERE user_id = ?
       ORDER BY created_at ASC`,
      userId,
    );
  }

  static async create({ userId, subjectId, text }) {
    const db = await getDb();
    const result = await db.run(
      `INSERT INTO tasks (user_id, subject_id, text)
       VALUES (?, ?, ?)`,
      userId,
      subjectId,
      text,
    );
    return this.findByIdForUser(result.lastID, userId);
  }

  static async findByIdForUser(id, userId) {
    const db = await getDb();
    return db.get(
      `SELECT id, subject_id AS "subjectId", text, completed, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM tasks
       WHERE id = ? AND user_id = ?`,
      id,
      userId,
    );
  }

  static async update({ id, userId, completed, text }) {
    const existing = await this.findByIdForUser(id, userId);
    if (!existing) return null;

    const nextCompleted = typeof completed === "boolean" ? (completed ? 1 : 0) : existing.completed;
    const nextText = typeof text === "string" && text.trim() ? text.trim() : existing.text;

    const db = await getDb();
    await db.run(
      `UPDATE tasks
       SET completed = ?, text = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
      nextCompleted,
      nextText,
      id,
      userId,
    );
    return this.findByIdForUser(id, userId);
  }

  static async delete({ id, userId }) {
    const db = await getDb();
    const result = await db.run("DELETE FROM tasks WHERE id = ? AND user_id = ?", id, userId);
    return result.changes > 0;
  }
}

module.exports = Task;
