import { Editor, MarkdownView, Notice, Plugin } from 'obsidian';
import { filterAgendaEventsFromCalendar, buildAgendaMarkdown, CalendarEvent } from './agenda-utils';

export default class CalendarAgendaPlugin extends Plugin {
	async onload() {
		// Command: Insert agenda from clipboard JSON (read-only)
		this.addCommand({
			id: 'insert-agenda-clipboard',
			name: 'Insert agenda from clipboard (JSON)',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				try {
					const clipboardText = await navigator.clipboard.readText();
					const events = JSON.parse(clipboardText);
					
					if (!Array.isArray(events)) {
						new Notice('Clipboard content must be a JSON array of events');
						return;
					}
					
					this.insertAgenda(editor, events);
				} catch (error) {
					console.error('Failed to parse clipboard:', error);
					new Notice('Failed to parse clipboard content as JSON');
				}
			}
		});
	}

	onunload() {
		// Cleanup if needed
	}

	/**
	 * Insert agenda at cursor position (read-only display)
	 */
	private insertAgenda(editor: Editor, events: CalendarEvent[]) {
		const agendaEvents = filterAgendaEventsFromCalendar(events);
		
		if (agendaEvents.length === 0) {
			new Notice('No events to display');
			return;
		}

		const agendaText = buildAgendaMarkdown(agendaEvents);
		editor.replaceSelection(agendaText);
		new Notice(`Displayed ${agendaEvents.length} event(s)`);
	}
}
