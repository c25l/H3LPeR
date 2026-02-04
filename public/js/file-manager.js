import { getContent } from './editor.js';
import { loadBacklinks } from './backlinks.js';
import db from './db.js';
import { showConflictWarning } from './conflict-manager.js';
import { escapeHtml, loadTags } from './search-manager.js';
import { getActiveTab, updateUrlState } from './tab-manager.js';

const DEFAULT_POLICY = {
  readOnly: false,
  allowCreate: true,
  allowRename: true,
  allowDelete: true,
  maxLength: null
};

const MAX_RECENT = 8;

let currentFile = null;
let isDirty = false;
let saveTimeout = null;
let dbInitialized = false;
let currentPolicy = null;
const policyCache = new Map();
let lastKnownModified = null; // Track server mtime for conflict detection

// References set during init
let bufferManagerRef = null;
let treeEditorRef = null;
let renderBufferTabsRef = null;

export function initFileManager({ getBufferManager, getTreeEditor, renderBufferTabs, getDbInitialized }) {
  bufferManagerRef = getBufferManager;
  treeEditorRef = getTreeEditor;
  renderBufferTabsRef = renderBufferTabs;
  dbInitialized = getDbInitialized();
}

export function setDbInitialized(val) {
  dbInitialized = val;
}

export function getCurrentFile() {
  return currentFile;
}

export function getIsDirty() {
  return isDirty;
}

export function getDefaultPolicy() {
  return DEFAULT_POLICY;
}

export function normalizePolicy(policy) {
  return { ...DEFAULT_POLICY, ...(policy || {}) };
}

export async function fetchPolicy(path, fallbackPolicy = null) {
  if (!path) return normalizePolicy(fallbackPolicy);
  if (policyCache.has(path)) return policyCache.get(path);

  if (fallbackPolicy) {
    const normalized = normalizePolicy(fallbackPolicy);
    policyCache.set(path, normalized);
    return normalized;
  }

  if (!navigator.onLine) {
    return normalizePolicy(fallbackPolicy);
  }

  try {
    const response = await fetch(`/api/policy?path=${encodeURIComponent(path)}`);
    if (!response.ok) throw new Error('Policy fetch failed');
    const policy = normalizePolicy(await response.json());
    policyCache.set(path, policy);
    return policy;
  } catch (err) {
    console.error('Policy fetch error:', err);
    return normalizePolicy(fallbackPolicy);
  }
}

function updateFileMenuPolicy(policy) {
  const renameItem = document.getElementById('file-menu-rename');
  const deleteItem = document.getElementById('file-menu-delete');

  if (renameItem) {
    renameItem.classList.toggle('disabled', policy.readOnly || policy.allowRename === false);
  }

  if (deleteItem) {
    deleteItem.classList.toggle('disabled', policy.readOnly || policy.allowDelete === false);
  }
}

export function applyBufferPolicy(policy) {
  currentPolicy = normalizePolicy(policy);
  updateFileMenuPolicy(currentPolicy);
}

// Update save status indicator
export function updateSaveStatus(text, className = '') {
  const status = document.getElementById('save-status');
  status.textContent = text;
  status.className = className;
}

// Recent files
export function getRecentFiles() {
  try {
    return JSON.parse(localStorage.getItem('writer-recent-files') || '[]');
  } catch { return []; }
}

export function addToRecentFiles(path) {
  let recent = getRecentFiles().filter(p => p !== path);
  recent.unshift(path);
  recent = recent.slice(0, MAX_RECENT);
  localStorage.setItem('writer-recent-files', JSON.stringify(recent));
  renderRecentFiles();
}

export function renderRecentFiles() {
  const container = document.getElementById('recent-files-list');
  if (!container) return;
  const recent = getRecentFiles();
  if (recent.length === 0) {
    container.innerHTML = '<div class="tags-empty">No recent files</div>';
    return;
  }
  container.innerHTML = recent.map(p => {
    const name = p.replace(/\.md$/, '').split('/').pop();
    return `<div class="recent-file-item" onclick="openFile('${p.replace(/'/g, "\\'")}')" title="${p}">
      <span class="recent-file-name">${name}</span>
    </div>`;
  }).join('');
}

