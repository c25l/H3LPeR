// Calendar Tab with Google Calendar Integration
import db from './db.js';

let selectedCalendars = [];
let allCalendars = [];
let currentView = 'month';
let currentDate = new Date();
let refreshInterval = null;
let isOffline = false;
let lastEvents = [];
let lastJournalEntries = [];

// Check online/offline status
window.addEventListener('online', () => {
  isOffline = false;
  console.log('Back online - refreshing calendar data');
  refreshAll();
});

window.addEventListener('offline', () => {
  isOffline = true;
  console.log('Offline - using cached calendar data');
  showCalendarMessage('Offline - showing cached data', 'info');
});

export async function initCalendarTab() {
  console.log('Initializing Calendar tab...');

  // Check if we're offline
  isOffline = !navigator.onLine;

  // Load calendars
  await loadCalendars();

  // Load tasks
  await loadTasks();

  // Render calendar view
  renderCalendarView();

  // Setup refresh button
  document.getElementById('refresh-calendar').addEventListener('click', async () => {
    await refreshAll();
  });

  // Setup auto-refresh every 6 hours (only when online)
  refreshInterval = setInterval(() => {
    if (!isOffline) {
      refreshAll();
    }
  }, 6 * 60 * 60 * 1000);
}

async function loadCalendars() {
  try {
    // Try to load from cache first
    const cached = await db.getCachedCalendarData('calendars');
    if (cached) {
      allCalendars = cached.data;
      selectedCalendars = allCalendars.filter(cal => cal.selected || cal.primary).map(cal => cal.id);
      renderCalendarList();
      
      // Show cache age if offline
      if (isOffline) {
        const age = Math.floor((Date.now() - cached.cachedAt) / (1000 * 60));
        showCalendarMessage(`Offline - showing calendars cached ${age} minutes ago`, 'info');
      }
    }

    // If online, fetch fresh data
    if (!isOffline) {
      const response = await fetch('/api/google/calendar/list');

      if (!response.ok) {
        if (response.status === 401) {
          const error = await response.json();
          window.handleGoogleAuthError(error);
          return;
        }
        throw new Error('Failed to load calendars');
      }

      allCalendars = await response.json();
      selectedCalendars = allCalendars.filter(cal => cal.selected || cal.primary).map(cal => cal.id);

      // Cache the fresh data
      await db.cacheCalendarData('calendars', allCalendars);
      
      renderCalendarList();
    } else if (!cached) {
      showCalendarError('No cached calendars available offline');
    }
  } catch (error) {
    console.error('Error loading calendars:', error);
    showCalendarError('Failed to load calendars');
  }
}

function renderCalendarList() {
  const container = document.getElementById('calendar-list');

  container.innerHTML = allCalendars.map(cal => `
    <label class="calendar-item">
      <input type="checkbox" 
             value="${cal.id}" 
             ${selectedCalendars.includes(cal.id) ? 'checked' : ''}
             onchange="toggleCalendar('${cal.id}')">
      <div class="calendar-color" style="background-color: ${cal.backgroundColor}"></div>
      <span class="calendar-name">${escapeHtml(cal.summary)}</span>
    </label>
  `).join('');
}

window.toggleCalendar = function(calendarId) {
  const index = selectedCalendars.indexOf(calendarId);
  if (index > -1) {
    selectedCalendars.splice(index, 1);
  } else {
    selectedCalendars.push(calendarId);
  }
  renderCalendarView();
};

