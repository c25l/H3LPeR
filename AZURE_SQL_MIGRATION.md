# Azure SQL Database Migration Guide

## Overview

The H3LPeR database layer supports both SQLite (for development/single-user) and Azure SQL Database (for production/multi-user deployments). This guide explains how to migrate from SQLite to Azure SQL.

## Architecture

The database layer uses an **adapter pattern** to abstract away database-specific details:

```
DatabaseService
    ├── SQLiteAdapter (better-sqlite3)
    └── AzureSQLAdapter (tedious)
```

Both adapters implement the same interface, allowing seamless switching without code changes.

## Setup for Azure SQL Database

### 1. Prerequisites

- Azure subscription
- Azure SQL Database provisioned
- Connection credentials (server, database, username, password)

### 2. Configuration

Create or update your `config.json` with Azure SQL settings:

```json
{
  "database": {
    "type": "azure",
    "azure": {
      "server": "your-server.database.windows.net",
      "authentication": {
        "type": "default",
        "options": {
          "userName": "your-username",
          "password": "your-password"
        }
      },
      "options": {
        "database": "h3lper-db",
        "encrypt": true,
        "trustServerCertificate": false,
        "connectTimeout": 30000,
        "requestTimeout": 30000
      }
    }
  }
}
```

**Security Best Practice:** Use environment variables for sensitive data:

```json
{
  "database": {
    "type": "azure",
    "azure": {
      "server": "${AZURE_SQL_SERVER}",
      "authentication": {
        "type": "default",
        "options": {
          "userName": "${AZURE_SQL_USERNAME}",
          "password": "${AZURE_SQL_PASSWORD}"
        }
      },
      "options": {
        "database": "${AZURE_SQL_DATABASE}",
        "encrypt": true,
        "trustServerCertificate": false
      }
    }
  }
}
```

### 3. Update Server Code

Modify `server/index.js` to use the configuration:

```javascript
const config = require('./config');
const DatabaseService = require('./services/database');

// Check database configuration
let database;
if (config.database && config.database.type === 'azure') {
  // Azure SQL Database
  database = new DatabaseService(config.database.azure, 'azure');
} else {
  // SQLite (default)
  const dbPath = path.join(__dirname, '..', '.data', 'writer.db');
  database = new DatabaseService(dbPath, 'sqlite');
}
```

### 4. Firewall Configuration

Add your IP address to Azure SQL firewall rules:

1. Go to Azure Portal → SQL Database → Networking
2. Add your client IP or enable "Allow Azure services"
3. For development, you may need to add your local IP

### 5. Connection String (Alternative)

You can also use a connection string format:

```javascript
const config = {
  server: 'your-server.database.windows.net',
  authentication: {
    type: 'default',
    options: {
      userName: process.env.AZURE_SQL_USERNAME,
      password: process.env.AZURE_SQL_PASSWORD
    }
  },
  options: {
    database: 'h3lper-db',
    encrypt: true
  }
};

const database = new DatabaseService(config, 'azure');
```

## Schema Compatibility

The schema has been designed for cross-database compatibility:

### Data Types

| Concept | SQLite | Azure SQL |
|---------|--------|-----------|
| Text | TEXT | NVARCHAR(MAX) |
| Integer | INTEGER | INT |
| Big Integer | INTEGER | BIGINT |
| Timestamps | INTEGER (Unix ms) | BIGINT (Unix ms) |
| Primary Key | INTEGER PRIMARY KEY AUTOINCREMENT | INT IDENTITY(1,1) PRIMARY KEY |

### Key Differences

1. **Auto-increment:**
   - SQLite: `INTEGER PRIMARY KEY AUTOINCREMENT`
   - Azure SQL: `INT IDENTITY(1,1) PRIMARY KEY`

2. **Boolean:**
   - SQLite: INTEGER (0/1)
   - Azure SQL: BIT

3. **Timestamps:**
   - Both use BIGINT for Unix timestamps in milliseconds

4. **Text fields:**
   - SQLite: TEXT
   - Azure SQL: NVARCHAR(MAX)

The adapter handles these differences automatically.

## Migration Process

### Option 1: Fresh Start (Recommended for Development)

1. Deploy schema to Azure SQL (happens automatically on first run)
2. Sync will populate data from filesystem

### Option 2: Data Migration (For Production)

Use a migration script to copy data from SQLite to Azure SQL:

```javascript
const SQLiteAdapter = require('./server/services/sqlite-adapter');
const AzureSQLAdapter = require('./server/services/azure-sql-adapter');

async function migrate() {
  // Source: SQLite
  const source = new SQLiteAdapter('./data/writer.db');
  await source.init();
  
  // Destination: Azure SQL
  const dest = new AzureSQLAdapter({
    server: 'your-server.database.windows.net',
    authentication: {
      type: 'default',
      options: {
        userName: process.env.AZURE_SQL_USERNAME,
        password: process.env.AZURE_SQL_PASSWORD
      }
    },
    options: {
      database: 'h3lper-db',
      encrypt: true
    }
  });
  await dest.init();
  
  // Migrate tables
  const tables = ['journal_entries', 'news_articles', 'research_articles', 
                  'calendar_events', 'change_log', 'sync_state'];
  
  for (const table of tables) {
    console.log(`Migrating ${table}...`);
    const rows = source.prepare(`SELECT * FROM ${table}`).all();
    
    if (rows.length > 0) {
      const columns = Object.keys(rows[0]);
      const placeholders = columns.map((_, i) => `@p${i + 1}`).join(', ');
      const insertSQL = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
      
      for (const row of rows) {
        const values = columns.map(col => row[col]);
        await dest.prepare(insertSQL).run(...values);
      }
    }
    
    console.log(`Migrated ${rows.length} rows from ${table}`);
  }
  
  await source.close();
  await dest.close();
  console.log('Migration complete!');
}

migrate().catch(console.error);
```

## Performance Considerations

### SQLite (Development)
- **Pros:** Zero configuration, fast for single user, no network latency
- **Cons:** Limited concurrency, single-server only
- **Best for:** Development, testing, single-user deployments

### Azure SQL (Production)
- **Pros:** Scalable, multi-user, backup/recovery, high availability
- **Cons:** Network latency, requires Azure account, cost
- **Best for:** Production, multi-user, cloud deployments

## Connection Pooling

The Azure SQL adapter automatically handles connection management. For high-load scenarios, consider:

1. Connection pooling (handled by tedious)
2. Query optimization (indexes already configured)
3. Batch operations for bulk inserts

## Testing

Test Azure SQL connection before deployment:

```javascript
const AzureSQLAdapter = require('./server/services/azure-sql-adapter');

async function test() {
  const db = new AzureSQLAdapter({
    server: 'your-server.database.windows.net',
    authentication: {
      type: 'default',
      options: {
        userName: process.env.AZURE_SQL_USERNAME,
        password: process.env.AZURE_SQL_PASSWORD
      }
    },
    options: {
      database: 'h3lper-db',
      encrypt: true
    }
  });
  
  try {
    await db.init();
    console.log('✓ Connected to Azure SQL');
    
    // Test query
    const result = await db.prepare('SELECT @@VERSION AS version').get();
    console.log('✓ Azure SQL Version:', result.version);
    
    await db.close();
    console.log('✓ Connection closed');
  } catch (err) {
    console.error('✗ Connection failed:', err);
  }
}

test();
```

## Rollback Plan

If issues occur with Azure SQL:

1. **Immediate:** Revert `config.json` to SQLite configuration
2. **Restart server:** Application will reconnect to SQLite
3. **Verify:** Check that data sync continues from filesystem

Data is not lost because:
- Journal entries sync from markdown files
- News/research/calendar refresh from APIs
- Change log rebuilds automatically

## Cost Optimization

Azure SQL pricing tips:

1. **DTU Model:** Start with Basic tier (5 DTU) for development
2. **vCore Model:** S0 (10 DTU) for small production
3. **Serverless:** Auto-pause after inactivity (cheapest for low-usage)
4. **Reserved Capacity:** Save up to 80% with 1-3 year commitment

Estimated costs:
- **Basic (5 DTU):** ~$5/month
- **S0 (10 DTU):** ~$15/month
- **Serverless:** Pay per use, ~$0.50-5/month for low usage

## Troubleshooting

### Connection timeout
- Check firewall rules
- Verify server name and credentials
- Increase `connectTimeout` in config

### "Login failed for user"
- Verify username/password
- Check Azure SQL user permissions
- Ensure user has db_owner role

### "Unable to connect"
- Check network connectivity
- Verify `encrypt: true` is set
- Test with Azure Data Studio first

### Performance issues
- Add indexes (already configured)
- Use connection pooling
- Consider upgrading DTU/vCore tier

## Security Best Practices

1. **Never commit credentials** to version control
2. **Use environment variables** for sensitive config
3. **Enable SSL/TLS** (`encrypt: true`)
4. **Restrict firewall** to known IPs only
5. **Use Azure Key Vault** for production secrets
6. **Enable auditing** in Azure SQL for compliance
7. **Regular backups** (Azure SQL auto-backup enabled by default)

## Next Steps

After successful Azure SQL migration:

1. Monitor performance in Azure Portal
2. Set up alerts for connection failures
3. Configure automatic backups
4. Enable geo-replication for disaster recovery (optional)
5. Consider read replicas for scaling (optional)
