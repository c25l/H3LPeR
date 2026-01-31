const logger = require('../logger');

/**
 * SyncService - Orchestrates bidirectional sync between filesystem (vault) and database
 * 
 * Features:
 * - Sync journal entries between .md files and database
 * - Track changes and calculate deltas
 * - Detect and resolve conflicts (three-way merge when possible)
 * - Periodic sync with configurable intervals
 */
class SyncService {
  constructor(vault, database, journal) {
    this.vault = vault;
    this.db = database;
    this.journal = journal;
    this.syncInterval = null;
    this.isSyncing = false;
  }

  /**
   * Start periodic sync
   * @param {number} intervalMs - Sync interval in milliseconds (default: 5 minutes)
   */
  startPeriodicSync(intervalMs = 5 * 60 * 1000) {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    // Initial sync
    this.syncAll().catch(err => {
      logger.error('SyncService', 'Initial sync failed', err);
    });

    // Periodic sync
    this.syncInterval = setInterval(() => {
      this.syncAll().catch(err => {
        logger.error('SyncService', 'Periodic sync failed', err);
      });
    }, intervalMs);

    logger.info('SyncService', `Started periodic sync (interval: ${intervalMs}ms)`);
  }

  /**
   * Stop periodic sync
   */
  stopPeriodicSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      logger.info('SyncService', 'Stopped periodic sync');
    }
  }

  /**
   * Sync all data types
   */
  async syncAll() {
    if (this.isSyncing) {
      logger.debug('SyncService', 'Sync already in progress, skipping');
      return;
    }

    this.isSyncing = true;
    try {
      await this.syncJournal();
      // Future: Add syncNews(), syncCalendar(), syncResearch()
      
      logger.info('SyncService', 'Sync completed successfully');
    } catch (err) {
      logger.error('SyncService', 'Sync failed', err);
      throw err;
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Sync journal entries between filesystem and database
   * 
   * Strategy:
   * 1. List all .md files in journal folder
   * 2. For each file, check if DB version matches filesystem
   * 3. If conflict, use three-way merge or flag for manual resolution
   * 4. Sync DB changes back to filesystem if needed
   */
  async syncJournal() {
    logger.info('SyncService', 'Starting journal sync');
    
    const syncState = this.db.getLastSync('journal');
    const lastSyncTime = syncState ? syncState.last_sync : 0;
    
    // Get all journal files from filesystem
    const journalFolder = this.journal.journalFolder || 'Journal/Day';
    const files = await this.vault.listFiles(journalFolder, false);
    
    let syncedCount = 0;
    let conflictCount = 0;
    
    for (const file of files) {
      try {
        // Parse date from filename
        const date = this.journal.parseDate(file.name);
        if (!date) {
          logger.debug('SyncService', `Skipping non-date file: ${file.name}`);
          continue;
        }
        
        const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
        const entryId = dateStr;
        
        // Read file from filesystem
        const fileData = await this.vault.readFile(file.path);
        if (!fileData) continue;
        
        const fileStats = await this.vault.getStats(file.path);
        const fileModified = fileStats ? new Date(fileStats.modified).getTime() : Date.now();
        
        // Check if entry exists in database
        const dbEntry = this.db.getJournalEntry(entryId);
        
        if (!dbEntry) {
          // New entry - add to database
          this.db.upsertJournalEntry(
            entryId,
            dateStr,
            fileData.content,
            fileData.frontmatter
          );
          this.db.markJournalSynced(entryId);
          syncedCount++;
          logger.debug('SyncService', `Created DB entry for ${dateStr}`);
        } else {
          // Entry exists - check for conflicts
          const fileHash = this.db.hashContent(fileData.content);
          const dbHash = dbEntry.hash;
          
          if (fileHash === dbHash) {
            // Content is identical - just update sync time
            this.db.markJournalSynced(entryId);
          } else {
            // Content differs - need to resolve
            const dbModified = dbEntry.updated_at;
            
            if (fileModified > dbModified) {
              // Filesystem is newer - check if DB has local changes since last sync
              if (dbEntry.synced_at && dbModified > dbEntry.synced_at) {
                // Conflict: both changed since last sync
                logger.warn('SyncService', `Conflict detected for ${dateStr}`);
                
                // Store conflict version in database for manual resolution
                this.db.upsertJournalEntry(
                  entryId,
                  dateStr,
                  fileData.content,
                  fileData.frontmatter,
                  dbEntry.content // Store DB version as conflict
                );
                conflictCount++;
              } else {
                // No conflict: filesystem is authoritative
                this.db.upsertJournalEntry(
                  entryId,
                  dateStr,
                  fileData.content,
                  fileData.frontmatter
                );
                this.db.markJournalSynced(entryId);
                syncedCount++;
              }
            } else {
              // Database is newer or same age - write back to filesystem
              await this.vault.writeFile(
                file.path,
                dbEntry.content,
                dbEntry.frontmatter
              );
              this.db.markJournalSynced(entryId);
              syncedCount++;
              logger.debug('SyncService', `Updated file from DB for ${dateStr}`);
            }
          }
        }
      } catch (err) {
        logger.error('SyncService', `Error syncing journal file ${file.path}`, err);
      }
    }
    
    // Check for DB entries that don't exist in filesystem
    // (entries created through API but not yet written to disk)
    const allDbEntries = this.db.getJournalEntriesInRange('1900-01-01', '2100-12-31');
    const filePathSet = new Set(files.map(f => this.journal.parseDate(f.name)?.toISOString().split('T')[0]).filter(Boolean));
    
    for (const dbEntry of allDbEntries) {
      if (!filePathSet.has(dbEntry.date)) {
        // DB entry doesn't have corresponding file - create it
        try {
          const journalPath = this.journal.getJournalPath(new Date(dbEntry.date));
          await this.vault.writeFile(
            journalPath,
            dbEntry.content,
            dbEntry.frontmatter
          );
          this.db.markJournalSynced(dbEntry.id);
          syncedCount++;
          logger.debug('SyncService', `Created file from DB entry for ${dbEntry.date}`);
        } catch (err) {
          logger.error('SyncService', `Error creating file for DB entry ${dbEntry.date}`, err);
        }
      }
    }
    
    // Update sync state
    this.db.updateSyncState('journal');
    
    logger.info('SyncService', `Journal sync complete: ${syncedCount} synced, ${conflictCount} conflicts`);
    
    return { synced: syncedCount, conflicts: conflictCount };
  }

  /**
   * Sync news articles from news service to database
   * This doesn't involve filesystem - just persisting RSS feed data
   */
  async syncNews(articles) {
    if (!articles || articles.length === 0) {
      return;
    }

    logger.info('SyncService', `Syncing ${articles.length} news articles to database`);
    
    try {
      this.db.bulkInsertNews(articles);
      this.db.updateSyncState('news');
      
      logger.info('SyncService', 'News sync complete');
    } catch (err) {
      logger.error('SyncService', 'Error syncing news', err);
      throw err;
    }
  }

  /**
   * Sync calendar events to database
   */
  async syncCalendar(events) {
    if (!events || events.length === 0) {
      return;
    }

    logger.info('SyncService', `Syncing ${events.length} calendar events to database`);
    
    try {
      const eventIds = [];
      for (const event of events) {
        this.db.upsertCalendarEvent(event);
        eventIds.push(event.id);
      }
      
      this.db.markCalendarSynced(eventIds);
      this.db.updateSyncState('calendar');
      
      logger.info('SyncService', 'Calendar sync complete');
    } catch (err) {
      logger.error('SyncService', 'Error syncing calendar', err);
      throw err;
    }
  }

  /**
   * Sync research articles to database
   */
  async syncResearch(articles) {
    if (!articles || articles.length === 0) {
      return;
    }

    logger.info('SyncService', `Syncing ${articles.length} research articles to database`);
    
    try {
      for (const article of articles) {
        this.db.upsertResearchArticle(article);
      }
      
      this.db.updateSyncState('research');
      
      logger.info('SyncService', 'Research sync complete');
    } catch (err) {
      logger.error('SyncService', 'Error syncing research', err);
      throw err;
    }
  }

  /**
   * Get delta changes for a specific entity type since a timestamp
   * @param {string} entityType - 'journal', 'news', 'article', 'calendar'
   * @param {number} since - Unix timestamp in milliseconds
   * @returns {Array} Array of changes
   */
  getDelta(entityType, since) {
    return this.db.getChangesSince(entityType, since);
  }

  /**
   * Get conflicts for journal entries
   * @returns {Array} Array of journal entries with conflicts
   */
  getJournalConflicts() {
    const allEntries = this.db.getJournalEntriesInRange('1900-01-01', '2100-12-31');
    return allEntries.filter(entry => entry.conflict_version !== null);
  }

  /**
   * Resolve a journal conflict by choosing a version
   * @param {string} entryId - Journal entry ID
   * @param {string} resolution - 'filesystem' or 'database'
   */
  async resolveJournalConflict(entryId, resolution) {
    const entry = this.db.getJournalEntry(entryId);
    if (!entry || !entry.conflict_version) {
      throw new Error('No conflict found for this entry');
    }

    if (resolution === 'database') {
      // Keep database version, clear conflict
      this.db.upsertJournalEntry(
        entryId,
        entry.date,
        entry.content,
        entry.frontmatter,
        null // Clear conflict
      );
      
      // Write to filesystem
      const journalPath = this.journal.getJournalPath(new Date(entry.date));
      await this.vault.writeFile(journalPath, entry.content, entry.frontmatter);
      this.db.markJournalSynced(entryId);
      
      logger.info('SyncService', `Resolved conflict for ${entryId}: kept database version`);
    } else if (resolution === 'filesystem') {
      // Use conflict version (which was the filesystem version), clear conflict
      this.db.upsertJournalEntry(
        entryId,
        entry.date,
        entry.conflict_version,
        entry.frontmatter,
        null // Clear conflict
      );
      
      // Write to filesystem
      const journalPath = this.journal.getJournalPath(new Date(entry.date));
      await this.vault.writeFile(journalPath, entry.conflict_version, entry.frontmatter);
      this.db.markJournalSynced(entryId);
      
      logger.info('SyncService', `Resolved conflict for ${entryId}: kept filesystem version`);
    } else {
      throw new Error('Invalid resolution option. Use "database" or "filesystem"');
    }
  }

  /**
   * Get version history for a journal entry
   */
  getJournalHistory(entryId) {
    return this.db.getJournalHistory(entryId);
  }
}

module.exports = SyncService;