async function renderCalendarView() {
  const container = document.getElementById('calendar-view');
  
  if (selectedCalendars.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h2>No Calendars Selected</h2>
        <p>Select one or more calendars from the sidebar to view events.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = '<div class="loading-spinner"></div>';

  try {
    // Calculate date range based on current view
    let start, end;
    if (currentView === 'month') {
      start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    } else if (currentView === 'week') {
      const dayOfWeek = currentDate.getDay();
      start = new Date(currentDate);
      start.setDate(currentDate.getDate() - dayOfWeek);
      end = new Date(start);
      end.setDate(start.getDate() + 6);
    } else if (currentView === 'day') {
      start = new Date(currentDate);
      start.setHours(0, 0, 0, 0);
      end = new Date(currentDate);
      end.setHours(23, 59, 59, 999);
    }

    // Create cache key based on view and date range
    const cacheKey = `events-${currentView}-${start.toISOString().split('T')[0]}-${selectedCalendars.join(',')}`;
    const journalCacheKey = `journal-${currentDate.getFullYear()}-${currentDate.getMonth() + 1}`;

    // Try to load from cache first
    const cached = await db.getCachedCalendarData(cacheKey);
    const cachedJournal = await db.getCachedCalendarData(journalCacheKey);
    let events = [];
    let journalEntries = [];
    
    if (cached) {
      events = cached.data;
      journalEntries = cachedJournal ? cachedJournal.data : [];
      lastEvents = events;
      lastJournalEntries = journalEntries;
      // Render cached data immediately
      renderMonthView(events, journalEntries);

      // Show cache age if offline
      if (isOffline) {
        const age = Math.floor((Date.now() - cached.cachedAt) / (1000 * 60));
        showCalendarMessage(`Offline - showing events cached ${age} minutes ago`, 'info');
      }
    }

    // If online, fetch fresh data
    if (!isOffline) {
      const [eventsResponse, journalResponse] = await Promise.all([
        fetch(`/api/google/calendar/events?` + new URLSearchParams({
          calendarIds: selectedCalendars.join(','),
          start: start.toISOString(),
          end: end.toISOString()
        })),
        fetch(`/api/journal/${currentDate.getFullYear()}/${currentDate.getMonth() + 1}`)
      ]);

      if (!eventsResponse.ok) {
        if (eventsResponse.status === 401) {
          const error = await eventsResponse.json();
          window.handleGoogleAuthError(error);
          return;
        }
        throw new Error('Failed to load events');
      }

      events = await eventsResponse.json();
      journalEntries = journalResponse.ok ? await journalResponse.json() : [];
      lastEvents = events;
      lastJournalEntries = journalEntries;

      // Cache the fresh data
      await Promise.all([
        db.cacheCalendarData(cacheKey, events),
        db.cacheCalendarData(journalCacheKey, journalEntries)
      ]);

      // Render fresh data
      renderMonthView(events, journalEntries);
    } else if (!cached) {
      container.innerHTML = `
        <div class="empty-state">
          <h2>No Cached Events</h2>
          <p>No cached events available for this view. Connect to the internet to load events.</p>
        </div>
      `;
    }
  } catch (error) {
    console.error('Error loading events:', error);
    container.innerHTML = `
      <div class="error-state">
        <h2>Error Loading Events</h2>
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
  }
}

function renderMonthView(events, journalEntries) {
  const container = document.getElementById('calendar-view');
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December'];

  const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startDayOfWeek = firstDay.getDay();

  // Group events by date
  const eventsByDate = {};
  events.forEach(event => {
    const dateKey = event.start.split('T')[0];
    if (!eventsByDate[dateKey]) {
      eventsByDate[dateKey] = [];
    }
    eventsByDate[dateKey].push(event);
  });

  // Group journal entries by date
  const journalByDate = {};
  journalEntries.forEach(entry => {
    journalByDate[entry.date] = entry;
  });

  let html = `
    <div class="calendar-month-header">
      <button class="btn btn-icon" onclick="navigatePrevious()">&lt;</button>
      <h2>${getViewTitle()}</h2>
      <button class="btn btn-icon" onclick="navigateNext()">&gt;</button>
      <div class="view-switcher">
        <button class="btn ${currentView === 'day' ? 'active' : ''}" onclick="switchView('day')">Day</button>
        <button class="btn ${currentView === 'week' ? 'active' : ''}" onclick="switchView('week')">Week</button>
        <button class="btn ${currentView === 'month' ? 'active' : ''}" onclick="switchView('month')">Month</button>
      </div>
    </div>
  `;

  if (currentView === 'month') {
    html += renderMonthGrid(events, journalEntries);
  } else if (currentView === 'week') {
    html += renderWeekGrid(events, journalEntries);
  } else {
    html += renderDayGrid(events, journalEntries);
  }

  container.innerHTML = html;
}

function getViewTitle() {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December'];
  
  if (currentView === 'month') {
    return `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
  } else if (currentView === 'week') {
    const weekStart = getWeekStart(currentDate);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    return `Week of ${monthNames[weekStart.getMonth()]} ${weekStart.getDate()}, ${weekStart.getFullYear()}`;
  } else {
    return `${monthNames[currentDate.getMonth()]} ${currentDate.getDate()}, ${currentDate.getFullYear()}`;
  }
}

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  return new Date(d.setDate(diff));
}

