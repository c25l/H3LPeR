/**
 * Database Adapter Interface
 * 
 * This interface defines the contract that all database adapters must implement.
 * Currently supports SQLite (via better-sqlite3) and Azure SQL Database (via tedious).
 * 
 * Purpose: Allow seamless switching between SQLite (development/single-user) 
 * and Azure SQL Database (production/multi-user) without changing application code.
 */

class DatabaseAdapter {
  /**
   * Initialize database connection
   * @returns {Promise<void>}
   */
  async init() {
    throw new Error('init() must be implemented by adapter');
  }

  /**
   * Execute SQL statement(s) without returning results
   * Used for DDL operations (CREATE TABLE, CREATE INDEX, etc.)
   * @param {string} sql - SQL statement(s) to execute
   * @returns {Promise<void>}
   */
  async exec(sql) {
    throw new Error('exec() must be implemented by adapter');
  }

  /**
   * Prepare a parameterized SQL statement
   * @param {string} sql - SQL statement with ? placeholders
   * @returns {PreparedStatement} Prepared statement object
   */
  prepare(sql) {
    throw new Error('prepare() must be implemented by adapter');
  }

  /**
   * Close database connection
   * @returns {Promise<void>}
   */
  async close() {
    throw new Error('close() must be implemented by adapter');
  }

  /**
   * Set database pragma (SQLite-specific, no-op for Azure SQL)
   * @param {string} pragma - Pragma statement
   * @returns {void}
   */
  pragma(pragma) {
    // Default no-op for adapters that don't support pragmas
  }
}

/**
 * PreparedStatement Interface
 * 
 * Represents a prepared SQL statement that can be executed multiple times
 * with different parameters.
 */
class PreparedStatement {
  /**
   * Execute statement and return a single row
   * @param {...any} params - Statement parameters
   * @returns {Object|null} Single row or null
   */
  get(...params) {
    throw new Error('get() must be implemented by adapter');
  }

  /**
   * Execute statement and return all rows
   * @param {...any} params - Statement parameters
   * @returns {Array<Object>} Array of rows
   */
  all(...params) {
    throw new Error('all() must be implemented by adapter');
  }

  /**
   * Execute statement without returning results
   * Used for INSERT, UPDATE, DELETE
   * @param {...any} params - Statement parameters
   * @returns {Object} Result object with lastInsertRowid, changes, etc.
   */
  run(...params) {
    throw new Error('run() must be implemented by adapter');
  }
}

module.exports = { DatabaseAdapter, PreparedStatement };
