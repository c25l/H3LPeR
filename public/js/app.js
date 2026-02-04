import { initCalendar } from './calendar.js';
import db from './db.js';
import { createBufferManager } from './buffer-manager.js';
import { initTreeEditor } from './tree-editor.js';
import { createSidebarManager, SIDEBAR_ICONS } from './sidebar-panels.js';
import { initBufferMenu } from './buffer-menu.js';
import { initUnifiedTabs, renderUnifiedTabs } from './unified-tabs.js';

import {
  initFileManager, setDbInitialized, getCurrentFile, getIsDirty,
  onContentChange, saveFile, loadFile, showEmptyState,
  renderBufferTabs, renderRecentFiles, fetchPolicy, getDefaultPolicy,
  applyBufferPolicy
} from './file-manager.js';

import {
  initTabManager, initTabs, initEmailIndicator, checkGoogleAuth,
  setActiveTab, getActiveTab, getTabFromUrl, getFilePathFromUrl, updateUrlState
} from './tab-manager.js';

import { initSearch, initTags, loadTags, initSearchManager } from './search-manager.js';
import { initSyncManager, updateSyncStatus } from './sync-manager.js';
import {
  initUI, initKeyboardShortcuts, initModals, setupWindowHandlers,
  onHistoryChange, showNotification
} from './ui.js';

// State
let dbInitialized = false;
let treeEditor = null;
let bufferManager = null;
let sidebarManager = null;

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
  // Register service worker
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('Service Worker registered');

      // Listen for SW update notifications
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'SW_UPDATED') {
          showNotification('App updated. Refresh for latest version.', 'info');
        }
        if (event.data?.type === 'SYNC_REQUESTED') {
          // SW requested a sync (e.g., after regaining connectivity)
          if (db && db.db) {
            db.processSyncQueue().catch(err => console.error('Background sync error:', err));
          }
        }
      });

      // Register for background sync if supported
      if ('sync' in registration) {
        // Will be triggered when connectivity is restored
        window.addEventListener('online', () => {
          registration.sync.register('file-sync').catch(() => {});
        });
      }
    } catch (error) {
      console.error('Service Worker registration failed:', error);
    }
  }

  // Initialize IndexedDB
  try {
    await db.init();
    dbInitialized = true;
    console.log('IndexedDB initialized');

    // Sync from server in background
    db.syncFromServer().then(() => {
      console.log('Initial sync complete');
      if (document.getElementById('tags-list')) {
        loadTags();
      }
    }).catch(err => {
      console.error('Sync error:', err);
    });
  } catch (error) {
    console.error('IndexedDB initialization failed:', error);
    dbInitialized = false;
  }

  // Initialize buffer manager
  bufferManager = createBufferManager({
    container: document.getElementById('editor'),
    onContentChange,
    onHistoryChange
  });

  // Accessor functions for cross-module refs
  const getDbInitialized = () => dbInitialized;
  const getBufferManager = () => bufferManager;
  const getTreeEditor = () => treeEditor;
  const getSidebarManager = () => sidebarManager;

  // Expose buffer manager globally for buffer menu
  window.getBufferManager = getBufferManager;
  window.renderBufferTabs = renderUnifiedTabs; // Use unified tabs instead

  // Initialize unified tab system
  initUnifiedTabs({
    getBufferManager,
    onRender: () => renderUnifiedTabs()
  });

  // Initialize modules
  initFileManager({ getBufferManager, getTreeEditor, renderBufferTabs: () => renderUnifiedTabs(), getDbInitialized });
  setDbInitialized(dbInitialized);
  initTabManager({ saveFile, getIsDirty });
  initSearchManager({ getDbInitialized, getBufferManager, renderBufferTabs: () => renderUnifiedTabs() });
  initSyncManager(getDbInitialized);
  initUI({ getSidebarManager });

  // Check Google auth status
  await checkGoogleAuth();

  // Initialize email indicator
  initEmailIndicator();

  // No need to init old tabs - we're using unified tabs now

  // No sidebar in this version - commented out
  /*
  // Initialize sidebar manager
  sidebarManager = createSidebarManager({
    iconRail: document.getElementById('icon-rail'),
    panelContainer: document.getElementById('sidebar-panel-container'),
    headerEl: document.getElementById('sidebar-panel-title'),
    stateKey: 'h3lper-sidebar-state'
  });
  */

  renderUnifiedTabs(); // Use unified tabs

  // Initialize keyboard shortcuts
  initKeyboardShortcuts();

  // Initialize buffer menu
  initBufferMenu();

  // Initialize modals
  initModals();

  // Initialize sync status
  updateSyncStatus();

  // Setup global window handlers
  setupWindowHandlers();

  // Load current file if any (this will trigger unified tabs rendering)
  const currentFile = window.APP_DATA?.currentFile || null;
  if (currentFile) {
    await loadFile(currentFile.path);
  } else {
    showEmptyState();
    // Start with Files tab active by default
    renderUnifiedTabs();
  }

  // Check for Google connection success
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('google_connected') === 'true') {
    showNotification('Successfully connected to Google!', 'success');
    const cleanedUrl = new URL(window.location.href);
    cleanedUrl.searchParams.delete('google_connected');
    window.history.replaceState({}, document.title, cleanedUrl.pathname + cleanedUrl.search);
  }
});
