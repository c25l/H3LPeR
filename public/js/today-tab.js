// Today Dashboard Tab - Morning briefing combining calendar, tasks, journal, weather
import db from './db.js';

let todayData = null;
let weatherData = null;
let initialized = false;

const CACHE_KEY = 'today-dashboard';
const WEATHER_CACHE_KEY = 'today-weather';

export async function initTodayTab() {
  if (initialized) return;
  initialized = true;
  console.log('Initializing Today tab...');

  document.getElementById('refresh-today')?.addEventListener('click', () => {
    loadTodayData(true);
  });

  await loadTodayData();
}

async function loadTodayData(forceRefresh = false) {
  const container = document.getElementById('today-content');
  const greetingEl = document.getElementById('today-greeting');

  // Try cache first for instant render
  if (!forceRefresh && !todayData) {
    try {
      const cached = await db.getCachedCalendarData(CACHE_KEY);
      if (cached && cached.data) {
        todayData = cached.data;
        todayData._cachedAt = cached.cachedAt;
        renderDashboard();
      }
    } catch (e) { /* ignore cache errors */ }
  }

  if (!navigator.onLine && todayData) {
    // Already rendered from cache, just update the greeting
    if (greetingEl) greetingEl.textContent = getGreeting();
    return;
  }

  if (!todayData) {
    container.innerHTML = '<div class="loading-spinner"></div>';
  }

  try {
    // Fetch dashboard data and weather in parallel
    const [todayResponse, weatherResponse] = await Promise.allSettled([
      fetch('/api/google/today'),
      getUserLocationThenFetchWeather()
    ]);

    if (todayResponse.status === 'fulfilled' && todayResponse.value.ok) {
      todayData = await todayResponse.value.json();
      todayData._cachedAt = null;
      // Cache for offline
      try { await db.cacheCalendarData(CACHE_KEY, todayData); } catch (e) { /* ignore */ }
    } else if (todayResponse.status === 'fulfilled' && todayResponse.value.status === 401) {
      // Google not authed - build fallback data
      if (!todayData) {
        todayData = buildFallbackData();
      }
    }

    if (weatherResponse.status === 'fulfilled') {
      weatherData = weatherResponse.value;
      try { await db.cacheCalendarData(WEATHER_CACHE_KEY, weatherData); } catch (e) { /* ignore */ }
    } else {
      // Try weather cache
      try {
        const cached = await db.getCachedCalendarData(WEATHER_CACHE_KEY);
        if (cached) weatherData = cached.data;
      } catch (e) { /* ignore */ }
    }

    renderDashboard();
  } catch (error) {
    console.error('Today dashboard error:', error);
    if (!todayData) {
      container.innerHTML = `<div class="empty-state">
        <p>Unable to load dashboard</p>
        <button class="btn btn-primary" onclick="document.getElementById('refresh-today').click()">Retry</button>
      </div>`;
    }
  }
}

function buildFallbackData() {
  const now = new Date();
  const hour = now.getHours();
  let greeting;
  if (hour < 12) greeting = 'Good morning';
  else if (hour < 17) greeting = 'Good afternoon';
  else greeting = 'Good evening';

  return {
    date: now.toISOString().split('T')[0],
    greeting,
    events: [],
    tasks: [],
    journal: { exists: false, path: window.APP_DATA?.todayPath || '' },
    calendars: [],
    _noGoogle: true
  };
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

async function getUserLocationThenFetchWeather() {
  let lat, lon;

  // Check localStorage for stored location
  const stored = localStorage.getItem('weather-location');
  if (stored) {
    try {
      const loc = JSON.parse(stored);
      lat = loc.lat;
      lon = loc.lon;
    } catch (e) { /* ignore */ }
  }

  // Fallback to geolocation
  if (!lat && 'geolocation' in navigator) {
    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000, maximumAge: 3600000 });
      });
      lat = pos.coords.latitude;
      lon = pos.coords.longitude;
    } catch (e) { /* ignore */ }
  }

  // Default location
  if (!lat) { lat = 40.7128; lon = -74.0060; }

  const response = await fetch(`/api/helper/weather/local?lat=${lat}&lon=${lon}`);
  if (!response.ok) throw new Error('Weather fetch failed');
  return await response.json();
}

