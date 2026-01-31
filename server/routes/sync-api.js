const express = require('express');
const router = express.Router();
const { AppError, asyncHandler } = require('../middleware/error-handler');
const logger = require('../logger');

/**
 * Sync API Routes
 * Endpoints for database sync, delta tracking, and conflict management
 */

// GET /api/sync/status - Get sync status for all sources
router.get('/status', asyncHandler(async (req, res) => {
  const syncService = req.app.locals.syncService;
  const db = req.app.locals.database;
  
  const sources = ['journal', 'news', 'calendar', 'research'];
  const status = {};
  
  for (const source of sources) {
    const syncState = db.getLastSync(source);
    status[source] = syncState || { 
      source, 
      last_sync: null, 
      last_version: 0,
      metadata: null 
    };
  }
  
  res.json({
    status,
    is_syncing: syncService.isSyncing
  });
}));

// POST /api/sync/trigger - Manually trigger sync
router.post('/trigger', asyncHandler(async (req, res) => {
  const syncService = req.app.locals.syncService;
  const { source } = req.body; // Optional: specific source to sync
  
  if (syncService.isSyncing) {
    throw new AppError('Sync already in progress', 409, 'SYNC_IN_PROGRESS');
  }
  
  let result;
  if (source === 'journal') {
    result = await syncService.syncJournal();
  } else if (!source) {
    await syncService.syncAll();
    result = { message: 'Full sync triggered' };
  } else {
    throw new AppError(`Unknown sync source: ${source}`, 400, 'INVALID_SOURCE');
  }
  
  res.json({ success: true, result });
}));

// GET /api/sync/delta/:entityType - Get delta changes since timestamp
router.get('/delta/:entityType', asyncHandler(async (req, res) => {
  const db = req.app.locals.database;
  const { entityType } = req.params;
  const { since } = req.query; // Unix timestamp in milliseconds
  
  if (!since) {
    throw new AppError('Missing "since" query parameter', 400, 'MISSING_PARAMETER');
  }
  
  const validTypes = ['journal', 'news', 'article', 'calendar'];
  if (!validTypes.includes(entityType)) {
    throw new AppError(`Invalid entity type. Must be one of: ${validTypes.join(', ')}`, 400, 'INVALID_TYPE');
  }
  
  const sinceTime = parseInt(since, 10);
  if (isNaN(sinceTime)) {
    throw new AppError('Invalid "since" timestamp', 400, 'INVALID_TIMESTAMP');
  }
  
  const changes = db.getChangesSince(entityType, sinceTime);
  
  res.json({
    entity_type: entityType,
    since: sinceTime,
    count: changes.length,
    changes
  });
}));

// GET /api/sync/delta/:entityType/range - Get delta between two timestamps
router.get('/delta/:entityType/range', asyncHandler(async (req, res) => {
  const db = req.app.locals.database;
  const { entityType } = req.params;
  const { start, end } = req.query;
  
  if (!start || !end) {
    throw new AppError('Missing "start" or "end" query parameters', 400, 'MISSING_PARAMETERS');
  }
  
  const validTypes = ['journal', 'news', 'article', 'calendar'];
  if (!validTypes.includes(entityType)) {
    throw new AppError(`Invalid entity type. Must be one of: ${validTypes.join(', ')}`, 400, 'INVALID_TYPE');
  }
  
  const startTime = parseInt(start, 10);
  const endTime = parseInt(end, 10);
  
  if (isNaN(startTime) || isNaN(endTime)) {
    throw new AppError('Invalid timestamp format', 400, 'INVALID_TIMESTAMP');
  }
  
  const changes = db.getDelta(entityType, startTime, endTime);
  
  res.json({
    entity_type: entityType,
    start: startTime,
    end: endTime,
    count: changes.length,
    changes
  });
}));

// GET /api/sync/conflicts - Get all conflicts
router.get('/conflicts', asyncHandler(async (req, res) => {
  const syncService = req.app.locals.syncService;
  
  const conflicts = syncService.getJournalConflicts();
  
  res.json({
    count: conflicts.length,
    conflicts: conflicts.map(entry => ({
      id: entry.id,
      date: entry.date,
      database_version: entry.content,
      conflict_version: entry.conflict_version,
      updated_at: entry.updated_at,
      version: entry.version
    }))
  });
}));

// POST /api/sync/conflicts/:entryId/resolve - Resolve a conflict
router.post('/conflicts/:entryId/resolve', asyncHandler(async (req, res) => {
  const syncService = req.app.locals.syncService;
  const { entryId } = req.params;
  const { resolution } = req.body; // 'database' or 'filesystem'
  
  if (!resolution || !['database', 'filesystem'].includes(resolution)) {
    throw new AppError('Invalid resolution. Must be "database" or "filesystem"', 400, 'INVALID_RESOLUTION');
  }
  
  await syncService.resolveJournalConflict(entryId, resolution);
  
  res.json({ 
    success: true, 
    message: `Conflict resolved using ${resolution} version`,
    entry_id: entryId
  });
}));

// GET /api/sync/journal/:entryId/history - Get version history for journal entry
router.get('/journal/:entryId/history', asyncHandler(async (req, res) => {
  const syncService = req.app.locals.syncService;
  const { entryId } = req.params;
  
  const history = syncService.getJournalHistory(entryId);
  
  res.json({
    entry_id: entryId,
    count: history.length,
    history
  });
}));

// GET /api/sync/journal - Get all journal entries from database
router.get('/journal', asyncHandler(async (req, res) => {
  const db = req.app.locals.database;
  const { startDate, endDate } = req.query;
  
  if (!startDate || !endDate) {
    throw new AppError('Missing "startDate" or "endDate" query parameters', 400, 'MISSING_PARAMETERS');
  }
  
  const entries = db.getJournalEntriesInRange(startDate, endDate);
  
  res.json({
    start_date: startDate,
    end_date: endDate,
    count: entries.length,
    entries
  });
}));

// GET /api/sync/news - Get news articles from database
router.get('/news', asyncHandler(async (req, res) => {
  const db = req.app.locals.database;
  const { category, since, limit } = req.query;
  
  const articles = db.getNewsArticles(
    category || null,
    since ? parseInt(since, 10) : null,
    limit ? parseInt(limit, 10) : 100
  );
  
  res.json({
    category: category || 'all',
    count: articles.length,
    articles
  });
}));

// GET /api/sync/research - Get research articles from database
router.get('/research', asyncHandler(async (req, res) => {
  const db = req.app.locals.database;
  const { since, limit } = req.query;
  
  const articles = db.getResearchArticles(
    since ? parseInt(since, 10) : null,
    limit ? parseInt(limit, 10) : 100
  );
  
  res.json({
    count: articles.length,
    articles
  });
}));

// GET /api/sync/calendar - Get calendar events from database
router.get('/calendar', asyncHandler(async (req, res) => {
  const db = req.app.locals.database;
  const { startTime, endTime } = req.query;
  
  if (!startTime || !endTime) {
    throw new AppError('Missing "startTime" or "endTime" query parameters', 400, 'MISSING_PARAMETERS');
  }
  
  const events = db.getCalendarEvents(
    parseInt(startTime, 10),
    parseInt(endTime, 10)
  );
  
  res.json({
    start_time: parseInt(startTime, 10),
    end_time: parseInt(endTime, 10),
    count: events.length,
    events
  });
}));

module.exports = router;
