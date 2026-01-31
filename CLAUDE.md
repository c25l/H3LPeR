# H3LPeR - Codebase Guide

## Project Overview

Obsidian-like web journal with PWA support, markdown editing, and integrations for calendar, email, weather, news, and research. Single-user app authenticated via Google OAuth.

## Directory Structure

```
writer/
├── config.json              # App config (secrets, vault path, Google OAuth)
├── server/
│   ├── index.js             # Express entry point, middleware, route registration
│   ├── auth.js              # Session auth, Google OAuth login/logout routes
│   ├── config.js            # Config loader
│   ├── logger.js            # Structured logger (debug/info/warn/error with context)
│   ├── auth/google.js       # Google OAuth2 client wrapper
│   ├── middleware/
│   │   └── error-handler.js # AppError class, asyncHandler wrapper, central errorHandler
│   ├── routes/
│   │   ├── api.js           # Core file CRUD, tree ops, journal, search, tags, backlinks
│   │   ├── helper-api.js    # Weather, news, research, stocks, astronomy endpoints
│   │   ├── google-api.js    # Calendar, Gmail, Tasks (requires Google auth)
│   │   └── pages.js         # EJS page rendering (login, main app)
│   └── services/
│       ├── vault.js         # File system abstraction (read/write/search/tree/watch)
│       ├── news.js          # RSS aggregation, embedding-based clustering, Claude ranking
│       ├── weather.js       # OpenWeatherMap + space weather
│       ├── astronomy.js     # Star/planet/ISS positions
│       ├── research.js      # arXiv paper fetching + AI ranking
│       ├── embeddings.js    # OpenAI embeddings for clustering
│       ├── claude.js        # Claude API client for ranking
│       ├── gmail.js         # Gmail API wrapper
│       ├── google-calendar.js
│       ├── google-tasks.js
│       ├── journal.js       # Daily journal entry creation
│       ├── backlinks.js     # Wiki-link cross-reference index
│       ├── stocks.js        # Stock quotes
│       ├── restrictions.js  # Policy engine (readOnly, allowCreate, etc.)
│       └── openai-responses.js  # Secondary AI ranker
├── public/
│   ├── manifest.json        # PWA manifest
│   ├── sw.js                # Service worker (static + API caching, background sync)
│   ├── css/
│   │   ├── style.css        # Main styles
│   │   └── helper-tabs.css  # Tab-specific styles
│   └── js/
│       ├── app.js           # Slim orchestrator - imports and initializes all modules
│       ├── file-manager.js  # File CRUD, save/load, buffers, policy, recent files
│       ├── tab-manager.js   # Tab switching, lazy-loading, Google auth check, URL state
│       ├── search-manager.js # Search, tags, search-buffer emission
│       ├── sync-manager.js  # Online/offline sync status indicator
│       ├── conflict-manager.js # Conflict detection modal and resolution
│       ├── agenda.js        # Calendar agenda parsing and markdown generation
│       ├── ui.js            # Keyboard shortcuts, modals, quick switcher, nav history, window globals
│       ├── editor.js        # CodeMirror integration, markdown extensions, KaTeX
│       ├── buffer-manager.js # Multi-buffer (tab) state management
│       ├── db.js            # IndexedDB wrapper (files, tags, calendar, syncQueue)
│       ├── tree-editor.js   # File tree sidebar UI
│       ├── sidebar-panels.js # Sidebar panel system (search, recent, files, tags, calendar)
│       ├── calendar-tab.js  # Calendar tab (Google Calendar events)
│       ├── weather-tab.js   # Weather tab
│       ├── news-tab.js      # News tab
│       ├── research-tab.js  # Research tab
│       ├── email-tab.js     # Email indicator badge
│       ├── today-tab.js     # Today view
│       ├── graph-tab.js     # Graph visualization
│       ├── tasks-panel.js   # Google Tasks panel
│       ├── star-chart.js    # Astronomy visualization
│       └── backlinks.js     # Backlinks panel
└── views/                   # EJS templates
```

## Key Patterns

### Server Error Handling
All route handlers use `asyncHandler()` from `middleware/error-handler.js` - no try/catch needed in routes. Throw `AppError(message, statusCode, code)` for expected errors. Unhandled errors caught by central `errorHandler` middleware registered last in `index.js`.

```js
const { AppError, asyncHandler } = require('../middleware/error-handler');
router.get('/foo', asyncHandler(async (req, res) => {
  throw new AppError('Not found', 404, 'NOT_FOUND');
}));
```

Error response format: `{ error: string, code: string, details?: any, policy?: object }`

### Server Logging
Use `require('./logger')` instead of `console.log/error`. Format: `logger.info(context, message, data)`.

### Frontend Module Communication
Modules share state via accessor functions passed during init (not direct imports of mutable state). Example: `file-manager.js` receives `getBufferManager` and `getTreeEditor` callbacks rather than importing the objects directly, because they're created after module load.

### Conflict Detection
- Server: `PUT /api/files/*` accepts `lastModified` in body. Compares against file mtime. Returns 409 with `details.serverContent` on conflict.
- Client: `file-manager.js` tracks `lastKnownModified`, sends it with saves, shows conflict modal on 409.
- Resolution: `conflict-manager.js` force-saves chosen version (no `lastModified` sent), then reloads file.

### News Delta Processing
`news.js` tracks `knownArticleIds` and `previousGroups` between update cycles. Only generates embeddings for new articles and merges them into existing clusters. Tech news tracks `knownTechArticleIds` to skip re-ranking when no new articles appear.

### Service Worker
- Static assets: network-first with cache fallback
- Cacheable API paths (weather, news, research, etc.): network-first with offline cache (stale up to 24h)
- Mutation APIs: pass-through (no caching)
- Background sync: triggers client's `db.processSyncQueue()` on connectivity
- Update notification: posts `SW_UPDATED` message to clients

### Policy System
`restrictions.js` resolves per-path policies (readOnly, allowCreate, allowRename, allowDelete, maxLength). Checked server-side via `validateOperation()` before all mutations. Client caches policies and disables UI controls accordingly.

## Common Tasks

**Add a new API endpoint:** Add to appropriate route file in `server/routes/`, wrap handler with `asyncHandler()`, throw `AppError` for errors.

**Add a new frontend module:** Create in `public/js/`, add to `STATIC_ASSETS` in `sw.js`, import in `app.js`.

**Add a new sidebar panel:** Register via `sidebarManager.register()` in `app.js`.

**Add a new tab:** Add tab name to `TAB_NAMES` in `tab-manager.js`, add lazy-load function, add HTML tab content in the EJS view.
