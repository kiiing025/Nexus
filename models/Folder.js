const { getDb } = require("./database");
const { defaultFolders } = require("./defaultSubjects");

function normalizeItem(row) {
  return {
    id: row.id,
    folderId: row.folderId,
    subjectId: row.subjectId,
    title: row.title,
    description: row.description || "",
    url: row.url || "",
    type: row.type || "link",
    dueAt: row.dueAt || null,
    completed: Boolean(row.completed),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function normalizeFolder(row, items = []) {
  return {
    id: row.id,
    subjectId: row.subjectId,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    items,
  };
}

class Folder {
  static async ensureDefaultsForUserSubject({ userId, subjectId }) {
    const db = await getDb();
    for (const name of defaultFolders) {
      const existing = await db.get(
        `SELECT id
         FROM folders
         WHERE user_id = ? AND subject_id = ? AND name = ?`,
        userId,
        subjectId,
        name,
      );
      if (!existing) {
        await db.run(
          `INSERT INTO folders (user_id, subject_id, name)
           VALUES (?, ?, ?)`,
          userId,
          subjectId,
          name,
        );
      }
    }
  }

  static async allForUser(userId) {
    const db = await getDb();
    const folders = await db.all(
      `SELECT id, subject_id AS "subjectId", name, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM folders
       WHERE user_id = ?
       ORDER BY subject_id ASC, created_at ASC, id ASC`,
      userId,
    );
    const items = await db.all(
      `SELECT id, folder_id AS "folderId", subject_id AS "subjectId", title, description, url, type,
              due_at AS "dueAt", completed, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM folder_items
       WHERE user_id = ?
       ORDER BY created_at ASC, id ASC`,
      userId,
    );
    const itemsByFolder = new Map();
    for (const item of items.map(normalizeItem)) {
      const list = itemsByFolder.get(item.folderId) || [];
      list.push(item);
      itemsByFolder.set(item.folderId, list);
    }

    return folders.map((folder) => normalizeFolder(folder, itemsByFolder.get(folder.id) || []));
  }

  static async allForUserSubject({ userId, subjectId }) {
    const folders = await this.allForUser(userId);
    return folders.filter((folder) => folder.subjectId === subjectId);
  }

  static async findForUser({ id, userId }) {
    const db = await getDb();
    const folder = await db.get(
      `SELECT id, subject_id AS "subjectId", name, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM folders
       WHERE id = ? AND user_id = ?`,
      id,
      userId,
    );
    return folder ? normalizeFolder(folder) : null;
  }

  static async create({ userId, subjectId, name }) {
    const db = await getDb();
    const result = await db.run(
      `INSERT INTO folders (user_id, subject_id, name)
       VALUES (?, ?, ?)`,
      userId,
      subjectId,
      name,
    );
    return this.findForUser({ id: result.lastID, userId });
  }

  static async update({ id, userId, name }) {
    const existing = await this.findForUser({ id, userId });
    if (!existing) return null;

    const nextName = typeof name === "string" && name.trim() ? name.trim() : existing.name;
    const db = await getDb();
    await db.run(
      `UPDATE folders
       SET name = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
      nextName,
      id,
      userId,
    );
    return this.findForUser({ id, userId });
  }

  static async delete({ id, userId }) {
    const db = await getDb();
    const result = await db.run("DELETE FROM folders WHERE id = ? AND user_id = ?", id, userId);
    return result.changes > 0;
  }

  static async findItemForUser({ id, userId }) {
    const db = await getDb();
    const row = await db.get(
      `SELECT id, folder_id AS "folderId", subject_id AS "subjectId", title, description, url, type,
              due_at AS "dueAt", completed, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM folder_items
       WHERE id = ? AND user_id = ?`,
      id,
      userId,
    );
    return row ? normalizeItem(row) : null;
  }

  static async createItem({ userId, folderId, title, description, url, type, dueAt, completed }) {
    const folder = await this.findForUser({ id: folderId, userId });
    if (!folder) return null;

    const db = await getDb();
    const result = await db.run(
      `INSERT INTO folder_items (user_id, folder_id, subject_id, title, description, url, type, due_at, completed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      userId,
      folderId,
      folder.subjectId,
      title,
      description || "",
      url || "",
      type || "link",
      dueAt || null,
      completed ? 1 : 0,
    );
    return this.findItemForUser({ id: result.lastID, userId });
  }

  static async updateItem({ id, userId, title, description, url, type, dueAt, completed }) {
    const existing = await this.findItemForUser({ id, userId });
    if (!existing) return null;

    const db = await getDb();
    await db.run(
      `UPDATE folder_items
       SET title = ?, description = ?, url = ?, type = ?, due_at = ?, completed = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
      typeof title === "string" && title.trim() ? title.trim() : existing.title,
      typeof description === "string" ? description : existing.description,
      typeof url === "string" ? url.trim() : existing.url,
      typeof type === "string" && type.trim() ? type.trim() : existing.type,
      typeof dueAt === "string" && dueAt.trim() ? dueAt.trim() : null,
      typeof completed === "boolean" ? (completed ? 1 : 0) : existing.completed ? 1 : 0,
      id,
      userId,
    );
    return this.findItemForUser({ id, userId });
  }

  static async deleteItem({ id, userId }) {
    const db = await getDb();
    const result = await db.run("DELETE FROM folder_items WHERE id = ? AND user_id = ?", id, userId);
    return result.changes > 0;
  }
}

module.exports = Folder;