// Buffer tabs
export function renderBufferTabs() {
  // Delegate to the unified tabs renderer if available
  if (renderBufferTabsRef) {
    renderBufferTabsRef();
    return;
  }
  
  // Fallback to old implementation (shouldn't be used anymore)
  const bufferManager = bufferManagerRef();
  const container = document.getElementById('buffer-tabs');
  if (!container || !bufferManager) return;

  const buffers = bufferManager.listBuffers();
  if (buffers.length === 0) {
    container.innerHTML = '';
    return;
  }

  const activeId = bufferManager.getActive()?.id;

  container.innerHTML = buffers.map(buffer => {
    const label = buffer.meta?.title || buffer.meta?.path || buffer.id;
    const dirtyMark = buffer.dirty ? '*' : '';
    return `
      <div class="buffer-tab ${buffer.id === activeId ? 'active' : ''}" data-id="${escapeHtml(buffer.id)}" title="${escapeHtml(label)}">
        <span class="buffer-label">${escapeHtml(label)}${dirtyMark}</span>
        <button class="buffer-close" title="Close">×</button>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.buffer-tab').forEach(tab => {
    tab.addEventListener('click', async () => {
      const id = tab.dataset.id;
      await switchToBuffer(id);
    });
  });

  container.querySelectorAll('.buffer-close').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.closest('.buffer-tab')?.dataset.id;
      if (id) {
        await closeBuffer(id);
      }
    });
  });
}

export async function switchToBuffer(id) {
  const bufferManager = bufferManagerRef();
  const treeEditor = treeEditorRef();
  if (!bufferManager) return;
  const buffer = bufferManager.getBuffer(id);
  if (!buffer) return;

  await bufferManager.setActive(id);

  if (buffer.meta?.path) {
    currentFile = {
      path: buffer.meta.path,
      content: buffer.content,
      hasConflict: buffer.meta.hasConflict || false,
      policy: buffer.policy || buffer.meta.policy
    };

    document.getElementById('current-file-path').textContent = buffer.meta.path;
    if (treeEditor) {
      treeEditor.setActivePath(buffer.meta.path);
    }
    loadBacklinks(buffer.meta.path);
    addToRecentFiles(buffer.meta.path);
    updateUrlState(getActiveTab(), { path: `/edit/${buffer.meta.path}` });
  } else {
    currentFile = null;
  }

  isDirty = Boolean(buffer.dirty);
  applyBufferPolicy(buffer.policy || buffer.meta?.policy || DEFAULT_POLICY);
  updateSaveStatus(isDirty ? 'Unsaved changes' : '');
  renderBufferTabs();
}

export async function closeBuffer(id) {
  const bufferManager = bufferManagerRef();
  if (!bufferManager) return;
  const buffer = bufferManager.getBuffer(id);
  if (!buffer) return;

  if (buffer.dirty) {
    const confirmed = confirm(`Close "${buffer.meta?.path || id}" with unsaved changes?`);
    if (!confirmed) return;
  }

  const wasActive = bufferManager.removeBuffer(id);

  if (wasActive) {
    const remaining = bufferManager.listBuffers();
    if (remaining.length > 0) {
      await switchToBuffer(remaining[remaining.length - 1].id);
    } else {
      currentFile = null;
      isDirty = false;
      showEmptyState();
      document.getElementById('current-file-path').textContent = '';
      updateUrlState(getActiveTab(), { path: '/' });
      applyBufferPolicy(DEFAULT_POLICY);
      updateSaveStatus('');
    }
  }

  renderBufferTabs();
}

export function showEmptyState() {
  const editor = document.getElementById('editor');
  editor.innerHTML = `
    <div class="empty-state">
      <h2>Welcome to H3LPeR</h2>
      <p>Select a file from the sidebar or create a new one to get started.</p>
      <div style="display: flex; gap: 1rem; margin-top: 1rem;">
        <button class="btn btn-secondary" onclick="document.getElementById('sidebar-new-file-btn').click()">Create New File</button>
      </div>
    </div>
  `;

  applyBufferPolicy(DEFAULT_POLICY);
}

// Load file content
export async function loadFile(path) {
  const bufferManager = bufferManagerRef();
  const treeEditor = treeEditorRef();

  try {
    let file;

    // Try IndexedDB first
    if (dbInitialized && db && db.db) {
      try {
        file = await db.getFile(path);
      } catch (err) {
        console.error('IndexedDB getFile error:', err);
        file = null;
      }

      // If not in IndexedDB or we're online, fetch from server
      if (!file || navigator.onLine) {
        try {
          const response = await fetch(`/api/files/${encodeURIComponent(path)}`);
          if (response.ok) {
            const serverFile = await response.json();
            // Save to IndexedDB
            try {
              await db.saveFile(path, serverFile.content, serverFile.modified || Date.now());
            } catch (err) {
              console.error('IndexedDB saveFile error:', err);
            }
            file = { path, content: serverFile.content, policy: serverFile.policy };
          }
        } catch (err) {
          // Offline or network error, use cached version
          if (!file) throw err;
        }
      }
    } else {
      // Fallback to server only
      const response = await fetch(`/api/files/${encodeURIComponent(path)}`);
      if (!response.ok) throw new Error('Failed to load file');
      file = await response.json();
    }

    if (!file) throw new Error('File not found');

    const policy = await fetchPolicy(path, file.policy);
    currentFile = {
      path,
      content: file.content,
      hasConflict: file.hasConflict,
      policy
    };

    // Track last known modification time for conflict detection
    lastKnownModified = file.modified || null;

    // Show conflict warning if present
    if (file.hasConflict) {
      showConflictWarning(path, file.content, file.serverContent);
    }

    // Update UI
    document.getElementById('current-file-path').textContent = path;

    // Update active file in tree
    if (treeEditor) {
      treeEditor.setActivePath(path);
    }

    // Initialize or update editor buffer
    if (bufferManager) {
      await bufferManager.openBuffer({
        id: path,
        content: file.content,
        meta: {
          path,
          title: path.split('/').pop(),
          hasConflict: file.hasConflict,
          policy
        },
        policy
      });
    }

    // Load backlinks
    loadBacklinks(path);

    isDirty = false;
    if (bufferManager && currentFile) {
      bufferManager.markClean(currentFile.path);
    }
    applyBufferPolicy(policy);
    renderBufferTabs();
    updateSaveStatus(navigator.onLine ? '' : 'Offline mode');
  } catch (err) {
    console.error('Error loading file:', err);
    updateSaveStatus('Error loading file', 'error');
  }
}

// Content change handler
export function onContentChange(content) {
  const bufferManager = bufferManagerRef();
  isDirty = true;
  updateSaveStatus('Unsaved changes');

  if (currentFile) {
    currentFile.content = content;
    if (bufferManager) {
      bufferManager.markDirty(currentFile.path);
    }
  }

  renderBufferTabs();

  // Debounced auto-save
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => saveFile(), 2000);
}

// Save file
export async function saveFile() {
  if (!currentFile || !isDirty) return true;
  const bufferManager = bufferManagerRef();

  const policy = normalizePolicy(currentFile.policy || currentPolicy);
  if (policy.readOnly) {
    updateSaveStatus('Read-only (save blocked)', 'error');
    return false;
  }

  const content = getContent();
  if (policy.maxLength != null && content.length > policy.maxLength) {
    updateSaveStatus(`Max length ${policy.maxLength} exceeded`, 'error');
    return false;
  }

  try {
    updateSaveStatus('Saving...', 'saving');

    // Save to IndexedDB immediately
    if (dbInitialized && db && db.db) {
      try {
        await db.saveFile(currentFile.path, content);

        // Try to sync to server if online
        if (navigator.onLine) {
          try {
            const saveBody = { content };
            if (lastKnownModified) {
              saveBody.lastModified = lastKnownModified;
            }
            const response = await fetch(`/api/files/${encodeURIComponent(currentFile.path)}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(saveBody)
            });

            if (response.ok) {
              const result = await response.json();
              lastKnownModified = result.modified || new Date().toISOString();
              await db.markFileAsSynced(currentFile.path, Date.now());
              updateSaveStatus('Saved', 'saved');
            } else if (response.status === 409) {
              // Conflict detected - server has a newer version
              const errorData = await response.json();
              const serverContent = errorData.details?.serverContent || '';
              showConflictWarning(currentFile.path, content, serverContent);
              updateSaveStatus('Conflict detected', 'error');
              return false;
            } else {
              // Server save failed, queue for later
              await db.addToSyncQueue('save', { path: currentFile.path, content });
              updateSaveStatus('Saved locally (will sync)', 'saved');
            }
          } catch (err) {
            // Network error, queue for later
            await db.addToSyncQueue('save', { path: currentFile.path, content });
            updateSaveStatus('Saved offline (will sync)', 'saved');
          }
        } else {
          // Offline, just confirm local save
          await db.addToSyncQueue('save', { path: currentFile.path, content });
          updateSaveStatus('Saved offline', 'saved');
        }

        // Update tags locally
        try {
          await db.updateTags();
          loadTags();
        } catch (err) {
          console.error('Tag update error:', err);
        }
      } catch (err) {
        console.error('IndexedDB save error:', err);
        // Fall through to server-only save
        throw err;
      }
    } else {
      // Fallback to server only
      const saveBody = { content };
      if (lastKnownModified) {
        saveBody.lastModified = lastKnownModified;
      }
      const response = await fetch(`/api/files/${encodeURIComponent(currentFile.path)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(saveBody)
      });

      if (response.status === 409) {
        const errorData = await response.json();
        const serverContent = errorData.details?.serverContent || '';
        showConflictWarning(currentFile.path, content, serverContent);
        updateSaveStatus('Conflict detected', 'error');
        return false;
      }
      if (!response.ok) throw new Error('Failed to save');

      const result = await response.json();
      lastKnownModified = result.modified || new Date().toISOString();
      updateSaveStatus('Saved', 'saved');
      loadTags();
    }

    isDirty = false;
    if (bufferManager && currentFile) {
      bufferManager.markClean(currentFile.path);
    }
    renderBufferTabs();

    // Clear status after a moment
    setTimeout(() => {
      if (!isDirty) updateSaveStatus('');
    }, 2000);
    return true;
  } catch (err) {
    console.error('Error saving file:', err);
    updateSaveStatus('Error saving', 'error');
    return false;
  }
}

// Open a file
export async function openFile(path) {
  const bufferManager = bufferManagerRef();
  const treeEditor = treeEditorRef();

  if (isDirty) {
    await saveFile();
  }

  if (bufferManager && bufferManager.getBuffer(path)) {
    await switchToBuffer(path);
    updateUrlState(getActiveTab(), { path: `/edit/${path}` });
    addToRecentFiles(path);
    return;
  }

  await loadFile(path);
  updateUrlState(getActiveTab(), { path: `/edit/${path}` });

  if (treeEditor) {
    treeEditor.setActivePath(path);
  }

  // Track in recent files
  addToRecentFiles(path);
}

// Save buffer as file
export async function saveBufferAsFile() {
  const bufferManager = bufferManagerRef();
  const treeEditor = treeEditorRef();
  if (!bufferManager) return;
  const active = bufferManager.getActive();
  if (!active) {
    alert('No buffer open.');
    return;
  }

  const content = getContent();
  const suggestedName = active.meta?.path || active.meta?.title?.replace(/[^a-zA-Z0-9_\-. ]/g, '_') || 'untitled';
  const defaultName = suggestedName.endsWith('.md') ? suggestedName : suggestedName + '.md';

  const name = prompt('Save as:', defaultName);
  if (!name) return;

  const finalName = name.endsWith('.md') ? name : name + '.md';

  try {
    const policy = await fetchPolicy(finalName);
    if (policy.readOnly || policy.allowCreate === false) {
      alert('Creation is restricted for this location.');
      return;
    }

    const response = await fetch('/api/tree/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: finalName,
        nodeType: 'file',
        content
      })
    });

    if (response.ok) {
      document.getElementById('file-menu').classList.add('hidden');

      // Close the old buffer if it was a virtual/read-only buffer
      if (active.policy?.readOnly || !active.meta?.path) {
        bufferManager.removeBuffer(active.id);
      }

      // Open the new file
      await openFile(finalName);
      if (treeEditor) {
        await treeEditor.refresh();
      }
    } else {
      const err = await response.json();
      if (response.status === 409) {
        // File exists - offer to overwrite
        const overwrite = confirm(`"${finalName}" already exists. Overwrite?`);
        if (!overwrite) return;
        const putResponse = await fetch(`/api/files/${encodeURIComponent(finalName)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content })
        });
        if (putResponse.ok) {
          document.getElementById('file-menu').classList.add('hidden');
          if (active.policy?.readOnly || !active.meta?.path) {
            bufferManager.removeBuffer(active.id);
          }
          await openFile(finalName);
          if (treeEditor) await treeEditor.refresh();
        } else {
          alert('Failed to save file');
        }
      } else {
        alert(err.error || 'Failed to create file');
      }
    }
  } catch (err) {
    console.error('Error saving buffer as file:', err);
    alert('Failed to save file');
  }
}

