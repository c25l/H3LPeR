# Calendar Agenda Plugin for Obsidian

Generate daily agenda sections from calendar events in your Obsidian journal notes.

## Features

- 📅 Insert agenda sections with calendar events in markdown format
- 🔄 Update existing agenda sections in notes
- 📝 Create daily journal entries with agenda templates
- 🎯 Smart filtering of events (removes free/tentative events)
- 🕒 Automatic time formatting
- 📍 Location display support
- 🔧 Configurable journal folder and date format

## Installation

### Manual Installation

1. Download the latest release files:
   - `main.js`
   - `manifest.json`
   - `styles.css` (if available)

2. Create a folder named `calendar-agenda` in your vault's `.obsidian/plugins/` directory

3. Copy the downloaded files to that folder

4. Reload Obsidian

5. Enable the plugin in Settings → Community Plugins

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

### Commands

The plugin provides the following commands (accessible via Command Palette with `Ctrl/Cmd + P`):

1. **Insert agenda from manual input** - Opens a modal to manually add events
2. **Insert agenda from clipboard (JSON)** - Parses JSON events from clipboard
3. **Update agenda in current note** - Replaces the agenda section in the current note
4. **Create today's journal with agenda** - Creates a new daily journal entry

### Event Input Methods

#### Method 1: Manual Input

1. Open Command Palette (`Ctrl/Cmd + P`)
2. Run "Insert agenda from manual input"
3. Fill in event details in the modal
4. Click "Add Event" to add more events
5. Click "Insert All Events" when done

#### Method 2: JSON from Clipboard

1. Copy event data as JSON to your clipboard (see format below)
2. Open Command Palette
3. Run "Insert agenda from clipboard (JSON)"

#### Method 3: JSON Import in Modal

1. Open "Insert agenda from manual input" command
2. Paste JSON in the text area
3. Click "Import Events"

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

Configure the plugin in Settings → Plugin Options → Calendar Agenda:

- **Journal folder**: Folder where journal entries are stored (default: "Journal")
- **Date format**: Format for journal filenames using YYYY, MM, DD (default: "YYYY-MM-DD")

## Integration with Calendar Services

### Google Calendar

To get events from Google Calendar:

1. Use Google Calendar API to export events
2. Format as JSON
3. Copy to clipboard or save to file
4. Use the plugin commands to insert

### Other Calendar Apps

- Export events from your calendar app to iCal/ICS format
- Use a converter tool to transform to JSON
- Import using the plugin

### Automation Ideas

You can automate event import by:

1. Creating a script that fetches calendar events and copies them to clipboard
2. Using other Obsidian plugins for calendar sync
3. Setting up a scheduled task that exports events to a file you can import

## Features from H3LPeR

This plugin extracts the agenda generation functionality from the H3LPeR project, including:

- Smart event filtering (removes free/tentative events)
- Duplicate meeting detection
- Clean summary formatting
- Flexible agenda section insertion/updating

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
