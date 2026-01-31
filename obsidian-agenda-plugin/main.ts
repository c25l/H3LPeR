import { App, Editor, MarkdownView, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { filterAgendaEventsFromCalendar, buildAgendaMarkdown, upsertAgendaInContent, CalendarEvent } from './agenda-utils';
import { CalendarEventModal } from './calendar-modal';

interface CalendarAgendaSettings {
	journalFolder: string;
	dateFormat: string;
}

const DEFAULT_SETTINGS: CalendarAgendaSettings = {
	journalFolder: 'Journal',
	dateFormat: 'YYYY-MM-DD'
}

export default class CalendarAgendaPlugin extends Plugin {
	settings: CalendarAgendaSettings;

	async onload() {
		await this.loadSettings();

		// Command: Insert today's agenda from manual input
		this.addCommand({
			id: 'insert-agenda-manual',
			name: 'Insert agenda from manual input',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				new CalendarEventModal(this.app, (events) => {
					this.insertAgenda(editor, events);
				}).open();
			}
		});

		// Command: Insert agenda at cursor from clipboard JSON
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

		// Command: Update existing agenda in current note
		this.addCommand({
			id: 'update-agenda-manual',
			name: 'Update agenda in current note',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				new CalendarEventModal(this.app, (events) => {
					this.updateAgenda(editor, events);
				}).open();
			}
		});

		// Command: Create today's journal with agenda
		this.addCommand({
			id: 'create-journal-with-agenda',
			name: 'Create today\'s journal with agenda',
			callback: async () => {
				await this.createTodayJournal();
			}
		});

		// Add settings tab
		this.addSettingTab(new CalendarAgendaSettingTab(this.app, this));
	}

	onunload() {
		// Cleanup if needed
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * Insert agenda at cursor position
	 */
	private insertAgenda(editor: Editor, events: CalendarEvent[]) {
		const agendaEvents = filterAgendaEventsFromCalendar(events);
		
		if (agendaEvents.length === 0) {
			new Notice('No events to add to agenda');
			return;
		}

		const agendaText = buildAgendaMarkdown(agendaEvents);
		editor.replaceSelection(agendaText);
		new Notice(`Added ${agendaEvents.length} event(s) to agenda`);
	}

	/**
	 * Update agenda in the entire document
	 */
	private updateAgenda(editor: Editor, events: CalendarEvent[]) {
		const agendaEvents = filterAgendaEventsFromCalendar(events);
		
		if (agendaEvents.length === 0) {
			new Notice('No events to add to agenda');
			return;
		}

		const agendaSection = buildAgendaMarkdown(agendaEvents);
		const currentContent = editor.getValue();
		const updatedContent = upsertAgendaInContent(currentContent, agendaSection);
		
		editor.setValue(updatedContent);
		new Notice(`Updated agenda with ${agendaEvents.length} event(s)`);
	}

	/**
	 * Format date according to settings
	 */
	private formatDate(date: Date): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');

		return this.settings.dateFormat
			.replace('YYYY', String(year))
			.replace('MM', month)
			.replace('DD', day);
	}

	/**
	 * Get journal path for a date
	 */
	private getJournalPath(date: Date): string {
		const filename = this.formatDate(date) + '.md';
		return this.settings.journalFolder 
			? `${this.settings.journalFolder}/${filename}`
			: filename;
	}

	/**
	 * Create today's journal entry
	 */
	private async createTodayJournal() {
		const today = new Date();
		const journalPath = this.getJournalPath(today);

		try {
			// Check if file already exists
			const file = this.app.vault.getAbstractFileByPath(journalPath);
			
			if (file) {
				// Open existing file
				const leaf = this.app.workspace.getLeaf(false);
				await leaf.openFile(file as any);
				new Notice('Journal entry already exists. Opened existing file.');
				return;
			}

			// Create new journal with template
			const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' } as const;
			const formatted = today.toLocaleDateString('en-US', options);
			const template = `# ${formatted}\n\n## Agenda\n\n(Use "Insert agenda from manual input" or "Insert agenda from clipboard" command to add events)\n\n## Notes\n\n`;

			// Ensure folder exists
			const folderPath = this.settings.journalFolder;
			if (folderPath) {
				const folder = this.app.vault.getAbstractFileByPath(folderPath);
				if (!folder) {
					await this.app.vault.createFolder(folderPath);
				}
			}

			// Create file
			const newFile = await this.app.vault.create(journalPath, template);
			
			// Open the new file
			const leaf = this.app.workspace.getLeaf(false);
			await leaf.openFile(newFile);
			
			new Notice('Created today\'s journal entry');
		} catch (error) {
			console.error('Failed to create journal:', error);
			new Notice('Failed to create journal entry');
		}
	}
}

class CalendarAgendaSettingTab extends PluginSettingTab {
	plugin: CalendarAgendaPlugin;

	constructor(app: App, plugin: CalendarAgendaPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Calendar Agenda Settings'});

		new Setting(containerEl)
			.setName('Journal folder')
			.setDesc('Folder where journal entries are stored')
			.addText(text => text
				.setPlaceholder('Journal')
				.setValue(this.plugin.settings.journalFolder)
				.onChange(async (value) => {
					this.plugin.settings.journalFolder = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Date format')
			.setDesc('Format for journal filenames (use YYYY, MM, DD)')
			.addText(text => text
				.setPlaceholder('YYYY-MM-DD')
				.setValue(this.plugin.settings.dateFormat)
				.onChange(async (value) => {
					this.plugin.settings.dateFormat = value;
					await this.plugin.saveSettings();
				}));

		containerEl.createEl('h3', {text: 'Usage Instructions'});
		
		const instructions = containerEl.createEl('div');
		instructions.innerHTML = `
			<p><strong>To use this plugin:</strong></p>
			<ol>
				<li><strong>Manual Input:</strong> Use the "Insert agenda from manual input" command to open a modal where you can add events</li>
				<li><strong>From Clipboard:</strong> Copy calendar events as JSON to clipboard, then use "Insert agenda from clipboard" command</li>
				<li><strong>Update Existing:</strong> Use "Update agenda in current note" to replace the agenda section in the current note</li>
				<li><strong>Create Journal:</strong> Use "Create today's journal with agenda" to create a new daily note</li>
			</ol>
			<p><strong>JSON Format Example:</strong></p>
			<pre style="background: var(--background-primary-alt); padding: 10px; border-radius: 4px; overflow-x: auto;">
[
  {
    "summary": "Team Meeting",
    "start": "2024-01-31T10:00:00",
    "end": "2024-01-31T11:00:00",
    "location": "Conference Room A",
    "allDay": false
  },
  {
    "summary": "Lunch",
    "start": "2024-01-31",
    "end": "2024-01-31",
    "allDay": true
  }
]</pre>
			<p><strong>Integration with Calendar Apps:</strong></p>
			<p>To get events from Google Calendar, Apple Calendar, or other services, you can:</p>
			<ul>
				<li>Export events to JSON format from your calendar app</li>
				<li>Use calendar APIs to fetch events and copy them to clipboard</li>
				<li>Use other Obsidian plugins that sync with calendar services and export the data</li>
			</ul>
		`;
	}
}
