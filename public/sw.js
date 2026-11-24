// Service Worker for JTEC MUSIC PWA
const CACHE_NAME = 'jtec-music-v3';

self.addEventListener('install', (event) => {
  // Only skipWaiting immediately on very first install when no active worker controls clients.
  // When an active worker already exists, wait in the 'waiting' state so the app can apply
  // updates safely at app start or when no music is playing.
  if (!self.registration.active) {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Skip non-GET and chrome-extension or external audio/cloud requests
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Never intercept or cache Supabase, REST API, cross-origin API requests, media streams,
  // Vite dev server modules, or service worker / version manifests
  if (
    url.hostname.includes('supabase') ||
    url.pathname.includes('/rest/v') ||
    url.pathname.includes('/storage/v') ||
    url.pathname.includes('/auth/v') ||
    url.pathname.startsWith('/api/') ||
    url.searchParams.has('apikey') ||
    request.headers.has('apikey') ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/src/') ||
    url.pathname.includes('/node_modules/') ||
    url.pathname.includes('/@') ||
    url.searchParams.has('v') ||
    url.searchParams.has('t') ||
    url.searchParams.has('import') ||
    url.searchParams.has('direct') ||
    url.searchParams.has('html-proxy') ||
    url.pathname.endsWith('/sw.js') ||
    url.pathname === '/sw.js' ||
    url.pathname.endsWith('/version.json') ||
    url.protocol === 'ws:' ||
    url.protocol === 'wss:'
  ) {
    return;
  }

  // Network-first for HTML navigations, stale-while-revalidate for static assets
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        })
        .catch(() => caches.match(request).then((res) => res || caches.match('./')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch in background to revalidate
        fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const clone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
          })
          .catch(() => {});
        return cachedResponse;
      }
      return fetch(request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseToCache);
        });
        return networkResponse;
      });
    })
  );
});
