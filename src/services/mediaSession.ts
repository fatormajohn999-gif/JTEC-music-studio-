import { MediaSession } from '@jofr/capacitor-media-session';
import { Song } from '../types/music';

export interface MediaSessionCallbacks {
  onPlay: () => void;
  onPause: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeek: (seconds: number) => void;
  onSeekBackward?: (offset?: number) => void;
  onSeekForward?: (offset?: number) => void;
  onStop?: () => void;
}

// In-memory cache for resized 512x512 artwork data URLs to avoid repeated recomputation
const artworkCache = new Map<string, string>();

let activeSongId: string | null = null;
let currentCallbacks: MediaSessionCallbacks | null = null;
let actionHandlersInitialized = false;

// Position throttling state
let lastPositionTime = 0;
let lastReportedPos = -1;

// Default 1x1 transparent PNG data URL to ensure native Android never fails on empty/http icon
const DEFAULT_BLANK_ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

let cachedFallbackDataUrl = DEFAULT_BLANK_ICON_DATA_URL;

// Preload the app icon into a base64 data URL so native Android never makes network requests for fallback artwork
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  try {
    const fallbackImg = new Image();
    fallbackImg.crossOrigin = 'anonymous';
    fallbackImg.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 192;
        canvas.height = 192;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(fallbackImg, 0, 0, 192, 192);
          cachedFallbackDataUrl = canvas.toDataURL('image/png');
        }
      } catch {
        // use DEFAULT_BLANK_ICON_DATA_URL
      }
    };
    fallbackImg.onerror = () => {
      // Keep DEFAULT_BLANK_ICON_DATA_URL
    };
    fallbackImg.src = 'icons/icon-192.png';
  } catch {
    // ignore
  }
}

export function getFallbackIconUrl(): string {
  return cachedFallbackDataUrl || DEFAULT_BLANK_ICON_DATA_URL;
}

/**
 * Resizes any image (blob URL, data URL, or remote HTTP URL) to a 512x512 square PNG data URL.
 * Falls back to the app icon if resizing fails or is rejected.
 */
export async function resizeImageTo512DataUrl(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    const timer = setTimeout(() => {
      reject(new Error('Image resize timed out'));
    }, 4000);

    img.onload = () => {
      clearTimeout(timer);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(src.startsWith('data:') ? src : getFallbackIconUrl());
          return;
        }

        const nw = img.naturalWidth || img.width || 512;
        const nh = img.naturalHeight || img.height || 512;
        const minDim = Math.min(nw, nh);
        const sx = (nw - minDim) / 2;
        const sy = (nh - minDim) / 2;

        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, 512, 512);
        const dataUrl = canvas.toDataURL('image/png', 0.85);
        resolve(dataUrl);
      } catch (err) {
        if (src.startsWith('data:')) {
          resolve(src);
        } else {
          resolve(getFallbackIconUrl());
        }
      }
    };

    img.onerror = () => {
      clearTimeout(timer);
      resolve(getFallbackIconUrl());
    };

    img.src = src;
  });
}

/**
 * Prepares artwork URL for MediaSession:
 * - If cover exists: resizes to 512x512 data URL
 * - If cover missing or fails: falls back to app icon data URL
 */
export async function prepareArtworkUrl(coverUrl?: string): Promise<string> {
  const fallback = getFallbackIconUrl();
  if (!coverUrl) return fallback;

  const cached = artworkCache.get(coverUrl);
  if (cached) return cached;

  try {
    const resized = await resizeImageTo512DataUrl(coverUrl);
    artworkCache.set(coverUrl, resized);
    return resized;
  } catch {
    return fallback;
  }
}

