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
  '/icons/icon-96.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
];

// Helper: Open the IndexedDB database matching StorageService
function openMusicDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('jtec_music_database', 1);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('songs')) {
        const songStore = db.createObjectStore('songs', { keyPath: 'id' });
        songStore.createIndex('title', 'title', { unique: false });
        songStore.createIndex('artist', 'artist', { unique: false });
        songStore.createIndex('album', 'album', { unique: false });
        songStore.createIndex('dateAdded', 'dateAdded', { unique: false });
      }
      if (!db.objectStoreNames.contains('audio_blobs')) {
        db.createObjectStore('audio_blobs');
      }
      if (!db.objectStoreNames.contains('playlists')) {
        db.createObjectStore('playlists', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('kv_store')) {
        db.createObjectStore('kv_store');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Helper: Save shared audio files into IndexedDB
async function saveSharedAudioToIndexedDB(files) {
  const db = await openMusicDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['songs', 'audio_blobs'], 'readwrite');
    const songStore = tx.objectStore('songs');
    const blobStore = tx.objectStore('audio_blobs');
    const addedSongs = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file || !(file instanceof Blob)) continue;

      const rawName = file.name || `Shared Audio ${new Date().toLocaleDateString()}`;
      const ext = (rawName.split('.').pop() || 'mp3').toLowerCase();
      const cleanTitle = rawName.replace(/\.[^/.]+$/, '').trim() || 'Shared Track';
      const songId = `shared_${Date.now()}_${Math.random().toString(36).slice(2, 9)}_${i}`;

      const song = {
        id: songId,
        title: cleanTitle,
        artist: 'Shared Track',
        album: 'Shared Library',
        duration: 0,
        format: ext,
        size: file.size || 0,
        dateAdded: Date.now() + i,
        isFavorite: false,
        hasStoredBlob: true,
        isCloud: false,
      };

      songStore.put(song);
      blobStore.put(file, songId);
      addedSongs.push(song);
    }

    tx.oncomplete = () => {
      // Notify all active clients about the new songs so the library updates live
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        for (const client of clients) {
          client.postMessage({
            type: 'SHARED_SONGS_ADDED',
            count: addedSongs.length,
          });
        }
      });
      resolve(addedSongs);
    };

    tx.onerror = () => reject(tx.error);
  });
}

// 1. Install event: Precache core shell and call self.skipWaiting()
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        await Promise.allSettled(
          PRECACHE_ASSETS.map((url) =>
            fetch(url, { cache: 'no-cache' })
              .then((res) => {
                if (res && res.status === 200) {
                  return cache.put(url, res);
                }
              })
              .catch(() => {})
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

// 2. Activate event: Claim clients immediately and delete old app-shell caches
// NOTE: Downloaded songs and covers are stored in IndexedDB (jtec_music_database)
// and are NEVER touched or removed by the service worker.
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

// 3. Background Sync event: retry failed requests when connection returns
self.addEventListener('sync', (event) => {
  if (event.tag === 'jtec-sync') {
    event.waitUntil(
      (async () => {
        try {
          // Notify client windows that background connectivity has returned
          const clients = await self.clients.matchAll({ type: 'window' });
          for (const client of clients) {
            client.postMessage({ type: 'SYNC_RETRY', tag: 'jtec-sync' });
          }
        } catch (err) {
          console.warn('[SW] Background sync retry failed:', err);
        }
      })()
    );
  }
});

// 4. Periodic Background Sync event: check for a new app version
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'jtec-update-check') {
    event.waitUntil(
      (async () => {
        try {
          const res = await fetch('/version.json?t=' + Date.now(), { cache: 'no-store' });
          if (res.ok) {
            const data = await res.json();
            if (data && data.version && data.version !== VERSION) {
              const clients = await self.clients.matchAll({ type: 'window' });
              for (const client of clients) {
                client.postMessage({
                  type: 'UPDATE_AVAILABLE',
                  version: data.version,
                  currentVersion: VERSION,
                });
              }
            }
          }
        } catch (err) {
          // Fail silently on periodic check network failures
        }
      })()
    );
  }
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

// 5. Fetch event:
// - Handle Share Target POST /share-target
// - Never cache the service worker itself or version.json
// - Cache-first for icons, images, and fonts
// - Network-first for index.html, main JS, CSS files, and routes (with cache fallback when offline)
// - Never intercept or disturb blob: or data: URLs (used by IndexedDB for local music/covers)
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Handle Share Target: receive audio files shared from external apps
  if (request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(
      (async () => {
        try {
          const formData = await request.formData();
          const files = formData.getAll('audio');
          if (files && files.length > 0) {
            await saveSharedAudioToIndexedDB(files);
          }
        } catch (err) {
          console.error('[SW] Failed to process shared audio files:', err);
        }
        // Redirect to open the app on the library screen showing the newly added songs
        return Response.redirect('/?tab=library&shared=1', 303);
      })()
    );
    return;
  }

  // Only handle HTTP/HTTPS GET requests
  if (request.method !== 'GET') {
    return;
  }

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
