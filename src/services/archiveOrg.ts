import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Song } from '../types/music';
import { downloadAndConvertCover } from './imageUtils';
import { generateProceduralArtwork } from './id3Parser';
import { extractPaletteFromImage } from './colorExtractor';

export interface ArchiveItemDoc {
  identifier: string;
  title: string;
  creator?: string;
  licenseurl?: string;
  downloads?: number;
}

export interface ArchiveAudioFile {
  name: string;
  title: string;
  size: number;
  length: number;
  format: string;
  downloadUrl: string;
  source?: string;
}

export interface ArchiveItemDetail extends ArchiveItemDoc {
  audioFiles: ArchiveAudioFile[];
  coverUrl?: string;
  hasRealImage: boolean;
  archiveUrl: string;
}

export interface ArchiveSearchResponse {
  docs: ArchiveItemDoc[];
  numFound: number;
  start: number;
}

export type ArchiveSortOption = 'downloads desc' | 'publicdate desc';

export interface ArchiveSessionState {
  searchQuery: string;
  activeChip: string;
  sort: ArchiveSortOption;
  items: ArchiveItemDoc[];
  page: number;
  hasMore: boolean;
  totalFound: number;
  activeDetailItem: ArchiveItemDetail | null;
}

/**
 * Persisted in-memory session state while the app remains open.
 */
export const archiveSessionState: ArchiveSessionState = {
  searchQuery: '',
  activeChip: 'all',
  sort: 'downloads desc',
  items: [],
  page: 1,
  hasMore: true,
  totalFound: 0,
  activeDetailItem: null,
};

const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache
const searchCache = new Map<string, { timestamp: number; data: ArchiveSearchResponse }>();
const metadataCache = new Map<string, ArchiveItemDetail>();

/**
 * Friendly formatter for license labels
 */
export function formatArchiveLicense(licenseUrl?: string): string {
  if (!licenseUrl || !licenseUrl.trim()) return 'No license listed';
  const lower = licenseUrl.toLowerCase();
  if (lower.includes('publicdomain/zero') || lower.includes('cc0')) return 'CC0 Public Domain';
  if (lower.includes('publicdomain/mark')) return 'Public Domain Mark';
  if (lower.includes('by-nc-sa')) return 'CC BY-NC-SA';
  if (lower.includes('by-nc-nd')) return 'CC BY-NC-ND';
  if (lower.includes('by-nc')) return 'CC BY-NC';
  if (lower.includes('by-sa')) return 'CC BY-SA';
  if (lower.includes('by-nd')) return 'CC BY-ND';
  if (lower.includes('/by/')) return 'CC BY';
  if (lower.includes('creativecommons.org')) return 'Creative Commons';
  return 'Standard Rights';
}

/**
 * Format creator/artist name: "Unknown artist" if empty or generic contributor
 */
export function formatArchiveCreator(creator?: string): string {
  if (!creator || !creator.trim() || creator.trim() === 'Internet Archive Contributor') {
    return 'Unknown artist';
  }
  return creator.trim();
}

/**
 * Format bytes to readable string (e.g. 5.2 MB)
 */
export function formatArchiveBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return 'Unknown size';
  const mb = bytes / (1024 * 1024);
  if (mb < 0.1) {
    const kb = bytes / 1024;
    return `${kb.toFixed(1)} KB`;
  }
  return `${mb.toFixed(1)} MB`;
}

/**
 * Format seconds to mm:ss
 */
