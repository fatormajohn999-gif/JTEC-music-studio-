import { MediaSession } from '@jofr/capacitor-media-session';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Song } from '../types/music';
import { WidgetBridge, prepareWidgetArtworkBase64, WidgetActionType } from './widgetBridge';
import { audioEngine } from './audioEngine';

export interface MediaSessionCallbacks {
  onPlay: () => void;
  onPause: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeek: (seconds: number) => void;
  onSeekBackward?: (offset?: number) => void;
  onSeekForward?: (offset?: number) => void;
  onStop?: () => void;
  onToggleFavorite?: () => void;
}

export interface PublishNowPlayingOptions {
  playing?: boolean;
  position?: number;
  duration?: number;
  playbackRate?: number;
  accentColor?: string;
  isFavorite?: boolean;
  hasPrev?: boolean;
  hasNext?: boolean;
}

// LRU-bounded cache of 512x512 center-cropped JPEG (quality 0.9) data URLs
const artwork512Cache = new Map<string, string>();
const MAX_ARTWORK_CACHE_ITEMS = 20;

let activeSongId: string | null = null;
let lastPublishedCoverSource: string | null = null;
let lastKnownDuration = 0;
let lastKnownRate = 1.0;
let currentCallbacks: MediaSessionCallbacks | null = null;
let actionHandlersInitialized = false;
let widgetActionListenerInitialized = false;

// Position sync tracking (updated on track change, play, pause, seek, rate change, and every 10s while playing)
let lastPositionSyncTime = 0;
let lastReportedPosition = -1;
let currentIsPlaying = false;
let suppressPausedUntil = 0;

// Tiny emergency fallback only if canvas is unavailable (SSR/test)
const EMERGENCY_1X1_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

let cachedFallback512Jpeg: string | null = null;
let fallbackBuildPromise: Promise<string> | null = null;

/**
 * Cleans a song title for notification, lock screen, Bluetooth, and widget display only
 * (never mutates the stored library title).
 */
export function cleanDisplayTitle(rawTitle?: string): string {
  if (!rawTitle) return 'Untitled Track';
  let title = rawTitle.replace(/_/g, ' ');

  // Remove bracketed / parenthesized tags such as (Official Video), (Official Audio), (Lyrics), [HD], etc.
  const tagPattern =
    /\s*[\(\[]\s*(?:official\s*(?:music\s*)?(?:video|audio|visualizer|lyric\s*video|lyrics)?|lyric\s*video|lyrics?|audio(?:\s*only)?|music\s*video|visualizer|hd|hq|4k|explicit|clean\s*version)\s*[\)\]]/gi;
  let prev = '';
  while (prev !== title) {
    prev = title;
    title = title.replace(tagPattern, '');
  }

  // Remove trailing long numbers (8 or more digits), e.g. "- 12345678", "(123456789)", "12345678"
  title = title.replace(/(?:[\s\-_|•]*[\(\[]?\d{8,}[\)\]]?)+$/g, '');

  // Collapse multiple spaces and clean trailing separators
  title = title
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s\-_|•]+$/g, '')
    .replace(/^[\s\-_|•]+/g, '')
    .trim();

  return title || 'Untitled Track';
}

/**
 * Cleans artist name for external display surfaces; replaces empty or "Unknown Artist" with "JTEC MUSIC".
 */
export function cleanDisplayArtist(rawArtist?: string): string {
  const cleaned = (rawArtist || '').replace(/\s{2,}/g, ' ').trim();
  if (!cleaned || /^(unknown(\s*artist)?|artist|none|null|undefined)$/i.test(cleaned)) {
    return 'JTEC MUSIC';
  }
  return cleaned;
}

/**
 * Cleans album name for external display surfaces so Android notification text ("artist - album") is always clean.
 */
export function cleanDisplayAlbum(rawAlbum?: string): string {
  const cleaned = (rawAlbum || '').replace(/\s{2,}/g, ' ').trim();
  return cleaned || 'JTEC MUSIC';
}

