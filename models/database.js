const fs = require("fs");
const os = require("os");
const path = require("path");
const { Pool } = require("pg");
const initSqlJs = require("sql.js");

const wasmPath = require.resolve("sql.js/dist/sql-wasm.wasm");
const dataDir = path.join(__dirname, "..", "data");
const defaultDbPath = process.env.VERCEL
  ? path.join(os.tmpdir(), "semstack.sqlite")
  : path.join(dataDir, "semstack.sqlite");
const dbPath = process.env.DB_FILE || defaultDbPath;
const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
const requireHostedDatabase = process.env.VERCEL || process.env.SEMSTACK_REQUIRE_DATABASE_URL === "true";

let dbPromise;

function normalizeParams(params) {
  return params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
}

function toPostgresPlaceholders(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function withReturningId(sql) {
  if (!/^\s*insert\b/i.test(sql) || /\breturning\b/i.test(sql)) return sql;
  return sql.replace(/;?\s*$/, " RETURNING id");
}

function useSslForPostgres(connectionString) {
  return !/localhost|127\.0\.0\.1/i.test(connectionString);
}

function sanitizedPostgresConnectionString(connectionString) {
  try {
    const url = new URL(connectionString);
    ["sslmode", "sslcert", "sslkey", "sslrootcert"].forEach((key) => url.searchParams.delete(key));
    return url.toString();
  } catch {
    return connectionString;
  }
}

function createPostgresPool() {
  return new Pool({
    connectionString: sanitizedPostgresConnectionString(databaseUrl),
    ssl: useSslForPostgres(databaseUrl) ? { rejectUnauthorized: false } : false,
    max: 1,
  });
}

function isRetryablePostgresError(error) {
  const message = String(error?.message || "");
  return (
    ["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "ENOTFOUND"].includes(error?.code) ||
    /network socket|connection terminated|timeout|tls connection/i.test(message)
  );
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function queryWithRetry(pool, sql, params = []) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await pool.query(sql, params);
    } catch (error) {
      lastError = error;
      if (!isRetryablePostgresError(error) || attempt === 2) break;
      await wait(350 * (attempt + 1));
    }
  }
  throw lastError;
}

