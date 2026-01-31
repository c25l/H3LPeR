# Database Sync Feature Documentation

## Overview

The H3LPeR app now includes a comprehensive database synchronization system that allows you to:
- Track changes (deltas) over time for articles, news, calendar events, and journal entries
- Manage conflicts in journal entries with intelligent resolution
- View version history of journal entries
- Persist data across sessions with SQLite database
- Automatically sync filesystem changes with database

## Architecture

### Components

1. **DatabaseService** (`server/services/database.js`)
   - SQLite database with version tracking
   - Tables: `journal_entries`, `journal_history`, `news_articles`, `research_articles`, `calendar_events`, `change_log`, `sync_state`
   - Automatic versioning and history tracking

2. **SyncService** (`server/services/sync.js`)
   - Bidirectional sync between filesystem (vault) and database
   - Periodic sync every 5 minutes (configurable)
   - Conflict detection and resolution
   - Delta calculation for all entity types

3. **VaultService** (`server/services/vault.js`)
   - File system abstraction for markdown files
   - Frontmatter parsing with gray-matter
   - File watching with chokidar
   - Search and tree operations

### Database Schema

#### Journal Entries
```sql
journal_entries (
  id TEXT PRIMARY KEY,           -- Date-based ID (YYYY-MM-DD)
  date TEXT NOT NULL,
  content TEXT NOT NULL,
  frontmatter TEXT,              -- JSON frontmatter
  version INTEGER DEFAULT 1,
  hash TEXT,                     -- Content hash for conflict detection
  created_at INTEGER,
  updated_at INTEGER,
  synced_at INTEGER,             -- Last sync with filesystem
  conflict_version TEXT          -- Stores conflicting version if any
)
```

#### Journal History
```sql
journal_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id TEXT,
  version INTEGER,
  content TEXT,
  frontmatter TEXT,
  hash TEXT,
  created_at INTEGER
)
```

#### News Articles
```sql
news_articles (
  id TEXT PRIMARY KEY,
  title TEXT,
  summary TEXT,
  url TEXT,
  source TEXT,
  category TEXT,                 -- 'news', 'tech', 'science', etc.
  published_at INTEGER,
  fetched_at INTEGER,
  cluster_id TEXT,               -- Related articles grouping
  rank INTEGER,                  -- AI relevance rank
  content TEXT,
  version INTEGER DEFAULT 1,
  created_at INTEGER,
  updated_at INTEGER
)
```

#### Research Articles
```sql
research_articles (
  id TEXT PRIMARY KEY,           -- arXiv ID or DOI
  title TEXT,
  authors TEXT,                  -- JSON array
  abstract TEXT,
  url TEXT,
  published_at INTEGER,
  fetched_at INTEGER,
  categories TEXT,               -- JSON array
  rank INTEGER,
  version INTEGER DEFAULT 1,
  created_at INTEGER,
  updated_at INTEGER
)
```

#### Calendar Events
```sql
calendar_events (
  id TEXT PRIMARY KEY,           -- Google Calendar event ID
  calendar_id TEXT,
  summary TEXT,
  description TEXT,
  location TEXT,
  start_time INTEGER,
  end_time INTEGER,
  all_day INTEGER,               -- Boolean
  recurrence TEXT,               -- JSON recurrence rules
  source TEXT,                   -- 'google', 'manual', etc.
  version INTEGER DEFAULT 1,
  created_at INTEGER,
  updated_at INTEGER,
  synced_at INTEGER
)
```

#### Change Log
```sql
change_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT,              -- 'journal', 'news', 'article', 'calendar'
  entity_id TEXT,
  operation TEXT,                -- 'create', 'update', 'delete'
  version INTEGER,
  data TEXT,                     -- JSON snapshot
  created_at INTEGER
)
```

## API Endpoints

### Sync Status and Control

#### `GET /api/sync/status`
Get current sync status for all data sources.

