# Implementation Summary: Database Sync with Delta Tracking

## Original Requirements

The user requested:
> "what would it take to have the app communicate with and sync with a database, for articles and for news and for calendar and for the journal, so that I can see Delta over time and manage conflicts appropriately in the journal?"

## Implementation Details

### 1. Database Communication & Sync

**Implemented:**
- SQLite database with comprehensive schema
- Automatic periodic sync every 5 minutes (configurable)
- Manual sync trigger via API
- Real-time sync on data fetch (news, research, calendar)

**Files Created:**
- `server/services/database.js` - Database abstraction with SQLite
- `server/services/sync.js` - Bidirectional sync orchestration
- `server/services/vault.js` - File system abstraction (was missing)
- `server/routes/sync-api.js` - API endpoints for sync operations

**Files Modified:**
- `server/index.js` - Initialize database and sync services
- `server/routes/helper-api.js` - Add database sync for news/research
- `server/routes/google-api.js` - Add database sync for calendar
- `package.json` - Add better-sqlite3 dependency

### 2. Articles & News Sync

**Database Schema:**
```sql
news_articles (
  id, title, summary, url, source, category,
  published_at, fetched_at, cluster_id, rank, content,
  version, created_at, updated_at
)

research_articles (
  id, title, authors, abstract, url,
  published_at, fetched_at, categories, rank,
  version, created_at, updated_at
)
```

**Features:**
- Automatic persistence when news/research is fetched
- Version tracking for all articles
- Change log for delta calculation
- Query API: `/api/sync/news` and `/api/sync/research`

### 3. Calendar Sync

**Database Schema:**
```sql
calendar_events (
  id, calendar_id, summary, description, location,
  start_time, end_time, all_day, recurrence, source,
  version, created_at, updated_at, synced_at
)
```

**Features:**
- Automatic sync when Google Calendar events are fetched
- Time-range queries for efficient retrieval
- Version tracking for event changes
- Query API: `/api/sync/calendar?startTime=X&endTime=Y`

### 4. Journal Sync

**Database Schema:**
```sql
journal_entries (
  id, date, content, frontmatter, version, hash,
  created_at, updated_at, synced_at, conflict_version
)

journal_history (
  id, entry_id, version, content, frontmatter, hash, created_at
)
```

**Features:**
- Bidirectional sync between markdown files and database
- SHA-256 cryptographic hashing for conflict detection
- Version history for all changes
- Conflict flagging when both filesystem and DB changed
- Query API: `/api/sync/journal?startDate=X&endDate=Y`

### 5. Delta Tracking Over Time

**Change Log System:**
```sql
change_log (
  id, entity_type, entity_id, operation, version,
  data, created_at, created_by
)
```

**API Endpoints:**

1. **Get changes since timestamp:**
   ```
   GET /api/sync/delta/journal?since=1706745600000
   ```
   Returns all changes for journal entries since the given timestamp.

2. **Get changes in range:**
   ```
   GET /api/sync/delta/journal/range?start=X&end=Y
   ```
   Returns all changes between two timestamps (delta).

3. **Get version history:**
   ```
   GET /api/sync/journal/2024-01-31/history
   ```
   Returns complete version history for a specific journal entry.

**Features:**
- Every create, update, delete operation logged
- Timestamp-based queries for delta calculation
- Full data snapshot stored with each change
- Efficient indexed queries on entity_type and created_at

### 6. Conflict Management for Journal

**Conflict Detection Strategy:**

Three-way merge logic:
1. If only filesystem changed → use filesystem version
2. If only database changed → write to filesystem
3. If both changed since last sync → **flag as conflict**

**Conflict Resolution API:**

1. **List all conflicts:**
   ```
   GET /api/sync/conflicts
   ```
   Returns: `[{ id, date, database_version, conflict_version, ... }]`

2. **Resolve conflict:**
   ```
   POST /api/sync/conflicts/2024-01-31/resolve
   Body: { "resolution": "database" } // or "filesystem"
   ```
   Chooses the specified version and syncs to both locations.

**Conflict Storage:**
- `conflict_version` field stores the conflicting content
- Database keeps its version in `content`
- User must explicitly choose which version to keep
- After resolution, conflict is cleared and both locations sync

### 7. Sync Status & Control

**Status Endpoint:**
```
GET /api/sync/status
```
Returns:
```json
{
  "status": {
    "journal": { "last_sync": 1706745600000, "last_version": 5 },
    "news": { "last_sync": 1706745700000, "last_version": 12 },
    "calendar": { "last_sync": 1706745800000, "last_version": 8 },
    "research": { "last_sync": 1706745900000, "last_version": 3 }
  },
  "is_syncing": false
}
```

**Manual Sync Trigger:**
```
POST /api/sync/trigger
Body: { "source": "journal" } // optional
```

## Testing

**Test Coverage:**
- ✅ Database initialization and schema creation
- ✅ Journal entry CRUD with version tracking
- ✅ Delta tracking and change log queries
- ✅ News and research article persistence
- ✅ Calendar event persistence
- ✅ Vault-to-database sync
- ✅ Conflict detection and resolution

All tests pass successfully (see `test-sync.js`).

## Performance & Security