function makePostgresWrapper(pool) {
  return {
    dialect: "postgres",

    async exec(sql) {
      await queryWithRetry(pool, sql);
    },

    async run(sql, ...params) {
      const result = await queryWithRetry(pool, toPostgresPlaceholders(withReturningId(sql)), normalizeParams(params));
      const row = result.rows[0] || {};
      return {
        lastID: row.id || row.last_insert_rowid || 0,
        changes: result.rowCount || 0,
      };
    },

    async get(sql, ...params) {
      const result = await queryWithRetry(pool, toPostgresPlaceholders(sql), normalizeParams(params));
      return result.rows[0];
    },

    async all(sql, ...params) {
      const result = await queryWithRetry(pool, toPostgresPlaceholders(sql), normalizeParams(params));
      return result.rows;
    },
  };
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

function makeSqlJsWrapper(sqlDb) {
  return {
    dialect: "sqlite",

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

async function createSqliteDb() {
  const SQL = await initSqlJs({
    locateFile: () => wasmPath,
  });
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const fileBuffer = fs.existsSync(dbPath) ? fs.readFileSync(dbPath) : null;
  const sqlDb = fileBuffer ? new SQL.Database(fileBuffer) : new SQL.Database();
  return makeSqlJsWrapper(sqlDb);
}

async function getDb() {
  if (!dbPromise) {
    if (!databaseUrl && requireHostedDatabase) {
      throw new Error("DATABASE_URL is required for deployed SemStack data. Attach a hosted Postgres database before starting production.");
    }
    dbPromise = databaseUrl ? Promise.resolve(makePostgresWrapper(createPostgresPool())) : createSqliteDb();
  }

  return dbPromise;
}

function primaryKeySql(dialect) {
  return dialect === "postgres" ? "SERIAL PRIMARY KEY" : "INTEGER PRIMARY KEY AUTOINCREMENT";
}

function schemaSql(dialect) {
  const primaryKey = primaryKeySql(dialect);
  const prefix = dialect === "sqlite" ? "PRAGMA foreign_keys = ON;" : "";

  return `
    ${prefix}

    CREATE TABLE IF NOT EXISTS users (
      id ${primaryKey},
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      status TEXT NOT NULL DEFAULT 'active',
      moderation_reason TEXT NOT NULL DEFAULT '',
      flagged_at TEXT,
      suspended_at TEXT,
      last_login_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS subjects (
      id ${primaryKey},
      user_id INTEGER NOT NULL,
      subject_id TEXT NOT NULL,
      year TEXT NOT NULL,
      semester TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      accent TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, subject_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS subject_links (
      id ${primaryKey},
      user_id INTEGER NOT NULL,
      subject_id TEXT NOT NULL,
      syllabus TEXT NOT NULL DEFAULT '',
      drive TEXT NOT NULL DEFAULT '',
      github TEXT NOT NULL DEFAULT '',
      messenger TEXT NOT NULL DEFAULT '',
      meeting TEXT NOT NULL DEFAULT '',
      instructor TEXT NOT NULL DEFAULT '',
      custom TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, subject_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS deleted_subjects (
      id ${primaryKey},
      user_id INTEGER NOT NULL,
      subject_id TEXT NOT NULL,
      deleted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, subject_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id ${primaryKey},
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
      id ${primaryKey},
      user_id INTEGER NOT NULL,
      subject_id TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, subject_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS folders (
      id ${primaryKey},
      user_id INTEGER NOT NULL,
      subject_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, subject_id, name),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS folder_items (
      id ${primaryKey},
      user_id INTEGER NOT NULL,
      folder_id INTEGER NOT NULL,
      subject_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'link',
      due_at TEXT,
      completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS events (
      id ${primaryKey},
      user_id INTEGER NOT NULL,
      subject_id TEXT NOT NULL,
      folder_item_id INTEGER,
      title TEXT NOT NULL,
      starts_at TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'Task',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (folder_item_id) REFERENCES folder_items(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      id ${primaryKey},
      user_id INTEGER NOT NULL,
      session_key TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'active',
      started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_ping_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ended_at TEXT,
      ip_address TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id ${primaryKey},
      user_id INTEGER,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL DEFAULT '',
      entity_id TEXT NOT NULL DEFAULT '',
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS feature_usage_daily (
      id ${primaryKey},
      user_id INTEGER,
      feature_key TEXT NOT NULL,
      usage_count INTEGER NOT NULL DEFAULT 1,
      date TEXT NOT NULL DEFAULT CURRENT_DATE,
      UNIQUE(user_id, feature_key, date),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS global_subject_templates (
      id ${primaryKey},
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      semester TEXT NOT NULL DEFAULT '1st Semester',
      accent TEXT NOT NULL DEFAULT '#38bdf8',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS global_task_templates (
      id ${primaryKey},
      subject_template_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      folder_name TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (subject_template_id) REFERENCES global_subject_templates(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_subjects_user_subject
      ON subjects(user_id, subject_id);
    CREATE INDEX IF NOT EXISTS idx_subject_links_user_subject
      ON subject_links(user_id, subject_id);
    CREATE INDEX IF NOT EXISTS idx_deleted_subjects_user_subject
      ON deleted_subjects(user_id, subject_id);
    CREATE INDEX IF NOT EXISTS idx_notes_user_subject
      ON notes(user_id, subject_id);
    CREATE INDEX IF NOT EXISTS idx_folders_user_subject
      ON folders(user_id, subject_id);
    CREATE INDEX IF NOT EXISTS idx_folder_items_user_folder
      ON folder_items(user_id, folder_id);
    CREATE INDEX IF NOT EXISTS idx_events_user_subject
      ON events(user_id, subject_id);
    CREATE INDEX IF NOT EXISTS idx_events_user_starts
      ON events(user_id, starts_at);
    CREATE INDEX IF NOT EXISTS idx_user_sessions_last_ping
      ON user_sessions(last_ping_at);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_created
      ON activity_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_feature_usage_daily_feature
      ON feature_usage_daily(feature_key, date);
  `;
}

async function initDb() {
  const db = await getDb();
  await db.exec(schemaSql(db.dialect));
  await ensureUserColumns(db);
}

async function ensureUserColumns(db) {
  if (db.dialect === "postgres") {
    await db.exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';");
    await db.exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';");
    await db.exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS moderation_reason TEXT NOT NULL DEFAULT '';");
    await db.exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS flagged_at TEXT;");
    await db.exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at TEXT;");
    await db.exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TEXT;");
    return;
  }

  const columns = await db.all("PRAGMA table_info(users)");
  const names = new Set(columns.map((column) => column.name));
  if (!names.has("role")) {
    await db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';");
  }
  if (!names.has("status")) {
    await db.exec("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active';");
  }
  if (!names.has("moderation_reason")) {
    await db.exec("ALTER TABLE users ADD COLUMN moderation_reason TEXT NOT NULL DEFAULT '';");
  }
  if (!names.has("flagged_at")) {
    await db.exec("ALTER TABLE users ADD COLUMN flagged_at TEXT;");
  }
  if (!names.has("suspended_at")) {
    await db.exec("ALTER TABLE users ADD COLUMN suspended_at TEXT;");
  }
  if (!names.has("last_login_at")) {
    await db.exec("ALTER TABLE users ADD COLUMN last_login_at TEXT;");
  }
}

module.exports = {
  getDb,
  initDb,
};