export const MediaSessionManager = {
  /**
   * Updates track metadata (title, artist, album, artwork).
   * Artwork is always provided as a self-contained data URL so native Android never throws network errors on main thread.
   */
  async updateMetadata(song: Song | null) {
    if (!song) {
      activeSongId = null;
      try {
        await MediaSession.setMetadata({
          title: '',
          artist: '',
          album: '',
          artwork: [{ src: getFallbackIconUrl(), sizes: '512x512', type: 'image/png' }],
        });
      } catch {
        // ignore
      }
      return;
    }

    activeSongId = song.id;
    const thisSongId = song.id;
    const coverSource = song.artworkUrl || song.coverUrl;
    const cachedArtwork = coverSource ? artworkCache.get(coverSource) : undefined;
    const initialArtworkUrl = cachedArtwork || getFallbackIconUrl();

    // 1. Set metadata immediately with cached artwork or fallback data URL for zero latency
    try {
      await MediaSession.setMetadata({
        title: song.title || 'Unknown Title',
        artist: song.artist || 'Unknown Artist',
        album: song.album || 'JTEC MUSIC',
        artwork: [
          { src: initialArtworkUrl, sizes: '512x512', type: 'image/png' },
        ],
      });
    } catch (err) {
      console.warn('Could not set initial MediaSession metadata', err);
    }

    // 2. If artwork was not already cached and a cover exists, prepare 512x512 resized data URL in background
    if (!cachedArtwork && coverSource) {
      try {
        const finalArtworkUrl = await prepareArtworkUrl(coverSource);
        // Only update if this song is still the active one
        if (activeSongId === thisSongId && finalArtworkUrl !== initialArtworkUrl) {
          await MediaSession.setMetadata({
            title: song.title || 'Unknown Title',
            artist: song.artist || 'Unknown Artist',
            album: song.album || 'JTEC MUSIC',
            artwork: [
              { src: finalArtworkUrl, sizes: '512x512', type: 'image/png' },
            ],
          });
        }
      } catch (err) {
        console.warn('Could not update refined MediaSession artwork', err);
      }
    }
  },

  /**
   * Updates playback state ("playing", "paused", or "none")
   */
  async updatePlaybackState(state: 'playing' | 'paused' | 'none' | boolean) {
    let playbackState: 'playing' | 'paused' | 'none';
    if (typeof state === 'boolean') {
      playbackState = state ? 'playing' : 'paused';
    } else {
      playbackState = state;
    }

    try {
      await MediaSession.setPlaybackState({ playbackState });
    } catch (err) {
      console.warn('Could not set MediaSession playbackState', err);
    }
  },

  /**
   * Updates playback position, duration, and playbackRate (including Slow + Reverb rates).
   * Position updates are throttled to ~800ms to keep lock screen seek bar accurate without flooding IPC.
   */
  async updatePositionState(
    position: number,
    duration: number,
    playbackRate: number = 1.0,
    force: boolean = false
  ) {
    try {
      if (
        typeof duration === 'number' &&
        duration > 0 &&
        isFinite(duration) &&
        typeof position === 'number' &&
        isFinite(position) &&
        position >= 0 &&
        position <= duration
      ) {
        const now = Date.now();
        const posJump = Math.abs(position - lastReportedPos);
        // Throttle updates unless forced, significant jump (seek), or >800ms has elapsed
        if (!force && posJump < 2 && now - lastPositionTime < 800) {
          return;
        }

        lastPositionTime = now;
        lastReportedPos = position;

        const rate = Math.max(0.25, Math.min(3.0, playbackRate || 1.0));
        await MediaSession.setPositionState({
          duration,
          position,
          playbackRate: rate,
        });
      }
    } catch {
      // ignore
    }
  },

  /**
   * Registers media action handlers for:
   * play, pause, previoustrack, nexttrack, seekto, seekbackward, seekforward, and stop.
   * Delegates dynamically to the latest callbacks to honor current queue, shuffle, and repeat modes.
   */
  async registerActionHandlers(callbacks: MediaSessionCallbacks) {
    currentCallbacks = callbacks;

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
                currentCallbacks.onSeek(-offset);
              }
              break;
            }
            case 'seekforward': {
              const offset = (details as any)?.seekOffset || 10;
              if (currentCallbacks.onSeekForward) {
                currentCallbacks.onSeekForward(offset);
              } else {
                currentCallbacks.onSeek(offset);
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
        // Some actions might not be supported on all browsers or platforms
        console.warn(`Could not register MediaSession action: ${action}`, err);
      }
    }
  },
};
