const express = require('express');
const router = express.Router();
const GoogleCalendarService = require('../services/google-calendar');
const GoogleTasksService = require('../services/google-tasks');
const GmailService = require('../services/gmail');
const { AppError, asyncHandler } = require('../middleware/error-handler');
const logger = require('../logger');

// Middleware to check Google authentication
function requireGoogleAuth(req, res, next) {
  const googleAuth = req.app.locals.googleAuth;

  if (!googleAuth || !googleAuth.isAuthenticated()) {
    return res.status(401).json({ 
      error: 'Not authenticated with Google',
      needsAuth: true 
    });
  }

  try {
    req.googleClient = googleAuth.getClient();
    next();
  } catch (error) {
    return res.status(401).json({ 
      error: error.message,
      needsAuth: true 
    });
  }
}

// Get Google authentication status
router.get('/status', (req, res) => {
  const googleAuth = req.app.locals.googleAuth;

  res.json({
    authenticated: googleAuth.isAuthenticated(),
    hasCredentials: googleAuth.hasCredentials(),
    user: googleAuth.getUserInfo()
  });
});

// === CALENDAR ENDPOINTS ===

// List calendars
router.get('/calendar/list', requireGoogleAuth, async (req, res) => {
  try {
    const service = new GoogleCalendarService(req.googleClient);
    const calendars = await service.listCalendars();
    res.json(calendars);
  } catch (error) {
    console.error('Calendar list error:', error);
    res.status(error.code || 500).json({ error: error.message });
  }
});

// List events
router.get('/calendar/events', requireGoogleAuth, async (req, res) => {
  try {
    const { calendarIds, start, end, maxResults } = req.query;

    if (!calendarIds) {
      return res.status(400).json({ error: 'calendarIds required' });
    }

    const ids = Array.isArray(calendarIds) ? calendarIds : calendarIds.split(',');
    const startDate = start ? new Date(start) : new Date();
    const endDate = end ? new Date(end) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const service = new GoogleCalendarService(req.googleClient);
    const events = await service.listEvents(ids, startDate, endDate, parseInt(maxResults) || 250);
    res.json(events);
  } catch (error) {
    console.error('Calendar events error:', error);
    res.status(error.code || 500).json({ error: error.message });
  }
});

// Create event
router.post('/calendar/events', requireGoogleAuth, async (req, res) => {
  try {
    const { calendarId, ...eventData } = req.body;

    if (!calendarId) {
      return res.status(400).json({ error: 'calendarId required' });
    }

    const service = new GoogleCalendarService(req.googleClient);
    const event = await service.createEvent(calendarId, eventData);
    res.status(201).json(event);
  } catch (error) {
    console.error('Create event error:', error);
    res.status(error.code || 500).json({ error: error.message });
  }
});

// Update event
router.put('/calendar/events/:eventId', requireGoogleAuth, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { calendarId, ...eventData } = req.body;

    if (!calendarId) {
      return res.status(400).json({ error: 'calendarId required' });
    }

    const service = new GoogleCalendarService(req.googleClient);
    const event = await service.updateEvent(calendarId, eventId, eventData);
    res.json(event);
  } catch (error) {
    console.error('Update event error:', error);
    res.status(error.code || 500).json({ error: error.message });
  }
});

// Delete event
router.delete('/calendar/events/:eventId', requireGoogleAuth, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { calendarId } = req.query;

    if (!calendarId) {
      return res.status(400).json({ error: 'calendarId required' });
    }

    const service = new GoogleCalendarService(req.googleClient);
    await service.deleteEvent(calendarId, eventId);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete event error:', error);
    res.status(error.code || 500).json({ error: error.message });
  }
});

// === TASKS ENDPOINTS ===

// List task lists
router.get('/tasks/lists', requireGoogleAuth, async (req, res) => {
  try {
    const service = new GoogleTasksService(req.googleClient);
    const lists = await service.listTaskLists();
    res.json(lists);
  } catch (error) {
    console.error('Task lists error:', error);
    res.status(error.code || 500).json({ error: error.message });
  }
});

// Get all tasks
router.get('/tasks/all', requireGoogleAuth, async (req, res) => {
  try {
    const showCompleted = req.query.showCompleted === 'true';
    const service = new GoogleTasksService(req.googleClient);
    const tasks = await service.getAllTasks(showCompleted);
    res.json(tasks);
  } catch (error) {
    console.error('All tasks error:', error);
    res.status(error.code || 500).json({ error: error.message });
  }
});