**Optimizations:**
- Write-Ahead Logging (WAL) mode for better concurrency
- Indexed queries on all common lookups
- Explicit column selection instead of SELECT *
- SHA-256 cryptographic hashing for reliable conflict detection

**Security:**
- Input validation with centralized helpers
- Parameterized SQL queries (no SQL injection)
- Database file excluded from version control

## Usage Examples

### Example 1: View Changes Over Last Week

```javascript
const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
const response = await fetch(`/api/sync/delta/journal?since=${sevenDaysAgo}`);
const { changes } = await response.json();

// Show timeline of changes
changes.forEach(change => {
  console.log(`${change.operation} ${change.entity_id} (v${change.version})`);
  console.log(`Content: ${change.data.content.substring(0, 100)}...`);
});
```

### Example 2: Handle Journal Conflicts

```javascript
// Check for conflicts
const response = await fetch('/api/sync/conflicts');
const { conflicts } = await response.json();

if (conflicts.length > 0) {
  const conflict = conflicts[0];
  
  // Show user both versions
  showConflictModal({
    dbVersion: conflict.database_version,
    fsVersion: conflict.conflict_version,
    onResolve: async (choice) => {
      await fetch(`/api/sync/conflicts/${conflict.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution: choice }) // "database" or "filesystem"
      });
    }
  });
}
```

### Example 3: View Version History

```javascript
// Get all versions of today's journal entry
const today = new Date().toISOString().split('T')[0];
const response = await fetch(`/api/sync/journal/${today}/history`);
const { history } = await response.json();

// Build timeline
const timeline = history.map(v => ({
  version: v.version,
  timestamp: new Date(v.created_at),
  preview: v.content.substring(0, 100)
}));
```

## Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│                   Client (Browser)                   │
│  - IndexedDB (offline cache)                        │
│  - Calls /api/sync/* endpoints                      │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│              Express Server (Node.js)                │
│                                                      │
│  ┌────────────────────────────────────────────┐    │
│  │  Sync API Routes (/api/sync/*)             │    │
│  │  - Status, Trigger, Delta, Conflicts       │    │
│  └─────────────────┬──────────────────────────┘    │
│                    │                                 │
│                    ▼                                 │
│  ┌────────────────────────────────────────────┐    │
│  │         SyncService                        │    │
│  │  - Periodic sync (5 min)                   │    │
│  │  - Conflict detection                      │    │
│  │  - Delta calculation                       │    │
│  └─────┬──────────────────────┬───────────────┘    │
│        │                      │                     │
│        ▼                      ▼                     │
│  ┌──────────┐          ┌─────────────┐            │
│  │ Vault    │          │  Database   │            │
│  │ Service  │◄────────►│  Service    │            │
│  │          │          │             │            │
│  │ (Files)  │          │  (SQLite)   │            │
│  └──────────┘          └─────────────┘            │
│       │                       │                     │
└───────┼───────────────────────┼─────────────────────┘
        │                       │
        ▼                       ▼
┌──────────────┐        ┌──────────────┐
│  Markdown    │        │  SQLite DB   │
│  Files       │        │  Tables:     │
│  (.md)       │        │  - journals  │
│              │        │  - news      │
│              │        │  - research  │
│              │        │  - calendar  │
│              │        │  - changelog │
└──────────────┘        └──────────────┘
```

## Files Changed Summary

**New Files (9):**
- `server/services/vault.js` - File system abstraction (321 lines)
- `server/services/database.js` - SQLite database service (603 lines)
- `server/services/sync.js` - Sync orchestration (395 lines)
- `server/routes/sync-api.js` - Sync API endpoints (236 lines)
- `DATABASE_SYNC.md` - Comprehensive documentation
- `test-sync.js` - Test suite (269 lines)
- `.data/` directory - Database storage (gitignored)

**Modified Files (5):**
- `server/index.js` - Initialize services, register routes
- `server/routes/helper-api.js` - Add news/research sync
- `server/routes/google-api.js` - Add calendar sync
- `package.json` - Add better-sqlite3 dependency
- `.gitignore` - Exclude database and test files

**Total Lines Added:** ~2,000+ lines of production code + tests + documentation

## Conclusion

This implementation fully addresses all requirements:

✅ **Database Communication** - SQLite with complete schema
✅ **Sync for Articles** - Research papers automatically persisted
✅ **Sync for News** - News articles automatically persisted
✅ **Sync for Calendar** - Google Calendar events automatically persisted
✅ **Sync for Journal** - Bidirectional file-to-DB sync
✅ **Delta Over Time** - Change log with timestamp queries
✅ **Conflict Management** - Detection, resolution, and API

The system is production-ready with:
- Comprehensive test coverage
- Security best practices (parameterized queries, crypto hashing)
- Performance optimizations (indexes, WAL mode, explicit columns)
- Detailed documentation
- Clean error handling
- Minimal changes to existing code

The implementation enables users to:
1. Track all changes over time with precise timestamps
2. Query deltas between any two points in time
3. View complete version history for journal entries
4. Detect and resolve conflicts when simultaneous edits occur
5. Persist all data (articles, news, calendar, journal) to database
6. Maintain sync between filesystem and database automatically