function drawDarkNavyGradientBackdrop(ctx: CanvasRenderingContext2D, size: number) {
  const bgGrad = ctx.createLinearGradient(0, 0, size, size);
  bgGrad.addColorStop(0, '#050814');
  bgGrad.addColorStop(0.55, '#0b1530');
  bgGrad.addColorStop(1, '#1a1038');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, size, size);

  const cyanGlow = ctx.createRadialGradient(size * 0.25, size * 0.22, 8, size * 0.25, size * 0.22, size * 0.72);
  cyanGlow.addColorStop(0, 'rgba(34, 211, 238, 0.24)');
  cyanGlow.addColorStop(1, 'rgba(34, 211, 238, 0)');
  ctx.fillStyle = cyanGlow;
  ctx.fillRect(0, 0, size, size);

  const purpleGlow = ctx.createRadialGradient(size * 0.8, size * 0.82, 8, size * 0.8, size * 0.82, size * 0.65);
  purpleGlow.addColorStop(0, 'rgba(168, 85, 247, 0.26)');
  purpleGlow.addColorStop(1, 'rgba(168, 85, 247, 0)');
  ctx.fillStyle = purpleGlow;
  ctx.fillRect(0, 0, size, size);
}

function loadImageElement(src: string, timeoutMs = 5000): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => reject(new Error('Image load timed out')), timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error('Image load failed'));
    };
    img.src = src;
  });
}

function drawRoundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Generates and caches a 512x512 JPEG (quality 0.9) featuring the JTEC MUSIC logo on a dark navy gradient.
 */
export async function buildFallbackCover512Jpeg(): Promise<string> {
  if (cachedFallback512Jpeg) return cachedFallback512Jpeg;
  if (fallbackBuildPromise) return fallbackBuildPromise;

  fallbackBuildPromise = (async () => {
    if (typeof document === 'undefined') {
      return EMERGENCY_1X1_PNG;
    }

    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return EMERGENCY_1X1_PNG;

    drawDarkNavyGradientBackdrop(ctx, size);

    let logoImg: HTMLImageElement | null = null;
    for (const candidate of ['logo.png', 'icons/icon-192.png', 'pwa-192x192.png']) {
      try {
        logoImg = await loadImageElement(candidate, 2500);
        break;
      } catch {
        // try next candidate
      }
    }

    if (logoImg) {
      const boxSize = 276;
      const boxX = (size - boxSize) / 2;
      const boxY = (size - boxSize) / 2 - 14;
      ctx.save();
      drawRoundedRectPath(ctx, boxX, boxY, boxSize, boxSize, 48);
      ctx.clip();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      const nw = logoImg.naturalWidth || logoImg.width || boxSize;
      const nh = logoImg.naturalHeight || logoImg.height || boxSize;
      const minDim = Math.min(nw, nh);
      const sx = (nw - minDim) / 2;
      const sy = (nh - minDim) / 2;
      ctx.drawImage(logoImg, sx, sy, minDim, minDim, boxX, boxY, boxSize, boxSize);
      ctx.restore();

      ctx.strokeStyle = 'rgba(34, 211, 238, 0.35)';
      ctx.lineWidth = 3;
      drawRoundedRectPath(ctx, boxX, boxY, boxSize, boxSize, 48);
      ctx.stroke();

      ctx.fillStyle = 'rgba(226, 232, 240, 0.9)';
      ctx.font = '700 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('JTEC MUSIC', size / 2, boxY + boxSize + 48);
    } else {
      ctx.fillStyle = '#22D3EE';
      ctx.font = '900 116px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('JT', size / 2, size / 2 - 20);
      ctx.fillStyle = '#E2E8F0';
      ctx.font = '700 28px sans-serif';
      ctx.fillText('JTEC MUSIC', size / 2, size / 2 + 78);
    }

    const jpeg = canvas.toDataURL('image/jpeg', 0.9);
    cachedFallback512Jpeg = jpeg;
    return jpeg;
  })();

  try {
    return await fallbackBuildPromise;
  } finally {
    fallbackBuildPromise = null;
  }
}

export function getFallbackIconUrl(): string {
  return cachedFallback512Jpeg || EMERGENCY_1X1_PNG;
}

// Preload the 512x512 JTEC fallback cover eagerly so track switches never start with a blank icon
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  buildFallbackCover512Jpeg().catch(() => {});
}

function cacheArtwork512(key: string, value: string) {
  if (artwork512Cache.size >= MAX_ARTWORK_CACHE_ITEMS) {
    const firstKey = artwork512Cache.keys().next().value;
    if (firstKey !== undefined) {
      artwork512Cache.delete(firstKey);
    }
  }
  artwork512Cache.set(key, value);
}