// List tasks in a list
router.get('/tasks/:listId', requireGoogleAuth, async (req, res) => {
  try {
    const { listId } = req.params;
    const showCompleted = req.query.showCompleted === 'true';

    const service = new GoogleTasksService(req.googleClient);
    const tasks = await service.listTasks(listId, showCompleted);
    res.json(tasks);
  } catch (error) {
    console.error('List tasks error:', error);
    res.status(error.code || 500).json({ error: error.message });
  }
});

// Create task
router.post('/tasks/:listId', requireGoogleAuth, async (req, res) => {
  try {
    const { listId } = req.params;
    const taskData = req.body;

    const service = new GoogleTasksService(req.googleClient);
    const task = await service.createTask(listId, taskData);
    res.status(201).json(task);
  } catch (error) {
    console.error('Create task error:', error);
    res.status(error.code || 500).json({ error: error.message });
  }
});

// Update task
router.put('/tasks/:listId/:taskId', requireGoogleAuth, async (req, res) => {
  try {
    const { listId, taskId } = req.params;
    const taskData = req.body;

    const service = new GoogleTasksService(req.googleClient);
    const task = await service.updateTask(listId, taskId, taskData);
    res.json(task);
  } catch (error) {
    console.error('Update task error:', error);
    res.status(error.code || 500).json({ error: error.message });
  }
});

// Toggle task completion
router.post('/tasks/:listId/:taskId/toggle', requireGoogleAuth, async (req, res) => {
  try {
    const { listId, taskId } = req.params;

    const service = new GoogleTasksService(req.googleClient);
    const task = await service.toggleTask(listId, taskId);
    res.json(task);
  } catch (error) {
    console.error('Toggle task error:', error);
    res.status(error.code || 500).json({ error: error.message });
  }
});

// Delete task
router.delete('/tasks/:listId/:taskId', requireGoogleAuth, async (req, res) => {
  try {
    const { listId, taskId } = req.params;

    const service = new GoogleTasksService(req.googleClient);
    await service.deleteTask(listId, taskId);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(error.code || 500).json({ error: error.message });
  }
});

// === GMAIL ENDPOINTS ===

// Get unread count
router.get('/gmail/unread-count', requireGoogleAuth, async (req, res) => {
  try {
    const service = new GmailService(req.googleClient);
    const count = await service.getUnreadCount();
    res.json({ count });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(error.code || 500).json({ error: error.message });
  }
});

// List messages
router.get('/gmail/messages', requireGoogleAuth, async (req, res) => {
  try {
    const { query, maxResults, pageToken } = req.query;

    const service = new GmailService(req.googleClient);
    const result = await service.listMessages(
      query || '',
      parseInt(maxResults) || 50,
      pageToken
    );
    res.json(result);
  } catch (error) {
    console.error('List messages error:', error);
    res.status(error.code || 500).json({ error: error.message });
  }
});

// Get message
router.get('/gmail/messages/:messageId', requireGoogleAuth, async (req, res) => {
  try {
    const { messageId } = req.params;

    const service = new GmailService(req.googleClient);
    const message = await service.getMessage(messageId);
    res.json(message);
  } catch (error) {
    console.error('Get message error:', error);
    res.status(error.code || 500).json({ error: error.message });
  }
});

// Get thread
router.get('/gmail/threads/:threadId', requireGoogleAuth, async (req, res) => {
  try {
    const { threadId } = req.params;

    const service = new GmailService(req.googleClient);
    const thread = await service.getThread(threadId);
    res.json(thread);
  } catch (error) {
    console.error('Get thread error:', error);
    res.status(error.code || 500).json({ error: error.message });
  }
});

// Send message
router.post('/gmail/send', requireGoogleAuth, async (req, res) => {
  try {
    const { to, subject, body, cc, bcc } = req.body;

    if (!to || !subject || !body) {
      return res.status(400).json({ error: 'to, subject, and body required' });
    }

    const service = new GmailService(req.googleClient);
    const result = await service.sendMessage(to, subject, body, cc, bcc);
    res.json(result);
  } catch (error) {
    console.error('Send message error:', error);
    res.status(error.code || 500).json({ error: error.message });
  }
});

// Search messages
router.get('/gmail/search', requireGoogleAuth, async (req, res) => {
  try {
    const { q, maxResults } = req.query;

    if (!q) {
      return res.status(400).json({ error: 'search query (q) required' });
    }

    const service = new GmailService(req.googleClient);
    const result = await service.searchMessages(q, parseInt(maxResults) || 50);
    res.json(result);
  } catch (error) {
    console.error('Search messages error:', error);
    res.status(error.code || 500).json({ error: error.message });
  }
});

