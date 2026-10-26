import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { JamendoTrack, Song } from '../types/music';
import { downloadAndConvertCover } from './imageUtils';
import { generateProceduralArtwork } from './id3Parser';
import { extractPaletteFromImage } from './colorExtractor';

export const JAMENDO_BASE_URL = 'https://api.jamendo.com/v3.0/tracks/';
export const JAMENDO_WEBSITE_URL = 'https://www.jamendo.com';

// Cache results for each query and page for 10 minutes while the app is open
interface CacheEntry {
  tracks: JamendoTrack[];
  timestamp: number;
}
const queryPageCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export interface JamendoQueryParams {
  order?: 'popularity_total' | 'releasedate_desc';
  search?: string;
  artist_name?: string;
  genre?: string;
  offset?: number;
  limit?: number;
}

/**
 * Extracts a friendly human-readable Creative Commons license label from the Jamendo license_ccurl.
 */
export function formatLicenseLabel(licenseUrl?: string): string {
  if (!licenseUrl) return 'CC License';
  const lower = licenseUrl.toLowerCase();
  if (lower.includes('by-nc-sa')) return 'CC BY-NC-SA';
  if (lower.includes('by-nc-nd')) return 'CC BY-NC-ND';
  if (lower.includes('by-nc')) return 'CC BY-NC';
  if (lower.includes('by-sa')) return 'CC BY-SA';
  if (lower.includes('by-nd')) return 'CC BY-ND';
  if (lower.includes('zero') || lower.includes('cc0')) return 'CC0';
  if (lower.includes('by')) return 'CC BY';
  return 'Creative Commons';
}

/**
 * Converts a base64 string returned by native CapacitorHttp to a binary Blob.
 */
