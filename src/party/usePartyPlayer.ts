import { useState, useEffect, useCallback, useRef } from 'react';
import { PartyService } from './PartyService';
import { PartyState, PartyTrack } from './types';
import { isShareablePartyAudioUrl } from './utils/audioValidation';
import { partyAudioEngine } from './PartyAudioEngine';
import { MediaSessionManager } from '../services/mediaSession';
import { StorageService } from '../services/storage';
import { Song } from '../types/music';

export function partyTrackToSong(track: PartyTrack): Song {
  return {
    id: `party_${track.id}`,
    title: track.title,
    artist: track.artist,
    album: 'JTEC Party',
    duration: track.duration || 0,
    artworkUrl: track.cover,
    coverUrl: track.cover,
    audioUrl: track.audioUrl,
    cloudId: track.id,
    isCloud: true,
    source: track.source,
    hasStoredBlob: false,
    size: track.size,
  };
}

interface UsePartyPlayerOptions {
  onShowMobileDataNotice?: (message: string) => void;
}

export function usePartyPlayer(options?: UsePartyPlayerOptions) {
  const [partyState, setPartyState] = useState<PartyState>(PartyService.getState());
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    return PartyService.subscribe((state) => {
      setPartyState(state);
    });
  }, []);

  // Hook PartyService exclusively to the dedicated PartyAudioEngine (never global audioEngine)
  useEffect(() => {
    const unregisterHandlers = PartyService.registerPlayerHandlers({
      loadTrack: async (track: PartyTrack): Promise<boolean> => {
        try {
          if (!isShareablePartyAudioUrl(track?.audioUrl)) {
            console.warn('[usePartyPlayer] Rejected non-HTTPS or local audio URL for Party track');
            return false;
          }

          // Check if user already downloaded this song locally so Party doesn't waste bandwidth
          let localBlob: Blob | null = null;
          try {
            const allSongs = await StorageService.getAllSongs();
            const match = allSongs.find(
              (s) =>
                s.hasStoredBlob &&
                (s.id === track.id ||
                  s.cloudId === track.id ||
                  (s.audioUrl && s.audioUrl === track.audioUrl))
            );
            if (match) {
              localBlob = await StorageService.getSongBlob(match.id);
            }
          } catch {
            // ignore IndexedDB lookup failure and stream HTTPS URL directly
          }

          if (localBlob && localBlob.size > 0) {
            await partyAudioEngine.loadTrack(localBlob, 0);
          } else {
            await partyAudioEngine.loadTrack(track.audioUrl, 0);
          }

          return true;
        } catch (err) {
          console.warn('[usePartyPlayer] Error loading audio track:', err);
          return false;
        }
      },
      play: async () => {
        await partyAudioEngine.play();
      },
      pause: () => {
        partyAudioEngine.pause();
      },
      seek: (posSec: number) => {
        partyAudioEngine.seek(posSec);
      },
      stopAndUnload: () => {
        partyAudioEngine.stopAndUnload();
      },
      getCurrentPositionSeconds: () => {
        return partyAudioEngine.currentTime;
      },
    });

    const unsubEnded = partyAudioEngine.onEnded(() => {
      const current = PartyService.getState();
      if (current.roomCode && current.role === 'host') {
        PartyService.hostNextTrack(true);
      }
    });

    return () => {
      unregisterHandlers();
      unsubEnded();
    };
  }, []);

  const isPartyActive = partyState.roomCode !== null;
  const isPartyHost = isPartyActive && partyState.role === 'host';
  const isPartyGuest = isPartyActive && partyState.role === 'guest';
  const canControlPlayback = !isPartyActive || isPartyHost;

  // Bind party-specific OS MediaSession controls ONLY when a party track is active,
  // leaving normal JTEC Music controls & Android widget completely untouched.
  useEffect(() => {
    if (!isPartyActive || !partyState.currentTrack) {
      MediaSessionManager.registerPartyActionHandlers(null);
      return;
    }

    MediaSessionManager.registerPartyActionHandlers({
      onPlay: () => {
        if (isPartyHost && !partyAudioEngine.isPlaying) {
          PartyService.hostPlay();
        }
      },
      onPause: () => {
        if (isPartyHost && partyAudioEngine.isPlaying) {
          PartyService.hostPause();
        }
      },
      onPrevious: () => {
        if (isPartyHost) {
          PartyService.hostPreviousTrack();
        }
      },
      onNext: () => {
        if (isPartyHost) {
          PartyService.hostNextTrack(false);
        }
      },
      onSeek: (seconds: number) => {
        if (isPartyHost) {
          PartyService.hostSeek(seconds);
        }
      },
      onSeekBackward: (offset = 10) => {
        if (isPartyHost) {
          PartyService.hostSeek(Math.max(0, (partyAudioEngine.currentTime || 0) - offset));
        }
      },
      onSeekForward: (offset = 10) => {
        if (isPartyHost) {
          const maxDur = partyAudioEngine.duration || partyState.currentTrack?.duration || 0;
          const rawTarget = (partyAudioEngine.currentTime || 0) + offset;
          PartyService.hostSeek(maxDur > 0 ? Math.min(maxDur, rawTarget) : rawTarget);
        }
      },
      onStop: () => {
        if (isPartyHost) {
          PartyService.hostPause();
        }
      },
    });

    return () => {
      MediaSessionManager.registerPartyActionHandlers(null);
    };
  }, [isPartyActive, isPartyHost, partyState.currentTrack?.id, partyState.currentTrack?.duration]);

  const playInParty = useCallback(async (track: PartyTrack) => {
    if (!isPartyHost) return;
    await PartyService.hostSelectTrack(track);
  }, [isPartyHost]);

  return {
    partyState,
    isPartyActive,
    isPartyHost,
    isPartyGuest,
    canControlPlayback,
    playInParty,
    leaveParty: PartyService.leaveRoom.bind(PartyService),
  };
}
