import { App, Editor, MarkdownView, Notice, Plugin, PluginSettingTab, Setting, requestUrl } from 'obsidian';
import { filterAgendaEventsFromCalendar, buildAgendaMarkdown, CalendarEvent } from './agenda-utils';
import * as http from 'http';

interface CalendarAgendaSettings {
	googleClientId: string;
	googleClientSecret: string;
	refreshToken: string;
	accessToken: string;
	tokenExpiry: number;
}

const DEFAULT_SETTINGS: CalendarAgendaSettings = {
	googleClientId: '',
	googleClientSecret: '',
	refreshToken: '',
	accessToken: '',
	tokenExpiry: 0
}

// OAuth configuration
const OAUTH_PORT = 42813;
const REDIRECT_URI = `http://localhost:${OAUTH_PORT}/callback`;
const OAUTH_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const OAUTH_SERVER_CLEANUP_DELAY_MS = 1000; // Delay before closing server after successful auth

export default class CalendarAgendaPlugin extends Plugin {
	settings: CalendarAgendaSettings;
	private oauthServer: http.Server | null = null;
	private fetchRetryCount = 0;
	private readonly MAX_FETCH_RETRIES = 1;

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

	async onunload() {
		// Close OAuth server if running
		if (this.oauthServer) {
			this.oauthServer.close();
		}
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
		// Check if we have a valid access token or refresh token
		return !!(
			(this.settings.accessToken && this.settings.tokenExpiry > Date.now()) ||
			this.settings.refreshToken
		);
	}

	/**
	 * Refresh access token using refresh token
	 */
	async refreshAccessToken(): Promise<boolean> {
		if (!this.settings.refreshToken) {
			return false;
		}

		try {
			const response = await requestUrl({
				url: 'https://oauth2.googleapis.com/token',
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded'
				},
				body: new URLSearchParams({
					client_id: this.settings.googleClientId,
					client_secret: this.settings.googleClientSecret,
					refresh_token: this.settings.refreshToken,
					grant_type: 'refresh_token'
				}).toString()
			});

			if (response.status === 200) {
				const data = response.json;
				this.settings.accessToken = data.access_token;
				this.settings.tokenExpiry = Date.now() + (data.expires_in * 1000);
				await this.saveSettings();
				return true;
			}
		} catch (error) {
			console.error('Failed to refresh access token:', error);
		}

