const fs = require("fs");
const os = require("os");
const path = require("path");
const initSqlJs = require("sql.js");

const dataDir = path.join(__dirname, "..", "data");
const defaultDbPath = process.env.VERCEL
  ? path.join(os.tmpdir(), "semstack.sqlite")
  : path.join(dataDir, "semstack.sqlite");
const dbPath = process.env.DB_FILE || defaultDbPath;

let dbPromise;

function normalizeParams(params) {
  return params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
}

function persist(sqlDb) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(dbPath, Buffer.from(sqlDb.export()));
}

function makeStatementResult(sqlDb) {
  const lastID = sqlDb.exec("SELECT last_insert_rowid() AS id")[0]?.values?.[0]?.[0] ?? 0;
  const changes = sqlDb.exec("SELECT changes() AS changes")[0]?.values?.[0]?.[0] ?? 0;
  return { lastID, changes };
}

function makeDbWrapper(sqlDb) {
  return {
    exec(sql) {
      sqlDb.exec(sql);
      persist(sqlDb);
    },

    run(sql, ...params) {
      sqlDb.run(sql, normalizeParams(params));
      const result = makeStatementResult(sqlDb);
      persist(sqlDb);
      return result;
    },

    get(sql, ...params) {
      const stmt = sqlDb.prepare(sql);
      try {
        stmt.bind(normalizeParams(params));
        return stmt.step() ? stmt.getAsObject() : undefined;
      } finally {
        stmt.free();
      }
    },

    all(sql, ...params) {
      const stmt = sqlDb.prepare(sql);
      const rows = [];
      try {
        stmt.bind(normalizeParams(params));
        while (stmt.step()) rows.push(stmt.getAsObject());
        return rows;
      } finally {
        stmt.free();
      }
    },
  };
}

async function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const SQL = await initSqlJs();
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      const fileBuffer = fs.existsSync(dbPath) ? fs.readFileSync(dbPath) : null;
      const sqlDb = fileBuffer ? new SQL.Database(fileBuffer) : new SQL.Database();
      return makeDbWrapper(sqlDb);
    })();
  }

  return dbPromise;
}

async function initDb() {
  const db = await getDb();

  await db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      subject_id TEXT NOT NULL,
      text TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_user_subject
      ON tasks(user_id, subject_id);

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      subject_id TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, subject_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
}

module.exports = {
  getDb,
  initDb,
};
