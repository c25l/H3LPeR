# H3LPeR

An Obsidian-like web-based journal with real-time data integrations, PWA support, and intelligent content processing.

## Why H3LPeR Over Static Markdown Files?

If you're wondering "Why use this instead of just generating a static `.md` file once a day and dropping it into Obsidian?", here are the key advantages this dynamic, web-based approach offers:

### 1. **Real-Time, On-Demand Data Updates**

Rather than waiting for a daily batch update, H3LPeR provides:

- **Live Data Refresh**: Click a button to get fresh weather, news, research papers, or astronomy data instantly
- **Scheduled Auto-Updates**: News refreshes every 6 hours, research every 24 hours - always current without manual intervention
- **Interactive Calendar Integration**: See your Google Calendar events update in real-time, with agenda sections automatically injected into journal entries
- **Email Notifications**: Live unread count badge from Gmail
- **Stock Quotes**: Current market data on demand

**Static file approach**: You'd need to manually regenerate the file or set up complex cron jobs. Any data you want is at least hours old.

**H3LPeR approach**: Data is as fresh as you need it, updated on-demand or automatically.

### 2. **Intelligent Content Processing**

H3LPeR uses AI to make sense of information:

- **News Clustering with Embeddings**: Aggregates RSS feeds from multiple sources, uses OpenAI embeddings to group similar stories, and AI ranking to surface the most important articles
- **Delta Processing**: Only generates embeddings for new articles, efficiently merging them into existing clusters - saves API costs and provides faster updates
- **Research Ranking**: Fetches latest arXiv papers and uses Claude AI to rank them by relevance and importance
- **Smart Summarization**: AI-powered content curation that would be expensive to run in a static batch process

**Static file approach**: You'd get raw RSS feeds or simple lists. Clustering and ranking would be a one-time daily operation, missing new important stories.

**H3LPeR approach**: Continuous intelligent processing with incremental updates that adapt throughout the day.

### 3. **Offline-First PWA Architecture**

H3LPeR works seamlessly online and offline:

- **Service Worker Caching**: All assets and API responses cached for offline access
- **IndexedDB Sync Queue**: Edits made offline are queued and automatically synced when connectivity returns
- **Background Sync**: Uses the Background Sync API to sync changes when you come back online
- **Conflict Detection & Resolution**: If you edit the same file offline and someone else edits it online, H3LPeR detects the conflict and shows you a resolution UI
- **Progressive Enhancement**: Install as a native-feeling app on desktop or mobile

**Static file approach**: Obsidian with static files requires Obsidian Sync ($8/mo) for multi-device sync, and you'd need to manually handle conflicts.

**H3LPeR approach**: Built-in sync with intelligent conflict resolution, works offline, zero subscription cost.

### 4. **Bi-Directional Integration with External Services**

Not just reading data, but interacting with it:

- **Google Calendar**: View events, automatically inject agendas into daily journal entries
- **Gmail**: See unread counts, read emails (can be extended to send/archive)
- **Google Tasks**: View and manage tasks alongside your notes
- **File System Integration**: Edits sync to actual markdown files on disk, compatible with Obsidian or any markdown editor

**Static file approach**: One-way data export into markdown. To update your calendar or tasks, you'd need to switch to another app.

**H3LPeR approach**: View and interact with multiple services in one place, reducing context switching.

### 5. **Live Editing with Real-Time Preview**

- **CodeMirror Integration**: Syntax highlighting, vim/emacs keybindings available
- **Markdown Extensions**: Wiki-links `[[like this]]`, backlinks panel, KaTeX math rendering
- **Multi-Buffer Editing**: Open multiple files in tabs, edit them simultaneously
- **Instant Save**: Auto-saves as you type (debounced), with sync status indicator
- **Search & Navigation**: Full-text search, tag browser, quick switcher (Cmd+P), graph visualization

**Static file approach**: Obsidian is excellent, but you'd need to manually open it, and integrations would require plugins.

**H3LPeR approach**: Access from any browser, no installation required, all integrations built-in.

### 6. **Dynamic Content Adaptation**

H3LPeR adapts to your workflow:

- **Automatic Journal Creation**: Creates daily journal entries with proper templates
- **Smart Agenda Insertion**: Finds the right place to insert/update agenda sections without overwriting notes
- **Backlinks & Cross-References**: Automatically tracks wiki-links between files
- **Tag Indexing**: Scans all files to maintain a tag inventory
- **File Watching**: Could be extended to watch vault changes from other apps (Obsidian) and sync them in

**Static file approach**: You'd need to carefully craft scripts to avoid overwriting manual edits when regenerating files.

**H3LPeR approach**: Intelligent merging that preserves your manual edits while updating dynamic sections.

### 7. **Web-Based Accessibility**

