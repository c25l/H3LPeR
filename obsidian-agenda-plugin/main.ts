import { App, Editor, MarkdownView, Notice, Plugin, PluginSettingTab, Setting, requestUrl } from 'obsidian';
import { filterAgendaEventsFromCalendar, buildAgendaMarkdown, CalendarEvent } from './agenda-utils';

interface CalendarAgendaSettings {
	googleClientId: string;
	googleApiKey: string;
	accessToken: string;
	tokenExpiry: number;
}

const DEFAULT_SETTINGS: CalendarAgendaSettings = {
	googleClientId: '',
	googleApiKey: '',
	accessToken: '',
	tokenExpiry: 0
}

export default class CalendarAgendaPlugin extends Plugin {
	settings: CalendarAgendaSettings;

	async onload() {
		await this.loadSettings();

		// Command: Fetch and insert today's agenda from Google Calendar
		this.addCommand({
			id: 'insert-agenda-google',
			name: 'Insert today\'s agenda from Google Calendar',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				await this.fetchAndInsertAgenda(editor);
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
	 * Check if Google is authenticated
	 */
	isAuthenticated(): boolean {
		return !!(this.settings.accessToken && this.settings.tokenExpiry > Date.now());
	}

	/**
	 * Authenticate with Google using OAuth 2.0 implicit flow
	 */
	async authenticateGoogle() {
		if (!this.settings.googleClientId) {
			new Notice('Please configure Google Client ID in settings');
			return;
		}

		const redirectUri = 'https://localhost';
		const scope = 'https://www.googleapis.com/auth/calendar.readonly';
		const state = Math.random().toString(36).substring(7);

		const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
			`client_id=${encodeURIComponent(this.settings.googleClientId)}&` +
			`redirect_uri=${encodeURIComponent(redirectUri)}&` +
			`response_type=token&` +
			`scope=${encodeURIComponent(scope)}&` +
			`state=${state}`;

		new Notice('Opening Google authentication...');
		window.open(authUrl, '_blank');
		
		new Notice('After authorizing, paste the access token from the URL into settings');
	}

	/**
	 * Fetch events from Google Calendar and insert agenda
	 */
	async fetchAndInsertAgenda(editor: Editor) {
		if (!this.isAuthenticated()) {
			new Notice('Please authenticate with Google Calendar first');
			await this.authenticateGoogle();
			return;
		}

		try {
			new Notice('Fetching calendar events...');

			// Get today's date range
			const today = new Date();
			const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
			const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

			// Fetch events from Google Calendar API
			const response = await requestUrl({
				url: `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
					`timeMin=${start.toISOString()}&` +
					`timeMax=${end.toISOString()}&` +
					`singleEvents=true&` +
					`orderBy=startTime`,
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${this.settings.accessToken}`,
					'Accept': 'application/json'
				}
			});

			if (response.status !== 200) {
				throw new Error(`Failed to fetch events: ${response.status}`);
			}

			const data = response.json;
			const events = (data.items || []).map((event: any) => ({
				summary: event.summary || 'Untitled',
				start: event.start.dateTime || event.start.date,
				end: event.end.dateTime || event.end.date,
				location: event.location,
				allDay: !event.start.dateTime,
				transparency: event.transparency
			}));

			this.insertAgenda(editor, events);
		} catch (error) {
			console.error('Failed to fetch calendar events:', error);
			if (error.message?.includes('401')) {
				new Notice('Authentication expired. Please re-authenticate in settings.');
				this.settings.accessToken = '';
				this.settings.tokenExpiry = 0;
				await this.saveSettings();
			} else {
				new Notice('Failed to fetch calendar events. Check console for details.');
			}
		}
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

		// Instructions
		containerEl.createEl('p', {
			text: 'To use Google Calendar, you need to set up OAuth credentials:'
		});

		const steps = containerEl.createEl('ol');
		steps.createEl('li', {text: 'Go to Google Cloud Console'});
		steps.createEl('li', {text: 'Create a project and enable Google Calendar API'});
		steps.createEl('li', {text: 'Create OAuth 2.0 credentials (Web application)'});
		steps.createEl('li', {text: 'Add https://localhost as authorized redirect URI'});
		steps.createEl('li', {text: 'Copy Client ID below'});

		// Google Client ID
		new Setting(containerEl)
			.setName('Google Client ID')
			.setDesc('OAuth 2.0 Client ID from Google Cloud Console')
			.addText(text => text
				.setPlaceholder('Enter your client ID')
				.setValue(this.plugin.settings.googleClientId)
				.onChange(async (value) => {
					this.plugin.settings.googleClientId = value;
					await this.plugin.saveSettings();
				}));

		// Authentication status
		const authStatus = containerEl.createDiv();
		authStatus.addClass('setting-item-description');
		if (this.plugin.isAuthenticated()) {
			authStatus.setText('✓ Authenticated with Google Calendar');
			authStatus.style.color = 'green';
		} else {
			authStatus.setText('✗ Not authenticated');
			authStatus.style.color = 'red';
		}

		// Authenticate button
		new Setting(containerEl)
			.setName('Authenticate')
			.setDesc('Sign in with Google Calendar')
			.addButton(button => button
				.setButtonText('Authenticate with Google')
				.onClick(async () => {
					await this.plugin.authenticateGoogle();
				}));

		// Manual token entry (for completing OAuth flow)
		new Setting(containerEl)
			.setName('Access Token (from OAuth redirect)')
			.setDesc('After authenticating, paste the access_token from the redirect URL')
			.addText(text => {
				text
					.setPlaceholder('Paste access token here')
					.setValue('')
					.onChange(async (value) => {
						if (value && value.length > 20) {
							this.plugin.settings.accessToken = value;
							// Access tokens typically expire in 1 hour
							this.plugin.settings.tokenExpiry = Date.now() + (3600 * 1000);
							await this.plugin.saveSettings();
							new Notice('Access token saved!');
							this.display(); // Refresh display
						}
					});
				text.inputEl.style.width = '100%';
			});

		// Clear authentication
		new Setting(containerEl)
			.setName('Clear authentication')
			.setDesc('Remove stored access token')
			.addButton(button => button
				.setButtonText('Clear')
				.setWarning()
				.onClick(async () => {
					this.plugin.settings.accessToken = '';
					this.plugin.settings.tokenExpiry = 0;
					await this.plugin.saveSettings();
					new Notice('Authentication cleared');
					this.display(); // Refresh display
				}));
	}
}
