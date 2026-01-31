# Calendar Agenda Plugin for Obsidian

Display calendar events from Google Calendar in markdown format in your Obsidian notes (read-only).

## Features

- 📅 Fetch events directly from Google Calendar
- 🔐 Secure OAuth 2.0 authentication with local callback server
- 🔄 Automatic token refresh (login once, stay authenticated)
- 🎯 Smart filtering of events (removes free/tentative events)
- 🕒 Automatic time formatting
- 📍 Location display support
- 📖 Read-only display

## Installation

### Manual Installation

1. Download the latest release files:
   - `main.js`
   - `manifest.json`

2. Create a folder named `calendar-agenda` in your vault's `.obsidian/plugins/` directory

3. Copy the downloaded files to that folder

4. Reload Obsidian

5. Enable the plugin in Settings → Community Plugins

### Google Calendar Setup

Before using the plugin, you need to set up Google Calendar API access:

1. **Create a Google Cloud Project:**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project (or select existing)

2. **Enable Google Calendar API:**
   - In your project, go to "APIs & Services" → "Library"
   - Search for "Google Calendar API"
   - Click "Enable"

3. **Create OAuth 2.0 Credentials:**
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth client ID"
   - Choose "Desktop app" (or "Web application")
   - Under "Authorized redirect URIs", add: `http://localhost:42813/callback`
   - Click "Create"
   - Copy your **Client ID** and **Client Secret**

4. **Configure the Plugin:**
   - Open Obsidian Settings → Community Plugins → Calendar Agenda
   - Paste your Client ID and Client Secret
   - Click "Authenticate with Google"
   - A browser window will open - sign in and authorize
   - The plugin automatically receives the OAuth callback
   - You're authenticated! The token is stored and will auto-refresh

### Development Installation

1. Clone this repository into your vault's `.obsidian/plugins/` directory:
   ```bash
   cd /path/to/vault/.obsidian/plugins/
   git clone https://github.com/c25l/H3LPeR.git
   cd H3LPeR/obsidian-agenda-plugin
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the plugin:
   ```bash
   npm run build
   ```

4. Reload Obsidian and enable the plugin

## Usage

### Command

The plugin provides one simple command (accessible via Command Palette with `Ctrl/Cmd + P`):

**Insert today's agenda from Google Calendar** - Fetches today's events from Google Calendar and displays them

### Usage

1. Set up Google Calendar API access (see Installation section above)
2. Configure your Client ID and Client Secret in plugin settings
3. Click "Authenticate with Google" - authentication happens automatically via local server
4. Open a note where you want to insert your agenda
5. Open Command Palette (`Ctrl/Cmd + P`)
6. Run "Insert today's agenda from Google Calendar"
7. The formatted agenda will be inserted at your cursor

**Note:** After initial authentication, the plugin stores a refresh token. You'll stay authenticated automatically - no need to sign in again unless you explicitly sign out.

### JSON Format

Events should be in the following JSON format:

```json
[
  {
    "summary": "Team Meeting",
    "start": "2024-01-31T10:00:00",
    "end": "2024-01-31T11:00:00",
    "location": "Conference Room A",
    "allDay": false
  },
  {
    "summary": "Project Deadline",
    "start": "2024-01-31",
    "allDay": true
  }
]
```

**Field descriptions:**
- `summary` (required): Event title
- `start` (required): Start time in ISO format (`YYYY-MM-DDTHH:MM:SS` or `YYYY-MM-DD` for all-day)
- `end` (optional): End time in ISO format
- `location` (optional): Event location
- `allDay` (optional): Boolean, defaults to false
- `availability` (optional): "free", "busy", or "tentative" (free and tentative events are filtered out)

### Output Format

The plugin generates markdown in this format:

```markdown
## Agenda

- **10:00 AM** Team Meeting _(Conference Room A)_
- **2:00 PM** Client Call
- **All day** Project Deadline

```

### Settings

Configure the plugin in Settings → Community Plugins → Calendar Agenda:

- **Google Client ID**: Your OAuth 2.0 Client ID from Google Cloud Console
- **Google Client Secret**: Your OAuth 2.0 Client Secret (stored securely)
- **Authentication**: Click to start OAuth flow via local server (port 42813)
- **Sign Out**: Clear stored tokens if needed

The plugin automatically:
- Stores refresh tokens for persistent authentication
- Refreshes access tokens when they expire
- Runs a local HTTP server during OAuth flow for secure callback handling

## Integration with Calendar Services

### Google Calendar

The plugin integrates directly with Google Calendar via OAuth 2.0:

1. Set up API credentials (one-time setup)
2. Authenticate with your Google account (opens browser, handled automatically)
3. Local HTTP server receives OAuth callback on port 42813
4. Refresh token stored for persistent authentication
5. Fetch events with a single command

### Security & Privacy

- OAuth 2.0 authorization code flow (more secure than implicit flow)
- Local HTTP server for callback (like desktop apps)
- Refresh tokens stored locally in Obsidian
- Access tokens auto-refresh when expired
- Read-only calendar access
- No data sent to third-party servers
- Client secret stored securely in plugin data

### Automation Ideas

You can automate event import by:

1. Creating a script that fetches calendar events and copies them to clipboard as JSON
2. Using other Obsidian plugins for calendar sync that can output JSON
3. Setting up shortcuts or hotkeys to run calendar export scripts

## Features from H3LPeR

This plugin extracts the core agenda display functionality from the H3LPeR project:

- Smart event filtering (removes free/tentative events)
- Duplicate meeting detection
- Clean summary formatting
- Read-only display of calendar events

## Development

### Building

```bash
npm run build      # Production build
npm run dev        # Development build with watch mode
```

### Project Structure

```
obsidian-agenda-plugin/
├── main.ts              # Main plugin entry point
├── agenda-utils.ts      # Core agenda logic (filtering, formatting)
├── calendar-modal.ts    # Event input modal UI
├── manifest.json        # Plugin metadata
├── package.json         # Dependencies
├── tsconfig.json        # TypeScript config
└── esbuild.config.mjs   # Build configuration
```

## Credits

Extracted from the [H3LPeR](https://github.com/c25l/H3LPeR) project, which is an Obsidian-like web journal with calendar integration.

## License

MIT

## Support

For issues, feature requests, or contributions, please visit the [GitHub repository](https://github.com/c25l/H3LPeR).
