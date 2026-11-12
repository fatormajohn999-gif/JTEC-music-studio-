import { MediaSession } from '@jofr/capacitor-media-session';
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

// In-memory cache for resized 512x512 artwork data URLs to avoid repeated recomputation
const artworkCache = new Map<string, string>();

let activeSongId: string | null = null;
let currentCallbacks: MediaSessionCallbacks | null = null;
let actionHandlersInitialized = false;
let widgetActionListenerInitialized = false;

// Position throttling state
let lastPositionTime = 0;
let lastReportedPos = -1;

// Native Android Home Screen Widget sync state
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
      // Bail if track changed while resizing artwork
      if (widgetSyncState.trackId !== trackId) {
        return;
      }
    }

    lastWidgetSyncTime = Date.now();
    await WidgetBridge.updateState({
      trackId,
      title: title || 'Unknown Title',
      artist: artist || 'Unknown Artist',
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
    // Widget failures must never impact music playback
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
      } catch {
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
    const coverSource = song.artworkUrl || song.coverUrl || '';

    widgetSyncState.trackId = song.id;
    widgetSyncState.title = song.title || 'Unknown Title';
    widgetSyncState.artist = song.artist || 'Unknown Artist';
    widgetSyncState.album = song.album || 'JTEC MUSIC';
    widgetSyncState.coverUrl = coverSource;
    if (typeof song.duration === 'number' && isFinite(song.duration) && song.duration > 0) {
      widgetSyncState.durationMs = Math.round(song.duration * 1000);
    }
    widgetSyncState.isFavorite = Boolean(song.isFavorite);
    scheduleWidgetSync();

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

    const isPlayingNow = playbackState === 'playing';
    widgetSyncState.playing = isPlayingNow;
    if (typeof audioEngine.currentTime === 'number' && isFinite(audioEngine.currentTime)) {
      widgetSyncState.positionMs = Math.max(0, Math.round(audioEngine.currentTime * 1000));
    }
    if (typeof audioEngine.duration === 'number' && isFinite(audioEngine.duration) && audioEngine.duration > 0) {
      widgetSyncState.durationMs = Math.round(audioEngine.duration * 1000);
    }
    scheduleWidgetSync();

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
        const rate = Math.max(0.25, Math.min(3.0, playbackRate || 1.0));
        widgetSyncState.positionMs = Math.round(position * 1000);
        widgetSyncState.durationMs = Math.round(duration * 1000);
        widgetSyncState.rate = rate;

        if (force || (widgetSyncState.playing && Date.now() - lastWidgetSyncTime >= 15000)) {
          scheduleWidgetSync();
        }

        const now = Date.now();
        const posJump = Math.abs(position - lastReportedPos);
        // Throttle updates unless forced, significant jump (seek), or >800ms has elapsed
        if (!force && posJump < 2 && now - lastPositionTime < 800) {
          return;
        }

        lastPositionTime = now;
        lastReportedPos = position;

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
   * Updates extra widget metadata (accentColor, favorite status, queue bounds)
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
   * Delegates dynamically to the latest callbacks to honor current queue, shuffle, and repeat modes.
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

