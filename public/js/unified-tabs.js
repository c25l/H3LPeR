// Unified Tab System - All tabs (special buffers + file buffers) in one place

const SPECIAL_TABS = [
  { id: 'calendar', label: 'Calendar', type: 'special', closeable: false },
  { id: 'today', label: 'Today', type: 'special', closeable: false },
  { id: 'files', label: 'Files', type: 'special', closeable: false },
  { id: 'weather', label: 'Weather', type: 'special', closeable: false },
  { id: 'news', label: 'News', type: 'special', closeable: false },
  { id: 'research', label: 'Research', type: 'special', closeable: false }
];

let activeTabId = 'files';
let bufferManagerRef = null;
let renderCallback = null;

// Initialize unified tabs
export function initUnifiedTabs({ getBufferManager, onRender }) {
  bufferManagerRef = getBufferManager;
  renderCallback = onRender;
}

// Render all tabs (special + document buffers)
export function renderUnifiedTabs() {
  const container = document.getElementById('buffer-tabs');
  if (!container) return;

  const bufferManager = bufferManagerRef ? bufferManagerRef() : null;
  const documentBuffers = bufferManager ? bufferManager.listBuffers() : [];

  // Combine special tabs with document buffers
  const allTabs = [
    ...SPECIAL_TABS.map(tab => ({
      ...tab,
      active: activeTabId === tab.id
    })),
    ...documentBuffers.map(buffer => ({
      id: buffer.id,
      label: buffer.meta?.title || buffer.meta?.path || buffer.id,
      type: 'document',
      closeable: true,
      dirty: buffer.dirty,
      active: bufferManager && bufferManager.getActive()?.id === buffer.id
    }))
  ];

  container.innerHTML = allTabs.map(tab => {
    const dirtyMark = tab.dirty ? '*' : '';
    const closeBtn = tab.closeable ? '<button class="buffer-close" title="Close">×</button>' : '';
    
    return `
      <div class="buffer-tab ${tab.active ? 'active' : ''}" data-id="${escapeHtml(tab.id)}" data-type="${tab.type}" title="${escapeHtml(tab.label)}">
        <span class="buffer-label">${escapeHtml(tab.label)}${dirtyMark}</span>
        ${closeBtn}
      </div>
    `;
  }).join('');

  // Add click handlers
  container.querySelectorAll('.buffer-tab').forEach(tab => {
    tab.addEventListener('click', async (e) => {
      // Don't trigger if clicking close button
      if (e.target.classList.contains('buffer-close')) return;
      
      const id = tab.dataset.id;
      const type = tab.dataset.type;
      
      if (type === 'special') {
        await switchToSpecialTab(id);
      } else {
        await switchToDocumentBuffer(id);
      }
    });
  });

  // Add close button handlers
  container.querySelectorAll('.buffer-close').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const tab = btn.closest('.buffer-tab');
      if (tab) {
        const id = tab.dataset.id;
        const type = tab.dataset.type;
        
        if (type === 'document') {
          await closeDocumentBuffer(id);
        }
      }
    });
  });
}

// Switch to special tab (Calendar, Today, Weather, etc.)
async function switchToSpecialTab(tabId) {
  activeTabId = tabId;
  
  // Hide editor area, show special content
  const editorContainer = document.querySelector('.editor-container');
  const backlinksPanel = document.getElementById('backlinks-panel');
  const specialContainers = [
    'calendar-content-container',
    'weather-content-container',
    'news-content-container',
    'research-content-container'
  ];
  
  // Hide editor and backlinks
  if (editorContainer) editorContainer.style.display = 'none';
  if (backlinksPanel) backlinksPanel.style.display = 'none';
  
  // Hide all special containers first
  specialContainers.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
  
  // Handle special tab actions
  if (tabId === 'today') {
    // Open today's journal entry as a document buffer
    await openTodayNote();
    return;
  } else if (tabId === 'files') {
    // Just show the editor empty state
    if (editorContainer) editorContainer.style.display = 'block';
    if (backlinksPanel) backlinksPanel.style.display = 'block';
    document.getElementById('current-file-path').textContent = 'Select a file';
  } else if (tabId === 'calendar') {
    const container = document.getElementById('calendar-content-container');
    if (container) {
      container.classList.remove('hidden');
      // Initialize calendar tab
      import('./calendar-tab.js').then(({ initCalendarTab }) => {
        initCalendarTab().catch(err => console.error('Calendar init error:', err));
      });
    }
  } else if (tabId === 'weather') {
    const container = document.getElementById('weather-content-container');
    if (container) {
      container.classList.remove('hidden');
      // Initialize weather tab
      import('./weather-tab.js').then(({ initWeatherTab }) => {
        initWeatherTab().catch(err => console.error('Weather init error:', err));
      });
    }
  } else if (tabId === 'news') {
    const container = document.getElementById('news-content-container');
    if (container) {
      container.classList.remove('hidden');
      // Initialize news tab
      import('./news-tab.js').then(({ initNewsTab }) => {
        initNewsTab().catch(err => console.error('News init error:', err));
      });
    }
  } else if (tabId === 'research') {
    const container = document.getElementById('research-content-container');
    if (container) {
      container.classList.remove('hidden');
      // Initialize research tab
      import('./research-tab.js').then(({ initResearchTab }) => {
        initResearchTab().catch(err => console.error('Research init error:', err));
      });
    }
  }
  
  renderUnifiedTabs();
}

// Switch to document buffer
async function switchToDocumentBuffer(bufferId) {
  const bufferManager = bufferManagerRef ? bufferManagerRef() : null;
  if (!bufferManager) return;
  
  // Show editor area, hide special content
  const editorContainer = document.querySelector('.editor-container');
  const backlinksPanel = document.getElementById('backlinks-panel');
  const specialContainers = [
    'calendar-content-container',
    'weather-content-container',
    'news-content-container',
    'research-content-container'
  ];
  
  // Show editor and backlinks
  if (editorContainer) editorContainer.style.display = 'block';
  if (backlinksPanel) backlinksPanel.style.display = 'block';
  
  // Hide all special containers
  specialContainers.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
  
  // Switch buffer
  if (window.switchToBuffer) {
    await window.switchToBuffer(bufferId);
  }
  
  activeTabId = null; // Document buffers don't have special tab IDs
  renderUnifiedTabs();
}

// Close document buffer
async function closeDocumentBuffer(bufferId) {
  if (window.closeBuffer) {
    await window.closeBuffer(bufferId);
  }
  renderUnifiedTabs();
}

// Open today's note
async function openTodayNote() {
  try {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    
    const response = await fetch(`/api/journal/${dateStr}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!response.ok) throw new Error('Failed to open today note');
    
    const entry = await response.json();
    
    if (entry.path && window.openFile) {
      await window.openFile(entry.path);
      activeTabId = null; // Now showing document buffer
      renderUnifiedTabs();
    }
  } catch (err) {
    console.error('Error opening today note:', err);
    alert('Failed to open today\'s note: ' + err.message);
  }
}

// Get active tab ID
export function getActiveTabId() {
  return activeTabId;
}

// Set active tab (called from external code)
export function setActiveTabId(tabId) {
  activeTabId = tabId;
  renderUnifiedTabs();
}

// Helper functions
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
