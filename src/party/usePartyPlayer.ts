import { useState, useEffect, useCallback, useRef } from 'react';
import { PartyService } from './PartyService';
import { PartyState, PartyTrack } from './types';
import { audioEngine } from '../services/audioEngine';
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
  onSyncCurrentSong?: (song: Song) => void;
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

  // Hook PartyService to audioEngine
  useEffect(() => {
    const unregister = PartyService.registerPlayerHandlers({
      loadTrack: async (track: PartyTrack): Promise<boolean> => {
        try {
          const songObj = partyTrackToSong(track);
          if (optionsRef.current?.onSyncCurrentSong) {
            optionsRef.current.onSyncCurrentSong(songObj);
          }

          // Check if user already downloaded this song locally
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
          } catch {}

          if (localBlob && localBlob.size > 0) {
            await audioEngine.loadAudio(localBlob, 0);
          } else {
            // Stream audio address
            await audioEngine.loadAudio(track.audioUrl, 0);
          }

          return true;
        } catch (err) {
          console.warn('[usePartyPlayer] Error loading audio track:', err);
          return false;
        }
      },
      play: async () => {
        await audioEngine.play();
      },
      pause: () => {
        audioEngine.pause();
      },
      seek: (posSec: number) => {
        audioEngine.seek(posSec);
      },
      getCurrentPositionSeconds: () => {
        return audioEngine.currentTime;
      },
    });

    return () => {
      unregister();
    };
  }, []);

  const isPartyActive = partyState.roomCode !== null;
  const isPartyHost = isPartyActive && partyState.role === 'host';
  const isPartyGuest = isPartyActive && partyState.role === 'guest';
  const canControlPlayback = !isPartyActive || isPartyHost;

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