function renderMonthGrid(events, journalEntries) {
  const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startDayOfWeek = firstDay.getDay();

  // Group events by date
  const eventsByDate = {};
  events.forEach(event => {
    const dateKey = event.start.split('T')[0];
    if (!eventsByDate[dateKey]) {
      eventsByDate[dateKey] = [];
    }
    eventsByDate[dateKey].push(event);
  });

  // Group journal entries by date
  const journalByDate = {};
  journalEntries.forEach(entry => {
    journalByDate[entry.date] = entry;
  });

  let html = `
    <div class="calendar-month-grid">
      <div class="calendar-weekday">Sun</div>
      <div class="calendar-weekday">Mon</div>
      <div class="calendar-weekday">Tue</div>
      <div class="calendar-weekday">Wed</div>
      <div class="calendar-weekday">Thu</div>
      <div class="calendar-weekday">Fri</div>
      <div class="calendar-weekday">Sat</div>
  `;

  // Empty cells for days before month starts
  for (let i = 0; i < startDayOfWeek; i++) {
    html += '<div class="calendar-day-cell empty"></div>';
  }

  // Days of month
  const today = new Date();
  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayEvents = eventsByDate[dateKey] || [];
    const journalEntry = journalByDate[dateKey];
    const isToday = today.getFullYear() === currentDate.getFullYear() &&
                    today.getMonth() === currentDate.getMonth() &&
                    today.getDate() === day;

    html += `
      <div class="calendar-day-cell ${isToday ? 'today' : ''}" data-date="${dateKey}" onclick="viewDay('${dateKey}')">
        <div class="calendar-day-header">
          <div class="calendar-day-number">${day}</div>
          ${journalEntry ? '<a href="#" class="calendar-journal-link" onclick="event.stopPropagation(); openJournalFromCalendar(\'' + journalEntry.path + '\'); return false;" title="Open journal entry">📝</a>' : '<a href="#" class="calendar-journal-link create" onclick="event.stopPropagation(); createJournalEntry(\'' + dateKey + '\'); return false;" title="Create journal entry">➕</a>'}
        </div>
        <div class="calendar-day-events">
          ${dayEvents.slice(0, 3).map(event => {
            const calendar = allCalendars.find(c => c.id === event.calendarId);
            const color = calendar ? calendar.backgroundColor : '#569cd6';
            return `<div class="calendar-event" style="border-left: 3px solid ${color}" onclick="event.stopPropagation(); showEventDetail('${event.id}', '${event.calendarId}')" title="${escapeHtml(event.summary)}">
              ${escapeHtml(event.summary)}
            </div>`;
          }).join('')}
          ${dayEvents.length > 3 ? `<div class="calendar-event-more">+${dayEvents.length - 3} more</div>` : ''}
        </div>
      </div>
    `;
  }

  html += '</div>';
  return html;
}

