const { getDb } = require("./database");

class Note {
  static async allForUser(userId) {
    const db = await getDb();
    return db.all(
      `SELECT subject_id AS "subjectId", content, updated_at AS "updatedAt"
       FROM notes
       WHERE user_id = ?`,
      userId,
    );
  }

  static async upsert({ userId, subjectId, content }) {
    const db = await getDb();
    await db.run(
      `INSERT INTO notes (user_id, subject_id, content, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id, subject_id)
       DO UPDATE SET content = excluded.content, updated_at = CURRENT_TIMESTAMP`,
      userId,
      subjectId,
      content,
    );

    return db.get(
      `SELECT subject_id AS "subjectId", content, updated_at AS "updatedAt"
       FROM notes
       WHERE user_id = ? AND subject_id = ?`,
      userId,
      subjectId,
    );
  }
}

module.exports = Note;