export function formatArchiveDuration(secs: number): string {
  if (!secs || isNaN(secs) || secs <= 0) return '--:--';
  const total = Math.round(secs);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/**
 * Clean track title
 */
export function cleanTrackTitle(raw: string): string {
  if (!raw) return 'Untitled Track';
  return raw
    .replace(/\.(mp3|ogg|m4a|aac|flac|wav)$/i, '')
    .replace(/_/g, ' ')
    .trim();
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

export const ArchiveOrgService = {
  /**
   * Search Internet Archive audio items with paging (25 items per page) and sorting.
   * Everything the search returns is shown without artificial filters.
   */
  async searchItems(options: {
    searchTerm?: string;
    chip?: string;
    ccOnly?: boolean;
    sort?: ArchiveSortOption;
    page: number;
    forceRefresh?: boolean;
  }): Promise<ArchiveSearchResponse> {
    const {
      searchTerm = '',
      chip = 'all',
      ccOnly = false,
      sort = 'downloads desc',
      page = 1,
      forceRefresh = false,
    } = options;

    // Paging limit: archive.org allows up to 10,000 results
    if (page * 25 > 10000) {
      return { docs: [], numFound: 10000, start: 10000 };
    }

    const cacheKey = `${searchTerm.trim()}::${chip}::${ccOnly}::${sort}::${page}`;
    if (!forceRefresh) {
      const cached = searchCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < SEARCH_CACHE_TTL_MS) {
        return cached.data;
      }
    }

    // Friendly offline check
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new Error("Can't connect to Internet Archive right now. Check your internet.");
    }

    // Determine query subject based on active chip
    let subjectQuery = '';
    switch (chip) {
      case 'nasheed':
        subjectQuery = 'nasheed';
        break;
      case 'anasheed':
        subjectQuery = 'anasheed';
        break;
      case 'nashid':
        subjectQuery = 'nashid';
        break;
      case 'arabic':
        subjectQuery = 'نشيد';
        break;
      case 'ilahi':
        subjectQuery = 'ilahi';
        break;
      case 'islamic':
        subjectQuery = 'islamic';
        break;
      case 'all':
      default:
        subjectQuery = 'nasheed OR anasheed OR nashid OR ilahi OR نشيد OR أناشيد';
        break;
    }

    let finalQuery: string;
    const cleanSearch = searchTerm.trim();
    if (cleanSearch) {
      if (chip !== 'all') {
        finalQuery = `(${cleanSearch}) AND (${subjectQuery}) AND mediatype:audio`;
      } else {
        // Search term with default subject terms
        finalQuery = `(${cleanSearch}) AND (${subjectQuery}) AND mediatype:audio`;
      }
    } else {
      finalQuery = `(${subjectQuery}) AND mediatype:audio`;
    }

    if (ccOnly) {
      finalQuery += ' AND licenseurl:*creativecommons*';
    }

    const params = new URLSearchParams();
    params.set('q', finalQuery);
    params.append('fl[]', 'identifier');
    params.append('fl[]', 'title');
    params.append('fl[]', 'creator');
    params.append('fl[]', 'licenseurl');
    params.append('fl[]', 'downloads');
    params.set('rows', '25');
    params.set('page', String(page));
    params.append('sort[]', sort);
    params.set('output', 'json');

    const searchUrl = `https://archive.org/advancedsearch.php?${params.toString()}`;

    let responseData: any = null;

    try {
      if (Capacitor.isNativePlatform()) {
        const nativeRes = await CapacitorHttp.get({
          url: searchUrl,
          headers: { Accept: 'application/json' },
        });
        if (nativeRes.status < 200 || nativeRes.status >= 300) {
          throw new Error(`HTTP ${nativeRes.status}`);
        }
        responseData = typeof nativeRes.data === 'string' ? JSON.parse(nativeRes.data) : nativeRes.data;
      } else {
        const webRes = await fetch(searchUrl);
        if (!webRes.ok) {
          throw new Error(`HTTP ${webRes.status}`);
        }
        responseData = await webRes.json();
      }

      const responseObj = responseData?.response || {};
      const docs: ArchiveItemDoc[] = (responseObj.docs || []).map((doc: any) => ({
        identifier: String(doc.identifier || ''),
        title: String(doc.title || doc.identifier || 'Untitled Item'),
        creator: doc.creator ? String(doc.creator) : undefined,
        licenseurl: doc.licenseurl ? String(doc.licenseurl) : undefined,
        downloads: typeof doc.downloads === 'number' ? doc.downloads : parseInt(doc.downloads || '0', 10) || 0,
      })).filter((doc: ArchiveItemDoc) => Boolean(doc.identifier));

      const numFound = typeof responseObj.numFound === 'number' ? responseObj.numFound : 0;
      const start = typeof responseObj.start === 'number' ? responseObj.start : 0;

      const result: ArchiveSearchResponse = {
        docs,
        numFound: Math.min(numFound, 10000),
        start,
      };

      searchCache.set(cacheKey, { timestamp: Date.now(), data: result });
      return result;
    } catch (err) {
      console.warn('[ArchiveOrgService] Search error:', err);
      throw new Error("Can't load Internet Archive right now. Check your internet.");
    }
  },

  /**
   * Fetch item metadata, extract audio files, and verify if a real image exists (JPEG or PNG)
   */
  async getItemDetails(identifier: string): Promise<ArchiveItemDetail> {
    if (!identifier) {
      throw new Error('Invalid item identifier');
    }

    // Check session cache
    if (metadataCache.has(identifier)) {
      return metadataCache.get(identifier)!;
    }

    const metadataUrl = `https://archive.org/metadata/${encodeURIComponent(identifier)}`;
    let data: any = null;

    try {
      if (Capacitor.isNativePlatform()) {
        const nativeRes = await CapacitorHttp.get({
          url: metadataUrl,
          headers: { Accept: 'application/json' },
        });
        if (nativeRes.status < 200 || nativeRes.status >= 300) {
          throw new Error(`HTTP ${nativeRes.status}`);
        }
        data = typeof nativeRes.data === 'string' ? JSON.parse(nativeRes.data) : nativeRes.data;
      } else {
        const webRes = await fetch(metadataUrl);
        if (!webRes.ok) {
          throw new Error(`HTTP ${webRes.status}`);
        }
        data = await webRes.json();
      }

      const files: any[] = Array.isArray(data?.files) ? data.files : [];
      const meta = data?.metadata || {};

      // Filter only audio files and deduplicate derivative copies
      const audioExtensions = ['.mp3', '.ogg', '.m4a', '.aac', '.flac', '.wav'];
      const rawAudio = files.filter((f) => {
        const name = (f.name || '').toLowerCase();
        const format = (f.format || '').toLowerCase();
        const hasExt = audioExtensions.some((ext) => name.endsWith(ext));
        const hasFmt =
          format.includes('mp3') ||
          format.includes('vorbis') ||
          format.includes('ogg') ||
          format.includes('m4a') ||
          format.includes('flac') ||
          format.includes('audio');
        return (
          (hasExt || hasFmt) &&
          !name.endsWith('.png') &&
          !name.endsWith('.jpg') &&
          !name.endsWith('.xml') &&
          !name.endsWith('.txt') &&
          !name.endsWith('.sqlite') &&
          !name.endsWith('.torrent')
        );
      });

      // Prefer MP3s, avoid derivative copies of the same track
      const kept: any[] = [];
      const seenTracks = new Set<string>();

      // First pass: add MP3s
      const mp3s = rawAudio.filter(
        (f) => (f.name || '').toLowerCase().endsWith('.mp3') || (f.format || '').toLowerCase().includes('mp3')
      );
      for (const f of mp3s) {
        const baseName = (f.original || f.name).replace(/\.[^/.]+$/, '').toLowerCase();
        if (!seenTracks.has(baseName)) {
          seenTracks.add(baseName);
          kept.push(f);
        }
      }

      // Second pass: add other audio if track not seen yet
      for (const f of rawAudio) {
        const baseName = (f.original || f.name).replace(/\.[^/.]+$/, '').toLowerCase();
        if (!seenTracks.has(baseName)) {
          seenTracks.add(baseName);
          kept.push(f);
        }
      }

      const audioFiles: ArchiveAudioFile[] = kept.map((f) => {
        const cleanTitle = cleanTrackTitle(f.title || f.name);
        const size = parseInt(f.size || '0', 10) || 0;
        const length = parseFloat(f.length || '0') || 0;
        const encodedName = encodeURIComponent(f.name).replace(/%2F/g, '/');
        const downloadUrl = `https://archive.org/download/${identifier}/${encodedName}`;
        return {
          name: f.name,
          title: cleanTitle,
          size,
          length,
          format: (f.name.split('.').pop() || 'mp3').toLowerCase(),
          downloadUrl,
          source: f.source,
        };
      });

      // Check if item has a real image file (JPEG or PNG) and not a generic audio waveform
      const realImageFile = files.find((f: any) => {
        const name = (f.name || '').toLowerCase();
        const isImg = name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png');
        const isNotWaveform = !name.includes('waveform') && !name.includes('spectrogram') && !name.includes('_thumb');
        return isImg && isNotWaveform && f.source === 'original';
      }) || files.find((f: any) => {
        const name = (f.name || '').toLowerCase();
        const isImg = name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png');
        const isNotWaveform = !name.includes('waveform') && !name.includes('spectrogram') && !name.includes('_thumb');
        return isImg && isNotWaveform;
      });

      const hasRealImage = Boolean(realImageFile);
      const coverUrl = realImageFile
        ? `https://archive.org/download/${identifier}/${encodeURIComponent(realImageFile.name).replace(/%2F/g, '/')}`
        : undefined;

      const detail: ArchiveItemDetail = {
        identifier,
        title: meta.title || identifier,
        creator: meta.creator || meta.artist,
        licenseurl: meta.licenseurl,
        downloads: meta.downloads ? parseInt(meta.downloads, 10) : undefined,
        audioFiles,
        coverUrl,
        hasRealImage,
        archiveUrl: `https://archive.org/details/${identifier}`,
      };

      metadataCache.set(identifier, detail);
      return detail;
    } catch (err) {
      console.warn(`[ArchiveOrgService] Metadata fetch failed for ${identifier}:`, err);
      throw new Error("Can't load item details right now.");
    }
  },

  /**
   * Downloads an audio file from Internet Archive, returns Song record + Blob for offline storage
   */
  async downloadFileBlob(
    item: ArchiveItemDetail,
    file: ArchiveAudioFile,
    onProgress?: (percent: number) => void
  ): Promise<{ song: Song; blob: Blob }> {
    if (onProgress) onProgress(10);

    let audioBlob: Blob;

    try {
      if (Capacitor.isNativePlatform()) {
        const response = await CapacitorHttp.get({
          url: file.downloadUrl,
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
        const response = await fetch(file.downloadUrl);
        if (!response.ok) {
          throw new Error(`Download failed with status ${response.status}`);
        }

        const contentLength = response.headers.get('content-length');
        const totalBytes = contentLength ? parseInt(contentLength, 10) : file.size || 0;

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
      const songId = `archive_${item.identifier}_${file.name.replace(/[^a-zA-Z0-9_]/g, '_')}`;
      const localSong: Song = {
        id: songId,
        title: file.title || cleanTrackTitle(file.name),
        artist: formatArchiveCreator(item.creator),
        album: item.title || 'Archive Collection',
        duration: file.length || 0,
        genre: 'Nasheed',
        artworkUrl: undefined,
        coverUrl: item.coverUrl,
        format: file.format || 'mp3',
        size: audioBlob.size,
        dateAdded: Date.now(),
        hasStoredBlob: true,
        cloudId: songId,
        isCloud: false,
        source: 'archive',
        license: formatArchiveLicense(item.licenseurl),
      };

      // Save cover as small JPEG data URL for offline display if item has real cover image
      if (item.hasRealImage && item.coverUrl) {
        try {
          const coverDataUrl = await downloadAndConvertCover(item.coverUrl, 512, 0.85);
          localSong.artworkUrl = coverDataUrl;
          try {
            localSong.palette = await extractPaletteFromImage(coverDataUrl);
          } catch {
            // palette fallback
          }
        } catch {
          localSong.artworkUrl = generateProceduralArtwork(localSong.title, localSong.artist);
          try {
            localSong.palette = await extractPaletteFromImage(localSong.artworkUrl);
          } catch {
            // palette fallback
          }
        }
      } else {
        localSong.artworkUrl = generateProceduralArtwork(localSong.title, localSong.artist);
        try {
          localSong.palette = await extractPaletteFromImage(localSong.artworkUrl);
        } catch {
          // palette fallback
        }
      }

      if (onProgress) onProgress(100);
      return { song: localSong, blob: audioBlob };
    } catch (err: unknown) {
      console.warn('[ArchiveOrgService] Download error:', err);
      throw new Error("Can't download file right now. Check your internet.");
    }
  },
};
