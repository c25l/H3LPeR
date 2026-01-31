const { Connection, Request, TYPES } = require('tedious');
const { DatabaseAdapter, PreparedStatement } = require('./database-adapter');
const logger = require('../logger');

/**
 * Azure SQL Database Adapter
 * 
 * Implements the DatabaseAdapter interface using tedious (Azure SQL/SQL Server driver).
 * Suitable for production deployments with Azure SQL Database.
 * 
 * Configuration example:
 * {
 *   server: 'your-server.database.windows.net',
 *   authentication: {
 *     type: 'default',
 *     options: {
 *       userName: 'your-username',
 *       password: 'your-password'
 *     }
 *   },
 *   options: {
 *     database: 'your-database',
 *     encrypt: true,
 *     trustServerCertificate: false
 *   }
 * }
 */
class AzureSQLAdapter extends DatabaseAdapter {
  constructor(config) {
    super();
    this.config = config;
    this.connection = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      this.connection = new Connection(this.config);
      
      this.connection.on('connect', (err) => {
        if (err) {
          logger.error('AzureSQLAdapter', 'Connection failed', err);
          reject(err);
        } else {
          logger.info('AzureSQLAdapter', 'Connected to Azure SQL Database');
          resolve();
        }
      });

      this.connection.on('error', (err) => {
        logger.error('AzureSQLAdapter', 'Connection error', err);
      });

      this.connection.connect();
    });
  }

  async exec(sql) {
    // Split SQL into individual statements (Azure SQL doesn't support batch CREATE TABLE)
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const statement of statements) {
      await this._executeStatement(statement);
    }
  }

  _executeStatement(sql) {
    return new Promise((resolve, reject) => {
      const request = new Request(sql, (err) => {
        if (err) {
          // Ignore "already exists" errors for CREATE TABLE IF NOT EXISTS compatibility
          if (err.message && err.message.includes('already exists')) {
            resolve();
          } else {
            reject(err);
          }
        } else {
          resolve();
        }
      });

      this.connection.execSql(request);
    });
  }

  prepare(sql) {
    // Convert SQLite placeholders (?) to Azure SQL placeholders (@p1, @p2, etc.)
    let paramIndex = 0;
    const azureSQL = sql.replace(/\?/g, () => {
      paramIndex++;
      return `@p${paramIndex}`;
    });

    return new AzureSQLPreparedStatement(this.connection, azureSQL, paramIndex);
  }

  async close() {
    return new Promise((resolve) => {
      if (this.connection) {
        this.connection.on('end', resolve);
        this.connection.close();
      } else {
        resolve();
      }
    });
  }

  // Azure SQL doesn't have pragmas - no-op
  pragma(pragma) {
    // No-op for Azure SQL
  }
}

/**
 * Azure SQL PreparedStatement wrapper
 */
class AzureSQLPreparedStatement extends PreparedStatement {
  constructor(connection, sql, paramCount) {
    super();
    this.connection = connection;
    this.sql = sql;
    this.paramCount = paramCount;
  }

  async get(...params) {
    const rows = await this._execute(params);
    return rows.length > 0 ? rows[0] : null;
  }

  async all(...params) {
    return await this._execute(params);
  }

  async run(...params) {
    const rows = await this._execute(params);
    return {
      changes: rows.length,
      lastInsertRowid: null // Azure SQL uses SCOPE_IDENTITY() separately
    };
  }

  _execute(params) {
    return new Promise((resolve, reject) => {
      const rows = [];
      const request = new Request(this.sql, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });

      // Add parameters
      params.forEach((param, index) => {
        const paramName = `p${index + 1}`;
        const type = this._inferType(param);
        request.addParameter(paramName, type, param);
      });

      request.on('row', (columns) => {
        const row = {};
        columns.forEach((column) => {
          row[column.metadata.colName] = column.value;
        });
        rows.push(row);
      });

      this.connection.execSql(request);
    });
  }

  _inferType(value) {
    if (value === null || value === undefined) {
      return TYPES.NVarChar;
    }
    
    switch (typeof value) {
      case 'string':
        return TYPES.NVarChar;
      case 'number':
        return Number.isInteger(value) ? TYPES.BigInt : TYPES.Float;
      case 'boolean':
        return TYPES.Bit;
      default:
        return TYPES.NVarChar;
    }
  }
}

module.exports = AzureSQLAdapter;
