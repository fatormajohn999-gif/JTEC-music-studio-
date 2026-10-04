import { Song } from '../types/music';

export interface MediaSessionCallbacks {
  onPlay: () => void;
  onPause: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeek: (seconds: number) => void;
}

export const MediaSessionManager = {
  updateMetadata(song: Song | null) {
    if (!('mediaSession' in navigator) || !song) return;

    try {
      const artwork = song.artworkUrl
        ? [
            { src: song.artworkUrl, sizes: '96x96', type: 'image/png' },
            { src: song.artworkUrl, sizes: '128x128', type: 'image/png' },
            { src: song.artworkUrl, sizes: '192x192', type: 'image/png' },
            { src: song.artworkUrl, sizes: '512x512', type: 'image/png' },
          ]
        : [{ src: './pwa-192x192.png', sizes: '192x192', type: 'image/png' }];

      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.title,
        artist: song.artist,
        album: song.album || 'JTEC MUSIC',
        artwork,
      });
    } catch (e) {
      console.warn('Could not update MediaSession metadata', e);
    }
  },

  updatePlaybackState(isPlaying: boolean) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    } catch {
      // ignore
    }
  },

  updatePositionState(position: number, duration: number, playbackRate: number = 1.0) {
    if (!('mediaSession' in navigator) || !('setPositionState' in navigator.mediaSession)) return;
    try {
      if (duration > 0 && isFinite(position) && position <= duration) {
        navigator.mediaSession.setPositionState({
          duration,
          playbackRate: Math.max(0.5, Math.min(2.0, playbackRate)),
          position,
        });
      }
    } catch {
      // ignore
    }
  },

  registerActionHandlers(callbacks: MediaSessionCallbacks) {
    if (!('mediaSession' in navigator)) return;

    const actionMap: [MediaSessionAction, (details: MediaSessionActionDetails) => void][] = [
      ['play', () => callbacks.onPlay()],
      ['pause', () => callbacks.onPause()],
      ['previoustrack', () => callbacks.onPrevious()],
      ['nexttrack', () => callbacks.onNext()],
      [
        'seekto',
        (details) => {
          if (details.seekTime !== undefined) {
            callbacks.onSeek(details.seekTime);
          }
        },
      ],
      [
        'seekbackward',
        (details) => {
          const skip = details.seekOffset || 10;
          callbacks.onSeek(Math.max(0, -skip));
        },
      ],
      [
        'seekforward',
        (details) => {
          const skip = details.seekOffset || 10;
          callbacks.onSeek(skip);
        },
      ],
    ];

    actionMap.forEach(([action, handler]) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch (err) {
        // Some actions might not be supported on all browsers
      }
    });
  },
};
