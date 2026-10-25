// Service Worker for JTEC MUSIC PWA
const CACHE_NAME = 'jtec-music-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
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

  // Never intercept or cache Supabase, REST API, cross-origin API requests, or media streams
  if (
    url.hostname.includes('supabase') ||
    url.pathname.includes('/rest/v') ||
    url.pathname.includes('/storage/v') ||
    url.pathname.includes('/auth/v') ||
    url.pathname.startsWith('/api/') ||
    url.searchParams.has('apikey') ||
    request.headers.has('apikey') ||
    url.origin !== self.location.origin ||
    url.pathname.includes('/@vite/') || 
    url.pathname.includes('/@fs/') ||
    url.protocol === 'ws:' || 
    url.protocol === 'wss:'
  ) {
    return;
  }

  // Network-first for HTML, stale-while-revalidate for static assets
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request).then((res) => res || caches.match('./')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch in background to revalidate
        fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
        }).catch(() => {});
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