function renderWeekGrid(events, journalEntries) {
  const weekStart = getWeekStart(currentDate);
  const eventsByDate = {};
  const journalByDate = {};
  
  events.forEach(event => {
    const dateKey = event.start.split('T')[0];
    if (!eventsByDate[dateKey]) eventsByDate[dateKey] = [];
    eventsByDate[dateKey].push(event);
  });

  journalEntries.forEach(entry => {
    journalByDate[entry.date] = entry;
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let html = '<div class="calendar-week-grid">';
  
  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart);
    day.setDate(day.getDate() + i);
    const dateKey = day.toISOString().split('T')[0];
    const dayEvents = eventsByDate[dateKey] || [];
    const journalEntry = journalByDate[dateKey];
    const isToday = day.getTime() === today.getTime();
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    html += `
      <div class="calendar-week-day ${isToday ? 'today' : ''}" onclick="viewDay('${dateKey}')">
        <div class="calendar-week-day-header">
          <div class="calendar-week-day-name">${dayNames[i]}</div>
          <div class="calendar-week-day-date">${day.getDate()}</div>
          ${journalEntry ? '<a href="#" class="calendar-journal-link" onclick="event.stopPropagation(); openJournalFromCalendar(\'' + journalEntry.path + '\'); return false;" title="Open journal entry">📝</a>' : '<a href="#" class="calendar-journal-link create" onclick="event.stopPropagation(); createJournalEntry(\'' + dateKey + '\'); return false;" title="Create journal entry">➕</a>'}
        </div>
        <div class="calendar-week-events">
          ${dayEvents.map(event => {
            const calendar = allCalendars.find(c => c.id === event.calendarId);
            const color = calendar ? calendar.backgroundColor : '#569cd6';
            const startTime = event.start.includes('T') ? new Date(event.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'All day';
            return `<div class="calendar-event" style="border-left: 3px solid ${color}" onclick="event.stopPropagation(); showEventDetail('${event.id}', '${event.calendarId}')" title="${escapeHtml(event.summary)}">
              <div class="event-time">${startTime}</div>
              <div class="event-title">${escapeHtml(event.summary)}</div>
            </div>`;
          }).join('')}
        </div>
      </div>
    `;
  }
  
  html += '</div>';
  return html;
}