		return false;
	}

	/**
	 * Start local OAuth server and authenticate with Google
	 */
	async authenticateGoogle(): Promise<void> {
		if (!this.settings.googleClientId || !this.settings.googleClientSecret) {
			new Notice('Please configure Google Client ID and Secret in settings');
			return;
		}

		// Close any existing server to prevent multiple instances
		if (this.oauthServer) {
			this.oauthServer.close();
			this.oauthServer = null;
		}

		// Generate random state for CSRF protection
		const state = Math.random().toString(36).substring(7);

		// Create authorization URL
		const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
			`client_id=${encodeURIComponent(this.settings.googleClientId)}&` +
			`redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
			`response_type=code&` +
			`scope=${encodeURIComponent(OAUTH_SCOPE)}&` +
			`access_type=offline&` +
			`prompt=consent&` +
			`state=${state}`;

		new Notice('Starting OAuth server...');

		// Start local server to receive callback
		return new Promise((resolve, reject) => {
			this.oauthServer = http.createServer(async (req, res) => {
				try {
					const url = new URL(req.url || '', `http://localhost:${OAUTH_PORT}`);
					
					if (url.pathname === '/callback') {
						const code = url.searchParams.get('code');
						const returnedState = url.searchParams.get('state');
						
						if (!code) {
							res.writeHead(400, { 'Content-Type': 'text/html' });
							res.end('<html><body><h1>Error: No authorization code received</h1></body></html>');
							this.oauthServer?.close();
							reject(new Error('No authorization code'));
							return;
						}

						if (returnedState !== state) {
							res.writeHead(400, { 'Content-Type': 'text/html' });
							res.end('<html><body><h1>Error: Invalid state (CSRF protection)</h1></body></html>');
							this.oauthServer?.close();
							reject(new Error('Invalid state'));
							return;
						}

						// Exchange code for tokens
						try {
							const tokenResponse = await requestUrl({
								url: 'https://oauth2.googleapis.com/token',
								method: 'POST',
								headers: {
									'Content-Type': 'application/x-www-form-urlencoded'
								},
								body: new URLSearchParams({
									client_id: this.settings.googleClientId,
									client_secret: this.settings.googleClientSecret,
									code: code,
									grant_type: 'authorization_code',
									redirect_uri: REDIRECT_URI
								}).toString()
							});

							if (tokenResponse.status === 200) {
								const data = tokenResponse.json;
								
								// Save tokens
								// Note: Google only returns refresh_token on first authorization or with prompt=consent
								// Preserve existing refresh token if not provided in response
								this.settings.accessToken = data.access_token;
								this.settings.refreshToken = data.refresh_token || this.settings.refreshToken;
								this.settings.tokenExpiry = Date.now() + (data.expires_in * 1000);
								await this.saveSettings();

								// Send success response
								res.writeHead(200, { 'Content-Type': 'text/html' });
								res.end('<html><body><h1>✓ Authentication successful!</h1><p>You can close this window and return to Obsidian.</p></body></html>');
								
								new Notice('✓ Google Calendar authenticated successfully!');
								
								// Close server after a short delay to ensure response is sent
								setTimeout(() => {
									this.oauthServer?.close();
									this.oauthServer = null;
								}, OAUTH_SERVER_CLEANUP_DELAY_MS);
								
								resolve();
							} else {
								throw new Error('Failed to exchange code for tokens');
							}
						} catch (error) {
							console.error('Token exchange error:', error);
							res.writeHead(500, { 'Content-Type': 'text/html' });
							res.end('<html><body><h1>Error: Failed to exchange authorization code</h1></body></html>');
							this.oauthServer?.close();
							reject(error);
						}
					} else {
						res.writeHead(404, { 'Content-Type': 'text/plain' });
						res.end('Not found');
					}
				} catch (error) {
					console.error('OAuth server error:', error);
					res.writeHead(500, { 'Content-Type': 'text/plain' });
					res.end('Internal server error');
					this.oauthServer?.close();
					reject(error);
				}
			});

			this.oauthServer.listen(OAUTH_PORT, () => {
				new Notice(`OAuth server listening on port ${OAUTH_PORT}`);
				// Open browser to authorization URL
				window.open(authUrl, '_blank');
			});

			this.oauthServer.on('error', (error: any) => {
				if (error.code === 'EADDRINUSE') {
					new Notice(`Port ${OAUTH_PORT} is already in use. Please close any other instances of the plugin or applications using this port.`);
				} else {
					new Notice('Failed to start OAuth server. Check console for details.');
				}
				console.error('Server error:', error);
				reject(error);
			});
		});
	}

	/**
	 * Fetch events from Google Calendar and insert agenda
	 */
	async fetchAndInsertAgenda(editor: Editor) {
		// Check if authenticated, try to refresh token if expired
		if (!this.isAuthenticated()) {
			new Notice('Please authenticate with Google Calendar first');
			this.fetchRetryCount = 0; // Reset retry count
			await this.authenticateGoogle();
			return;
		}

		// If access token expired but we have refresh token, refresh it
		if (this.settings.tokenExpiry <= Date.now() && this.settings.refreshToken) {
			new Notice('Refreshing access token...');
			const refreshed = await this.refreshAccessToken();
			if (!refreshed) {
				new Notice('Failed to refresh token. Please re-authenticate.');
				this.fetchRetryCount = 0; // Reset retry count
				await this.authenticateGoogle();
				return;
			}
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

			this.fetchRetryCount = 0; // Reset on success
			this.insertAgenda(editor, events);
		} catch (error) {
			console.error('Failed to fetch calendar events:', error);
			if (error.message?.includes('401') && this.fetchRetryCount < this.MAX_FETCH_RETRIES) {
				this.fetchRetryCount++;
				new Notice('Authentication expired. Refreshing...');
				const refreshed = await this.refreshAccessToken();
				if (refreshed) {
					// Retry the fetch once
					return this.fetchAndInsertAgenda(editor);
				} else {
					this.fetchRetryCount = 0;
					new Notice('Please re-authenticate in settings.');
				}
			} else {
				this.fetchRetryCount = 0;
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
		steps.createEl('li', {text: 'Create OAuth 2.0 credentials (Desktop app or Web application)'});
		steps.createEl('li', {text: `Add http://localhost:${OAUTH_PORT}/callback as authorized redirect URI`});
		steps.createEl('li', {text: 'Copy Client ID and Client Secret below'});

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

		// Google Client Secret
		new Setting(containerEl)
			.setName('Google Client Secret')
			.setDesc('OAuth 2.0 Client Secret from Google Cloud Console')
			.addText(text => {
				text.setPlaceholder('Enter your client secret')
					.setValue(this.plugin.settings.googleClientSecret)
					.onChange(async (value) => {
						this.plugin.settings.googleClientSecret = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.type = 'password';
			});

		// Authentication status
		const authStatus = containerEl.createDiv();
		authStatus.addClass('setting-item-description');
		if (this.plugin.isAuthenticated()) {
			authStatus.setText('✓ Authenticated with Google Calendar');
			authStatus.style.color = 'var(--text-success)';
		} else {
			authStatus.setText('✗ Not authenticated');
			authStatus.style.color = 'var(--text-error)';
		}

		// Authenticate button
		new Setting(containerEl)
			.setName('Authenticate')
			.setDesc('Sign in with Google Calendar. This will open a browser window.')
			.addButton(button => button
				.setButtonText('Authenticate with Google')
				.setCta()
				.onClick(async () => {
					try {
						await this.plugin.authenticateGoogle();
						this.display(); // Refresh display
					} catch (error) {
						new Notice('Authentication failed. Check console for details.');
						console.error('Auth error:', error);
					}
				}));

		// Clear authentication
		if (this.plugin.isAuthenticated()) {
			new Setting(containerEl)
				.setName('Clear authentication')
				.setDesc('Remove stored tokens and sign out')
				.addButton(button => button
					.setButtonText('Sign Out')
					.setWarning()
					.onClick(async () => {
						this.plugin.settings.accessToken = '';
						this.plugin.settings.refreshToken = '';
						this.plugin.settings.tokenExpiry = 0;
						await this.plugin.saveSettings();
						new Notice('Signed out successfully');
						this.display(); // Refresh display
					}));
		}
	}
}