/**
 * Draws any image source (data URL, blob URL, or http/https remote URL) onto a 512x512 canvas,
 * center-cropped (never stretched), and exports JPEG quality 0.9.
 */
export async function resizeImageTo512DataUrl(src: string): Promise<string> {
  if (!src) {
    return buildFallbackCover512Jpeg();
  }

  let objectUrlToRevoke: string | null = null;
  let loadSrc = src;

  try {
    if (src.startsWith('http://') || src.startsWith('https://')) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 7000);
        const res = await fetch(src, {
          signal: controller.signal,
          headers: { Accept: 'image/*' },
        });
        clearTimeout(timer);
        if (res.ok) {
          const blob = await res.blob();
          if (blob && blob.size > 0) {
            objectUrlToRevoke = URL.createObjectURL(blob);
            loadSrc = objectUrlToRevoke;
          }
        }
      } catch {
        // On native Android, fallback to CapacitorHttp if WebView fetch was blocked by CORS
        if (Capacitor.isNativePlatform()) {
          try {
            const nativeRes = await CapacitorHttp.get({ url: src, responseType: 'blob' });
            if (nativeRes.status >= 200 && nativeRes.status < 300 && typeof nativeRes.data === 'string') {
              const mime =
                nativeRes.headers?.['content-type'] ||
                nativeRes.headers?.['Content-Type'] ||
                'image/jpeg';
              loadSrc = nativeRes.data.startsWith('data:')
                ? nativeRes.data
                : `data:${mime};base64,${nativeRes.data}`;
            }
          } catch {
            // fall back to direct Image load
          }
        }
      }
    }

    const img = await loadImageElement(loadSrc, 5500);
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return buildFallbackCover512Jpeg();
    }

    ctx.fillStyle = '#060810';
    ctx.fillRect(0, 0, 512, 512);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const nw = img.naturalWidth || img.width || 512;
    const nh = img.naturalHeight || img.height || 512;
    const minDim = Math.min(nw, nh);
    const sx = Math.max(0, (nw - minDim) / 2);
    const sy = Math.max(0, (nh - minDim) / 2);

    ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, 512, 512);
    return canvas.toDataURL('image/jpeg', 0.9);
  } catch {
    return buildFallbackCover512Jpeg();
  } finally {
    if (objectUrlToRevoke) {
      try {
        URL.revokeObjectURL(objectUrlToRevoke);
      } catch {
        // ignore
      }
    }
  }
}

/**
 * Prepares a 512x512 center-cropped JPEG (quality 0.9) data URL for MediaSession.
 */
export async function prepareArtworkUrl(coverUrl?: string): Promise<string> {
  if (!coverUrl) {
    return buildFallbackCover512Jpeg();
  }

  const cached = artwork512Cache.get(coverUrl);
  if (cached) return cached;

  try {
    const jpeg512 = await resizeImageTo512DataUrl(coverUrl);
    cacheArtwork512(coverUrl, jpeg512);
    return jpeg512;
  } catch {
    return buildFallbackCover512Jpeg();
  }
}

// =========================================================================
// NATIVE ANDROID HOME SCREEN WIDGET SYNC STATE
// =========================================================================
const widgetSyncState = {
  trackId: '',
  title: '',
  artist: '',
  album: 'JTEC MUSIC',
  coverUrl: '',
  playing: false,
  positionMs: 0,
  durationMs: 0,
  rate: 1.0,
  accentColor: '#22D3EE',
  isFavorite: false,
  hasPrev: false,
  hasNext: false,
};

let lastSentArtworkTrackId: string | null = null;
let lastSentArtworkCoverUrl: string | null = null;
let lastWidgetSyncTime = 0;
let widgetDebounceTimer: ReturnType<typeof setTimeout> | null = null;

