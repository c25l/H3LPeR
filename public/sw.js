// Service Worker for H3LPeR PWA
const CACHE_NAME = 'h3lper-v2';
const API_CACHE_NAME = 'h3lper-api-v1';

const STATIC_ASSETS = [
  '/',
  '/css/style.css',
  '/css/helper-tabs.css',
  '/js/app.js',
  '/js/editor.js',
  '/js/calendar.js',
  '/js/backlinks.js',
  '/js/weather-tab.js',
  '/js/star-chart.js',
  '/js/file-manager.js',
  '/js/tab-manager.js',
  '/js/search-manager.js',
  '/js/sync-manager.js',
  '/js/conflict-manager.js',
  '/js/agenda.js',
  '/js/ui.js',
  '/js/db.js',
  '/js/buffer-manager.js',
  '/js/tree-editor.js',
  '/js/sidebar-panels.js',
  '/js/news-tab.js',
  '/js/research-tab.js',
  '/js/calendar-tab.js',
  '/js/email-tab.js',
  '/js/today-tab.js',
  '/js/graph-tab.js',
  '/js/tasks-panel.js',
  '/login',
  // CodeMirror assets
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/gfm/gfm.min.js',
  // KaTeX
  'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css',
  'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js'
];

// API paths to cache for offline access (read-only data)
const CACHEABLE_API_PATHS = [
  '/api/helper/weather',
  '/api/helper/news',
  '/api/helper/research',
  '/api/helper/sky',
  '/api/helper/stocks',
  '/api/tags',
  '/api/files'
];

// Max age for cached API responses (in ms)
const API_CACHE_MAX_AGE = 60 * 60 * 1000; // 1 hour

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS.filter(url => !url.startsWith('http')));
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches, notify clients of update
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Notify all clients that a new SW is active
      return self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'SW_UPDATED', version: CACHE_NAME });
        });
      });
    })
  );
  self.clients.claim();
});

// Check if URL matches a cacheable API path
function isCacheableApiPath(url) {
  const urlObj = new URL(url);
  return CACHEABLE_API_PATHS.some(path => urlObj.pathname.startsWith(path));
}

// Fetch event - network first with offline fallback
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Handle cacheable API requests: network-first with cache fallback
  if (request.url.includes('/api/') && isCacheableApiPath(request.url)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(API_CACHE_NAME).then((cache) => {
              // Store with timestamp header for expiry checking
              const headers = new Headers(responseClone.headers);
              headers.set('sw-cached-at', Date.now().toString());
              const cachedResponse = new Response(responseClone.body, {
                status: responseClone.status,
                statusText: responseClone.statusText,
                headers
              });
              cache.put(request, cachedResponse);
            });
          }
          return response;
        })
        .catch(() => {
          // Network failed, try API cache
          return caches.open(API_CACHE_NAME).then(cache => {
            return cache.match(request).then(response => {
              if (response) {
                // Check if cached response is too old
                const cachedAt = parseInt(response.headers.get('sw-cached-at') || '0');
                if (Date.now() - cachedAt < API_CACHE_MAX_AGE * 24) {
                  // Allow stale data up to 24x max age when offline
                  return response;
                }
              }
              return new Response(
                JSON.stringify({ error: 'Offline', code: 'OFFLINE' }),
                { status: 503, headers: { 'Content-Type': 'application/json' } }
              );
            });
          });
        })
    );
    return;
  }

  // Skip non-cacheable API requests (mutations, auth, etc.)
  if (request.url.includes('/api/')) {
    return;
  }

  // Static assets: network first, cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful responses
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Network failed, try cache
        return caches.match(request).then((response) => {
          if (response) return response;

          // For navigation requests, return the cached root page
          if (request.mode === 'navigate') {
            return caches.match('/');
          }

          return new Response('Offline', { status: 503 });
        });
      })
  );
});

// Handle background sync for file saves
self.addEventListener('sync', (event) => {
  if (event.tag === 'file-sync') {
    event.waitUntil(syncFiles());
  }
});

async function syncFiles() {
  // The actual sync logic is handled by IndexedDB in db.js
  // This just triggers the client to process its sync queue
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({ type: 'SYNC_REQUESTED' });
  });
}

// Listen for messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