// Delete current file
export async function deleteCurrentFile() {
  const treeEditor = treeEditorRef();
  if (!currentFile) return;

  const policy = normalizePolicy(currentFile.policy || currentPolicy);
  if (policy.readOnly || policy.allowDelete === false) {
    alert('Deletion is restricted for this file.');
    return;
  }

  const confirmed = confirm(`Delete "${currentFile.path}"?\n\nThis cannot be undone.`);
  if (!confirmed) return;

  try {
    const response = await fetch('/api/tree/files', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: currentFile.path, nodeType: 'file', hardDelete: true })
    });

    if (response.ok) {
      currentFile = null;
      isDirty = false;
      document.getElementById('file-menu').classList.add('hidden');
      showEmptyState();
      document.getElementById('current-file-path').textContent = '';
      updateUrlState(getActiveTab(), { path: '/' });
      if (treeEditor) {
        await treeEditor.refresh();
      }
    } else {
      const err = await response.json();
      alert(err.error || 'Failed to delete file');
    }
  } catch (err) {
    console.error('Error deleting file:', err);
    alert('Failed to delete file');
  }
}

// Rename current file
export async function renameCurrentFile() {
  const treeEditor = treeEditorRef();
  if (!currentFile) return;

  const policy = normalizePolicy(currentFile.policy || currentPolicy);
  if (policy.readOnly || policy.allowRename === false) {
    alert('Renaming is restricted for this file.');
    return;
  }

  const newName = prompt('New filename:', currentFile.path);
  if (!newName || newName === currentFile.path) return;

  // Ensure .md extension
  const finalName = newName.endsWith('.md') ? newName : newName + '.md';

  try {
    // Read current content
    const content = getContent();

    // Save content to new path via rename API
    const renameResponse = await fetch('/api/tree/files', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: currentFile.path, to: finalName })
    });

    if (!renameResponse.ok) {
      const err = await renameResponse.json();
      alert(err.error || 'Failed to rename file');
      return;
    }

    // Ensure content is saved under new name
    await fetch(`/api/files/${encodeURIComponent(finalName)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });

    document.getElementById('file-menu').classList.add('hidden');
    currentFile.path = finalName;
    document.getElementById('current-file-path').textContent = finalName;
    updateUrlState(getActiveTab(), { path: `/edit/${finalName}` });
    if (treeEditor) {
      await treeEditor.refresh();
      treeEditor.setActivePath(finalName);
    }
  } catch (err) {
    console.error('Error renaming file:', err);
    alert('Failed to rename file');
  }
}

// Create new file
export async function createNewFile() {
  const treeEditor = treeEditorRef();
  const nameInput = document.getElementById('new-file-name');
  let name = nameInput.value.trim();

  if (!name) return;

  // Add .md extension if missing
  if (!name.endsWith('.md')) {
    name += '.md';
  }

  try {
    const policy = await fetchPolicy(name);
    if (policy.readOnly || policy.allowCreate === false) {
      alert('Creation is restricted for this location.');
      return;
    }

    const response = await fetch('/api/tree/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: name,
        nodeType: 'file',
        content: `# ${name.replace('.md', '')}\n\n`
      })
    });

    if (response.ok) {
      window.closeNewFileModal();
      await openFile(name);
      if (treeEditor) {
        await treeEditor.refresh();
      }
    } else {
      const err = await response.json();
      alert(err.error || 'Failed to create file');
    }
  } catch (err) {
    console.error('Error creating file:', err);
    alert('Failed to create file');
  }
}
