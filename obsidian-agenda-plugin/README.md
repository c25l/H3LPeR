# Calendar Agenda Plugin for Obsidian

Display calendar events from Google Calendar in markdown format in your Obsidian notes (read-only).

## Features

- 📅 Fetch events directly from Google Calendar
- 🔐 Secure OAuth 2.0 authentication
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
   - Choose "Web application"
   - Under "Authorized redirect URIs", add: `https://localhost`
   - Click "Create"
   - Copy your **Client ID**

4. **Configure the Plugin:**
   - Open Obsidian Settings → Community Plugins → Calendar Agenda
   - Paste your Client ID
   - Click "Authenticate with Google"
   - Sign in and authorize the plugin
   - Copy the `access_token` from the redirect URL
   - Paste it into the "Access Token" field in settings

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
2. Configure your Client ID in plugin settings
3. Authenticate with Google
4. Open a note where you want to insert your agenda
5. Open Command Palette (`Ctrl/Cmd + P`)
6. Run "Insert today's agenda from Google Calendar"
7. The formatted agenda will be inserted at your cursor

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
- **Authentication**: Sign in with Google to authorize calendar access
- **Access Token**: Paste the access token from the OAuth redirect URL

The plugin stores your access token locally for privacy.

## Integration with Calendar Services

### Google Calendar

The plugin integrates directly with Google Calendar via OAuth 2.0:

1. Set up API credentials (one-time setup)
2. Authenticate with your Google account
3. Fetch events with a single command

### Security & Privacy

- OAuth 2.0 for secure authentication
- Access tokens stored locally in Obsidian
- Read-only calendar access
- No data sent to third-party servers

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
