const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const logger = require('../logger');

/**
 * DatabaseService - Centralized database for syncing articles, news, calendar, and journal
 * Features:
 * - Version tracking for all records
 * - Change log for delta calculations
 * - Conflict detection and resolution
 * - History tracking for journal entries
 */
class DatabaseService {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
    this.init();
  }

  init() {
    // Ensure database directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL'); // Write-Ahead Logging for better concurrency
    this.db.pragma('foreign_keys = ON');
    
    this.createSchema();
    logger.info('DatabaseService', `Database initialized at ${this.dbPath}`);
  }

  createSchema() {
    // Change log for tracking all modifications (for delta calculation)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS change_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL, -- 'journal', 'news', 'article', 'calendar'
        entity_id TEXT NOT NULL,
        operation TEXT NOT NULL, -- 'create', 'update', 'delete'
        version INTEGER NOT NULL,
        data TEXT, -- JSON data snapshot
        created_at INTEGER NOT NULL, -- Unix timestamp in milliseconds
        created_by TEXT DEFAULT 'system'
      );
      CREATE INDEX IF NOT EXISTS idx_change_log_entity ON change_log(entity_type, entity_id);
      CREATE INDEX IF NOT EXISTS idx_change_log_created_at ON change_log(created_at);
    `);

    // Journal entries with version tracking
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS journal_entries (
        id TEXT PRIMARY KEY, -- date-based ID (e.g., '2024-01-31')
        date TEXT NOT NULL UNIQUE, -- ISO date string
        content TEXT NOT NULL,
        frontmatter TEXT, -- JSON frontmatter
        version INTEGER NOT NULL DEFAULT 1,
        hash TEXT, -- Content hash for conflict detection
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        synced_at INTEGER, -- Last sync with filesystem
        conflict_version TEXT -- If conflicted, stores the conflicting content
      );
      CREATE INDEX IF NOT EXISTS idx_journal_date ON journal_entries(date);
      CREATE INDEX IF NOT EXISTS idx_journal_updated ON journal_entries(updated_at);
    `);

    // Journal entry history for time-travel and conflict resolution
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS journal_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        content TEXT NOT NULL,
        frontmatter TEXT,
        hash TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_journal_history_entry ON journal_history(entry_id, version);
    `);

    // News articles with clustering and version tracking
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS news_articles (
        id TEXT PRIMARY KEY, -- UUID or article-based ID
        title TEXT NOT NULL,
        summary TEXT,
        url TEXT,
        source TEXT NOT NULL,
        category TEXT, -- 'news', 'tech', 'science', etc.
        published_at INTEGER, -- Article publication time
        fetched_at INTEGER NOT NULL, -- When we fetched it
        cluster_id TEXT, -- Group related articles
        rank INTEGER, -- AI-determined relevance rank
        content TEXT, -- Full article content if scraped
        version INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_news_published ON news_articles(published_at);
      CREATE INDEX IF NOT EXISTS idx_news_fetched ON news_articles(fetched_at);
      CREATE INDEX IF NOT EXISTS idx_news_cluster ON news_articles(cluster_id);
      CREATE INDEX IF NOT EXISTS idx_news_category ON news_articles(category);
    `);

    // Research articles (arXiv papers, etc.)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS research_articles (
        id TEXT PRIMARY KEY, -- arXiv ID or DOI
        title TEXT NOT NULL,
        authors TEXT, -- JSON array
        abstract TEXT,
        url TEXT,
        published_at INTEGER,
        fetched_at INTEGER NOT NULL,
        categories TEXT, -- JSON array of categories
        rank INTEGER,
        version INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_research_published ON research_articles(published_at);
      CREATE INDEX IF NOT EXISTS idx_research_fetched ON research_articles(fetched_at);
    `);

    // Calendar events with sync tracking
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS calendar_events (
        id TEXT PRIMARY KEY, -- Google Calendar event ID
        calendar_id TEXT, -- Which calendar this belongs to
        summary TEXT,
        description TEXT,
        location TEXT,
        start_time INTEGER, -- Unix timestamp
        end_time INTEGER,
        all_day INTEGER DEFAULT 0, -- Boolean: 1 = all day event
        recurrence TEXT, -- JSON recurrence rules if any
        source TEXT DEFAULT 'google', -- 'google', 'manual', etc.
        version INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        synced_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_calendar_start ON calendar_events(start_time);
      CREATE INDEX IF NOT EXISTS idx_calendar_end ON calendar_events(end_time);
      CREATE INDEX IF NOT EXISTS idx_calendar_cal_id ON calendar_events(calendar_id);
    `);

    // Sync state tracker - keeps track of last sync times per data source
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sync_state (
        source TEXT PRIMARY KEY, -- 'journal', 'news', 'calendar', 'research'
        last_sync INTEGER NOT NULL, -- Unix timestamp
        last_version INTEGER NOT NULL DEFAULT 0,
        metadata TEXT -- JSON for additional state
      );
    `);

    logger.info('DatabaseService', 'Database schema created/verified');
  }

  // ===== Change Log Methods =====
  
  /**
   * Log a change for delta tracking
   */
  logChange(entityType, entityId, operation, version, data) {
    const stmt = this.db.prepare(`
      INSERT INTO change_log (entity_type, entity_id, operation, version, data, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      entityType,
      entityId,
      operation,
      version,
      JSON.stringify(data),
      Date.now()
    );
  }

  /**
   * Get changes since a specific timestamp
   */
  getChangesSince(entityType, since) {
    const stmt = this.db.prepare(`
      SELECT * FROM change_log
      WHERE entity_type = ? AND created_at > ?
      ORDER BY created_at ASC
    `);
    
    return stmt.all(entityType, since).map(row => ({
      ...row,
      data: JSON.parse(row.data)
    }));
  }

  /**
   * Get changes between two timestamps (delta)
   */
  getDelta(entityType, startTime, endTime) {
    const stmt = this.db.prepare(`
      SELECT * FROM change_log
      WHERE entity_type = ? AND created_at > ? AND created_at <= ?
      ORDER BY created_at ASC
    `);
    
    return stmt.all(entityType, startTime, endTime).map(row => ({
      ...row,
      data: JSON.parse(row.data)
    }));
  }

  // ===== Journal Methods =====
  
  /**
   * Upsert a journal entry with version tracking
   */
  upsertJournalEntry(id, date, content, frontmatter = null, conflictVersion = null) {
    const now = Date.now();
    const hash = this.hashContent(content);
    
    const existing = this.db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(id);
    
    if (existing) {
      // Save to history before updating
      this.db.prepare(`
        INSERT INTO journal_history (entry_id, version, content, frontmatter, hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, existing.version, existing.content, existing.frontmatter, existing.hash, existing.updated_at);
      
      const newVersion = existing.version + 1;
      
      this.db.prepare(`
        UPDATE journal_entries
        SET content = ?, frontmatter = ?, version = ?, hash = ?, updated_at = ?,
            conflict_version = ?
        WHERE id = ?
      `).run(content, frontmatter ? JSON.stringify(frontmatter) : null, newVersion, hash, now, conflictVersion, id);
      
      this.logChange('journal', id, 'update', newVersion, { date, content, frontmatter });
      
      return { id, version: newVersion };
    } else {
      this.db.prepare(`
        INSERT INTO journal_entries (id, date, content, frontmatter, version, hash, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, ?, ?)
      `).run(id, date, content, frontmatter ? JSON.stringify(frontmatter) : null, hash, now, now);
      
      this.logChange('journal', id, 'create', 1, { date, content, frontmatter });
      
      return { id, version: 1 };
    }
  }

  /**
   * Get a journal entry by ID
   */
  getJournalEntry(id) {
    const row = this.db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(id);
    if (!row) return null;
    
    return {
      ...row,
      frontmatter: row.frontmatter ? JSON.parse(row.frontmatter) : null
    };
  }

  /**
   * Get journal entry by date
   */
  getJournalEntryByDate(date) {
    const row = this.db.prepare('SELECT * FROM journal_entries WHERE date = ?').get(date);
    if (!row) return null;
    
    return {
      ...row,
      frontmatter: row.frontmatter ? JSON.parse(row.frontmatter) : null
    };
  }

  /**
   * Get all versions of a journal entry
   */
  getJournalHistory(entryId) {
    const history = this.db.prepare(`
      SELECT * FROM journal_history WHERE entry_id = ? ORDER BY version ASC
    `).all(entryId);
    
    return history.map(row => ({
      ...row,
      frontmatter: row.frontmatter ? JSON.parse(row.frontmatter) : null
    }));
  }

  /**
   * Get journal entries in date range
   */
  getJournalEntriesInRange(startDate, endDate) {
    const rows = this.db.prepare(`
      SELECT * FROM journal_entries 
      WHERE date >= ? AND date <= ?
      ORDER BY date ASC
    `).all(startDate, endDate);
    
    return rows.map(row => ({
      ...row,
      frontmatter: row.frontmatter ? JSON.parse(row.frontmatter) : null
    }));
  }

  /**
   * Mark journal entry as synced with filesystem
   */
  markJournalSynced(id) {
    this.db.prepare('UPDATE journal_entries SET synced_at = ? WHERE id = ?')
      .run(Date.now(), id);
  }

  // ===== News Methods =====
  
  /**
   * Upsert a news article
   */
  upsertNewsArticle(article) {
    const now = Date.now();
    const existing = this.db.prepare('SELECT version FROM news_articles WHERE id = ?').get(article.id);
    
    if (existing) {
      const newVersion = existing.version + 1;
      this.db.prepare(`
        UPDATE news_articles
        SET title = ?, summary = ?, url = ?, source = ?, category = ?,
            published_at = ?, fetched_at = ?, cluster_id = ?, rank = ?,
            content = ?, version = ?, updated_at = ?
        WHERE id = ?
      `).run(
        article.title, article.summary, article.url, article.source, article.category,
        article.published_at, article.fetched_at, article.cluster_id, article.rank,
        article.content, newVersion, now, article.id
      );
      
      this.logChange('news', article.id, 'update', newVersion, article);
    } else {
      this.db.prepare(`
        INSERT INTO news_articles (
          id, title, summary, url, source, category, published_at, fetched_at,
          cluster_id, rank, content, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(
        article.id, article.title, article.summary, article.url, article.source,
        article.category, article.published_at, article.fetched_at, article.cluster_id,
        article.rank, article.content, now, now
      );
      
      this.logChange('news', article.id, 'create', 1, article);
    }
  }

  /**
   * Get news articles by category and time range
   */
  getNewsArticles(category = null, since = null, limit = 100) {
    let query = 'SELECT * FROM news_articles WHERE 1=1';
    const params = [];
    
    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }
    
    if (since) {
      query += ' AND fetched_at > ?';
      params.push(since);
    }
    
    query += ' ORDER BY published_at DESC, rank ASC LIMIT ?';
    params.push(limit);
    
    return this.db.prepare(query).all(...params);
  }

  /**
   * Bulk insert news articles
   */
  bulkInsertNews(articles) {
    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO news_articles (
        id, title, summary, url, source, category, published_at, fetched_at,
        cluster_id, rank, content, version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);
    
    const insertMany = this.db.transaction((articles) => {
      const now = Date.now();
      for (const article of articles) {
        insert.run(
          article.id, article.title, article.summary, article.url, article.source,
          article.category, article.published_at || now, article.fetched_at || now,
          article.cluster_id, article.rank, article.content, now, now
        );
      }
    });
    
    insertMany(articles);
  }

  // ===== Research Methods =====
  
  /**
   * Upsert a research article
   */
  upsertResearchArticle(article) {
    const now = Date.now();
    const existing = this.db.prepare('SELECT version FROM research_articles WHERE id = ?').get(article.id);
    
    if (existing) {
      const newVersion = existing.version + 1;
      this.db.prepare(`
        UPDATE research_articles
        SET title = ?, authors = ?, abstract = ?, url = ?, published_at = ?,
            fetched_at = ?, categories = ?, rank = ?, version = ?, updated_at = ?
        WHERE id = ?
      `).run(
        article.title, JSON.stringify(article.authors), article.abstract, article.url,
        article.published_at, article.fetched_at, JSON.stringify(article.categories),
        article.rank, newVersion, now, article.id
      );
      
      this.logChange('article', article.id, 'update', newVersion, article);
    } else {
      this.db.prepare(`
        INSERT INTO research_articles (
          id, title, authors, abstract, url, published_at, fetched_at,
          categories, rank, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(
        article.id, article.title, JSON.stringify(article.authors), article.abstract,
        article.url, article.published_at, article.fetched_at,
        JSON.stringify(article.categories), article.rank, now, now
      );
      
      this.logChange('article', article.id, 'create', 1, article);
    }
  }

  /**
   * Get research articles
   */
  getResearchArticles(since = null, limit = 100) {
    let query = 'SELECT * FROM research_articles WHERE 1=1';
    const params = [];
    
    if (since) {
      query += ' AND fetched_at > ?';
      params.push(since);
    }
    
    query += ' ORDER BY published_at DESC, rank ASC LIMIT ?';
    params.push(limit);
    
    const rows = this.db.prepare(query).all(...params);
    return rows.map(row => ({
      ...row,
      authors: JSON.parse(row.authors),
      categories: JSON.parse(row.categories)
    }));
  }

  // ===== Calendar Methods =====
  
  /**
   * Upsert a calendar event
   */
  upsertCalendarEvent(event) {
    const now = Date.now();
    const existing = this.db.prepare('SELECT version FROM calendar_events WHERE id = ?').get(event.id);
    
    if (existing) {
      const newVersion = existing.version + 1;
      this.db.prepare(`
        UPDATE calendar_events
        SET calendar_id = ?, summary = ?, description = ?, location = ?,
            start_time = ?, end_time = ?, all_day = ?, recurrence = ?,
            source = ?, version = ?, updated_at = ?
        WHERE id = ?
      `).run(
        event.calendar_id, event.summary, event.description, event.location,
        event.start_time, event.end_time, event.all_day ? 1 : 0,
        event.recurrence ? JSON.stringify(event.recurrence) : null,
        event.source, newVersion, now, event.id
      );
      
      this.logChange('calendar', event.id, 'update', newVersion, event);
    } else {
      this.db.prepare(`
        INSERT INTO calendar_events (
          id, calendar_id, summary, description, location, start_time, end_time,
          all_day, recurrence, source, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(
        event.id, event.calendar_id, event.summary, event.description, event.location,
        event.start_time, event.end_time, event.all_day ? 1 : 0,
        event.recurrence ? JSON.stringify(event.recurrence) : null,
        event.source, now, now
      );
      
      this.logChange('calendar', event.id, 'create', 1, event);
    }
  }

  /**
   * Get calendar events in time range
   */
  getCalendarEvents(startTime, endTime) {
    const rows = this.db.prepare(`
      SELECT * FROM calendar_events
      WHERE start_time >= ? AND start_time < ?
      ORDER BY start_time ASC
    `).all(startTime, endTime);
    
    return rows.map(row => ({
      ...row,
      all_day: row.all_day === 1,
      recurrence: row.recurrence ? JSON.parse(row.recurrence) : null
    }));
  }

  /**
   * Mark calendar events as synced
   */
  markCalendarSynced(eventIds) {
    const update = this.db.prepare('UPDATE calendar_events SET synced_at = ? WHERE id = ?');
    const now = Date.now();
    
    const updateMany = this.db.transaction((ids) => {
      for (const id of ids) {
        update.run(now, id);
      }
    });
    
    updateMany(eventIds);
  }

  // ===== Sync State Methods =====
  
  /**
   * Get last sync time for a source
   */
  getLastSync(source) {
    const row = this.db.prepare('SELECT * FROM sync_state WHERE source = ?').get(source);
    if (!row) return null;
    
    return {
      ...row,
      metadata: row.metadata ? JSON.parse(row.metadata) : null
    };
  }

  /**
   * Update sync state
   */
  updateSyncState(source, version = null, metadata = null) {
    const now = Date.now();
    const existing = this.db.prepare('SELECT * FROM sync_state WHERE source = ?').get(source);
    
    if (existing) {
      this.db.prepare(`
        UPDATE sync_state
        SET last_sync = ?, last_version = ?, metadata = ?
        WHERE source = ?
      `).run(now, version || existing.last_version, metadata ? JSON.stringify(metadata) : existing.metadata, source);
    } else {
      this.db.prepare(`
        INSERT INTO sync_state (source, last_sync, last_version, metadata)
        VALUES (?, ?, ?, ?)
      `).run(source, now, version || 0, metadata ? JSON.stringify(metadata) : null);
    }
  }

  // ===== Utility Methods =====
  
  /**
   * Generate a cryptographic hash of content for conflict detection
   */
  hashContent(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      logger.info('DatabaseService', 'Database connection closed');
    }
  }
}

module.exports = DatabaseService;
