# Quick Start Guide

Get started with the Calendar Agenda plugin in 2 minutes!

## Installation

1. **Download the plugin files:**
   - Copy the entire `obsidian-agenda-plugin` folder to your vault's `.obsidian/plugins/` directory
   - Or download just these files:
     - `manifest.json`
     - `main.js`
   
2. **Reload Obsidian:**
   - Restart Obsidian or reload it (Ctrl/Cmd + R)

3. **Enable the plugin:**
   - Open Settings → Community Plugins
   - Find "Calendar Agenda" in the list
   - Toggle it on

## First Steps

### Try the Plugin with Sample Events

We've included sample event files for testing!

**Quick Test:**
1. Open or create a note
2. Copy the contents of `examples/sample-events.json`
3. Open Command Palette (Ctrl/Cmd + P)
4. Run: "Insert agenda from clipboard (JSON)"
5. You should see an agenda section inserted!

**Expected Output:**
```markdown
## Agenda

- **9:00 AM** Morning Standup _(Zoom)_
- **10:00 AM** Team Meeting _(Conference Room A)_
- **12:30 PM** Lunch with Client _(Restaurant)_
- **2:00 PM** Code Review Session
- **4:00 PM** Project Planning _(Conference Room B)_

```

## Daily Workflow

### Get Events from Your Calendar
1. Export your day's events from Google Calendar/Outlook as JSON
2. Copy the JSON to clipboard
3. Open your note in Obsidian
4. Command: "Insert agenda from clipboard (JSON)"
5. Done!

## Common Use Cases

### Use Case 1: Daily Planning
Create a routine:
1. Morning: Export calendar events to JSON
2. Copy to clipboard
3. Insert into your daily note
4. Add notes and reflections throughout the day

### Use Case 2: Meeting Notes
1. Insert today's agenda in a meeting notes page
2. Add notes under each meeting item
3. Cross-reference with other notes

### Use Case 3: Weekly Review
1. Create a weekly note
2. Export and insert all week's events
3. Review and plan

## Tips & Tricks

1. **Keyboard Shortcuts**: Set up a custom hotkey for the insert command in Settings → Hotkeys

2. **Event Filtering**: The plugin automatically filters out:
   - Free/blocked time
   - Tentative events
   Try `examples/filtered-events.json` to see this in action!

3. **Multiple Imports**: You can run the insert command multiple times to add more events

4. **Calendar Export Scripts**: Create scripts that automatically export your calendar to JSON and copy to clipboard

## Need Help?

- Check the main [README.md](README.md) for detailed documentation
- See [examples/README.md](examples/README.md) for more event examples
- Report issues on GitHub

## Next Steps

- Explore automation options for calendar export
- Set up templates for different types of journal entries
- Integrate with other Obsidian plugins like Calendar, Daily Notes, etc.

Happy journaling! 📅✨
