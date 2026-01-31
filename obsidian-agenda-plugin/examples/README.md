# Example Event Files

This directory contains sample event JSON files that you can use to test the Calendar Agenda plugin.

## Files

### sample-events.json
A typical workday schedule with meetings throughout the day. Use this to test:
- Time-based events
- Location display
- Multiple events in sequence

**Output preview:**
```markdown
## Agenda

- **9:00 AM** Morning Standup _(Zoom)_
- **10:00 AM** Team Meeting _(Conference Room A)_
- **12:30 PM** Lunch with Client _(Restaurant)_
- **2:00 PM** Code Review Session
- **4:00 PM** Project Planning _(Conference Room B)_
```

### all-day-events.json
Examples of all-day events like company events, vacation days, and conferences. Use this to test:
- All-day event formatting
- Events spanning multiple days

**Output preview:**
```markdown
## Agenda

- **All day** Company All-Hands
- **All day** Vacation
- **All day** Conference Day 1 _(Convention Center)_
```

### filtered-events.json
Events with different availability statuses to demonstrate filtering. Use this to test:
- Automatic filtering of tentative events
- Automatic filtering of free/blocked time
- Only busy events appear in the agenda

**Output preview:**
```markdown
## Agenda

- **10:00 AM** Important Client Call
- **2:00 PM** Design Review
```

*Note: The tentative event and free time block are automatically filtered out.*

## How to Use

### Method 1: Copy to Clipboard
1. Open one of the JSON files
2. Copy the entire contents
3. In Obsidian, run command: "Insert agenda from clipboard (JSON)"

### Method 2: Import via Modal
1. Open one of the JSON files
2. Copy the contents
3. In Obsidian, run command: "Insert agenda from manual input"
4. Paste in the JSON text area
5. Click "Import Events"

### Method 3: Combine Multiple Files
You can combine events from multiple files into a single array:
```json
[
  ...events from sample-events.json,
  ...events from all-day-events.json
]
```

## Creating Your Own Events

Use these examples as templates for your own events. The basic structure is:

```json
{
  "summary": "Event Title",
  "start": "YYYY-MM-DDTHH:MM:SS",  // or "YYYY-MM-DD" for all-day
  "end": "YYYY-MM-DDTHH:MM:SS",    // optional
  "location": "Place",              // optional
  "allDay": false,                  // optional, defaults to false
  "availability": "busy"            // optional: "busy", "free", or "tentative"
}
```

## Integration with Real Calendars

These static files are for testing. For real calendar integration:

1. Export events from Google Calendar, Outlook, etc. to JSON format
2. Use calendar APIs to fetch events programmatically
3. Create scripts that automate the process of getting events and formatting them
4. Consider using other Obsidian plugins that sync with calendar services
