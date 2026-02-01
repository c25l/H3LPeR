import { undo, redo } from './editor.js';
import { saveFile, loadFile, openFile, getCurrentFile, getIsDirty } from './file-manager.js';
import { getActiveTab, getFilePathFromUrl, getTabFromUrl, setActiveTab, updateUrlState } from './tab-manager.js';

// Navigation history
let navHistory = [];
let navIndex = -1;
let navIgnoreNext = false;

let sidebarManagerRef = null;

export function initUI({ getSidebarManager }) {
  sidebarManagerRef = getSidebarManager;
}

export function updateNavButtons() {
  const backBtn = document.getElementById('nav-back-btn');
  const fwdBtn = document.getElementById('nav-forward-btn');
  if (backBtn) backBtn.disabled = navIndex <= 0;
  if (fwdBtn) fwdBtn.disabled = navIndex >= navHistory.length - 1;
}

// Show notification banner
export function showNotification(message, type = 'info') {
  const banner = document.getElementById('google-auth-banner');
  const messageEl = document.getElementById('auth-banner-message');

  messageEl.textContent = message;
  banner.className = 'auth-banner';

  if (type === 'success') {
    banner.style.background = 'rgba(78, 201, 176, 0.1)';
    banner.style.borderColor = '#4ec9b0';
    banner.style.color = '#4ec9b0';
  }

  setTimeout(() => {
    banner.classList.add('hidden');
  }, 5000);
}

// Keyboard shortcuts
export function initKeyboardShortcuts() {
  document.addEventListener('keydown', async (e) => {
    // Ctrl+S: Save
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      await saveFile();
    }

    // Ctrl+B: Toggle sidebar collapse
    if (e.ctrlKey && e.key === 'b') {
      e.preventDefault();
      const sidebarManager = sidebarManagerRef();
      if (sidebarManager) sidebarManager.toggleCollapse();
    }

    // Ctrl+O: Quick switcher
    if (e.ctrlKey && e.key === 'o') {
      e.preventDefault();
      openQuickSwitcher();
    }

    // Escape: Close modals
    if (e.key === 'Escape') {
      closeAllModals();
    }
  });
}

// Quick Switcher
async function openQuickSwitcher() {
  const modal = document.getElementById('quick-switcher');
  const input = document.getElementById('switcher-input');
  const results = document.getElementById('switcher-results');

  modal.classList.remove('hidden');
  input.value = '';
  input.focus();

  // Load all files
  try {
    const response = await fetch('/api/files');
    const files = await response.json();
    window.allFiles = flattenFiles(files);
    renderSwitcherResults('');
  } catch (err) {
    console.error('Error loading files:', err);
  }

  input.oninput = () => renderSwitcherResults(input.value);

  let selectedIndex = 0;

  input.onkeydown = (e) => {
    const items = results.querySelectorAll('.switcher-item');

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
      updateSelection(items, selectedIndex);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      updateSelection(items, selectedIndex);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = items[selectedIndex];
      if (selected) {
        openFile(selected.dataset.path);
        closeAllModals();
      }
    }
  };
}

function renderSwitcherResults(query) {
  const results = document.getElementById('switcher-results');
  const files = window.allFiles || [];

  const filtered = query
    ? files.filter(f => f.name.toLowerCase().includes(query.toLowerCase()))
    : files;

  results.innerHTML = filtered.slice(0, 20).map((file, i) => `
    <div class="switcher-item ${i === 0 ? 'selected' : ''}"
         data-path="${file.path}"
         onclick="openFile('${file.path}'); closeAllModals();">
      <div class="switcher-item-name">${file.name}</div>
      <div class="switcher-item-path">${file.path}</div>
    </div>
  `).join('');
}

function updateSelection(items, index) {
  items.forEach((item, i) => {
    item.classList.toggle('selected', i === index);
  });
}

function flattenFiles(files, result = []) {
  for (const file of files) {
    if (file.type === 'folder' && file.children) {
      flattenFiles(file.children, result);
    } else if (file.type === 'file') {
      result.push(file);
    }
  }
  return result;
}

// Modals
export function initModals() {
  // Close on backdrop click
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.add('hidden');
      }
    });
  });
}

export function closeNewFileModal() {
  document.getElementById('new-file-modal').classList.add('hidden');
}

export function closeAllModals() {
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
}

// History change handler - update undo/redo button states
export function onHistoryChange(histSize) {
  const undoBtn = document.getElementById('undo-btn');
  const redoBtn = document.getElementById('redo-btn');
  if (undoBtn) undoBtn.disabled = histSize.undo === 0;
  if (redoBtn) redoBtn.disabled = histSize.redo === 0;
}