**Response:**
```json
{
  "status": {
    "journal": {
      "source": "journal",
      "last_sync": 1706745600000,
      "last_version": 5,
      "metadata": null
    },
    "news": { ... },
    "calendar": { ... },
    "research": { ... }
  },
  "is_syncing": false
}
```

#### `POST /api/sync/trigger`
Manually trigger a sync operation.

**Request Body:**
```json
{
  "source": "journal"  // Optional: specific source to sync
}
```

**Response:**
```json
{
  "success": true,
  "result": {
    "synced": 10,
    "conflicts": 2
  }
}
```

### Delta Tracking

#### `GET /api/sync/delta/:entityType?since=<timestamp>`
Get changes since a specific timestamp.

**Parameters:**
- `entityType`: One of `journal`, `news`, `article`, `calendar`
- `since`: Unix timestamp in milliseconds

**Response:**
```json
{
  "entity_type": "journal",
  "since": 1706745600000,
  "count": 3,
  "changes": [
    {
      "id": 1,
      "entity_type": "journal",
      "entity_id": "2024-01-31",
      "operation": "create",
      "version": 1,
      "data": { ... },
      "created_at": 1706745601000
    }
  ]
}
```

#### `GET /api/sync/delta/:entityType/range?start=<timestamp>&end=<timestamp>`
Get changes in a time range.

**Response:**
```json
{
  "entity_type": "journal",
  "start": 1706745600000,
  "end": 1706832000000,
  "count": 5,
  "changes": [ ... ]
}
```

### Conflict Management

**Note:** Conflicts only occur for **journal entries** (markdown files that are synced bidirectionally between filesystem and database). News articles, research papers, and calendar events do not have conflicts because they are read-only data fetched from external sources. Duplicate articles are automatically deduplicated by their unique IDs.

#### `GET /api/sync/conflicts`
Get all journal entries with conflicts.

**Response:**
```json
{
  "count": 2,
  "conflicts": [
    {
      "id": "2024-01-31",
      "date": "2024-01-31",
      "database_version": "# Content in DB",
      "conflict_version": "# Content from filesystem",
      "updated_at": 1706745600000,
      "version": 3
    }
  ]
}
```

#### `POST /api/sync/conflicts/:entryId/resolve`
Resolve a conflict by choosing a version.

**Request Body:**
```json
{
  "resolution": "database"  // or "filesystem"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Conflict resolved using database version",
  "entry_id": "2024-01-31"
}
```

### Version History

#### `GET /api/sync/journal/:entryId/history`
Get version history for a journal entry.

**Response:**
```json
{
  "entry_id": "2024-01-31",
  "count": 5,
  "history": [
    {
      "id": 1,
      "entry_id": "2024-01-31",
      "version": 1,
      "content": "# Original content",
      "frontmatter": null,
      "hash": "abc123",
      "created_at": 1706745600000
    }
  ]
}
```

### Data Retrieval

#### `GET /api/sync/journal?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`
Get journal entries from database in date range.

#### `GET /api/sync/news?category=tech&since=<timestamp>&limit=100`
Get news articles from database. Articles are automatically deduplicated by ID - if the same article is fetched multiple times, only one copy is stored with the latest version.

#### `GET /api/sync/research?since=<timestamp>&limit=100`
Get research articles from database. Articles are automatically deduplicated by their arXiv ID or DOI.

#### `GET /api/sync/calendar?startTime=<timestamp>&endTime=<timestamp>`
Get calendar events from database. Events are deduplicated by their Google Calendar event ID.

## Usage Examples

### 1. Viewing Deltas Over Time

```javascript
// Get all journal changes from the last 7 days
const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
const response = await fetch(`/api/sync/delta/journal?since=${sevenDaysAgo}`);
const { changes } = await response.json();

// Each change includes: operation, version, data snapshot, timestamp
changes.forEach(change => {
  console.log(`${change.operation} on ${change.entity_id} at version ${change.version}`);
});
```

### 2. Handling Conflicts