async function flushWidgetSync() {
  if (!WidgetBridge.isSupported()) return;

  try {
    const hasWidgets = await WidgetBridge.hasWidgets();
    if (!hasWidgets) {
      // Do not mark artwork as sent if no widgets exist yet, so adding one later gets artwork
      return;
    }

    const {
      trackId,
      title,
      artist,
      album,
      coverUrl,
      playing,
      positionMs,
      durationMs,
      rate,
      accentColor,
      isFavorite,
      hasPrev,
      hasNext,
    } = widgetSyncState;

    if (!trackId) {
      lastSentArtworkTrackId = null;
      lastSentArtworkCoverUrl = null;
      lastWidgetSyncTime = Date.now();
      await WidgetBridge.clear();
      return;
    }

    const trackOrCoverChanged =
      trackId !== lastSentArtworkTrackId || coverUrl !== lastSentArtworkCoverUrl;
    let artworkBase64: string | undefined;

    if (trackOrCoverChanged && coverUrl) {
      artworkBase64 = await prepareWidgetArtworkBase64(coverUrl);
      if (widgetSyncState.trackId !== trackId) {
        return;
      }
    }

    lastWidgetSyncTime = Date.now();
    await WidgetBridge.updateState({
      trackId,
      title: title || 'Untitled Track',
      artist: artist || 'JTEC MUSIC',
      album: album || 'JTEC MUSIC',
      playing,
      positionMs: Math.max(0, Math.round(positionMs)),
      durationMs: Math.max(0, Math.round(durationMs)),
      rate: Math.max(0.25, Math.min(3.0, rate || 1.0)),
      accentColor: accentColor || '#22D3EE',
      isFavorite,
      hasPrev,
      hasNext,
      ...(artworkBase64 ? { artwork: artworkBase64 } : {}),
    });

    if (trackOrCoverChanged && (!coverUrl || artworkBase64 !== undefined)) {
      lastSentArtworkTrackId = trackId;
      lastSentArtworkCoverUrl = coverUrl;
    }
  } catch {
    // Widget errors must never affect playback
  }
}

function scheduleWidgetSync() {
  if (!WidgetBridge.isSupported()) return;
  if (widgetDebounceTimer) {
    clearTimeout(widgetDebounceTimer);
  }
  widgetDebounceTimer = setTimeout(() => {
    widgetDebounceTimer = null;
    flushWidgetSync();
  }, 300);
}

async function applyMediaSessionPosition(
  position: number,
  duration: number,
  playbackRate: number,
  force: boolean
) {
  if (
    typeof duration !== 'number' ||
    !isFinite(duration) ||
    duration <= 0 ||
    typeof position !== 'number' ||
    !isFinite(position) ||
    position < 0
  ) {
    return;
  }

  const clampedPosition = Math.max(0, Math.min(duration, position));
  const rate = Math.max(0.25, Math.min(3.0, playbackRate || lastKnownRate || 1.0));
  lastKnownRate = rate;
  lastKnownDuration = duration;

  widgetSyncState.positionMs = Math.round(clampedPosition * 1000);
  widgetSyncState.durationMs = Math.round(duration * 1000);
  widgetSyncState.rate = rate;

  if (force || (widgetSyncState.playing && Date.now() - lastWidgetSyncTime >= 15000)) {
    scheduleWidgetSync();
  }

  const now = Date.now();
  const posJump = Math.abs(clampedPosition - lastReportedPosition);
  const dueForPlayingRefresh = currentIsPlaying && now - lastPositionSyncTime >= 10000;

  if (!force && posJump < 2 && !dueForPlayingRefresh) {
    return;
  }

  lastPositionSyncTime = now;
  lastReportedPosition = clampedPosition;

  try {
    await MediaSession.setPositionState({
      duration,
      position: clampedPosition,
      playbackRate: rate,
    });
  } catch {
    // ignore
  }
}