// Global window handlers
export function setupWindowHandlers() {
  // Global undo/redo
  window.editorUndo = function () { undo(); };
  window.editorRedo = function () { redo(); };

  // Navigation
  window.navigateBack = async function () {
    if (navIndex <= 0) return;
    if (getIsDirty()) await saveFile();
    navIndex--;
    navIgnoreNext = true;
    await loadFile(navHistory[navIndex]);
    updateNavButtons();
    const { addToRecentFiles } = await import('./file-manager.js');
    addToRecentFiles(navHistory[navIndex]);
    updateUrlState(getActiveTab(), { path: `/edit/${navHistory[navIndex]}` });
  };

  window.navigateForward = async function () {
    if (navIndex >= navHistory.length - 1) return;
    if (getIsDirty()) await saveFile();
    navIndex++;
    navIgnoreNext = true;
    await loadFile(navHistory[navIndex]);
    updateNavButtons();
    const { addToRecentFiles } = await import('./file-manager.js');
    addToRecentFiles(navHistory[navIndex]);
    updateUrlState(getActiveTab(), { path: `/edit/${navHistory[navIndex]}` });
  };

  // Open file - global
  window.openFile = async function (path) {
    await openFile(path);
    if (!navIgnoreNext) {
      navHistory = navHistory.slice(0, navIndex + 1);
      navHistory.push(path);
      navIndex = navHistory.length - 1;
    }
    navIgnoreNext = false;
    updateNavButtons();
  };

  // File menu
  window.toggleFileMenu = function () {
    const menu = document.getElementById('file-menu');
    menu.classList.toggle('hidden');

    if (!menu.classList.contains('hidden')) {
      setTimeout(() => {
        document.addEventListener('click', closeFileMenuOnClickOutside);
      }, 0);
    }
  };

  window.toggleBacklinks = function () {
    document.getElementById('backlinks-panel').classList.toggle('collapsed');
  };

  window.closeNewFileModal = closeNewFileModal;
  window.closeAllModals = closeAllModals;

  // Help modal handlers
  const helpBtn = document.getElementById('help-btn');
  const helpModal = document.getElementById('help-modal');
  const helpCloseBtn = document.getElementById('help-modal-close');
  
  if (helpBtn) {
    helpBtn.addEventListener('click', () => {
      helpModal.classList.remove('hidden');
    });
  }
  
  if (helpCloseBtn) {
    helpCloseBtn.addEventListener('click', () => {
      helpModal.classList.add('hidden');
    });
  }

  // Auth error handler
  window.handleGoogleAuthError = function (error) {
    if (error.needsAuth) {
      const banner = document.getElementById('google-auth-banner');
      const messageEl = document.getElementById('auth-banner-message');
      messageEl.textContent = 'Google authentication required. Please reconnect your account.';
      banner.classList.remove('hidden');
      // Disable tabs
      document.getElementById('calendar-tab-btn').disabled = true;
      document.getElementById('email-tab-btn').disabled = true;
      // Switch back to writer
      document.querySelector('.tab-btn[data-tab="writer"]').click();
    }
  };

  // Import file operations for window bindings
  import('./file-manager.js').then(({ saveBufferAsFile, deleteCurrentFile, renameCurrentFile, createNewFile }) => {
    window.saveBufferAsFile = saveBufferAsFile;
    window.deleteCurrentFile = deleteCurrentFile;
    window.renameCurrentFile = renameCurrentFile;
    window.createNewFile = createNewFile;
  });

  // Import agenda for window binding
  import('./agenda.js').then(({ addTodayAgendaFromCalendar }) => {
    window.addTodayAgendaFromCalendar = addTodayAgendaFromCalendar;
  });

  // Import conflict resolution for window binding
  import('./conflict-manager.js').then(({ resolveConflict }) => {
    window.resolveConflict = function (choice) {
      resolveConflict(choice, loadFile);
    };
  });

  // Popstate handler
  window.addEventListener('popstate', async () => {
    const tabFromUrl = getTabFromUrl() || getActiveTab();
    await setActiveTab(tabFromUrl, { updateUrl: false });

    const filePath = getFilePathFromUrl();
    const currentFile = getCurrentFile();
    if (filePath) {
      if (!currentFile || currentFile.path !== filePath) {
        await loadFile(filePath);
      }
    } else if (currentFile) {
      const { showEmptyState } = await import('./file-manager.js');
      showEmptyState();
      const pathEl = document.getElementById('current-file-path');
      if (pathEl) pathEl.textContent = '';
    }
  });

  // Reload document when tab regains focus (to sync remote changes)
  document.addEventListener('visibilitychange', async () => {
    const currentFile = getCurrentFile();
    if (document.visibilityState === 'visible' && currentFile && !getIsDirty()) {
      await loadFile(currentFile.path);
    }
  });
}

function closeFileMenuOnClickOutside(e) {
  const menu = document.getElementById('file-menu');
  const btn = document.getElementById('file-menu-btn');
  if (!menu.contains(e.target) && !btn.contains(e.target)) {
    menu.classList.add('hidden');
    document.removeEventListener('click', closeFileMenuOnClickOutside);
  }
}