// Get messages by date range
router.get('/gmail/by-date', requireGoogleAuth, async (req, res) => {
  try {
    const { start, end, maxResults } = req.query;

    if (!start || !end) {
      return res.status(400).json({ error: 'start and end dates required' });
    }

    const startDate = new Date(start);
    const endDate = new Date(end);
    
    // Convert to Gmail query format (YYYY/MM/DD)
    const formatDate = (d) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}/${month}/${day}`;
    };

    // For single day, use "on" instead of after/before
    const isSameDay = startDate.toDateString() === endDate.toDateString();
    const query = isSameDay 
      ? `after:${formatDate(startDate)} before:${formatDate(new Date(endDate.getTime() + 86400000))}`
      : `after:${formatDate(startDate)} before:${formatDate(endDate)}`;
    
    console.log('Gmail date query:', query);
    
    const service = new GmailService(req.googleClient);
    const result = await service.searchMessages(query, parseInt(maxResults) || 100);
    res.json(result);
  } catch (error) {
    console.error('Get messages by date error:', error);
    res.status(error.code || 500).json({ error: error.message });
  }
});

// Get agenda entries from daily agenda email
router.get('/gmail/agenda', requireGoogleAuth, async (req, res) => {
  try {
    const { date, maxResults } = req.query;

    if (!date) {
      return res.status(400).json({ error: 'date query parameter required (YYYY-MM-DD)' });
    }

    const parts = date.split('-');
    if (parts.length !== 3) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    const dateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    if (isNaN(dateObj.getTime())) {
      return res.status(400).json({ error: 'Invalid date' });
    }

    const query = buildAgendaQuery(dateObj);
    const service = new GmailService(req.googleClient);
    const result = await service.searchMessages(query, parseInt(maxResults) || 10);

    if (!result.messages || result.messages.length === 0) {
      return res.json({ events: [], query, messageId: null });
    }

    for (const msg of result.messages) {
      const message = await service.getMessage(msg.id);
      const text = normalizeAgendaText(message.body || '');
      const events = filterAgendaEvents(parseAgendaEventsFromText(text, date));
      if (events.length > 0) {
        return res.json({ events, query, messageId: msg.id });
      }
    }

    res.json({ events: [], query, messageId: result.messages[0]?.id || null });
  } catch (error) {
    console.error('Gmail agenda error:', error);
    res.status(error.code || 500).json({ error: error.message });
  }
});

// List labels
router.get('/gmail/labels', requireGoogleAuth, async (req, res) => {
  try {
    const service = new GmailService(req.googleClient);
    const labels = await service.listLabels();
    res.json(labels);
  } catch (error) {
    console.error('List labels error:', error);
    res.status(error.code || 500).json({ error: error.message });
  }
});

// Mark as read
router.post('/gmail/messages/:messageId/read', requireGoogleAuth, async (req, res) => {
  try {
    const { messageId } = req.params;

    const service = new GmailService(req.googleClient);
    await service.markAsRead(messageId);
    res.json({ success: true });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(error.code || 500).json({ error: error.message });
  }
});

// Archive message
router.post('/gmail/messages/:messageId/archive', requireGoogleAuth, async (req, res) => {
  try {
    const { messageId } = req.params;

    const service = new GmailService(req.googleClient);
    const result = await service.archiveMessage(messageId);
    res.json(result);
  } catch (error) {
    console.error('Archive message error:', error);
    res.status(error.code || 500).json({ error: error.message });
  }
});

// Unarchive message
router.post('/gmail/messages/:messageId/unarchive', requireGoogleAuth, async (req, res) => {
  try {
    const { messageId } = req.params;

    const service = new GmailService(req.googleClient);
    const result = await service.unarchiveMessage(messageId);
    res.json(result);
  } catch (error) {
    console.error('Unarchive message error:', error);
    res.status(error.code || 500).json({ error: error.message });
  }
});

// Trash message
router.post('/gmail/messages/:messageId/trash', requireGoogleAuth, async (req, res) => {
  try {
    const { messageId } = req.params;

    const service = new GmailService(req.googleClient);
    const result = await service.trashMessage(messageId);
    res.json(result);
  } catch (error) {
    console.error('Trash message error:', error);
    res.status(error.code || 500).json({ error: error.message });
  }
});

// Untrash message
router.post('/gmail/messages/:messageId/untrash', requireGoogleAuth, async (req, res) => {
  try {
    const { messageId } = req.params;

    const service = new GmailService(req.googleClient);
    const result = await service.untrashMessage(messageId);
    res.json(result);
  } catch (error) {
    console.error('Untrash message error:', error);
    res.status(error.code || 500).json({ error: error.message });
  }
});

// Delete message permanently (kept for backwards compatibility but now uses trash)
router.delete('/gmail/messages/:messageId', requireGoogleAuth, async (req, res) => {
  try {
    const { messageId } = req.params;

    const service = new GmailService(req.googleClient);
    await service.trashMessage(messageId);
    res.json({ success: true });
  } catch (error) {
    console.error('Trash message error:', error);
    res.status(error.code || 500).json({ error: error.message });
  }
});

module.exports = router;

function buildAgendaQuery(dateObj) {
  const formatDate = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
  };

  const start = formatDate(dateObj);
  const endDate = new Date(dateObj.getTime() + 24 * 60 * 60 * 1000);
  const end = formatDate(endDate);
  return `subject:(Agenda) after:${start} before:${end}`;
}

function normalizeAgendaText(body) {
  let text = body || '';
  const hasHtml = /<[^>]+>/.test(text);

  if (hasHtml) {
    text = text
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\s*\/\s*(div|p|li|tr|h\d)\s*>/gi, '\n')
      .replace(/<\s*li\b[^>]*>/gi, '- ')
      .replace(/<[^>]*>/g, '');
  }

  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

function parseAgendaEventsFromText(text, dateStr) {
  const events = [];
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  const dateParts = dateStr.split('-');
  const baseDate = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));

  if (isNaN(baseDate.getTime())) {
    return events;
  }

  const timeRangeRegex = /^(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s*(?:-|–|to)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s*(.+)$/i;
  const timeSingleRegex = /^(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s+(.+)$/i;
  const allDayRegex = /^all\s*-?\s*day\s*(.*)$/i;

  for (const rawLine of lines) {
    const line = rawLine.replace(/^[-•]\s*/, '').trim();
    let match = line.match(allDayRegex);
    if (match) {
      const summary = cleanSummary(match[1] || '');
      events.push({
        summary,
        start: dateStr,
        end: dateStr,
        allDay: true,
        availability: extractAvailability(line),
        _startMs: new Date(`${dateStr}T00:00:00`).getTime(),
        _endMs: new Date(`${dateStr}T00:00:00`).getTime()
      });
      continue;
    }

    match = line.match(timeRangeRegex);
    if (match) {
      const startTime = parseTimeTo24(match[1]);
      const endTime = parseTimeTo24(match[2]);
      if (!startTime || !endTime) continue;
      const summary = cleanSummary(match[3]);
      const startStr = `${dateStr}T${String(startTime.hours).padStart(2, '0')}:${String(startTime.minutes).padStart(2, '0')}:00`;
      const endStr = `${dateStr}T${String(endTime.hours).padStart(2, '0')}:${String(endTime.minutes).padStart(2, '0')}:00`;
      events.push({
        summary,
        start: startStr,
        end: endStr,
        allDay: false,
        availability: extractAvailability(line),
        _startMs: new Date(startStr).getTime(),
        _endMs: new Date(endStr).getTime()
      });
      continue;
    }

    match = line.match(timeSingleRegex);
    if (match) {
      const startTime = parseTimeTo24(match[1]);
      if (!startTime) continue;
      const summary = cleanSummary(match[2]);
      const startStr = `${dateStr}T${String(startTime.hours).padStart(2, '0')}:${String(startTime.minutes).padStart(2, '0')}:00`;
      events.push({
        summary,
        start: startStr,
        end: startStr,
        allDay: false,
        availability: extractAvailability(line),
        _startMs: new Date(startStr).getTime(),
        _endMs: new Date(startStr).getTime()
      });
    }
  }

  return events;
}

function parseTimeTo24(timeText) {
  const match = timeText.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2] || '0', 10);
  const period = match[3].toLowerCase();

  if (period === 'pm' && hours < 12) hours += 12;
  if (period === 'am' && hours === 12) hours = 0;

  return { hours, minutes };
}

function extractAvailability(text) {
  const match = text.match(/\b(Free|Busy|Tentative)\b/i);
  return match ? match[1].toLowerCase() : null;
}

function cleanSummary(text) {
  const summary = text
    .replace(/\(\s*(Free|Busy|Tentative)\s*\)/gi, '')
    .replace(/\b(Free|Busy|Tentative)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[-–—]\s*/, '')
    .trim();

  return summary || 'Untitled';
}

function filterAgendaEvents(events) {
  const filtered = events.filter(event => !['free', 'tentative'].includes(event.availability));
  const meetingTimes = new Set(
    filtered
      .filter(event => event.summary?.trim().toLowerCase() === 'meeting')
      .map(event => `${event._startMs}-${event._endMs}`)
  );

  return filtered
    .filter(event => !(event.availability === 'busy' && meetingTimes.has(`${event._startMs}-${event._endMs}`)))
    .map(({ _startMs, _endMs, availability, ...rest }) => rest);
}
