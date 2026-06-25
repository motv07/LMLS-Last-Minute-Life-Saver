/**
 * LMLS — Last-Minute Life Saver
 * sw.js — Service Worker for offline app-shell caching
 */

const CACHE_NAME = 'lmls-cache-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles/main.css',
  './scripts/tasks.js',
  './scripts/gemini.js',
  './scripts/voice.js',
  './scripts/scheduler.js',
  './scripts/calendar.js',
  './scripts/habits.js',
  './scripts/analytics.js',
  './scripts/agent.js',
  './scripts/animations.js',
  './scripts/app.js',
  './assets/icon-192.png',
  './assets/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap'
];

// Install Event
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching App Shell...');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event (Stale-While-Revalidate Strategy)
self.addEventListener('fetch', (e) => {
  // Only cache GET requests (API calls for GCal OAuth etc. should bypass caching)
  if (e.request.method !== 'GET') return;
  
  // Skip caching for Google APIs directly (handled live)
  if (e.request.url.includes('googleapis.com') || e.request.url.includes('googleusercontent.com')) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      const fetchPromise = fetch(e.request).then((networkResponse) => {
        // If valid response, clone and update cache
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Network failed (offline)
        console.log('[Service Worker] Offline load for:', e.request.url);
      });

      // Return cached immediately if found, otherwise wait for network fetch
      return cachedResponse || fetchPromise;
    })
  );
});