```javascript
// Check for conflicts
const conflictsResponse = await fetch('/api/sync/conflicts');
const { conflicts } = await conflictsResponse.json();

if (conflicts.length > 0) {
  const conflict = conflicts[0];
  
  // Show both versions to user
  console.log('Database version:', conflict.database_version);
  console.log('Filesystem version:', conflict.conflict_version);
  
  // User chooses resolution
  const resolution = 'database'; // or 'filesystem'
  
  await fetch(`/api/sync/conflicts/${conflict.id}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resolution })
  });
}
```

### 3. Version History

```javascript
// Get complete history of a journal entry
const response = await fetch('/api/sync/journal/2024-01-31/history');
const { history } = await response.json();

// Display timeline of changes
history.forEach((version, index) => {
  console.log(`Version ${version.version} (${new Date(version.created_at)})`);
  console.log(version.content);
});
```

### 4. Manual Sync Trigger

```javascript
// Trigger sync for all sources
await fetch('/api/sync/trigger', { 
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
});

// Or sync specific source
await fetch('/api/sync/trigger', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ source: 'journal' })
});
```

## Conflict Resolution Strategy

The sync service uses a three-way merge strategy:

1. **No Conflict**: If only one side changed, use that version
2. **Filesystem Newer**: If filesystem is newer and DB hasn't changed since last sync, use filesystem
3. **Database Newer**: If DB is newer and filesystem hasn't changed, write DB to filesystem
4. **Both Changed**: If both changed since last sync, flag as conflict and store both versions

When a conflict is detected:
- Database keeps its version as `content`
- Filesystem version is stored in `conflict_version`
- User must manually resolve via API
- After resolution, conflict is cleared and chosen version syncs

## Configuration

### Database Location
Default: `.data/writer.db` (relative to project root)

Can be customized in `server/index.js`:
```javascript
const dbPath = path.join(__dirname, '..', '.data', 'writer.db');
```

### Sync Interval
Default: 5 minutes

Can be customized when starting sync:
```javascript
syncService.startPeriodicSync(10 * 60 * 1000); // 10 minutes
```

### Vault Path
Configured in `config.json`:
```json
{
  "vaultPath": "./vault",
  "journalFolder": "Journal/Day"
}
```

## Testing

Run the test suite:
```bash
node test-sync.js
```

Tests cover:
- Database initialization
- Journal entry CRUD operations
- Delta tracking
- News and research article storage
- Calendar event storage
- Vault-to-database sync
- Conflict detection

## Performance Considerations

1. **Write-Ahead Logging (WAL)**: Database uses WAL mode for better concurrency
2. **Indexes**: All tables have appropriate indexes for fast queries
3. **Bulk Operations**: Use `bulkInsertNews()` for inserting multiple articles
4. **Lazy Sync**: Periodic sync runs in background, doesn't block requests
5. **Change Log Pruning**: Consider implementing cleanup for old change log entries

## Future Enhancements

1. **Real-time Sync**: WebSocket-based sync for instant updates
2. **Selective Sync**: Choose which data types to sync
3. **Compression**: Compress large content fields
4. **Encryption**: Encrypt sensitive data at rest
5. **Multi-device Sync**: Sync between multiple devices
6. **Backup/Restore**: Database backup and restore functionality
7. **Change Log Retention**: Auto-prune old change log entries
8. **Merge Strategies**: Additional conflict resolution strategies (last-write-wins, manual merge)

## Troubleshooting

### Database Locked
If you see "database is locked" errors:
- WAL mode is enabled to reduce this
- Ensure no other processes are accessing the database
- Check file permissions on `.data/` directory

### Sync Not Running
Check:
1. Server logs for errors: `[SyncService]` messages
2. Sync status: `GET /api/sync/status`
3. Trigger manual sync: `POST /api/sync/trigger`

### Conflicts Not Resolving
- Ensure you're calling the resolve endpoint correctly
- Check that the entry_id matches exactly
- Verify the conflict still exists: `GET /api/sync/conflicts`

### Missing Changes
- Check the change log: `GET /api/sync/delta/:type?since=0`
- Verify sync state: `GET /api/sync/status`
- Trigger manual sync and check logs
