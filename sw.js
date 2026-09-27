/**
 * Gacha Tabulation (v1.0.2) - Service Worker
 * Provides offline caching, network-first fallback, and PWA capabilities.
 */

const CACHE_NAME = 'gacha-tabulation-v1.0.2';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon.svg',
  './data/student_icons.json',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

// Install event: cache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate event: clean up outdated caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name.startsWith('gacha-tabulation-') && name !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event: Network-first for dynamic APIs/sheets, Stale-while-revalidate for static assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // If request is external API, Sheets export, or CORS proxy -> Network First
  if (
    url.hostname.includes('docs.google.com') ||
    url.hostname.includes('allorigins.win') ||
    url.hostname.includes('wikiru.jp')
  ) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // If response is valid, optionally cache a copy
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Default: Stale-while-revalidate for local static assets
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
