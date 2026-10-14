// Service Worker for JTEC MUSIC PWA
// Changes with every build to ensure immediate updates across all devices
const VERSION = '1.0.1-dev';
const CACHE_NAME = `jtec-music-${VERSION}`;

// 1. Install event: Call self.skipWaiting() right away
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Allow client app to trigger immediate activation
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// 2. Activate event: Claim clients immediately and delete all old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      const cacheKeys = await caches.keys();
      await Promise.all(
        cacheKeys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })()
  );
});

// Helper: Check if request is an image, font, or audio/video/cover file
function isCacheFirstAsset(url, request) {
  const destination = request.destination;
  if (
    destination === 'image' ||
    destination === 'font' ||
    destination === 'audio' ||
    destination === 'video'
  ) {
    return true;
  }
  const pathname = url.pathname.toLowerCase();
  return /\.(png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot|otf|mp3|wav|ogg|flac|m4a|aac|mp4)$/.test(
    pathname
  );
}

// Helper: Check if request is for the service worker itself
function isServiceWorkerFile(url) {
  return url.pathname.endsWith('/sw.js') || url.pathname.endsWith('sw.js');
}

// 3. Fetch event:
// - Never cache the service worker itself
// - Cache-first for images, fonts, and audio/cover files
// - Network-first for index.html, main JS, CSS files, and other resources (with cache fallback when offline)
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle HTTP/HTTPS GET requests
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  if (!url.protocol.startsWith('http')) {
    return;
  }

  // Never cache the service worker file itself
  if (isServiceWorkerFile(url)) {
    return;
  }

  // Strategy A: Cache-first for images, fonts, audio and cover files
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
          // If network failed and not in cache, let it fail gracefully
          throw error;
        }
      })()
    );
    return;
  }

  // Strategy B: Network-first for index.html, main JS, CSS, and other documents
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

        // For navigation requests when offline, fallback to cached index.html
        if (request.mode === 'navigate') {
          const fallback =
            (await cache.match('./index.html')) ||
            (await cache.match('/index.html')) ||
            (await cache.match('./')) ||
            (await cache.match('/'));
          if (fallback) {
            return fallback;
          }
        }

        throw networkError;
      }
    })()
  );
});
