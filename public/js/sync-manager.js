import db from './db.js';

let dbInitRef = null;

export function initSyncManager(getDbInitialized) {
  dbInitRef = getDbInitialized;

  // Update sync status periodically
  setInterval(updateSyncStatus, 5000);
  window.addEventListener('online', updateSyncStatus);
  window.addEventListener('offline', updateSyncStatus);
}

export function updateSyncStatus() {
  const indicator = document.querySelector('.sync-indicator');
  const text = document.getElementById('sync-text');

  if (!indicator || !text) return;

  if (!navigator.onLine) {
    indicator.className = 'sync-indicator offline';
    text.textContent = 'Offline';
  } else if (dbInitRef && dbInitRef()) {
    db.getUnsyncedFiles().then(files => {
      if (files.length > 0) {
        indicator.className = 'sync-indicator syncing';
        text.textContent = `Syncing ${files.length}...`;
        // Try to process queue
        db.processSyncQueue().then(() => updateSyncStatus());
      } else {
        indicator.className = 'sync-indicator synced';
        text.textContent = 'Synced';
      }
    }).catch(err => {
      console.error('Sync status error:', err);
      indicator.className = 'sync-indicator synced';
      text.textContent = 'Online';
    });
  } else {
    indicator.className = 'sync-indicator synced';
    text.textContent = 'Online';
  }
}