- **Access Anywhere**: Any device with a browser, no app installation required
- **Cross-Platform**: Same experience on Windows, Mac, Linux, iOS, Android
- **Shareable Links**: Could be extended to share specific notes or views
- **Mobile-Responsive**: Optimized layout for phones and tablets
- **Low Storage Footprint**: Caching only stores what you need, server holds the full vault

**Static file approach**: Requires Obsidian installed on each device, vault synced to each device.

**H3LPeR approach**: Single source of truth on server, access from anywhere.

### 8. **Extensibility & Customization**

H3LPeR is built for expansion:

- **Modular Architecture**: Services, tabs, and sidebar panels are easy to add
- **Policy System**: Per-path restrictions (read-only, no-delete, max-length)
- **API-First Design**: Everything is API-driven, easy to build alternative clients
- **Open Integration**: Add new RSS feeds, APIs, or data sources easily

**Static file approach**: Limited to what you can script; integrations require external tools.

**H3LPeR approach**: Full-stack control to add any integration you can imagine.

## Key Features

- **Markdown Editor** with CodeMirror, wiki-links, and KaTeX math support
- **File Management** with tree view, search, tags, and backlinks
- **Journal System** with automatic daily entries and calendar agenda injection
- **Weather Tab** with OpenWeatherMap data and space weather
- **News Tab** with AI-clustered and ranked news from multiple RSS sources
- **Research Tab** with latest arXiv papers ranked by AI relevance
- **Calendar Tab** with Google Calendar integration
- **Email Tab** with Gmail unread count and integration
- **Astronomy Tab** with star charts, planet positions, and ISS tracking
- **Graph Visualization** of wiki-link connections
- **PWA Support** with offline mode and background sync
- **Google OAuth** for calendar, email, and tasks integration

## Getting Started

### Prerequisites

- Node.js 16+ and npm
- Google Cloud project with Calendar, Gmail, and Tasks APIs enabled (for integrations)
- OpenAI API key (for news clustering)
- Claude API key (optional, for AI ranking)
- OpenWeatherMap API key (for weather data)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/c25l/H3LPeR.git
cd H3LPeR
```

2. Install dependencies:
```bash
npm install
```

3. Create `config.json` in the project root:
```json
{
  "vaultPath": "/path/to/your/markdown/vault",
  "journalFolder": "Journal/Day",
  "dateFormat": "%Y-%m-%d",
  "sessionSecret": "your-session-secret-here",
  "google": {
    "clientId": "your-google-client-id",
    "clientSecret": "your-google-client-secret",
    "redirectUri": "http://localhost:3000/auth/google/callback"
  },
  "openai": {
    "apiKey": "your-openai-api-key"
  },
  "claude": {
    "apiKey": "your-claude-api-key"
  },
  "weather": {
    "apiKey": "your-openweathermap-api-key",
    "location": {
      "lat": 40.1672,
      "lon": -105.1019,
      "name": "Your City"
    }
  }
}
```

4. Start the server:
```bash
npm start
```

5. Open http://localhost:3000 in your browser

### Development Mode

For auto-restart on file changes:
```bash
npm run dev
```

## Architecture

- **Backend**: Express.js server with session-based authentication
- **Frontend**: Vanilla JavaScript with ES modules
- **Storage**: File system for markdown files, IndexedDB for client-side caching
- **Real-Time**: Service Worker for offline support and background sync
- **AI**: OpenAI for embeddings, Claude for ranking
- **Integrations**: Google APIs, OpenWeatherMap, RSS feeds, arXiv API

See [CLAUDE.md](CLAUDE.md) for detailed architecture documentation.

## Configuration

### Vault Path

Point `vaultPath` to an existing folder of markdown files. H3LPeR will read and write to this folder, making it compatible with Obsidian or any other markdown editor.

### Journal Setup

Configure `journalFolder` and `dateFormat` to match your journaling conventions. H3LPeR will create daily notes in this folder with calendar agendas.

### Policy System

Create a `.restrictions.json` file in your vault to set per-path policies:
```json
{
  "Archive/**": {
    "readOnly": true
  },
  "Templates/**": {
    "allowDelete": false
  },
  "Scratchpad.md": {
    "maxLength": 10000
  }
}
```

## Use Cases Where H3LPeR Excels

1. **Daily Journaling with Context**: Start your day seeing your calendar, weather, important news, and latest research - all in one view
2. **Research Workflow**: Monitor arXiv for papers in your field, ranked by relevance, with notes in the same interface
3. **News Curation**: Get AI-clustered news that surfaces important stories without drowning in duplicates
4. **Mobile Access**: Quick notes on your phone that sync to your main vault
5. **Offline Work**: Edit notes on a plane, automatic sync when you land
6. **Multi-Device**: Seamless access from work computer, home computer, and tablet without manual sync

## License

MIT

## Contributing

Contributions welcome! See the modular architecture in [CLAUDE.md](CLAUDE.md) for guidance on adding new features.