function base64ToBlob(base64Data: string, mimeType = 'audio/mpeg'): Blob {
  const base64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

export const JamendoService = {
  /**
   * Reads client ID securely from import.meta.env.VITE_JAMENDO_CLIENT_ID.
   * Never logs or exposes the client ID.
   */
  getClientId(): string {
    return (import.meta.env.VITE_JAMENDO_CLIENT_ID || '').trim();
  },

  /**
   * Fetches tracks from Jamendo API v3.0 with paging and filtering.
   * Caches results for each query and page for 10 minutes.
   * Retries up to 3 times with increasing delays on failure.
   */
  async fetchTracks(params: JamendoQueryParams = {}, skipCache = false): Promise<JamendoTrack[]> {
    const clientId = this.getClientId();
    const limit = params.limit || 20;
    const offset = params.offset || 0;
    const order = params.order || 'popularity_total';
    const search = (params.search || '').trim();
    const artistName = (params.artist_name || '').trim();
    const genre = (params.genre || '').trim().toLowerCase();

    const cacheKey = `${order}::${search}::${artistName}::${genre}::${offset}`;

    // Return cached results if still fresh within 10 minutes
    if (!skipCache) {
      const cached = queryPageCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.tracks;
      }
    }

    // Friendly offline check
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new Error("Can't load Jamendo right now. Check your internet.");
    }

    const url = new URL(JAMENDO_BASE_URL);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('imagesize', '300');
    url.searchParams.set('include', 'licenses');
    url.searchParams.set('audioformat', 'mp32');

    if (artistName) {
      url.searchParams.set('artist_name', artistName);
    } else if (search) {
      url.searchParams.set('namesearch', search);
    }

    if (genre && genre !== 'all') {
      const tagMap: Record<string, string> = {
        'hip hop': 'hiphop',
      };
      const tag = tagMap[genre] || genre;
      url.searchParams.set('tags', tag);
    }

    if (!search && !artistName) {
      url.searchParams.set('order', order);
    }

    // Retry up to 3 times with increasing delays (400ms, 800ms, 1600ms)
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url.toString());
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        if (data?.headers?.status === 'failed') {
          console.warn('[Jamendo API notice]:', data?.headers?.error_message);
          throw new Error("Can't load Jamendo right now. Check your internet.");
        }

        const tracks: JamendoTrack[] = (data.results || []).map((t: any) => ({
          id: String(t.id),
          name: t.name || 'Untitled Track',
          duration: Number(t.duration) || 0,
          artist_id: String(t.artist_id || ''),
          artist_name: t.artist_name || 'Unknown Artist',
          album_id: t.album_id ? String(t.album_id) : undefined,
          album_name: t.album_name || 'Single',
          album_image: t.album_image || '',
          image: t.image || t.album_image || '',
          audio: t.audio || '',
          audiodownload: t.audiodownload || t.audio || '',
          audiodownload_allowed: Boolean(t.audiodownload_allowed),
          license_ccurl: t.license_ccurl || '',
          shareurl: t.shareurl || `${JAMENDO_WEBSITE_URL}/track/${t.id}`,
          shorturl: t.shorturl || '',
        }));

        // Store in 10-minute cache
        queryPageCache.set(cacheKey, {
          tracks,
          timestamp: Date.now(),
        });

        return tracks;
      } catch (err: unknown) {
        lastError = err;
        if (attempt < 2) {
          // Exponential backoff delay
          await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 400));
        }
      }
    }

    console.warn('[JamendoService] Request failed after 3 attempts:', lastError);
    throw new Error("Can't load Jamendo right now. Check your internet.");
  },

  /**
   * Clears the in-memory 10-minute cache.
   */
  clearCache(): void {
    queryPageCache.clear();
  },

  /**
   * Downloads a Jamendo track to local persistent storage.
   * Uses CapacitorHttp on native Android to bypass CORS, and fetch on web.
   * Respects audiodownload_allowed strictly and saves cover as data URL.
   */
  async downloadTrack(
    track: JamendoTrack,
    onProgress?: (percent: number) => void
  ): Promise<{ song: Song; blob: Blob }> {
    if (!track.audiodownload_allowed) {
      throw new Error('Download is not available for this track (Pro licensing required).');
    }

    const downloadUrl = track.audiodownload || track.audio;
    if (!downloadUrl) {
      throw new Error("Can't load Jamendo right now. Check your internet.");
    }

    if (onProgress) onProgress(10);

    let audioBlob: Blob;

    try {
      if (Capacitor.isNativePlatform()) {
        // Use Capacitor's native HTTP on Android to prevent CORS issues
        const response = await CapacitorHttp.get({
          url: downloadUrl,
          responseType: 'blob',
        });

        if (response.status < 200 || response.status >= 300) {
          throw new Error(`Download failed with status ${response.status}`);
        }

        if (onProgress) onProgress(60);

        if (response.data instanceof Blob) {
          audioBlob = response.data;
        } else if (typeof response.data === 'string') {
          audioBlob = base64ToBlob(response.data, 'audio/mpeg');
        } else {
          audioBlob = new Blob([response.data], { type: 'audio/mpeg' });
        }
      } else {
        // Standard fetch on web
        const response = await fetch(downloadUrl);
        if (!response.ok) {
          throw new Error(`Download failed with status ${response.status}`);
        }

        const contentLength = response.headers.get('content-length');
        const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;

        if (response.body && totalBytes > 0) {
          const reader = response.body.getReader();
          const chunks: Uint8Array[] = [];
          let receivedBytes = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              chunks.push(value);
              receivedBytes += value.length;
              if (onProgress) {
                const pct = Math.min(85, Math.round((receivedBytes / totalBytes) * 75) + 10);
                onProgress(pct);
              }
            }
          }

          audioBlob = new Blob(chunks as any, { type: 'audio/mpeg' });
        } else {
          if (onProgress) onProgress(50);
          audioBlob = await response.blob();
        }
      }

      if (!audioBlob || audioBlob.size === 0) {
        throw new Error('Downloaded file was empty.');
      }

      if (onProgress) onProgress(90);

      // Construct offline Song record
      const licenseLabel = formatLicenseLabel(track.license_ccurl);
      const localSong: Song = {
        id: `jamendo_${track.id}`,
        title: track.name,
        artist: track.artist_name,
        album: track.album_name || 'Single',
        duration: track.duration,
        genre: 'Jamendo Indie',
        artworkUrl: undefined,
        coverUrl: track.image,
        format: 'mp3',
        size: audioBlob.size,
        dateAdded: Date.now(),
        hasStoredBlob: true,
        cloudId: `jamendo_${track.id}`,
        isCloud: false,
        source: 'jamendo',
        license: licenseLabel,
        jamendoUrl: track.shareurl || `${JAMENDO_WEBSITE_URL}/track/${track.id}`,
      };

      // Download and convert album cover to persistent JPEG data URL
      if (track.image) {
        try {
          const coverDataUrl = await downloadAndConvertCover(track.image, 512, 0.85);
          localSong.artworkUrl = coverDataUrl;
          try {
            localSong.palette = await extractPaletteFromImage(coverDataUrl);
          } catch {
            // palette fallback
          }
        } catch {
          localSong.artworkUrl = generateProceduralArtwork(track.name, track.artist_name);
          try {
            localSong.palette = await extractPaletteFromImage(localSong.artworkUrl);
          } catch {
            // palette fallback
          }
        }
      } else {
        localSong.artworkUrl = generateProceduralArtwork(track.name, track.artist_name);
        try {
          localSong.palette = await extractPaletteFromImage(localSong.artworkUrl);
        } catch {
          // palette fallback
        }
      }

      if (onProgress) onProgress(100);
      return { song: localSong, blob: audioBlob };
    } catch (err: unknown) {
      console.warn('[JamendoService] Download error:', err);
      throw new Error("Can't load Jamendo right now. Check your internet.");
    }
  },
};
