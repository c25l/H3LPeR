// Email indicator - Simple unread count badge in header
import db from './db.js';

let unreadCount = 0;
let refreshInterval = null;
let isOffline = false;

// Check online/offline status
window.addEventListener('online', () => {
  isOffline = false;
  loadUnreadCount();
});

window.addEventListener('offline', () => {
  isOffline = true;
});

export async function initEmailIndicator() {
  console.log('Initializing Email indicator...');

  isOffline = !navigator.onLine;

  // Load unread count
  await loadUnreadCount();

  // Auto-refresh every 5 minutes when online
  refreshInterval = setInterval(() => {
    if (!isOffline) {
      loadUnreadCount();
    }
  }, 5 * 60 * 1000);
}

async function loadUnreadCount(forceRefresh = false) {
  try {
    // Try to load from cache first
    const cached = await db.getCachedCalendarData('email-unread');
    if (cached && !forceRefresh) {
      unreadCount = cached.data.count || 0;
      updateBadge();
    }

    // If online, fetch fresh data
    if (!isOffline) {
      const response = await fetch('/api/google/gmail/unread-count');

      if (!response.ok) {
        if (response.status === 401) {
          // Not authenticated, just hide the badge
          updateBadge(0);
          return;
        }
        throw new Error('Failed to load unread count');
      }

      const data = await response.json();
      unreadCount = data.count || 0;

      // Cache the data
      await db.cacheCalendarData('email-unread', { count: unreadCount });

      updateBadge();
    }
  } catch (error) {
    console.error('Error loading unread count:', error);
    // Silently fail - this is just an indicator
  }
}

function updateBadge(count = unreadCount) {
  const badge = document.getElementById('unread-count');
  const indicator = document.getElementById('email-indicator');
  
  if (!badge || !indicator) return;

  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.classList.remove('hidden');
    indicator.title = `${count} unread message${count === 1 ? '' : 's'} - Open Gmail`;
  } else {
    badge.classList.add('hidden');
    indicator.title = 'Gmail';
  }
}

// Export for global access
window.loadUnreadCount = loadUnreadCount;
export { initEmailIndicator };
