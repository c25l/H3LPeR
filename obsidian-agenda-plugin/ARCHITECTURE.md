# Plugin Architecture & Code Extraction

This document explains how the Obsidian Calendar Agenda plugin was created by extracting and adapting code from the H3LPeR project.

## What Was Extracted

### 1. Agenda Generation Logic (`public/js/agenda.js` → `agenda-utils.ts`)

**Extracted Functions:**
- `filterAgendaEventsFromCalendar()` - Filters and normalizes calendar events
- `buildAgendaMarkdown()` - Generates markdown from events
- `cleanAgendaSummary()` - Cleans up event titles
- `getAgendaAvailability()` - Determines event availability

**Key Features Preserved:**
- Smart event filtering (removes free/tentative events)
- Duplicate meeting detection and removal
- Time formatting for different event types (all-day vs timed)
- Location display
- Special handling for "meeting" events (converts to #work tag)

**Changes Made:**
- Removed web-specific dependencies (`insertTextAtCursor`, `fetch` calls)
- Converted from ES6 modules to TypeScript with interfaces
- Made functions pure and reusable
- Added TypeScript type definitions

### 2. Display Logic Only

**Approach:**
- **Read-only**: Plugin only displays events, no creation or modification
- **Simple**: Single command to insert agenda from clipboard
- **No settings**: Zero configuration needed

**What Was NOT Included:**
- Manual event input UI
- Agenda updating/replacement functionality
- Journal creation features
- Settings and configuration
- Any write operations

### 3. Calendar Integration Concepts

**NOT Directly Extracted:**
- Google Calendar OAuth (server-side)
- Calendar API integration (requires backend)
- Automatic calendar fetching
- Any calendar write operations

**Simplified Approach:**
Instead of complex server-side integration, the plugin provides:
- JSON import from clipboard only
- Read-only event display
- Works with any calendar source that can export to JSON

This makes the plugin:
- Simpler (no complex UI or workflows)
- More flexible (works with any calendar app)
- Privacy-focused (no OAuth or cloud dependencies)
- More portable (works on mobile and desktop)
- Minimal (5KB bundle size)

## File Mapping

### Source Files (H3LPeR)
```
H3LPeR/
├── public/js/agenda.js          → Core agenda logic
├── server/services/journal.js   → Journal management
└── server/services/google-calendar.js  → (Concept only, not directly used)
```

### Plugin Files (Obsidian)
```
obsidian-agenda-plugin/
├── agenda-utils.ts     ← Core agenda logic from public/js/agenda.js
├── main.ts            ← Simple plugin entry with one command
├── manifest.json      ← Standard Obsidian plugin metadata
├── package.json       ← Build configuration
├── tsconfig.json      ← TypeScript configuration
└── esbuild.config.mjs ← Build script
```

## Code Comparison

### Original H3LPeR (Web App)
```javascript
// public/js/agenda.js
export async function addTodayAgendaFromCalendar() {
  const calendarResponse = await fetch('/api/google/calendar/list');
  // ... fetch from server
  const agendaText = buildAgendaMarkdown(agendaEvents);
  insertTextAtCursor(agendaText);
}
```

### Obsidian Plugin Adaptation
```typescript
// main.ts
private insertAgenda(editor: Editor, events: CalendarEvent[]) {
  const agendaEvents = filterAgendaEventsFromCalendar(events);
  const agendaText = buildAgendaMarkdown(agendaEvents);
  editor.replaceSelection(agendaText);
}
```

**Key Differences:**
1. No server API calls - events provided directly from clipboard
2. Uses Obsidian Editor API instead of DOM manipulation
3. Synchronous instead of async (no fetch needed)
4. TypeScript with interfaces for type safety
5. Read-only - no modification features

## Design Decisions

### 1. Client-Side Only
**Decision:** Make the plugin completely client-side without server dependencies.

**Rationale:**
- Simpler deployment (no server setup)
- Better privacy (no data sent to servers)
- More flexible (works with any calendar source)
- Mobile-friendly (Obsidian mobile doesn't support Node.js APIs)

### 2. Read-Only Design
**Decision:** Plugin only reads and displays events, no write operations.

**Rationale:**
- Simpler user experience (one command, one purpose)
- Smaller bundle size (5KB vs 16KB+)
- Fewer potential bugs
- Clear separation of concerns (display only)
- Users can use other plugins for editing/creating

### 3. Preserve Core Logic
**Decision:** Keep the agenda filtering and formatting logic exactly as-is.

**Rationale:**
- This logic is well-tested and proven in H3LPeR
- The filtering rules (free/tentative, duplicates) are valuable
- The markdown output format is clean and useful
- Maintains consistency with the original project

### 4. TypeScript
**Decision:** Use TypeScript instead of JavaScript.

**Rationale:**
- Better IDE support and autocomplete
- Type safety for calendar event structures
- Standard practice for Obsidian plugins
- Easier to maintain and extend

## What's Different

### Removed from H3LPeR:
- ❌ Google OAuth authentication
- ❌ Server-side API endpoints
- ❌ Real-time calendar syncing
- ❌ Database/cache layer
- ❌ Express.js middleware
- ❌ Session management
- ❌ Manual event input UI
- ❌ Agenda updating/replacement
- ❌ Journal creation features
- ❌ Settings and configuration

### Added for Obsidian:
- ✅ Single clipboard import command
- ✅ TypeScript type definitions
- ✅ Minimal plugin structure (5KB)

### Preserved from H3LPeR:
- ✅ Event filtering logic
- ✅ Markdown generation
- ✅ Date formatting
- ✅ Smart event handling

## Future Enhancements

Potential additions that could bring back some H3LPeR functionality:

1. **Calendar Sync Plugin Bridge**
   - Integrate with other Obsidian calendar plugins
   - Read events from their data stores

2. **iCal Import**
   - Support importing .ics files directly
   - Parse iCalendar format

3. **Templater Integration**
   - Work with Templater plugin for advanced automation
   - Dynamic event fetching via templates

4. **Google Calendar API (Client-Side)**
   - Use browser-based OAuth for direct Google Calendar access
   - No server required, but more complex

5. **Webhook Support**
   - Allow external services to push events
   - Via Obsidian Local REST API plugin

## Conclusion

This plugin successfully extracts the "agenda blob generation" functionality from H3LPeR while keeping it simple and focused. The core filtering and formatting logic remains intact, but the plugin is now:

- **Read-only**: Only displays events, no modification
- **Minimal**: 5KB bundle, one command
- **Flexible**: Works with any calendar that exports JSON
- **Simple**: No configuration needed

The result is a focused tool that provides clean agenda formatting without complexity.
