// Service Worker for JTEC MUSIC PWA
// Changes with every build to ensure immediate updates across all devices
const VERSION = '1.0.1-dev';
const CACHE_NAME = `jtec-music-${VERSION}`;

// Core assets to pre-cache on install for instant offline support
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/manifest.json',
  '/favicon.ico',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/icon.svg',
];

// 1. Install event: Precache core shell and call self.skipWaiting()
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        await Promise.allSettled(
          PRECACHE_ASSETS.map((url) =>
            fetch(url, { cache: 'no-cache' }).then((res) => {
              if (res && res.status === 200) {
                return cache.put(url, res);
              }
            }).catch(() => {})
          )
        );
      } catch (err) {
        // Continue even if initial precaching is partial
      }
      await self.skipWaiting();
    })()
  );
});

// Allow client app to trigger immediate activation
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// 2. Activate event: Claim clients immediately and delete only old app-shell caches
// NOTE: Downloaded songs and covers are stored in IndexedDB (jtec_music_database)
// and are NEVER touched or removed by the service worker or cache cleanup.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      const cacheKeys = await caches.keys();
      await Promise.all(
        cacheKeys.map((key) => {
          if (key !== CACHE_NAME && key.startsWith('jtec-music-')) {
            return caches.delete(key);
          }
        })
      );
    })()
  );
});

// Helper: Check if request is an image, font, or icon
function isCacheFirstAsset(url, request) {
  const destination = request.destination;
  if (destination === 'image' || destination === 'font') {
    return true;
  }
  const pathname = url.pathname.toLowerCase();
  return /\.(png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot|otf)$/.test(pathname);
}

// Helper: Check if request is for sw.js or version.json (must never be cached)
function isNoCacheFile(url) {
  const p = url.pathname;
  return (
    p.endsWith('/sw.js') ||
    p.endsWith('sw.js') ||
    p.endsWith('/version.json') ||
    p.endsWith('version.json')
  );
}

// 3. Fetch event:
// - Never cache the service worker itself or version.json
// - Cache-first for icons, images, and fonts
// - Network-first for index.html, main JS, CSS files, and routes (with cache fallback when offline)
// - Never intercept or disturb blob: or data: URLs (used by IndexedDB for local music/covers)
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle HTTP/HTTPS GET requests
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // Ignore non-http/https requests (e.g. blob:, data:, chrome-extension:)
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // Never cache the service worker or version.json files
  if (isNoCacheFile(url)) {
    return;
  }

  // Strategy A: Cache-first for icons, images, and fonts
  if (isCacheFirstAsset(url, request)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
          return cachedResponse;
        }

        try {
          const networkResponse = await fetch(request);
          if (
            networkResponse &&
            (networkResponse.status === 200 || networkResponse.type === 'opaque')
          ) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch (error) {
          // If offline and not in cache, fallback if available
          throw error;
        }
      })()
    );
    return;
  }

  // Strategy B: Network-first for index.html, JS, CSS, and navigation documents
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.status === 200) {
          cache.put(request, networkResponse.clone());
        }
        return networkResponse;
      } catch (networkError) {
        // Fallback to cache when offline
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
          return cachedResponse;
        }

        // For navigation requests when offline, fallback to cached index.html or root
        if (request.mode === 'navigate') {
          const fallback =
            (await cache.match('/index.html')) ||
            (await cache.match('./index.html')) ||
            (await cache.match('/')) ||
            (await cache.match('./'));
          if (fallback) {
            return fallback;
          }
        }

        throw networkError;
      }
    })()
  );
});
