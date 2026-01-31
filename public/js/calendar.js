// Calendar Component

let currentYear;
let currentMonth;
let entriesCache = {};

export function initCalendar() {
  const today = new Date();
  currentYear = today.getFullYear();
  currentMonth = today.getMonth();

  // Navigation
  document.getElementById('prev-month').addEventListener('click', () => {
    currentMonth--;
    if (currentMonth < 0) {
      currentMonth = 11;
      currentYear--;
    }
    renderCalendar();
  });

  document.getElementById('next-month').addEventListener('click', () => {
    currentMonth++;
    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear++;
    }
    renderCalendar();
  });

  // Render immediately
  renderCalendar();
}

async function renderCalendar() {
  const title = document.getElementById('calendar-title');
  const grid = document.getElementById('calendar-grid');

  // Fetch entries for this month
  const entries = await fetchMonthEntries(currentYear, currentMonth + 1);
  const entryDays = new Set(entries.map(e => e.day));

  // Update title with entry count
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December'];
  const entryCount = entries.length;
  title.innerHTML = `${monthNames[currentMonth]} ${currentYear}` +
    (entryCount > 0 ? `<span class="month-entry-count">${entryCount}</span>` : '');

  // Build calendar grid
  const today = new Date();
  const firstDay = new Date(currentYear, currentMonth, 1);
  const lastDay = new Date(currentYear, currentMonth + 1, 0);
  const startDayOfWeek = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  let html = '';

  // Day headers with week indicator column
  html += '<div class="calendar-week-header"></div>';
  const dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  for (const day of dayNames) {
    html += `<div class="calendar-day-header">${day}</div>`;
  }

  // Calculate weeks
  let weekNum = getWeekNumber(firstDay);
  let weekEntryCount = 0;
  let currentWeekDays = [];

  // Previous month days
  const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate();
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const day = prevMonthLastDay - i;
    currentWeekDays.push({ day, otherMonth: true, hasEntry: false });
  }

  // Current month days
  for (let day = 1; day <= daysInMonth; day++) {
    const isToday = today.getFullYear() === currentYear &&
                    today.getMonth() === currentMonth &&
                    today.getDate() === day;
    const hasEntry = entryDays.has(day);

    currentWeekDays.push({ day, isToday, hasEntry, otherMonth: false });
    if (hasEntry) weekEntryCount++;

    // End of week or end of month
    if (currentWeekDays.length === 7 || day === daysInMonth) {
      // Pad with next month days if needed
      let nextMonthDay = 1;
      while (currentWeekDays.length < 7) {
        currentWeekDays.push({ day: nextMonthDay++, otherMonth: true, hasEntry: false });
      }

      // Render week indicator
      html += `<div class="calendar-week-indicator${weekEntryCount > 0 ? ' has-entries' : ''}" title="Week ${weekNum}: ${weekEntryCount} entries">`;
      if (weekEntryCount > 0) {
        html += `<span class="week-dots">${'·'.repeat(Math.min(weekEntryCount, 5))}</span>`;
      }
      html += '</div>';

      // Render week days
      for (const d of currentWeekDays) {
        const classes = ['calendar-day'];
        if (d.otherMonth) classes.push('other-month');
        if (d.isToday) classes.push('today');
        if (d.hasEntry) classes.push('has-entry');

        if (d.otherMonth) {
          html += `<div class="${classes.join(' ')}">${d.day}</div>`;
        } else {
          const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
          html += `<div class="${classes.join(' ')}" data-date="${dateStr}" onclick="openJournalEntry('${dateStr}')">${d.day}</div>`;
        }
      }

      // Reset for next week
      currentWeekDays = [];
      weekEntryCount = 0;
      weekNum++;
    }
  }

  grid.innerHTML = html;
}

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

async function fetchMonthEntries(year, month) {
  const key = `${year}-${month}`;
  if (entriesCache[key]) {
    return entriesCache[key];
  }

  try {
    const response = await fetch(`/api/journal/${year}/${month}`);
    if (response.ok) {
      const entries = await response.json();
      entriesCache[key] = entries;
      return entries;
    }
  } catch (err) {
    console.error('Error fetching journal entries:', err);
  }

  return [];
}

// Open or create journal entry for a date
window.openJournalEntry = async function(dateStr) {
  try {
    const response = await fetch(`/api/journal/${dateStr}`, {
      method: 'POST'
    });

    if (response.ok) {
      const entry = await response.json();
      window.openFile(entry.path);

      // Invalidate cache for this month
      const [year, month] = dateStr.split('-');
      delete entriesCache[`${year}-${parseInt(month)}`];
    }
  } catch (err) {
    console.error('Error opening journal entry:', err);
  }
};