function renderDashboard() {
  const container = document.getElementById('today-content');
  const greetingEl = document.getElementById('today-greeting');

  if (!todayData) {
    container.innerHTML = '<div class="empty-state"><p>No data available</p></div>';
    return;
  }

  if (greetingEl) {
    greetingEl.textContent = todayData.greeting || getGreeting();
  }

  const dateStr = formatFullDate(todayData.date);
  const events = todayData.events || [];
  const tasks = todayData.tasks || [];
  const journal = todayData.journal || {};

  let html = '<div class="today-dashboard">';

  // Header with date
  html += `<div class="today-header">
    <div class="today-date">${escapeHtml(dateStr)}</div>
    ${todayData._cachedAt ? `<div class="today-cache-notice">Cached ${formatTimeAgo(todayData._cachedAt)}</div>` : ''}
    ${todayData._noGoogle ? '<div class="today-cache-notice">Google not connected &mdash; <a href="/google-setup">Set up</a></div>' : ''}
  </div>`;

  // Top row: Weather + Journal
  html += '<div class="today-top-row">';

  // Weather card
  html += renderWeatherCard();

  // Journal card
  html += renderJournalCard(journal, events);

  html += '</div>'; // end top-row

  // Schedule
  html += renderScheduleCard(events);

  // Tasks
  html += renderTasksCard(tasks);

  html += '</div>'; // end today-dashboard

  container.innerHTML = html;
}

function renderWeatherCard() {
  if (!weatherData) {
    return `<div class="today-card today-weather">
      <h3>Weather</h3>
      <div class="empty-state">Weather data unavailable</div>
    </div>`;
  }

  const current = weatherData.current || weatherData;
  const temp = current.temperature_2m ?? current.temperature ?? '--';
  const unit = current.temperature_unit || '\u00B0F';
  const weatherCode = current.weather_code ?? current.weathercode ?? 0;
  const windSpeed = current.wind_speed_10m ?? current.windspeed ?? '--';
  const humidity = current.relative_humidity_2m ?? current.humidity ?? '--';
  const desc = getWeatherDescription(weatherCode);

  return `<div class="today-card today-weather">
    <h3>Weather</h3>
    <div class="today-weather-summary">
      <div class="today-weather-icon">${getWeatherIcon(weatherCode)}</div>
      <div>
        <div class="today-weather-temp">${Math.round(temp)}${unit}</div>
        <div class="today-weather-desc">${desc}</div>
      </div>
    </div>
    <div class="today-weather-details">
      <span>Wind: ${windSpeed} km/h</span>
      <span>Humidity: ${humidity}%</span>
    </div>
  </div>`;
}

function renderJournalCard(journal, events) {
  const todayDate = todayData.date;

  if (journal.exists) {
    return `<div class="today-card today-journal">
      <h3>Journal</h3>
      <p>Today's entry is ready</p>
      <div class="today-journal-actions">
        <button class="btn btn-primary" onclick="openTodayJournal('${escapeAttr(journal.path)}')">Open Journal</button>
        <button class="btn btn-secondary" onclick="addTodayAgendaFromCalendar()">Add Agenda</button>
      </div>
    </div>`;
  }

  return `<div class="today-card today-journal">
    <h3>Journal</h3>
    <p>No entry for today yet</p>
    <div class="today-journal-actions">
      <button class="btn btn-primary" onclick="openTodayJournal()">Create Entry</button>
      ${events.length > 0 ? `<button class="btn btn-secondary" onclick="createTodayJournalWithAgenda()">With Agenda</button>` : ''}
      <button class="btn btn-secondary" onclick="addTodayAgendaFromCalendar()">Add Agenda</button>
    </div>
  </div>`;
}