function renderDayGrid(events, journalEntries) {
  const dateKey = currentDate.toISOString().split('T')[0];
  const eventsByDate = {};
  const journalByDate = {};
  
  events.forEach(event => {
    const key = event.start.split('T')[0];
    if (!eventsByDate[key]) eventsByDate[key] = [];
    eventsByDate[key].push(event);
  });

  journalEntries.forEach(entry => {
    journalByDate[entry.date] = entry;
  });

  const dayEvents = (eventsByDate[dateKey] || []).sort((a, b) => {
    return new Date(a.start) - new Date(b.start);
  });
  const journalEntry = journalByDate[dateKey];

  let html = `
    <div class="calendar-day-view">
      <div class="calendar-day-journal">
        ${journalEntry
          ? `<div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
              <button class="btn btn-primary" onclick="openJournalFromCalendar('${journalEntry.path}')">
                Open Journal Entry
              </button>
              <button class="btn btn-secondary" onclick="addAgendaFromCalendar('${dateKey}')">
                Add Agenda
              </button>
            </div>`
          : `<div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
              <button class="btn btn-primary" onclick="createJournalEntry('${dateKey}')">
                Create Journal Entry
              </button>
              ${dayEvents.length > 0 ? `<button class="btn btn-secondary" onclick="createJournalWithAgenda('${dateKey}')">
                Create with Agenda
              </button>` : ''}
            </div>`
        }
      </div>
      <div class="calendar-day-schedule">
        <h3>Events (${dayEvents.length})</h3>
  `;

  if (dayEvents.length === 0) {
    html += '<p class="empty-message">No events scheduled for this day</p>';
  } else {
    dayEvents.forEach(event => {
      const calendar = allCalendars.find(c => c.id === event.calendarId);
      const color = calendar ? calendar.backgroundColor : '#569cd6';
      const startTime = event.start.includes('T') 
        ? new Date(event.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        : 'All day';
      const endTime = event.end && event.end.includes('T')
        ? new Date(event.end).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        : '';

      html += `
        <div class="calendar-day-event" style="border-left: 4px solid ${color}" onclick="showEventDetail('${event.id}', '${event.calendarId}')">
          <div class="event-time-range">
            ${startTime}${endTime ? ' - ' + endTime : ''}
          </div>
          <div class="event-details">
            <div class="event-title">${escapeHtml(event.summary)}</div>
            ${event.description ? `<div class="event-description">${escapeHtml(event.description)}</div>` : ''}
            ${calendar ? `<div class="event-calendar">${escapeHtml(calendar.summary)}</div>` : ''}
          </div>
        </div>
      `;
    });
  }

  html += '</div></div>';
  return html;
}

window.switchView = function(view) {
  currentView = view;
  renderCalendarView();
};

window.viewDay = function(dateKey) {
  currentDate = new Date(dateKey + 'T00:00:00');
  currentView = 'day';
  renderCalendarView();
};

window.navigatePrevious = function() {
  if (currentView === 'month') {
    currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
  } else if (currentView === 'week') {
    currentDate = new Date(currentDate.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else {
    currentDate = new Date(currentDate.getTime() - 24 * 60 * 60 * 1000);
  }
  renderCalendarView();
};

window.navigateNext = function() {
  if (currentView === 'month') {
    currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
  } else if (currentView === 'week') {
    currentDate = new Date(currentDate.getTime() + 7 * 24 * 60 * 60 * 1000);
  } else {
    currentDate = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000);
  }
  renderCalendarView();
};

window.createJournalEntry = async function(dateKey) {
  // Create journal entry for the given date
  const date = new Date(dateKey + 'T00:00:00');
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const path = `Journal/Day/${year}-${month}-${day}.md`;
  
  // Switch to writer tab and create file
  document.querySelector('.tab-btn[data-tab="writer"]').click();
  setTimeout(() => {
    window.createNewFile(path, `# ${year}-${month}-${day}\n\n`);
  }, 100);
};

window.createJournalWithAgenda = async function(dateKey) {
  try {
    // Fetch events for this date
    const start = new Date(dateKey + 'T00:00:00');
    const end = new Date(dateKey + 'T23:59:59');
    let events = [];

    if (!isOffline && selectedCalendars.length > 0) {
      const response = await fetch(`/api/google/calendar/events?` + new URLSearchParams({
        calendarIds: selectedCalendars.join(','),
        start: start.toISOString(),
        end: end.toISOString()
      }));
      if (response.ok) {
        events = await response.json();
      }
    }

    const agendaEvents = filterAgendaEventsFromCalendar(events);

    // Create journal with agenda
    const response = await fetch(`/api/journal/${dateKey}/with-agenda`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: agendaEvents.map(e => ({
          summary: e.summary,
          start: e.start,
          end: e.end,
          location: e.location,
          allDay: e.allDay
        }))
      })
    });

    if (response.ok) {
      const entry = await response.json();
      document.querySelector('.tab-btn[data-tab="writer"]').click();
      setTimeout(() => window.openFile(entry.path), 100);
    }
  } catch (error) {
    console.error('Error creating journal with agenda:', error);
  }
};

window.addAgendaFromCalendar = async function(dateKey) {
  try {
    const events = getEventsForDate(dateKey);
    const agendaEvents = filterAgendaEventsFromCalendar(events);

    if (agendaEvents.length === 0) {
      console.warn('No agenda entries found for this day.');
      return;
    }

    const response = await fetch(`/api/journal/${dateKey}/add-agenda`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: agendaEvents.map(e => ({
          summary: e.summary,
          start: e.start,
          end: e.end,
          location: e.location,
          allDay: e.allDay
        }))
      })
    });

    if (response.ok) {
      const entry = await response.json();
      document.querySelector('.tab-btn[data-tab="writer"]').click();
      setTimeout(() => window.openFile(entry.path), 100);
    }
  } catch (error) {
    console.error('Error adding agenda from calendar:', error);
  }
};

window.previousMonth = function() {
  currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
  renderCalendarView();
};

window.nextMonth = function() {
  currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
  renderCalendarView();
};

