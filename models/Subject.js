const { getDb } = require("./database");
const { defaultSubjects } = require("./defaultSubjects");

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

class Subject {
  static async ensureDefaultsForUser(userId) {
    const db = await getDb();

    for (const subject of defaultSubjects) {
      const existing = await this.findForUser({ userId, subjectId: subject.id });
      if (!existing) {
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
      }

      const links = await this.linksForUserSubject({ userId, subjectId: subject.id });
      if (!links) {
        await db.run(
          `INSERT INTO subject_links (user_id, subject_id)
           VALUES (?, ?)`,
          userId,
          subject.id,
        );
      }
    }
  }

  static async allForUser(userId) {
    const db = await getDb();
    const subjects = await db.all(
      `SELECT subject_id AS "subjectId", year, semester, code, name, accent
       FROM subjects
       WHERE user_id = ?
       ORDER BY
        CASE year WHEN '3rd Year' THEN 1 WHEN '4th Year' THEN 2 ELSE 3 END,
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
}

module.exports = Subject;
