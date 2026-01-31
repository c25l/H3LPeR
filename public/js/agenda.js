import { insertTextAtCursor } from './editor.js';

export function filterAgendaEventsFromCalendar(events) {
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

function buildAgendaMarkdown(events) {
  const lines = ['## Agenda', ''];

  events.forEach(event => {
    let timeLabel = '';
    if (event.allDay) {
      timeLabel = 'All day';
    } else if (event.start) {
      const startDate = new Date(event.start);
      timeLabel = startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }

    const summaryText = event.summary?.trim().toLowerCase() === 'meeting'
      ? '#work'
      : (event.summary || 'Untitled');
    let line = `- **${timeLabel}** ${summaryText}`;
    if (event.location) {
      line += ` _(${event.location})_`;
    }
    lines.push(line);
  });

  lines.push('');
  return lines.join('\n');
}

export async function addTodayAgendaFromCalendar() {
  try {
    const today = new Date();
    const dateKey = today.toISOString().split('T')[0];

    const calendarResponse = await fetch('/api/google/calendar/list');
    if (!calendarResponse.ok) {
      if (calendarResponse.status === 401) {
        const error = await calendarResponse.json();
        window.handleGoogleAuthError(error);
        return;
      }
      throw new Error('Failed to load calendars');
    }

    const calendars = await calendarResponse.json();
    const selected = calendars.filter(cal => cal.selected || cal.primary).map(cal => cal.id);
    const calendarIds = selected.length > 0 ? selected : calendars.map(cal => cal.id);

    if (calendarIds.length === 0) {
      console.warn('No calendars available for agenda.');
      return;
    }

    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

    const eventsResponse = await fetch(`/api/google/calendar/events?` + new URLSearchParams({
      calendarIds: calendarIds.join(','),
      start: start.toISOString(),
      end: end.toISOString()
    }));

    if (!eventsResponse.ok) {
      if (eventsResponse.status === 401) {
        const error = await eventsResponse.json();
        window.handleGoogleAuthError(error);
        return;
      }
      throw new Error('Failed to load calendar events');
    }

    const events = await eventsResponse.json();
    const agendaEvents = filterAgendaEventsFromCalendar(events);

    if (agendaEvents.length === 0) {
      console.warn('No agenda entries found for today.');
      return;
    }

    const agendaText = buildAgendaMarkdown(agendaEvents);
    insertTextAtCursor(agendaText);
  } catch (error) {
    console.error('Error adding agenda from calendar:', error);
  }
}