window.openJournalFromCalendar = function(path) {
  // Switch to writer tab and open file
  document.querySelector('.tab-btn[data-tab="writer"]').click();
  setTimeout(() => {
    window.openFile(path);
  }, 100);
};

window.showEventDetail = async function(eventId, calendarId) {
  // TODO: Implement event detail modal
  console.log('Show event:', eventId, calendarId);
};

async function loadTasks() {
  try {
    const { initTasksPanel } = await import('./tasks-panel.js');
    await initTasksPanel();
  } catch (error) {
    console.error('Error loading tasks:', error);
  }
}

async function refreshAll() {
  const btn = document.getElementById('refresh-calendar');
  btn.disabled = true;
  btn.textContent = 'Refreshing...';

  await Promise.all([
    renderCalendarView(),
    loadTasks()
  ]);

  btn.disabled = false;
  btn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="23 4 23 10 17 10"></polyline>
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
    </svg>
    Refresh
  `;
}

function showCalendarError(message) {
  const container = document.getElementById('calendar-view');
  container.innerHTML = `
    <div class="empty-state">
      <h2>Error</h2>
      <p>${escapeHtml(message)}</p>
      <button class="btn btn-primary" onclick="location.reload()">Reload</button>
    </div>
  `;
}

function showCalendarMessage(message, type = 'info') {
  // Create or update message banner
  let banner = document.querySelector('.calendar-message-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.className = 'calendar-message-banner';
    const calendarView = document.getElementById('calendar-view');
    calendarView.parentNode.insertBefore(banner, calendarView);
  }
  
  banner.className = `calendar-message-banner ${type}`;
  banner.textContent = message;
  banner.style.display = 'block';
  
  // Auto-hide after 5 seconds for non-error messages
  if (type !== 'error') {
    setTimeout(() => {
      banner.style.display = 'none';
    }, 5000);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getEventsForDate(dateKey) {
  return (lastEvents || []).filter(event => {
    const eventDate = event.start ? event.start.split('T')[0] : '';
    return eventDate === dateKey;
  });
}

function filterAgendaEventsFromCalendar(events) {
  const normalized = events.map(event => {
    const summary = cleanAgendaSummary(event.summary || event.title || 'Untitled');
    const availability = getAgendaAvailability(event, summary);
    const start = event.start || null;
    const end = event.end || event.start || null;
    const startMs = start ? new Date(start).getTime() : NaN;
    const endMs = end ? new Date(end).getTime() : startMs;

    return {
      summary,
      start,
      end,
      location: event.location,
      allDay: !!event.allDay,
      availability,
      _startMs: startMs,
      _endMs: endMs
    };
  });

  const filtered = normalized.filter(event => !['free', 'tentative'].includes(event.availability));
  const meetingTimes = new Set(
    filtered
      .filter(event => event.summary.trim().toLowerCase() === 'meeting')
      .map(event => `${event._startMs}-${event._endMs}`)
  );

  return filtered
    .filter(event => !(event.availability === 'busy' && meetingTimes.has(`${event._startMs}-${event._endMs}`)))
    .sort((a, b) => a._startMs - b._startMs)
    .map(({ _startMs, _endMs, availability, ...rest }) => rest);
}

function getAgendaAvailability(event, summary) {
  if (event.availability) return String(event.availability).toLowerCase();

  if (event.transparency) {
    const transparency = String(event.transparency).toLowerCase();
    if (transparency === 'transparent') return 'free';
    if (transparency === 'opaque') return 'busy';
  }

  const text = `${summary || ''} ${event.description || ''}`;
  const match = text.match(/\b(Free|Busy|Tentative)\b/i);
  return match ? match[1].toLowerCase() : null;
}

function cleanAgendaSummary(text) {
  return String(text || 'Untitled')
    .replace(/\(\s*(Free|Busy|Tentative)\s*\)/gi, '')
    .replace(/\b(Free|Busy|Tentative)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[-–—]\s*/, '')
    .trim() || 'Untitled';
}

// Cleanup on tab switch
export function cleanupCalendarTab() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}
