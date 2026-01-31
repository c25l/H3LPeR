/**
 * Calendar event interface
 */
export interface CalendarEvent {
	summary?: string;
	title?: string;
	start?: string;
	end?: string;
	location?: string;
	allDay?: boolean;
	availability?: string;
	transparency?: string;
	description?: string;
}

/**
 * Normalized agenda event
 */
export interface AgendaEvent {
	summary: string;
	start: string | null;
	end: string | null;
	location?: string;
	allDay: boolean;
}

/**
 * Filter and normalize calendar events for agenda display
 * 
 * This function:
 * 1. Normalizes event data from various calendar sources
 * 2. Filters out free/tentative events
 * 3. Removes duplicate "meeting" events that share the same time slot
 * 4. Sorts events by start time
 */
export function filterAgendaEventsFromCalendar(events: CalendarEvent[]): AgendaEvent[] {
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

	// Filter out free and tentative events
	const filtered = normalized.filter(event => !['free', 'tentative'].includes(event.availability));
	
	// Find meeting times to avoid duplicates
	const meetingTimes = new Set(
		filtered
			.filter(event => event.summary.trim().toLowerCase() === 'meeting')
			.map(event => `${event._startMs}-${event._endMs}`)
	);

	// Remove duplicates and sort
	return filtered
		.filter(event => !(event.availability === 'busy' && meetingTimes.has(`${event._startMs}-${event._endMs}`)))
		.sort((a, b) => a._startMs - b._startMs)
		.map(({ _startMs, _endMs, availability, ...rest }) => rest);
}

/**
 * Get availability status from event data
 */
function getAgendaAvailability(event: CalendarEvent, summary: string): string {
	if (event.availability) return String(event.availability).toLowerCase();

	if (event.transparency) {
		const transparency = String(event.transparency).toLowerCase();
		if (transparency === 'transparent') return 'free';
		if (transparency === 'opaque') return 'busy';
	}

	const text = `${summary || ''} ${event.description || ''}`;
	const match = text.match(/\b(Free|Busy|Tentative)\b/i);
	return match ? match[1].toLowerCase() : 'busy';
}

/**
 * Clean up event summary text by removing availability markers
 */
function cleanAgendaSummary(text: string): string {
	return String(text || 'Untitled')
		.replace(/\(\s*(Free|Busy|Tentative)\s*\)/gi, '')
		.replace(/\b(Free|Busy|Tentative)\b/gi, '')
		.replace(/\s{2,}/g, ' ')
		.replace(/^[-–—]\s*/, '')
		.trim() || 'Untitled';
}

/**
 * Build markdown text for agenda section
 */
export function buildAgendaMarkdown(events: AgendaEvent[]): string {
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

/**
 * Insert or replace agenda section in journal content
 */
export function upsertAgendaInContent(content: string, agendaSection: string): string {
	if (!agendaSection) {
		return content;
	}

	// Try to replace existing agenda section
	const agendaRegex = /^## Agenda\s*\n[\s\S]*?(?=^##\s|\Z)/m;
	if (agendaRegex.test(content)) {
		return content.replace(agendaRegex, agendaSection.trimEnd() + '\n\n');
	}

	// Insert after first heading
	const headingMatch = content.match(/^# .*(?:\n+|\n\r+|\r+|\r\n+)/m);
	if (headingMatch && headingMatch.index !== undefined) {
		const insertAt = headingMatch.index + headingMatch[0].length;
		return content.slice(0, insertAt) + agendaSection + content.slice(insertAt);
	}

	// Prepend if no heading found
	return agendaSection + content;
}
