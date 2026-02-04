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

  // Initialize sidebar manager
  sidebarManager = createSidebarManager({
    iconRail: document.getElementById('icon-rail'),
    panelContainer: document.getElementById('sidebar-panel-container'),
    headerEl: document.getElementById('sidebar-panel-title'),
    stateKey: 'h3lper-sidebar-state'
  });

  // Register sidebar panels
  sidebarManager.register({
    id: 'search',
    title: 'Search',
    icon: SIDEBAR_ICONS.search,
    order: 10,
    render(container) {
      container.innerHTML = `
        <div class="search-container">
          <input type="text" id="search-input" placeholder="Search files..." autocomplete="off">
          <div id="search-results" class="search-results hidden"></div>
        </div>
      `;
      initSearch();
    }
  });

  sidebarManager.register({
    id: 'recent',
    title: 'Recent',
    icon: SIDEBAR_ICONS.clock,
    order: 20,
    render(container) {
      container.innerHTML = `
        <div class="recent-files-panel" id="recent-files-panel">
          <div id="recent-files-list" class="recent-files-list"></div>
        </div>
      `;
      renderRecentFiles();
    },
    onShow() {
      renderRecentFiles();
    }
  });

  sidebarManager.register({
    id: 'files',
    title: 'Files',
    icon: SIDEBAR_ICONS.folder,
    order: 30,
    render(container) {
      container.innerHTML = `
        <div class="file-tree-toolbar">
          <button id="tree-new-file-btn" class="btn btn-icon" title="New file">+F</button>
          <button id="tree-new-folder-btn" class="btn btn-icon" title="New folder">+D</button>
          <button id="tree-rename-btn" class="btn btn-icon" title="Rename">Rename</button>
          <button id="tree-delete-btn" class="btn btn-icon" title="Delete">Delete</button>
          <button id="tree-refresh-btn" class="btn btn-icon" title="Refresh">\u21BB</button>
        </div>
        <div class="file-tree" id="file-tree">
          <div id="file-tree-root"></div>
        </div>
      `;
      treeEditor = initTreeEditor({
        container: document.getElementById('file-tree-root'),
        toolbar: {
          newFileBtn: document.getElementById('tree-new-file-btn'),
          newFolderBtn: document.getElementById('tree-new-folder-btn'),
          renameBtn: document.getElementById('tree-rename-btn'),
          deleteBtn: document.getElementById('tree-delete-btn'),
          refreshBtn: document.getElementById('tree-refresh-btn')
        },
        type: 'files',
        initialTree: window.APP_DATA?.fileTree || null,
        onOpenFile: (path) => window.openFile(path),
        policyProvider: ({ path }) => fetchPolicy(path)
      });
    }
  });

  sidebarManager.register({
    id: 'tags',
    title: 'Tags',
    icon: SIDEBAR_ICONS.tag,
    order: 40,
    render(container) {
      container.innerHTML = `
        <div class="tags-panel">
          <div class="tags-header">
            <span class="tags-title">Tags</span>
            <button id="refresh-tags-btn" class="btn btn-icon" title="Refresh tags">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="23 4 23 10 17 10"></polyline>
                <polyline points="1 20 1 14 7 14"></polyline>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
              </svg>
            </button>
          </div>
          <div id="tags-list" class="tags-list">
            <div class="tags-loading">Loading tags...</div>
          </div>
        </div>
      `;
      initTags();
    },
    onShow() {
      loadTags();
    }
  });

  sidebarManager.register({
    id: 'calendar',
    title: 'Calendar',
    icon: SIDEBAR_ICONS.calendar,
    order: 50,
    render(container) {
      container.innerHTML = `
        <div id="calendar-panel" class="calendar-panel">
          <div class="calendar-header">
            <button id="prev-month" class="btn btn-icon">&lt;</button>
            <span id="calendar-title"></span>
            <button id="next-month" class="btn btn-icon">&gt;</button>
          </div>
          <div id="calendar-grid" class="calendar-grid"></div>
        </div>
      `;
      initCalendar();
    }
  });

  // Initialize sidebar
  sidebarManager.init();

  // Wire sidebar buttons
  document.getElementById('sidebar-collapse-btn').addEventListener('click', () => {
    sidebarManager.toggleCollapse();
  });

  document.getElementById('sidebar-new-file-btn').addEventListener('click', () => {
    document.getElementById('new-file-modal').classList.remove('hidden');
    document.getElementById('new-file-name').focus();
  });

  // Mobile sidebar toggle
  document.getElementById('mobile-sidebar-toggle').addEventListener('click', () => {
    document.getElementById('app-sidebar').classList.toggle('open');
  });

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
