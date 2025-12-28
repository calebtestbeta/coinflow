// Service Worker for WAYFARER CALCULATOR PWA
// Version: 1.2.0

const CACHE_VERSION = 'v1.2.0';
const CACHE_NAME = `wayfarer-${CACHE_VERSION}`;

// Critical files to cache immediately on install
const STATIC_CACHE = [
  '/coinflow/',
  '/coinflow/index.html',
  '/coinflow/icons/icon-192.png',
  '/coinflow/icons/icon-512.png',
  '/coinflow/icons/icon.svg',
  '/coinflow/preview.png'
];

// Data files - cache but always try network first
const DATA_FILES = [
  '/coinflow/rates.json',
  '/coinflow/crypto-rates.json',
  '/coinflow/currencies.json',
  '/coinflow/crypto-currencies.json'
];

// CDN resources to cache at runtime
const CDN_PATTERNS = [
  /unpkg\.com/,
  /cdn\.tailwindcss\.com/,
  /cdnjs\.cloudflare\.com/,
  /fonts\.googleapis\.com/,
  /fonts\.gstatic\.com/
];

// Install Event: Pre-cache critical assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing version:', CACHE_VERSION);

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching static assets');
        return cache.addAll(STATIC_CACHE);
      })
      .then(() => {
        console.log('[Service Worker] Static assets cached successfully');
        return self.skipWaiting(); // Activate immediately
      })
      .catch((error) => {
        console.error('[Service Worker] Cache installation failed:', error);
      })
  );
});

// Activate Event: Clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating version:', CACHE_VERSION);

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              // Delete old versions of our cache
              return cacheName.startsWith('wayfarer-') && cacheName !== CACHE_NAME;
            })
            .map((cacheName) => {
              console.log('[Service Worker] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => {
        console.log('[Service Worker] Old caches cleaned up');
        return self.clients.claim(); // Take control immediately
      })
  );
});

// Fetch Event: Smart caching strategy
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Strategy 1: Data files - Network first, cache fallback
  // This ensures users get fresh exchange rates when online
  const isDataFile = DATA_FILES.some((file) => url.pathname.endsWith(file.split('/').pop()));

  if (isDataFile) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // If successful, update cache with fresh data
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Network failed, try cache
          console.log('[Service Worker] Network failed for', url.pathname, '- using cache');
          return caches.match(event.request)
            .then((cachedResponse) => {
              if (cachedResponse) {
                return cachedResponse;
              }
              // No cache available either
              return new Response(
                JSON.stringify({ error: 'Offline and no cached data available' }),
                {
                  headers: { 'Content-Type': 'application/json' },
                  status: 503
                }
              );
            });
        })
    );
    return;
  }

  // Strategy 2: Static assets & CDN - Cache first, network fallback
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        // Not in cache, fetch from network
        return fetch(event.request)
          .then((response) => {
            // Don't cache if not a success response
            if (!response || response.status !== 200 || response.type === 'error') {
              return response;
            }

            // Cache CDN resources at runtime
            const shouldCache = CDN_PATTERNS.some((pattern) => pattern.test(url.href)) ||
                               url.pathname.startsWith('/coinflow/');

            if (shouldCache) {
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseClone);
              });
            }

            return response;
          })
          .catch((error) => {
            console.error('[Service Worker] Fetch failed for', url.href, error);

            // Return offline page for navigation requests
            if (event.request.mode === 'navigate') {
              return caches.match('/coinflow/index.html');
            }

            return new Response('Network error occurred', {
              status: 408,
              headers: { 'Content-Type': 'text/plain' }
            });
          });
      })
  );
});

// Message event: Allow clients to trigger cache updates
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            console.log('[Service Worker] Clearing cache:', cacheName);
            return caches.delete(cacheName);
          })
        );
      })
    );
  }
});

console.log('[Service Worker] Loaded version:', CACHE_VERSION);
