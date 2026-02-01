// IndexedDB wrapper for Writer app
const DB_NAME = 'WriterDB';
const DB_VERSION = 3; // Incremented to add calendar caching

class WriterDB {
  constructor() {
    this.db = null;
    this.syncQueue = [];
    this.isOnline = navigator.onLine;
    
    // Listen for online/offline events
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.processSyncQueue();
    });
    
    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Files store
        if (!db.objectStoreNames.contains('files')) {
          const filesStore = db.createObjectStore('files', { keyPath: 'path' });
          filesStore.createIndex('modifiedAt', 'modifiedAt', { unique: false });
          filesStore.createIndex('syncStatus', 'syncStatus', { unique: false });
        }

        // Tags store (cached tag inventory)
        if (!db.objectStoreNames.contains('tags')) {
          const tagsStore = db.createObjectStore('tags', { keyPath: 'tag' });
          tagsStore.createIndex('count', 'totalCount', { unique: false });
        }

        // Metadata store
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'key' });
        }

        // Calendar data store
        if (!db.objectStoreNames.contains('calendar')) {
          const calendarStore = db.createObjectStore('calendar', { keyPath: 'id' });
          calendarStore.createIndex('type', 'type', { unique: false });
          calendarStore.createIndex('cachedAt', 'cachedAt', { unique: false });
        }

        // Sync queue for offline operations
        if (!db.objectStoreNames.contains('syncQueue')) {
          const syncStore = db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
          syncStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  // File operations
  async getFile(path) {
    if (!this.db) return null;
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db.transaction('files', 'readonly');
        const store = tx.objectStore('files');
        const request = store.get(path);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        tx.onerror = () => reject(tx.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async getAllFiles() {
    if (!this.db) return [];
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db.transaction('files', 'readonly');
        const store = tx.objectStore('files');
        const request = store.getAll();
        
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
        tx.onerror = () => reject(tx.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async saveFile(path, content, serverModifiedAt = null) {
    if (!this.db) return null;
    const file = {
      path,
      content,
      modifiedAt: Date.now(),
      serverModifiedAt: serverModifiedAt || Date.now(),
      syncStatus: this.isOnline ? 'synced' : 'pending'
    };

    return new Promise((resolve, reject) => {
      try {
        const tx = this.db.transaction('files', 'readwrite');
        const store = tx.objectStore('files');
        const request = store.put(file);
        
        request.onsuccess = () => resolve(file);
        request.onerror = () => reject(request.error);
        tx.onerror = () => reject(tx.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async deleteFile(path) {
    if (!this.db) return;
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db.transaction('files', 'readwrite');
        const store = tx.objectStore('files');
        const request = store.delete(path);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        tx.onerror = () => reject(tx.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async markFileAsSynced(path, serverModifiedAt) {
    const file = await this.getFile(path);
    if (file) {
      file.syncStatus = 'synced';
      file.serverModifiedAt = serverModifiedAt;
      await this.saveFile(path, file.content, serverModifiedAt);
    }
  }

  async getUnsyncedFiles() {
    if (!this.db) return [];
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db.transaction('files', 'readonly');
        const store = tx.objectStore('files');
        const index = store.index('syncStatus');
        const request = index.getAll('pending');
        
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
        tx.onerror = () => reject(tx.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  // Search files locally
  async searchFiles(query) {
    const files = await this.getAllFiles();
    const lowerQuery = query.toLowerCase();
    
    return files.filter(file => {
      return file.path.toLowerCase().includes(lowerQuery) ||
             file.content.toLowerCase().includes(lowerQuery);
    }).map(file => ({
      path: file.path,
      name: file.path.split('/').pop(),
      content: file.content
    }));
  }

  // Tags operations
  async getTags() {
    if (!this.db) return [];
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db.transaction('tags', 'readonly');
        const store = tx.objectStore('tags');
        const request = store.getAll();
        
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
        tx.onerror = () => reject(tx.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async updateTags() {
    if (!this.db) return [];
    
    try {
      const files = await this.getAllFiles();
      const tagMap = new Map();
      const tagPattern = /(?:^|\s)(#[A-Za-z0-9_.-]*[A-Za-z0-9])/g;

      // Scan all files for tags
      for (const file of files) {
        if (file.path.endsWith('.md')) {
          const matches = [...file.content.matchAll(tagPattern)];
          const fileTags = new Map();
          
          matches.forEach(match => {
            const tag = match[1]; // Capture group 1 is the #tag part
            fileTags.set(tag, (fileTags.get(tag) || 0) + 1);
          });

          fileTags.forEach((count, tag) => {
            if (!tagMap.has(tag)) {
              tagMap.set(tag, []);
            }
            tagMap.get(tag).push({ file: file.path, count });
          });
        }
      }

      // Convert to array
      const tags = Array.from(tagMap.entries()).map(([tag, files]) => ({
        tag,
        files,
        totalCount: files.reduce((sum, f) => sum + f.count, 0)
      }));

      // Save to tags store
      return new Promise((resolve, reject) => {
        try {
          const tx = this.db.transaction('tags', 'readwrite');
          const store = tx.objectStore('tags');
          
          // Clear existing tags
          const clearRequest = store.clear();
          
          clearRequest.onsuccess = () => {
            // Add new tags
            for (const tag of tags) {
              store.put(tag);
            }
          };
          
          tx.oncomplete = () => resolve(tags);
          tx.onerror = () => reject(tx.error);
        } catch (err) {
          reject(err);
        }
      });
    } catch (err) {
      console.error('updateTags error:', err);
      return [];
    }
  }

  // Sync queue operations
  async addToSyncQueue(operation, data) {
    if (!this.db) return;
    const item = {
      operation,
      data,
      timestamp: Date.now()
    };
    
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db.transaction('syncQueue', 'readwrite');
        const store = tx.objectStore('syncQueue');
        const request = store.add(item);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        tx.onerror = () => reject(tx.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async getSyncQueue() {
    if (!this.db) return [];
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db.transaction('syncQueue', 'readonly');
        const store = tx.objectStore('syncQueue');
        const request = store.getAll();
        
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
        tx.onerror = () => reject(tx.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async clearSyncQueueItem(id) {
    if (!this.db) return;
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db.transaction('syncQueue', 'readwrite');
        const store = tx.objectStore('syncQueue');
        const request = store.delete(id);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        tx.onerror = () => reject(tx.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async processSyncQueue() {
    if (!this.isOnline) return;

    const queue = await this.getSyncQueue();
    
    for (const item of queue) {
      try {
        if (item.operation === 'save') {
          const response = await fetch(`/api/files/${encodeURIComponent(item.data.path)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: item.data.content })
          });

          if (response.ok) {
            await this.markFileAsSynced(item.data.path, Date.now());
            await this.clearSyncQueueItem(item.id);
          }
        } else if (item.operation === 'delete') {
          const response = await fetch(`/api/files/${encodeURIComponent(item.data.path)}`, {
            method: 'DELETE'
          });

          if (response.ok) {
            await this.clearSyncQueueItem(item.id);
          }
        }
      } catch (err) {
        console.error('Sync error:', err);
        // Keep in queue, will retry later
      }
    }
  }

  // Metadata operations
  async getMetadata(key) {
    if (!this.db) return null;
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db.transaction('metadata', 'readonly');
        const store = tx.objectStore('metadata');
        const request = store.get(key);
        
        request.onsuccess = () => resolve(request.result?.value);
        request.onerror = () => reject(request.error);
        tx.onerror = () => reject(tx.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async setMetadata(key, value) {
    if (!this.db) return;
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db.transaction('metadata', 'readwrite');
        const store = tx.objectStore('metadata');
        const request = store.put({ key, value });
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        tx.onerror = () => reject(tx.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  // Initial sync from server
  async syncFromServer() {
    if (!this.db || !this.isOnline) return;

    try {
      // Fetch all files from server
      const response = await fetch('/api/files');
      if (!response.ok) {
        console.error('Failed to fetch files list:', response.status);
        return;
      }

      const serverFiles = await response.json();
      if (!Array.isArray(serverFiles)) {
        console.error('Invalid response from /api/files:', serverFiles);
        return;
      }

      for (const file of serverFiles) {
        // listFiles() only returns .md files, no type check needed
        if (!file || !file.path || !file.path.endsWith('.md')) continue;

        try {
          // Check if we have a local version
          const localFile = await this.getFile(file.path);

          if (!localFile) {
            // New file from server, fetch content
            const contentResponse = await fetch(`/api/files/${encodeURIComponent(file.path)}`);
            if (!contentResponse.ok) continue;

            const contentData = await contentResponse.json();
            if (!contentData || contentData.content === undefined) continue;

            const modifiedTime = file.modified ? new Date(file.modified).getTime() : Date.now();
            await this.saveFile(file.path, contentData.content, modifiedTime);
          } else {
            // Check for conflicts - convert ISO string to timestamp for comparison
            const serverModified = file.modified ? new Date(file.modified).getTime() : 0;
            if (serverModified > localFile.serverModifiedAt && localFile.syncStatus === 'pending') {
              // Conflict detected - server has newer version but we have unsynced changes
              const conflictResponse = await fetch(`/api/files/${encodeURIComponent(file.path)}`);
              if (conflictResponse.ok) {
                const conflictData = await conflictResponse.json();
                if (conflictData && conflictData.content !== undefined) {
                  localFile.hasConflict = true;
                  localFile.serverContent = conflictData.content;
                  const tx = this.db.transaction('files', 'readwrite');
                  tx.objectStore('files').put(localFile);
                }
              }
            } else if (serverModified > localFile.modifiedAt) {
              // Server is newer, update local
              const contentResponse = await fetch(`/api/files/${encodeURIComponent(file.path)}`);
              if (!contentResponse.ok) continue;

              const contentData = await contentResponse.json();
              if (!contentData || contentData.content === undefined) continue;

              await this.saveFile(file.path, contentData.content, serverModified);
            }
          }
        } catch (fileErr) {
          console.error(`Error syncing file ${file.path}:`, fileErr);
          // Continue with next file
        }
      }

      // Update tags after sync
      await this.updateTags();

      // Set last sync time
      await this.setMetadata('lastSync', Date.now());

    } catch (err) {
      console.error('Sync from server failed:', err);
    }
  }

  // Calendar caching operations
  async cacheCalendarData(type, data) {
    if (!this.db) return;
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db.transaction('calendar', 'readwrite');
        const store = tx.objectStore('calendar');
        const item = {
          id: type,
          type: type,
          data: data,
          cachedAt: Date.now()
        };
        const request = store.put(item);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        tx.onerror = () => reject(tx.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async getCachedCalendarData(type) {
    if (!this.db) return null;
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db.transaction('calendar', 'readonly');
        const store = tx.objectStore('calendar');
        const request = store.get(type);
        
        request.onsuccess = () => {
          const result = request.result;
          if (result) {
            resolve({
              data: result.data,
              cachedAt: result.cachedAt
            });
          } else {
            resolve(null);
          }
        };
        request.onerror = () => reject(request.error);
        tx.onerror = () => reject(tx.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async clearCalendarCache() {
    if (!this.db) return;
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db.transaction('calendar', 'readwrite');
        const store = tx.objectStore('calendar');
        const request = store.clear();
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        tx.onerror = () => reject(tx.error);
      } catch (err) {
        reject(err);
      }
    });
  }
}

// Create singleton instance
const db = new WriterDB();

export default db;
