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

### 2. Journal Service Logic (`server/services/journal.js` → `main.ts`)

**Extracted Concepts:**
- Journal folder configuration
- Date formatting logic
- Journal path generation
- Template generation with agenda sections
- Agenda section insertion/updating (`upsertAgendaInContent`)

**Key Features Preserved:**
- Configurable journal folder
- Configurable date format
- Smart agenda insertion (after first heading)
- Agenda section replacement when updating

**Changes Made:**
- Adapted from server-side Node.js to Obsidian Plugin API
- Removed vault service dependency
- Integrated with Obsidian's native file system API
- Simplified to work client-side only

### 3. Calendar Integration Concepts

**NOT Directly Extracted:**
- Google Calendar OAuth (server-side)
- Calendar API integration (requires backend)
- Automatic calendar fetching

**Alternative Approach:**
Instead of server-side Google Calendar integration, the plugin provides:
- Manual event input via modal UI
- JSON import from clipboard
- JSON import via text area
- Support for any calendar source that can export to JSON

This makes the plugin:
- More flexible (works with any calendar app)
- Privacy-focused (no OAuth or cloud dependencies)
- Simpler (no server required)
- More portable (works on mobile and desktop)

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
├── main.ts            ← Plugin entry, adapted journal logic
├── calendar-modal.ts  ← New: UI for manual event input
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
1. No server API calls - events provided directly
2. Uses Obsidian Editor API instead of DOM manipulation
3. Synchronous instead of async (no fetch needed)
4. TypeScript with interfaces for type safety

## Design Decisions

### 1. Client-Side Only
**Decision:** Make the plugin completely client-side without server dependencies.

**Rationale:**
- Simpler deployment (no server setup)
- Better privacy (no data sent to servers)
- More flexible (works with any calendar source)
- Mobile-friendly (Obsidian mobile doesn't support Node.js APIs)

### 2. Manual/JSON Input
**Decision:** Use manual input and JSON import instead of automatic calendar sync.

**Rationale:**
- Avoids complex OAuth flows in a plugin
- Works with any calendar app (Google, Apple, Outlook, etc.)
- Users maintain control over what's imported
- Enables automation via external scripts

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

### Added for Obsidian:
- ✅ Manual event input modal
- ✅ JSON clipboard import
- ✅ Settings tab with Obsidian UI
- ✅ Command palette integration
- ✅ Obsidian file system integration
- ✅ TypeScript type definitions

### Preserved from H3LPeR:
- ✅ Event filtering logic
- ✅ Markdown generation
- ✅ Date formatting
- ✅ Agenda section management
- ✅ Journal file organization

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

This plugin successfully extracts the "agenda blob generation" functionality from H3LPeR while adapting it to work as a standalone Obsidian plugin. The core logic remains intact, proving valuable enough to reuse, while the integration approach has been completely redesigned to fit Obsidian's architecture and philosophy.

The result is a simpler, more focused tool that provides the same agenda formatting capabilities without the complexity of a full web application.
