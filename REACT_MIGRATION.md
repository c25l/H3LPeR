# H3LPeR React Migration

This document describes the migration from vanilla JavaScript to React components.

## Overview

The H3LPeR application has been upgraded from a vanilla JavaScript application to a modern React application using Vite as the build tool. This migration componentizes the entire frontend while maintaining backward compatibility with the existing Express backend.

## Architecture

### Tech Stack

- **Frontend**: React 19.2.4
- **Build Tool**: Vite 7.3.1
- **Backend**: Express.js (unchanged)
- **State Management**: React Context API
- **Styling**: Existing CSS (unchanged)

### Directory Structure

```
H3LPeR/
├── client/                 # React application source
│   ├── src/
│   │   ├── components/    # React components
│   │   │   ├── tabs/      # Tab content components
│   │   │   ├── sidebar/   # Sidebar panel components
│   │   │   └── modals/    # Modal components
│   │   ├── contexts/      # React Context providers
│   │   ├── hooks/         # Custom React hooks (to be added)
│   │   ├── services/      # Service layer (API, db, etc.)
│   │   └── utils/         # Utility functions
│   └── index.html         # Main HTML template
├── dist/                  # Built React app (gitignored)
├── public/                # Static assets (CSS, manifest, service worker)
│   ├── css/
│   ├── js/                # Legacy vanilla JS (to be removed)
│   └── sw.js
├── server/                # Express backend (unchanged)
└── views/                 # EJS templates (legacy, for backward compat)
```

## Components

### Core Components

- **App**: Main application wrapper with AppProvider
- **TabNavigation**: Top navigation bar with tab switching
- **GoogleAuthBanner**: Google authentication status banner

### Tab Components

- **WriterTab**: Main writing/editing interface
- **CalendarTab**: Calendar and tasks view
- **WeatherTab**: Weather and space weather information
- **NewsTab**: News stories and stocks ticker
- **ResearchTab**: Research papers from arXiv

### Sidebar Components

- **Sidebar**: Main sidebar container with icon rail
- **SearchPanel**: File search interface
- **RecentPanel**: Recently opened files
- **FilesPanel**: File tree browser
- **TagsPanel**: Tag management
- **CalendarPanel**: Mini calendar

### Editor Components

- **Editor**: CodeMirror-based markdown editor
- **BacklinksPanel**: Wiki-style backlinks display

### Modal Components

- **QuickSwitcher**: Quick file switcher (Cmd/Ctrl+P)
- **NewFileModal**: Create new file dialog
- **ConflictModal**: Merge conflict resolution

## State Management

### AppContext

The `AppContext` provides global state management for:

- Database initialization status
- Current file and file tree
- Active tab selection
- Dirty state (unsaved changes)
- Sync status
- Google authentication status
- Buffer management (multi-tab editing)

### Custom Hooks (To Be Implemented)

- `useFileManager`: File CRUD operations
- `useBufferManager`: Multiple buffer management
- `useSearch`: Full-text search functionality
- `useSync`: Online/offline synchronization

## Development

### Prerequisites

```bash
npm install
```

### Development Mode

Run the Vite dev server alongside the Express backend:

```bash
# Terminal 1: Start Express backend
npm run dev

# Terminal 2: Start Vite dev server (if needed for development)
npm run dev:client
```

The Vite dev server will proxy API requests to the Express backend.

### Building for Production

Build the React application:

```bash
npm run build
```

This creates a production-ready build in the `dist/` directory. The Express server automatically serves the built React app if it exists, falling back to EJS templates if not.

### Running Production Build

```bash
npm start
```

The server will serve the built React app from `dist/` if available, otherwise it falls back to the original EJS templates.

## Migration Status

### ✅ Completed

1. React infrastructure setup (Vite, build configuration)
2. Core component structure
3. Tab components (all 5 tabs)
4. Sidebar placeholder components
5. Modal placeholder components
6. Global state context
7. Server configuration for React builds

### 🚧 In Progress

1. Full sidebar panel implementations
2. CodeMirror integration in Editor component
3. File manager hooks and state management
4. Buffer manager (multi-tab editing) in React
5. Search functionality integration
6. Sync manager integration

### ⏳ Pending

1. Complete API integration hooks
2. Service worker updates for React build
3. Full keyboard shortcut handling
4. Complete Google OAuth flow in React
5. Testing all features
6. Remove legacy vanilla JS code
7. Update documentation

## API Endpoints

All existing API endpoints remain unchanged. The React app communicates with the same Express backend:

- `/api/files/*` - File CRUD operations
- `/api/search` - Full-text search
- `/api/tags` - Tag management
- `/api/calendar/*` - Calendar operations
- `/api/gmail/*` - Gmail integration
- `/api/weather` - Weather data
- `/api/news` - News aggregation
- `/api/research` - Research papers
- `/api/auth/google/*` - Google OAuth

## Backward Compatibility

The application maintains backward compatibility:

1. If the `dist/` directory exists, serve the React app
2. If not, fall back to EJS templates (original behavior)
3. All API endpoints remain unchanged
4. Public assets (CSS, images, manifest) remain in `public/`
5. Service worker remains at `/sw.js`

## CSS and Styling

All existing CSS files are preserved and used by the React components:

- `/css/style.css` - Main application styles
- `/css/helper-tabs.css` - Tab-specific styles

React components use the same CSS classes as the original vanilla JS implementation.

## Service Worker

The service worker (`/sw.js`) continues to work with the React build:

- Static assets are cached
- API responses are cached (offline support)
- Background sync for file operations
- Update notifications

## Known Issues / TODO

1. CodeMirror integration needs full implementation
2. File tree component needs to integrate with existing tree-editor.js logic
3. Keyboard shortcuts need React implementation
4. Some modals need state management hooks
5. Buffer tabs (multi-file editing) needs full React implementation
6. Google Calendar rendering needs proper component
7. Weather/News/Research tabs need proper data rendering (currently just dangerouslySetInnerHTML)

## Testing

After building and starting the server:

1. Navigate to `http://localhost:3000`
2. Login with credentials
3. Test tab navigation
4. Test sidebar panel switching
5. Test file operations (once implemented)
6. Test offline mode (PWA)

## Contributing

When adding new features:

1. Create React components in `client/src/components/`
2. Use Context API for shared state
3. Create custom hooks for complex logic
4. Follow existing naming conventions
5. Keep CSS classes consistent with original design
6. Test both online and offline modes
7. Ensure PWA functionality remains intact

## Migration Philosophy

This migration follows a **minimal disruption** approach:

- Preserve all existing functionality
- Maintain the same UX/UI
- Keep the same API contracts
- Ensure backward compatibility
- Incremental migration path
- No breaking changes for users

The goal is to modernize the codebase while maintaining feature parity with the original application.
