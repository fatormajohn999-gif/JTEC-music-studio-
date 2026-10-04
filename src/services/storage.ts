import { Song, Playlist, AppSettings } from '../types/music';

const DB_NAME = 'jtec_music_database';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

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

  return dbPromise;
}

export const StorageService = {
  // SONGS
  async getAllSongs(): Promise<Song[]> {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('songs', 'readonly');
      const store = tx.objectStore('songs');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },

  async saveSong(song: Song, audioBlob?: Blob): Promise<void> {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(audioBlob ? ['songs', 'audio_blobs'] : ['songs'], 'readwrite');
      const songStore = tx.objectStore('songs');
      songStore.put(song);

      if (audioBlob) {
        const blobStore = tx.objectStore('audio_blobs');
        blobStore.put(audioBlob, song.id);
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async saveMultipleSongs(songsWithBlobs: { song: Song; blob?: Blob }[]): Promise<void> {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['songs', 'audio_blobs'], 'readwrite');
      const songStore = tx.objectStore('songs');
      const blobStore = tx.objectStore('audio_blobs');

      for (const item of songsWithBlobs) {
        songStore.put(item.song);
        if (item.blob) {
          blobStore.put(item.blob, item.song.id);
        }
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async getSongBlob(songId: string): Promise<Blob | null> {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('audio_blobs', 'readonly');
      const store = tx.objectStore('audio_blobs');
      const req = store.get(songId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  },

  async deleteSong(songId: string): Promise<void> {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['songs', 'audio_blobs'], 'readwrite');
      tx.objectStore('songs').delete(songId);
      tx.objectStore('audio_blobs').delete(songId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async toggleFavorite(songId: string, isFavorite: boolean): Promise<void> {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('songs', 'readwrite');
      const store = tx.objectStore('songs');
      const req = store.get(songId);
      req.onsuccess = () => {
        const song: Song = req.result;
        if (song) {
          song.isFavorite = isFavorite;
          store.put(song);
        }
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  },

  // PLAYLISTS
  async getAllPlaylists(): Promise<Playlist[]> {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('playlists', 'readonly');
      const store = tx.objectStore('playlists');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },

  async savePlaylist(playlist: Playlist): Promise<void> {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('playlists', 'readwrite');
      const store = tx.objectStore('playlists');
      store.put(playlist);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async deletePlaylist(playlistId: string): Promise<void> {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('playlists', 'readwrite');
      tx.objectStore('playlists').delete(playlistId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  // RECENTLY PLAYED
  async getRecentlyPlayed(): Promise<string[]> {
    const db = await getDB();
    return new Promise((resolve) => {
      const tx = db.transaction('kv_store', 'readonly');
      const store = tx.objectStore('kv_store');
      const req = store.get('recently_played');
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  },

  async addRecentlyPlayed(songId: string): Promise<void> {
    const list = await this.getRecentlyPlayed();
    const updated = [songId, ...list.filter(id => id !== songId)].slice(0, 30);
    const db = await getDB();
    return new Promise((resolve) => {
      const tx = db.transaction('kv_store', 'readwrite');
      const store = tx.objectStore('kv_store');
      store.put(updated, 'recently_played');
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  },

  // SETTINGS
  async getSettings(): Promise<AppSettings> {
    const defaultSettings: AppSettings = {
      performanceMode: 'balanced',
      visualizerMode: 'circular',
      autoplayNext: true,
      rememberLastSong: true,
      neonGlow: true,
      reducedMotion: false,
    };
    try {
      const db = await getDB();
      return new Promise((resolve) => {
        const tx = db.transaction('kv_store', 'readonly');
        const store = tx.objectStore('kv_store');
        const req = store.get('app_settings');
        req.onsuccess = () => resolve({ ...defaultSettings, ...(req.result || {}) });
        req.onerror = () => resolve(defaultSettings);
      });
    } catch {
      return defaultSettings;
    }
  },

  async saveSettings(settings: AppSettings): Promise<void> {
    const db = await getDB();
    return new Promise((resolve) => {
      const tx = db.transaction('kv_store', 'readwrite');
      const store = tx.objectStore('kv_store');
      store.put(settings, 'app_settings');
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  },

  // STORAGE USAGE
  async getStorageStats(): Promise<{ songCount: number; estimatedBytes: number }> {
    const songs = await this.getAllSongs();
    let totalBytes = 0;
    for (const song of songs) {
      totalBytes += song.size || 0;
    }
    return {
      songCount: songs.length,
      estimatedBytes: totalBytes,
    };
  },

  async clearEntireLibrary(): Promise<void> {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['songs', 'audio_blobs', 'playlists', 'kv_store'], 'readwrite');
      tx.objectStore('songs').clear();
      tx.objectStore('audio_blobs').clear();
      tx.objectStore('playlists').clear();
      tx.objectStore('kv_store').clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
};
