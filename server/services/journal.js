const path = require('path');

class JournalService {
  constructor(vaultService, config) {
    this.vault = vaultService;
    this.journalFolder = config.journalFolder || 'Journal/Day';
    this.dateFormat = config.dateFormat || '%Y-%m-%d';
  }

  // Format date according to config
  formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return this.dateFormat
      .replace('%Y', year)
      .replace('%m', month)
      .replace('%d', day);
  }

  // Parse date from filename
  parseDate(filename) {
    // Remove .md extension and path
    const name = path.basename(filename, '.md');

    // Try to parse YYYY-MM-DD format
    const match = name.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
    }

    return null;
  }

  // Get journal filename for a date
  getJournalPath(date) {
    const filename = this.formatDate(date) + '.md';
    return this.journalFolder
      ? path.join(this.journalFolder, filename)
      : filename;
  }

  // Get journal entry for a specific date
  async getEntry(date) {
    const filePath = this.getJournalPath(date);
    return this.vault.readFile(filePath);
  }

  // Create or get journal entry for a date
  async getOrCreateEntry(date) {
    const filePath = this.getJournalPath(date);

    let entry = await this.vault.readFile(filePath);
    if (!entry) {
      // Create new entry with template
      const template = this.getTemplate(date);
      await this.vault.createFile(filePath, template);
      entry = await this.vault.readFile(filePath);
    }

    return entry;
  }

  // Get template for new journal entry
  getTemplate(date) {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const formatted = date.toLocaleDateString('en-US', options);
    return `# ${formatted}\n\n`;
  }

  // Get all journal entries for a month
  async getMonthEntries(year, month) {
    const files = await this.vault.listFiles(this.journalFolder);
    const entries = [];

    for (const file of files) {
      const date = this.parseDate(file.name);
      if (date && date.getFullYear() === year && date.getMonth() === month - 1) {
        entries.push({
          date: date.toISOString().split('T')[0],
          day: date.getDate(),
          path: file.path
        });
      }
    }

    return entries.sort((a, b) => a.day - b.day);
  }

  // Get entries for a date range
  async getEntriesInRange(startDate, endDate) {
    const files = await this.vault.listFiles(this.journalFolder);
    const entries = [];

    for (const file of files) {
      const date = this.parseDate(file.name);
      if (date && date >= startDate && date <= endDate) {
        entries.push({
          date: date.toISOString().split('T')[0],
          path: file.path
        });
      }
    }

    return entries;
  }

  // Check if entry exists for a date
  async hasEntry(date) {
    const filePath = this.getJournalPath(date);
    return this.vault.exists(filePath);
  }

  // Get template with agenda section for calendar events
  getTemplateWithAgenda(date, events) {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const formatted = date.toLocaleDateString('en-US', options);
    let template = `# ${formatted}\n\n`;

    template += this.buildAgendaSection(events);

    template += `## Notes\n\n`;
    return template;
  }

  // Build agenda section block from events
  buildAgendaSection(events) {
    if (!events || events.length === 0) {
      return '';
    }

    let section = `## Agenda\n\n`;
    for (const event of events) {
      let time;
      if (event.allDay) {
        time = 'All day';
      } else if (event.start) {
        const startDate = new Date(event.start);
        time = startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      } else {
        time = '';
      }
      section += `- **${time}** ${event.summary || 'Untitled'}`;
      if (event.location) section += ` _(${event.location})_`;
      section += `\n`;
    }
    section += `\n`;
    return section;
  }

  // Insert or replace agenda section in existing content
  upsertAgendaInContent(content, agendaSection) {
    if (!agendaSection) {
      return content;
    }

    const agendaRegex = /^## Agenda\s*\n[\s\S]*?(?=^##\s|\Z)/m;
    if (agendaRegex.test(content)) {
      return content.replace(agendaRegex, agendaSection.trimEnd() + '\n\n');
    }

    const headingMatch = content.match(/^# .*(?:\n+|\n\r+|\r+|\r\n+)/m);
    if (headingMatch && headingMatch.index !== undefined) {
      const insertAt = headingMatch.index + headingMatch[0].length;
      return content.slice(0, insertAt) + agendaSection + content.slice(insertAt);
    }

    return agendaSection + content;
  }

  // Add or replace agenda for existing entry
  async addAgendaToEntry(date, events) {
    const filePath = this.getJournalPath(date);
    let entry = await this.vault.readFile(filePath);

    if (!entry) {
      return this.getOrCreateEntryWithAgenda(date, events);
    }

    if (!events || events.length === 0) {
      return entry;
    }

    const agendaSection = this.buildAgendaSection(events);
    const updatedContent = this.upsertAgendaInContent(entry.content || '', agendaSection);
    await this.vault.writeFile(filePath, updatedContent, entry.frontmatter);
    entry = await this.vault.readFile(filePath);
    return entry;
  }

  // Create or get journal entry with agenda
  async getOrCreateEntryWithAgenda(date, events) {
    const filePath = this.getJournalPath(date);

    let entry = await this.vault.readFile(filePath);
    if (!entry) {
      const template = this.getTemplateWithAgenda(date, events);
      await this.vault.createFile(filePath, template);
      entry = await this.vault.readFile(filePath);
    }

    return entry;
  }
}

module.exports = JournalService;
