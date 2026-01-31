const Database = require('better-sqlite3');
const { DatabaseAdapter, PreparedStatement } = require('./database-adapter');

/**
 * SQLite Database Adapter
 * 
 * Implements the DatabaseAdapter interface using better-sqlite3.
 * Suitable for development and single-user deployments.
 */
class SQLiteAdapter extends DatabaseAdapter {
  constructor(dbPath) {
    super();
    this.dbPath = dbPath;
    this.db = null;
  }

  async init() {
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL'); // Write-Ahead Logging
    this.db.pragma('foreign_keys = ON');
  }

  async exec(sql) {
    this.db.exec(sql);
  }

  prepare(sql) {
    const stmt = this.db.prepare(sql);
    return new SQLitePreparedStatement(stmt);
  }

  async close() {
    if (this.db) {
      this.db.close();
    }
  }

  pragma(pragma) {
    this.db.pragma(pragma);
  }
}

/**
 * SQLite PreparedStatement wrapper
 */
class SQLitePreparedStatement extends PreparedStatement {
  constructor(stmt) {
    super();
    this.stmt = stmt;
  }

  get(...params) {
    return this.stmt.get(...params);
  }

  all(...params) {
    return this.stmt.all(...params);
  }

  run(...params) {
    return this.stmt.run(...params);
  }
}

module.exports = SQLiteAdapter;
