import { App, Modal, Setting } from 'obsidian';
import { CalendarEvent } from './agenda-utils';

/**
 * Modal for manually inputting calendar events
 */
export class CalendarEventModal extends Modal {
	private events: CalendarEvent[] = [];
	private onSubmit: (events: CalendarEvent[]) => void;

	constructor(app: App, onSubmit: (events: CalendarEvent[]) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: 'Add Calendar Events' });

		contentEl.createEl('p', { 
			text: 'Paste calendar events in JSON format or use the form below to add events one at a time.' 
		});

		// JSON input area
		const jsonContainer = contentEl.createDiv();
		new Setting(jsonContainer)
			.setName('Import from JSON')
			.setDesc('Paste events as JSON array')
			.addTextArea(text => {
				text.inputEl.rows = 10;
				text.inputEl.style.width = '100%';
				text.inputEl.style.fontFamily = 'monospace';
				text.setPlaceholder(`[
  {
    "summary": "Team Meeting",
    "start": "2024-01-31T10:00:00",
    "end": "2024-01-31T11:00:00",
    "location": "Conference Room A"
  }
]`);
				return text;
			});

		// Parse and submit button
		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText('Import Events')
				.setCta()
				.onClick(() => {
					try {
						const textarea = jsonContainer.querySelector('textarea');
						if (textarea && textarea.value) {
							const parsed = JSON.parse(textarea.value);
							if (Array.isArray(parsed)) {
								this.events = parsed;
								this.onSubmit(this.events);
								this.close();
							} else {
								throw new Error('Input must be an array of events');
							}
						}
					} catch (error) {
						console.error('Failed to parse events:', error);
						alert('Failed to parse JSON. Please check the format.');
					}
				}));

		// Manual entry form
		contentEl.createEl('hr');
		contentEl.createEl('h3', { text: 'Or add events manually:' });

		const formData = {
			summary: '',
			start: '',
			end: '',
			location: '',
			allDay: false
		};

		new Setting(contentEl)
			.setName('Event Title')
			.addText(text => text
				.setPlaceholder('Team Meeting')
				.onChange(value => formData.summary = value));

		new Setting(contentEl)
			.setName('Start Time')
			.setDesc('Format: YYYY-MM-DDTHH:MM:SS or YYYY-MM-DD for all-day')
			.addText(text => text
				.setPlaceholder('2024-01-31T10:00:00')
				.onChange(value => formData.start = value));

		new Setting(contentEl)
			.setName('End Time')
			.setDesc('Format: YYYY-MM-DDTHH:MM:SS or YYYY-MM-DD for all-day')
			.addText(text => text
				.setPlaceholder('2024-01-31T11:00:00')
				.onChange(value => formData.end = value));

		new Setting(contentEl)
			.setName('Location')
			.addText(text => text
				.setPlaceholder('Conference Room A')
				.onChange(value => formData.location = value));

		new Setting(contentEl)
			.setName('All Day Event')
			.addToggle(toggle => toggle
				.onChange(value => formData.allDay = value));

		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText('Add Event')
				.setCta()
				.onClick(() => {
					if (formData.summary && formData.start) {
						this.events.push({ ...formData });
						// Reset form
						formData.summary = '';
						formData.start = '';
						formData.end = '';
						formData.location = '';
						formData.allDay = false;
						// Show feedback
						alert(`Added "${formData.summary}". Add more or close to insert.`);
					} else {
						alert('Please provide at least a title and start time');
					}
				}))
			.addButton(btn => btn
				.setButtonText('Insert All Events')
				.onClick(() => {
					if (this.events.length > 0) {
						this.onSubmit(this.events);
						this.close();
					} else {
						alert('No events to insert');
					}
				}));
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
