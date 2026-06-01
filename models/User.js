const { getDb } = require("./database");

class User {
  static async create({ email, passwordHash }) {
    const db = await getDb();
    const result = await db.run(
      "INSERT INTO users (email, password_hash) VALUES (?, ?)",
      email.toLowerCase(),
      passwordHash,
    );
    return this.findById(result.lastID);
  }

  static async findByEmail(email) {
    const db = await getDb();
    return db.get("SELECT * FROM users WHERE email = ?", email.toLowerCase());
  }

  static async findById(id) {
    const db = await getDb();
    return db.get("SELECT id, email, created_at FROM users WHERE id = ?", id);
  }
}

module.exports = User;
