const { getDb } = require("./database");

const linkKeys = ["syllabus", "drive", "github", "messenger", "meeting", "instructor", "custom"];

function normalizeLinks(links = {}) {
  return Object.fromEntries(linkKeys.map((key) => [key, typeof links[key] === "string" ? links[key].trim() : ""]));
}

function rowToSubject(row, links = {}) {
  return {
    id: row.subjectId,
    year: row.year,
    semester: row.semester,
    code: row.code,
    name: row.name,
    accent: row.accent,
    links: normalizeLinks(links),
  };
}

function normalizeSubjectId(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "");
}

class Subject {
  static async allForUser(userId) {
    const db = await getDb();
    const subjects = await db.all(
      `SELECT subject_id AS "subjectId", year, semester, code, name, accent
       FROM subjects
       WHERE user_id = ?
       ORDER BY
        CASE
          WHEN semester LIKE '%1st Semester%' OR year = '1st Semester' THEN 1
          WHEN semester LIKE '%2nd Semester%' OR year = '2nd Semester' THEN 2
          ELSE 3
        END,
        code ASC`,
      userId,
    );
    const links = await db.all(
      `SELECT subject_id AS "subjectId", syllabus, drive, github, messenger, meeting, instructor, custom
       FROM subject_links
       WHERE user_id = ?`,
      userId,
    );
    const linksBySubject = new Map(links.map((row) => [row.subjectId, row]));

    return subjects.map((subject) => rowToSubject(subject, linksBySubject.get(subject.subjectId)));
  }

  static async findForUser({ userId, subjectId }) {
    const db = await getDb();
    return db.get(
      `SELECT subject_id AS "subjectId", year, semester, code, name, accent
       FROM subjects
       WHERE user_id = ? AND subject_id = ?`,
      userId,
      subjectId,
    );
  }

  static async linksForUserSubject({ userId, subjectId }) {
    const db = await getDb();
    const row = await db.get(
      `SELECT syllabus, drive, github, messenger, meeting, instructor, custom
       FROM subject_links
       WHERE user_id = ? AND subject_id = ?`,
      userId,
      subjectId,
    );
    return row ? normalizeLinks(row) : null;
  }

  static async updateLinksForUser({ userId, subjectId, links }) {
    const normalized = normalizeLinks(links);
    const db = await getDb();
    await db.run(
      `INSERT INTO subject_links (user_id, subject_id, syllabus, drive, github, messenger, meeting, instructor, custom, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id, subject_id)
       DO UPDATE SET
        syllabus = excluded.syllabus,
        drive = excluded.drive,
        github = excluded.github,
        messenger = excluded.messenger,
        meeting = excluded.meeting,
        instructor = excluded.instructor,
        custom = excluded.custom,
        updated_at = CURRENT_TIMESTAMP`,
      userId,
      subjectId,
      normalized.syllabus,
      normalized.drive,
      normalized.github,
      normalized.messenger,
      normalized.meeting,
      normalized.instructor,
      normalized.custom,
    );
    return this.linksForUserSubject({ userId, subjectId });
  }

  static async createForUser({ userId, code, name, year, semester, accent }) {
    const subjectId = normalizeSubjectId(code);
    if (!subjectId) {
      const error = new Error("Subject code is required.");
      error.status = 400;
      throw error;
    }

    const subject = {
      id: subjectId,
      year: typeof year === "string" && year.trim() ? year.trim() : "Coursework",
      semester: typeof semester === "string" && semester.trim() ? semester.trim() : "1st Semester",
      code: subjectId,
      name: typeof name === "string" && name.trim() ? name.trim() : subjectId,
      accent: /^#[0-9A-F]{6}$/i.test(String(accent || "")) ? accent : "#38bdf8",
    };

    const existing = await this.findForUser({ userId, subjectId });
    if (existing) {
      const error = new Error("A subject with that code already exists.");
      error.status = 409;
      throw error;
    }

    const db = await getDb();
    await db.run("DELETE FROM deleted_subjects WHERE user_id = ? AND subject_id = ?", userId, subjectId);
    await db.run(
      `INSERT INTO subjects (user_id, subject_id, year, semester, code, name, accent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      userId,
      subject.id,
      subject.year,
      subject.semester,
      subject.code,
      subject.name,
      subject.accent,
    );
    await db.run(
      `INSERT INTO subject_links (user_id, subject_id)
       VALUES (?, ?)
       ON CONFLICT(user_id, subject_id) DO NOTHING`,
      userId,
      subject.id,
    );

    return rowToSubject(
      {
        subjectId: subject.id,
        year: subject.year,
        semester: subject.semester,
        code: subject.code,
        name: subject.name,
        accent: subject.accent,
      },
      {},
    );
  }

  static async deleteForUser({ userId, subjectId }) {
    const normalizedSubjectId = normalizeSubjectId(subjectId);
    const existing = await this.findForUser({ userId, subjectId: normalizedSubjectId });
    if (!existing) return false;

    const db = await getDb();
    await db.run(
      `INSERT INTO deleted_subjects (user_id, subject_id, deleted_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id, subject_id)
       DO UPDATE SET deleted_at = CURRENT_TIMESTAMP`,
      userId,
      normalizedSubjectId,
    );
    await db.run("DELETE FROM events WHERE user_id = ? AND subject_id = ?", userId, normalizedSubjectId);
    await db.run("DELETE FROM tasks WHERE user_id = ? AND subject_id = ?", userId, normalizedSubjectId);
    await db.run("DELETE FROM notes WHERE user_id = ? AND subject_id = ?", userId, normalizedSubjectId);
    await db.run("DELETE FROM subject_links WHERE user_id = ? AND subject_id = ?", userId, normalizedSubjectId);
    await db.run("DELETE FROM folder_items WHERE user_id = ? AND subject_id = ?", userId, normalizedSubjectId);
    await db.run("DELETE FROM folders WHERE user_id = ? AND subject_id = ?", userId, normalizedSubjectId);
    const result = await db.run("DELETE FROM subjects WHERE user_id = ? AND subject_id = ?", userId, normalizedSubjectId);
    return result.changes > 0;
  }
}

module.exports = Subject;