export const MediaSessionManager = {
  /**
   * Single source of truth for publishing the currently playing/loaded song across:
   * - Android Notification & Lock Screen
   * - Bluetooth / Headset / Car metadata
   * - Home screen widget (WidgetBridge)
   */
  async publishNowPlaying(song: Song | null, options: PublishNowPlayingOptions = {}) {
    if (!song) {
      activeSongId = null;
      lastPublishedCoverSource = null;
      lastKnownDuration = 0;

      widgetSyncState.trackId = '';
      widgetSyncState.title = '';
      widgetSyncState.artist = '';
      widgetSyncState.album = 'JTEC MUSIC';
      widgetSyncState.coverUrl = '';
      widgetSyncState.playing = false;
      widgetSyncState.positionMs = 0;
      widgetSyncState.durationMs = 0;
      widgetSyncState.isFavorite = false;
      lastSentArtworkTrackId = null;
      lastSentArtworkCoverUrl = null;
      scheduleWidgetSync();

      const fallbackCover = await buildFallbackCover512Jpeg();
      try {
        await MediaSession.setMetadata({
          title: 'JTEC MUSIC',
          artist: 'JTEC MUSIC',
          album: 'JTEC MUSIC',
          artwork: [{ src: fallbackCover, sizes: '512x512', type: 'image/jpeg' }],
        });
      } catch {
        // ignore
      }
      return;
    }

    const thisSongId = song.id;
    const isTrackChange = activeSongId !== thisSongId;
    activeSongId = thisSongId;

    const cleanTitle = cleanDisplayTitle(song.title);
    const cleanArtist = cleanDisplayArtist(song.artist);
    const cleanAlbum = cleanDisplayAlbum(song.album);
    const savedRasterArt =
      song.artworkUrl && !song.artworkUrl.startsWith('data:image/svg') ? song.artworkUrl : '';
    const coverSource = savedRasterArt || song.coverUrl || '';

    const resolvedDuration =
      typeof options.duration === 'number' && isFinite(options.duration) && options.duration > 0
        ? options.duration
        : isTrackChange
          ? (typeof song.duration === 'number' && isFinite(song.duration) && song.duration > 0 ? song.duration : 0)
          : Math.max(song.duration || 0, lastKnownDuration || 0);

    const resolvedPosition =
      typeof options.position === 'number' && isFinite(options.position) && options.position >= 0
        ? options.position
        : isTrackChange
          ? 0
          : Math.max(0, audioEngine.currentTime || 0);

    const resolvedRate =
      typeof options.playbackRate === 'number' && isFinite(options.playbackRate) && options.playbackRate > 0
        ? Math.max(0.25, Math.min(3.0, options.playbackRate))
        : lastKnownRate;
    lastKnownRate = resolvedRate;

    if (typeof options.playing === 'boolean') {
      currentIsPlaying = options.playing;
    }

    // Update unified widget state with exact same cleaned metadata
    widgetSyncState.trackId = song.id;
    widgetSyncState.title = cleanTitle;
    widgetSyncState.artist = cleanArtist;
    widgetSyncState.album = cleanAlbum;
    widgetSyncState.coverUrl = coverSource;
    widgetSyncState.playing = currentIsPlaying;
    widgetSyncState.positionMs = Math.max(0, Math.round(resolvedPosition * 1000));
    widgetSyncState.durationMs = Math.max(0, Math.round(resolvedDuration * 1000));
    widgetSyncState.rate = resolvedRate;
    widgetSyncState.isFavorite =
      options.isFavorite !== undefined ? options.isFavorite : Boolean(song.isFavorite);
    if (options.accentColor !== undefined) {
      widgetSyncState.accentColor = options.accentColor || '#22D3EE';
    }
    if (options.hasPrev !== undefined) {
      widgetSyncState.hasPrev = options.hasPrev;
    }
    if (options.hasNext !== undefined) {
      widgetSyncState.hasNext = options.hasNext;
    }
    scheduleWidgetSync();

    // Ensure a 512x512 JPEG cover is always ready immediately (never stale from previous track, never blank)
    const cached512 = coverSource ? artwork512Cache.get(coverSource) : undefined;
    const immediateCover = cached512 || (await buildFallbackCover512Jpeg());

    if (isTrackChange || coverSource !== lastPublishedCoverSource || cached512) {
      lastPublishedCoverSource = coverSource;
    }

    try {
      await MediaSession.setMetadata({
        title: cleanTitle,
        artist: cleanArtist,
        album: cleanAlbum,
        artwork: [{ src: immediateCover, sizes: '512x512', type: 'image/jpeg' }],
      });
    } catch (err) {
      console.warn('Could not set initial MediaSession metadata', err);
    }

    if (resolvedDuration > 0) {
      await applyMediaSessionPosition(resolvedPosition, resolvedDuration, resolvedRate, isTrackChange || options.position !== undefined);
    } else if (isTrackChange) {
      lastKnownDuration = 0;
    }

    if (typeof options.playing === 'boolean') {
      try {
        await MediaSession.setPlaybackState({
          playbackState: options.playing ? 'playing' : 'paused',
        });
      } catch {
        // ignore
      }
    }

    // If cover wasn't cached yet, prepare 512x512 center-cropped JPEG (0.9) and push immediately
    if (!cached512 && coverSource) {
      try {
        const final512Cover = await prepareArtworkUrl(coverSource);
        if (activeSongId === thisSongId && final512Cover !== immediateCover) {
          await MediaSession.setMetadata({
            title: cleanTitle,
            artist: cleanArtist,
            album: cleanAlbum,
            artwork: [{ src: final512Cover, sizes: '512x512', type: 'image/jpeg' }],
          });
        }
      } catch (err) {
        console.warn('Could not update 512x512 MediaSession artwork', err);
      }
    }
  },

  /**
   * Backward-compatible metadata helper delegating directly to publishNowPlaying.
   */
  async updateMetadata(song: Song | null) {
    await this.publishNowPlaying(song);
  },

  /**
   * Updates playback state ("playing", "paused", or "none") and immediately syncs position + rate.
   */
  async updatePlaybackState(state: 'playing' | 'paused' | 'none' | boolean) {
    let playbackState: 'playing' | 'paused' | 'none';
    if (typeof state === 'boolean') {
      playbackState = state ? 'playing' : 'paused';
    } else {
      playbackState = state;
    }

    if (playbackState === 'none') {
      // Prevent async HTMLAudioElement 'pause' event from overwriting 'none' back to 'paused'
      suppressPausedUntil = Date.now() + 450;
    } else if (playbackState === 'playing') {
      suppressPausedUntil = 0;
    } else if (playbackState === 'paused' && Date.now() < suppressPausedUntil) {
      return;
    }

    currentIsPlaying = playbackState === 'playing';
    widgetSyncState.playing = currentIsPlaying;

    const currentPos =
      typeof audioEngine.currentTime === 'number' && isFinite(audioEngine.currentTime)
        ? Math.max(0, audioEngine.currentTime)
        : 0;
    const currentDur =
      typeof audioEngine.duration === 'number' && isFinite(audioEngine.duration) && audioEngine.duration > 0
        ? audioEngine.duration
        : lastKnownDuration;

    widgetSyncState.positionMs = Math.round(currentPos * 1000);
    if (currentDur > 0) {
      widgetSyncState.durationMs = Math.round(currentDur * 1000);
    }
    scheduleWidgetSync();

    try {
      await MediaSession.setPlaybackState({ playbackState });
    } catch (err) {
      console.warn('Could not set MediaSession playbackState', err);
    }

    if (playbackState !== 'none' && currentDur > 0) {
      await applyMediaSessionPosition(currentPos, currentDur, lastKnownRate, true);
    }
  },

  /**
   * Updates playback position, duration, and playbackRate (including Slow + Reverb rates).
   * Pushes immediately on force/seek/initial duration discovery, and refreshes once every 10s while playing.
   */
  async updatePositionState(
    position: number,
    duration: number,
    playbackRate: number = 1.0,
    force: boolean = false
  ) {
    const rate = Math.max(0.25, Math.min(3.0, playbackRate || 1.0));
    const rateChanged = Math.abs(rate - lastKnownRate) > 0.001;
    const validDuration = typeof duration === 'number' && isFinite(duration) && duration > 0;
    const durationJustDiscovered = lastKnownDuration <= 0 && validDuration;
    const durationChanged = validDuration && lastKnownDuration > 0 && Math.abs(duration - lastKnownDuration) > 0.5;

    await applyMediaSessionPosition(
      position,
      duration,
      rate,
      force || rateChanged || durationJustDiscovered || durationChanged
    );
  },

  /**
   * Immediately updates MediaSession positionState when playback rate (e.g. Slow + Reverb) changes.
   */
  async updatePlaybackRate(playbackRate: number) {
    const rate = Math.max(0.25, Math.min(3.0, playbackRate || 1.0));
    lastKnownRate = rate;
    widgetSyncState.rate = rate;

    const currentPos =
      typeof audioEngine.currentTime === 'number' && isFinite(audioEngine.currentTime)
        ? Math.max(0, audioEngine.currentTime)
        : 0;
    const currentDur =
      typeof audioEngine.duration === 'number' && isFinite(audioEngine.duration) && audioEngine.duration > 0
        ? audioEngine.duration
        : lastKnownDuration;

    if (currentDur > 0) {
      await applyMediaSessionPosition(currentPos, currentDur, rate, true);
    } else {
      scheduleWidgetSync();
    }
  },

  /**
   * Updates extra widget metadata (accentColor, favorite status, queue bounds).
   */
  updateWidgetContext(context: {
    accentColor?: string;
    isFavorite?: boolean;
    hasPrev?: boolean;
    hasNext?: boolean;
  }) {
    let changed = false;
    if (context.accentColor !== undefined && context.accentColor !== widgetSyncState.accentColor) {
      widgetSyncState.accentColor = context.accentColor || '#22D3EE';
      changed = true;
    }
    if (context.isFavorite !== undefined && context.isFavorite !== widgetSyncState.isFavorite) {
      widgetSyncState.isFavorite = context.isFavorite;
      changed = true;
    }
    if (context.hasPrev !== undefined && context.hasPrev !== widgetSyncState.hasPrev) {
      widgetSyncState.hasPrev = context.hasPrev;
      changed = true;
    }
    if (context.hasNext !== undefined && context.hasNext !== widgetSyncState.hasNext) {
      widgetSyncState.hasNext = context.hasNext;
      changed = true;
    }
    if (changed) {
      scheduleWidgetSync();
    }
  },

  /**
   * Forces a debounced widget sync (e.g. on cold start or returning to foreground after pinning).
   */
  forceWidgetSync(options?: { resetArtworkCache?: boolean }) {
    if (options?.resetArtworkCache) {
      lastSentArtworkTrackId = null;
      lastSentArtworkCoverUrl = null;
    }
    scheduleWidgetSync();
  },

  /**
   * Registers media action handlers for:
   * play, pause, previoustrack, nexttrack, seekto, seekbackward, seekforward, stop,
   * and native Android home screen widget actions.
   */
  async registerActionHandlers(callbacks: MediaSessionCallbacks) {
    currentCallbacks = callbacks;

    if (!widgetActionListenerInitialized) {
      widgetActionListenerInitialized = true;
      WidgetBridge.addActionListener((action: WidgetActionType) => {
        if (!currentCallbacks) return;
        switch (action) {
          case 'playPause':
            if (audioEngine.isPlaying) {
              currentCallbacks.onPause();
            } else {
              currentCallbacks.onPlay();
            }
            break;
          case 'next':
            currentCallbacks.onNext();
            break;
          case 'previous':
            currentCallbacks.onPrevious();
            break;
          case 'toggleFavorite':
            currentCallbacks.onToggleFavorite?.();
            break;
        }
      });
    }

    if (actionHandlersInitialized) return;
    actionHandlersInitialized = true;

    const actions: MediaSessionAction[] = [
      'play',
      'pause',
      'previoustrack',
      'nexttrack',
      'seekto',
      'seekbackward',
      'seekforward',
      'stop',
    ];

    for (const action of actions) {
      try {
        await MediaSession.setActionHandler({ action }, (details) => {
          if (!currentCallbacks) return;

          switch (action) {
            case 'play':
              currentCallbacks.onPlay();
              break;
            case 'pause':
              currentCallbacks.onPause();
              break;
            case 'previoustrack':
              currentCallbacks.onPrevious();
              break;
            case 'nexttrack':
              currentCallbacks.onNext();
              break;
            case 'seekto':
              if (typeof details?.seekTime === 'number' && !isNaN(details.seekTime)) {
                currentCallbacks.onSeek(details.seekTime);
              }
              break;
            case 'seekbackward': {
              const offset = (details as any)?.seekOffset || 10;
              if (currentCallbacks.onSeekBackward) {
                currentCallbacks.onSeekBackward(offset);
              } else {
                const target = Math.max(0, (audioEngine.currentTime || 0) - offset);
                currentCallbacks.onSeek(target);
              }
              break;
            }
            case 'seekforward': {
              const offset = (details as any)?.seekOffset || 10;
              if (currentCallbacks.onSeekForward) {
                currentCallbacks.onSeekForward(offset);
              } else {
                const maxDur = audioEngine.duration || lastKnownDuration || 0;
                const rawTarget = (audioEngine.currentTime || 0) + offset;
                const target = maxDur > 0 ? Math.min(maxDur, rawTarget) : rawTarget;
                currentCallbacks.onSeek(target);
              }
              break;
            }
            case 'stop':
              if (currentCallbacks.onStop) {
                currentCallbacks.onStop();
              } else {
                currentCallbacks.onPause();
              }
              break;
          }
        });
      } catch (err) {
        console.warn(`Could not register MediaSession action: ${action}`, err);
      }
    }
  },
};