function renderScheduleCard(events) {
  if (events.length === 0) {
    return `<div class="today-card today-schedule">
      <h3>Schedule</h3>
      <div class="empty-state">No events today</div>
    </div>`;
  }

  // Sort: all-day first, then by start time
  const sorted = [...events].sort((a, b) => {
    if (a.allDay && !b.allDay) return -1;
    if (!a.allDay && b.allDay) return 1;
    return new Date(a.start) - new Date(b.start);
  });

  let html = `<div class="today-card today-schedule"><h3>Schedule</h3>`;

  for (const event of sorted) {
    const time = event.allDay ? 'All day' :
      new Date(event.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const color = event.backgroundColor || '#569cd6';

    html += `<div class="today-event-item">
      <div class="today-event-color" style="background-color: ${color}"></div>
      <div class="today-event-time">${escapeHtml(time)}</div>
      <div class="today-event-details">
        <div class="today-event-title">${escapeHtml(event.summary || 'Untitled')}</div>
        ${event.location ? `<div class="today-event-location">${escapeHtml(event.location)}</div>` : ''}
      </div>
    </div>`;
  }

  html += '</div>';
  return html;
}

function renderTasksCard(taskLists) {
  // Flatten all task lists into one section with list headers
  const allTasks = [];
  for (const list of taskLists) {
    if (list.tasks && list.tasks.length > 0) {
      for (const task of list.tasks) {
        if (task.status !== 'completed') {
          allTasks.push({ ...task, listTitle: list.listTitle, listId: list.listId });
        }
      }
    }
  }

  if (allTasks.length === 0) {
    return `<div class="today-card today-tasks">
      <h3>Tasks</h3>
      <div class="empty-state">No pending tasks</div>
    </div>`;
  }

  let html = `<div class="today-card today-tasks"><h3>Tasks</h3>`;

  for (const task of allTasks) {
    const checked = task.status === 'completed' ? 'checked' : '';
    html += `<div class="today-task-item">
      <input type="checkbox" ${checked} onchange="toggleTodayTask('${escapeAttr(task.listId)}', '${escapeAttr(task.id)}')">
      <div class="today-task-content">
        <span class="today-task-title">${escapeHtml(task.title || 'Untitled')}</span>
        ${task.due ? `<span class="today-task-due">${formatDueDate(task.due)}</span>` : ''}
      </div>
    </div>`;
  }

  html += '</div>';
  return html;
}

// --- Global handlers ---

window.openTodayJournal = async function(path) {
  if (path) {
    // Switch to writer tab and open the file
    document.querySelector('.tab-btn[data-tab="writer"]').click();
    setTimeout(() => window.openFile(path), 100);
  } else {
    // Create entry and open
    document.querySelector('.tab-btn[data-tab="writer"]').click();
    setTimeout(() => window.openToday(), 100);
  }
};

window.createTodayJournalWithAgenda = async function() {
  if (!todayData) return;
  try {
    const events = (todayData.events || []).map(e => ({
      summary: e.summary,
      start: e.start,
      end: e.end,
      location: e.location,
      allDay: e.allDay
    }));

    const response = await fetch(`/api/journal/${todayData.date}/with-agenda`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events })
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

window.addTodayAgendaFromCalendar = async function() {
  if (!todayData) return;

  try {
    const events = filterAgendaEventsFromCalendar(todayData.events || []);

    if (events.length === 0) {
      console.warn('No agenda entries found for today.');
      return;
    }

    const response = await fetch(`/api/journal/${todayData.date}/add-agenda`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events })
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

window.toggleTodayTask = async function(listId, taskId) {
  try {
    await fetch(`/api/google/tasks/${listId}/${taskId}/toggle`, { method: 'POST' });
    // Refresh after a brief delay
    setTimeout(() => loadTodayData(true), 500);
  } catch (error) {
    console.error('Error toggling task:', error);
  }
};

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

// --- Utility functions ---

function formatFullDate(dateStr) {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function formatTimeAgo(timestamp) {
  const mins = Math.floor((Date.now() - timestamp) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatDueDate(dateStr) {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(date);
  due.setHours(0, 0, 0, 0);
  const diff = Math.floor((due - today) / 86400000);

  if (diff < 0) return 'Overdue';
  if (diff === 0) return 'Due today';
  if (diff === 1) return 'Due tomorrow';
  return `Due ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

function getWeatherDescription(code) {
  const descriptions = {
    0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Foggy', 48: 'Rime fog',
    51: 'Light drizzle', 53: 'Drizzle', 55: 'Dense drizzle',
    61: 'Slight rain', 63: 'Rain', 65: 'Heavy rain',
    71: 'Slight snow', 73: 'Snow', 75: 'Heavy snow',
    77: 'Snow grains', 80: 'Slight showers', 81: 'Showers', 82: 'Violent showers',
    85: 'Slight snow showers', 86: 'Snow showers',
    95: 'Thunderstorm', 96: 'Thunderstorm w/ hail', 99: 'Thunderstorm w/ heavy hail'
  };
  return descriptions[code] || 'Unknown';
}

function getWeatherIcon(code) {
  if (code === 0) return '\u2600\uFE0F';
  if (code <= 2) return '\u26C5';
  if (code === 3) return '\u2601\uFE0F';
  if (code <= 48) return '\uD83C\uDF2B\uFE0F';
  if (code <= 55) return '\uD83C\uDF26\uFE0F';
  if (code <= 65) return '\uD83C\uDF27\uFE0F';
  if (code <= 77) return '\u2744\uFE0F';
  if (code <= 82) return '\uD83C\uDF27\uFE0F';
  if (code <= 86) return '\uD83C\uDF28\uFE0F';
  return '\u26C8\uFE0F';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/'/g, '&#39;')
    .replace(/"/g, '&quot;');
}
