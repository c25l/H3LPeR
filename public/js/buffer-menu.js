// Buffer Menu - Emacs-style buffer switcher for quick access to special buffers and root files

let rootFiles = [];
let bufferMenuOpen = false;

// Initialize buffer menu
export function initBufferMenu() {
  // Load root files on init
  loadRootFiles();
  
  // Close buffer menu when clicking outside
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('buffer-menu');
    const btn = document.getElementById('buffer-menu-btn');
    if (!menu?.contains(e.target) && !btn?.contains(e.target)) {
      closeBufferMenu();
    }
  });
}

// Toggle buffer menu
export function toggleBufferMenu() {
  const menu = document.getElementById('buffer-menu');
  if (menu.classList.contains('hidden')) {
    openBufferMenu();
  } else {
    closeBufferMenu();
  }
}

// Open buffer menu
export function openBufferMenu() {
  const menu = document.getElementById('buffer-menu');
  menu.classList.remove('hidden');
  bufferMenuOpen = true;
  loadRootFiles(); // Refresh on open
}

// Close buffer menu
export function closeBufferMenu() {
  const menu = document.getElementById('buffer-menu');
  menu.classList.add('hidden');
  bufferMenuOpen = false;
}

// Load root files from vault
async function loadRootFiles() {
  const container = document.getElementById('buffer-menu-root-files');
  if (!container) return;

  container.innerHTML = '<div class="buffer-menu-loading">Loading...</div>';

  try {
    const response = await fetch('/api/files?folder=');
    if (!response.ok) throw new Error('Failed to fetch files');
    
    const files = await response.json();
    
    // Filter for root-level files only (no subdirectories)
    rootFiles = files.filter(f => {
      const path = f.path || f.name;
      return path && !path.includes('/') && path.endsWith('.md');
    });

    if (rootFiles.length === 0) {
      container.innerHTML = '<div class="buffer-menu-empty">No files in root</div>';
      return;
    }

    // Render root files
    container.innerHTML = rootFiles.map(file => {
      const fileName = file.name || file.path.split('/').pop();
      return `
        <div class="buffer-menu-item" onclick="openBufferFromMenu('${escapeAttr(file.path)}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
            <polyline points="13 2 13 9 20 9"></polyline>
          </svg>
          ${escapeHtml(fileName)}
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Error loading root files:', err);
    container.innerHTML = '<div class="buffer-menu-empty">Error loading files</div>';
  }
}

// Open special buffer (today, calendar, etc.)
export async function openSpecialBuffer(bufferType) {
  closeBufferMenu();
  
  if (bufferType === 'today') {
    await openTodayBuffer();
  } else if (bufferType === 'calendar') {
    await openCalendarBuffer();
  }
}

// Open today's journal note
async function openTodayBuffer() {
  try {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Create or get today's journal entry
    const response = await fetch(`/api/journal/${dateStr}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!response.ok) throw new Error('Failed to open today note');
    
    const entry = await response.json();
    
    // Open the file in editor
    if (entry.path && window.openFile) {
      await window.openFile(entry.path);
    }
  } catch (err) {
    console.error('Error opening today buffer:', err);
    alert('Failed to open today\'s note: ' + err.message);
  }
}

// Open calendar as a special buffer
async function openCalendarBuffer() {
  try {
    const bufferManager = window.getBufferManager ? window.getBufferManager() : null;
    if (!bufferManager) {
      console.error('Buffer manager not available');
      return;
    }

    // Create a special calendar buffer with read-only calendar content
    const calendarContent = await generateCalendarMarkdown();
    
    await bufferManager.openBuffer({
      id: 'special:calendar',
      content: calendarContent,
      meta: {
        title: 'Calendar View',
        isSpecial: true
      },
      policy: {
        readOnly: true,
        allowCreate: false,
        allowRename: false,
        allowDelete: false
      }
    });

    // Update UI
    document.getElementById('current-file-path').textContent = 'Calendar View';
    if (window.renderBufferTabs) window.renderBufferTabs();
  } catch (err) {
    console.error('Error opening calendar buffer:', err);
    alert('Failed to open calendar: ' + err.message);
  }
}

// Generate calendar markdown for display
async function generateCalendarMarkdown() {
  try {
    const response = await fetch('/api/google/calendar/events');
    if (!response.ok) {
      return '# Calendar\n\n*Calendar unavailable. Please connect your Google account.*';
    }

    const events = await response.json();
    
    let markdown = '# Calendar\n\n';
    
    if (events.length === 0) {
      markdown += '*No upcoming events*\n';
      return markdown;
    }

    // Group events by date
    const eventsByDate = {};
    events.forEach(event => {
      const dateStr = event.start ? new Date(event.start).toLocaleDateString() : 'No date';
      if (!eventsByDate[dateStr]) eventsByDate[dateStr] = [];
      eventsByDate[dateStr].push(event);
    });

    // Render events
    Object.keys(eventsByDate).sort().forEach(date => {
      markdown += `## ${date}\n\n`;
      eventsByDate[date].forEach(event => {
        const time = event.allDay ? 'All day' : 
          event.start ? new Date(event.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
        markdown += `- **${time}** ${event.summary || 'Untitled'}`;
        if (event.location) markdown += ` _(${event.location})_`;
        markdown += '\n';
      });
      markdown += '\n';
    });

    return markdown;
  } catch (err) {
    console.error('Error generating calendar markdown:', err);
    return '# Calendar\n\n*Error loading calendar events*\n';
  }
}

// Open buffer from menu (for root files)
export async function openBufferFromMenu(filePath) {
  closeBufferMenu();
  if (window.openFile) {
    await window.openFile(filePath);
  }
}

// Helper functions
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeAttr(text) {
  return text.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
