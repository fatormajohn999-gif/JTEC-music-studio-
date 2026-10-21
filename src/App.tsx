import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Song, Playlist, AudioEffectsConfig, VisualizerMode, PerformanceMode, RepeatMode, AppSettings, 
  ArtworkPalette, CinematicScene, CloudSong, PlaybackSessionState 
} from './types/music';
import { StorageService } from './services/storage';
import { SupabaseService } from './services/supabase';
import { audioEngine } from './services/audioEngine';
import { MediaSessionManager } from './services/mediaSession';
import { NotificationPermissionManager } from './services/notificationPermission';
import { extractPaletteFromImage } from './services/colorExtractor';

// UI Components
import { Header } from './components/Header';
import { Navbar, NavTab } from './components/Navbar';
import { MiniPlayer } from './components/MiniPlayer';
import { FullPlayer } from './components/FullPlayer';
import { AudioEffectsModal } from './components/AudioEffectsModal';
import { QueueDrawer } from './components/QueueDrawer';
import { ImportModal } from './components/ImportModal';
import { PlaylistModal } from './components/PlaylistModal';
import { SongDetailsModal } from './components/SongDetailsModal';
import { SongOptionsMenu } from './components/SongOptionsMenu';
import { StartupScreen } from './components/StartupScreen';
import { CloudSettingsModal } from './components/CloudSettingsModal';
import { PWAUpdateBanner } from './components/PWAUpdateBanner';

// Screens
import { HomeScreen } from './screens/HomeScreen';
import { LibraryScreen } from './screens/LibraryScreen';
import { SearchScreen } from './screens/SearchScreen';
import { PlaylistsScreen } from './screens/PlaylistsScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { CloudScreen } from './screens/CloudScreen';
import { Capacitor } from '@capacitor/core';
import { useSleepTimer } from './hooks/useSleepTimer';
import { usePWAUpdate } from './hooks/usePWAUpdate';

export default function App() {
  // Navigation & Screen state
  const [currentTab, setCurrentTab] = useState<NavTab>(() => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const tab = searchParams.get('tab');
      if (tab === 'library' || tab === 'cloud' || tab === 'playlists' || tab === 'search' || tab === 'home') {
        return tab as NavTab;
      }
    } catch {
      // ignore
    }
    return 'home';
  });
  const [isSettingsView, setIsSettingsView] = useState(false);
  const [showStartup, setShowStartup] = useState(true);

  // PWA Automatic Updates Controller
  const {
    updateAvailable,
    isUpdating: isPWAUpdating,
    updateApp: handleUpdateApp,
  } = usePWAUpdate();

  // Sleep Timer Controller
  const {
    timerState: sleepTimer,
    startTimer: handleStartSleepTimer,
    cancelTimer: handleCancelSleepTimer,
    extendTimer: handleExtendSleepTimer,
  } = useSleepTimer();

  // Music & Library State
  const [songs, setSongs] = useState<Song[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [recentlyPlayedIds, setRecentlyPlayedIds] = useState<string[]>([]);
  const [storageStats, setStorageStats] = useState({ songCount: 0, estimatedBytes: 0 });

  // Supabase Cloud State
  const [cloudSongs, setCloudSongs] = useState<CloudSong[]>([]);
  const [isCloudSettingsOpen, setIsCloudSettingsOpen] = useState(false);

  // Playback & Queue State
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [queue, setQueue] = useState<Song[]>([]);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('all');
  const [isShuffle, setIsShuffle] = useState(false);

  // Dynamic Cinematic Artwork Palette
  const [currentPalette, setCurrentPalette] = useState<ArtworkPalette>({
    main: '#00f0ff',
    primary: '#00f0ff',
    secondary: '#a855f7',
    accent: '#ec4899',
    glow: 'rgba(0, 240, 255, 0.45)',
    darkBg: '#070b18',
    hasCover: false,
  });

  // Audio Effects State
  const [effects, setEffects] = useState<AudioEffectsConfig>({
    playbackRate: 1.0,
    reverbWet: 0.0,
    echoWet: 0.0,
    bassGain: 0,
    trebleGain: 0,
    volume: 1.0,
    presetName: 'Normal',
  });

  // App Settings & Performance
  const [settings, setSettings] = useState<AppSettings>({
    performanceMode: 'balanced',
    visualizerMode: 'auto',
    reactionStrength: 'medium',
    autoplayNext: true,
    rememberLastSong: true,
    neonGlow: true,
    reducedMotion: false,
  });

  // Modals
  const [isFullPlayerOpen, setIsFullPlayerOpen] = useState(false);
  const [isEffectsModalOpen, setIsEffectsModalOpen] = useState(false);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isPlaylistModalOpen, setIsPlaylistModalOpen] = useState(false);
  const [songToAddPlaylist, setSongToAddPlaylist] = useState<Song | null>(null);
  const [detailsSong, setDetailsSong] = useState<Song | null>(null);
  const [optionsMenuSong, setOptionsMenuSong] = useState<Song | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // References to keep callbacks fresh
  const currentSongRef = useRef(currentSong);
  currentSongRef.current = currentSong;
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const originalQueueRef = useRef<Song[]>([]);
  const songsRef = useRef(songs);
  songsRef.current = songs;
  const repeatModeRef = useRef(repeatMode);
  repeatModeRef.current = repeatMode;
  const isShuffleRef = useRef(isShuffle);
  isShuffleRef.current = isShuffle;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  // Synchronize cloud songs with local state & IndexedDB cache
  const syncCloudWithLocalSongs = async (cloudList: CloudSong[]) => {
    setCloudSongs(cloudList);
    const localList = await StorageService.getAllSongs();
    const updatedSongs = [...localList];

    for (const cs of cloudList) {
      const existing = updatedSongs.find(
        (s) => s.cloudId === cs.id || (cs.file_hash && s.fileHash === cs.file_hash) ||
               (s.title.trim().toLowerCase() === cs.title.trim().toLowerCase() && 
                s.artist.trim().toLowerCase() === cs.artist.trim().toLowerCase())
      );

      if (existing) {
        existing.isCloud = true;
        existing.cloudId = cs.id;
        existing.audioUrl = cs.audio_url;
        if (!existing.artworkUrl && cs.cover_url) {
          existing.artworkUrl = cs.cover_url;
        }
        await StorageService.saveSong(existing);
      } else {
        const streamableSong: Song = {
          id: `cloud_${cs.id}`,
          title: cs.title,
          artist: cs.artist,
          album: cs.album,
          duration: cs.duration,
          genre: cs.genre,
          artworkUrl: cs.cover_url,
          format: (cs.file_name.split('.').pop() || 'mp3').toLowerCase(),
          size: cs.file_size,
          dateAdded: new Date(cs.created_at).getTime() || Date.now(),
          hasStoredBlob: false,
          cloudId: cs.id,
          isCloud: true,
          audioUrl: cs.audio_url,
          fileHash: cs.file_hash,
        };
        updatedSongs.push(streamableSong);
        await StorageService.saveSong(streamableSong);
      }
    }

    setSongs(updatedSongs);
    return updatedSongs;
  };

  // Initialize Library and Database
  useEffect(() => {
    async function initApp() {
      try {
        const storedSettings = await StorageService.getSettings();
        setSettings(storedSettings);

        let storedSongs = await StorageService.getAllSongs();
        let storedPlaylists = await StorageService.getAllPlaylists();
        const storedRecents = await StorageService.getRecentlyPlayed();

        // Purge any old demo/placeholder songs if present in database
        const hasDemoTracks = storedSongs.some(
          (s) => s.id.startsWith('demo-') || s.isDemo || s.artist === 'JTEC Sound Lab' || s.title?.includes('Neon Skyline')
        );
        if (hasDemoTracks) {
          for (const s of storedSongs) {
            if (s.id.startsWith('demo-') || s.isDemo || s.artist === 'JTEC Sound Lab' || s.title?.includes('Neon Skyline')) {
              await StorageService.deleteSong(s.id);
            }
          }
          storedSongs = await StorageService.getAllSongs();
        }

        // Clean any demo track IDs out of playlists
        let playlistsNeedUpdate = false;
        storedPlaylists = storedPlaylists.map((pl) => {
          const cleanIds = pl.songIds.filter((id) => !id.startsWith('demo-'));
          if (cleanIds.length !== pl.songIds.length) {
            playlistsNeedUpdate = true;
            return { ...pl, songIds: cleanIds };
          }
          return pl;
        });
        if (playlistsNeedUpdate) {
          for (const pl of storedPlaylists) {
            await StorageService.savePlaylist(pl);
          }
        }

        // Clean demo IDs from recently played
        const cleanRecents = storedRecents.filter((id) => !id.startsWith('demo-'));
        if (cleanRecents.length !== storedRecents.length) {
          await StorageService.saveRecentlyPlayed(cleanRecents);
        }

        // If no playlists exist yet, create default starter playlists (empty, ready for real user music)
        if (storedPlaylists.length === 0) {
          const starterPlaylists: Playlist[] = [
            {
              id: 'pl-favorites',
              name: 'Favorite Songs',
              description: 'Your starred and loved tracks',
              songIds: [],
              coverGradient: 'from-pink-500 to-rose-600',
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
            {
              id: 'pl-slow-reverb',
              name: 'Slow + Reverb Mix',
              description: 'Spaced out aesthetic vibing',
              songIds: [],
              coverGradient: 'from-purple-500 to-indigo-600',
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
            {
              id: 'pl-chill',
              name: 'Chill Beats',
              description: 'Relaxing sounds for night walks',
              songIds: [],
              coverGradient: 'from-cyan-500 to-blue-600',
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ];

          for (const pl of starterPlaylists) {
            await StorageService.savePlaylist(pl);
          }
          storedPlaylists = starterPlaylists;
        }

        // Only keep songs that have actual confirmed stored blobs in local storage
        const offlineOnly = storedSongs.filter((s) => s.hasStoredBlob);
        for (const s of storedSongs) {
          if (!s.hasStoredBlob) {
            await StorageService.deleteSong(s.id);
          }
        }
        storedSongs = offlineOnly;

        setSongs(storedSongs);
        setPlaylists(storedPlaylists);
        setRecentlyPlayedIds(storedRecents);
        setQueue(storedSongs);

        // Check saved playback session to restore exact song, position, queue, shuffle, repeat & theme
        const savedSession = await StorageService.getPlaybackSession();
        let targetSong: Song | null = null;
        let restoredPosition = 0;

        if (savedSession && savedSession.songId) {
          const match = storedSongs.find((s) => s.id === savedSession.songId);
          if (match) {
            targetSong = match;
            restoredPosition = Math.max(0, savedSession.position || 0);

            // Restore queue if valid
            if (savedSession.queueSongIds && savedSession.queueSongIds.length > 0) {
              const restoredQueue = savedSession.queueSongIds
                .map((id) => storedSongs.find((s) => s.id === id))
                .filter((s): s is Song => Boolean(s));
              if (restoredQueue.length > 0) {
                setQueue(restoredQueue);
              }
            }

            // Restore shuffle, repeat, and visualizer theme
            if (typeof savedSession.isShuffle === 'boolean') {
              setIsShuffle(savedSession.isShuffle);
            }
            if (savedSession.repeatMode) {
              setRepeatMode(savedSession.repeatMode);
            }
            if (savedSession.visualizerTheme) {
              setSettings((prev) => ({ ...prev, visualizerMode: savedSession.visualizerTheme }));
            }
          }
        }

        // Fallback to first song if no saved session or saved song no longer exists
        if (!targetSong && storedSongs.length > 0 && storedSettings.rememberLastSong) {
          targetSong = storedSongs[0];
          restoredPosition = 0;
        }

        if (targetSong) {
          setCurrentSong(targetSong);
          setCurrentTime(restoredPosition);
          MediaSessionManager.updateMetadata(targetSong);
          MediaSessionManager.updatePositionState(restoredPosition, targetSong.duration || 0);
          MediaSessionManager.updatePlaybackState(false);

          // Prepare audio engine at exact second, PAUSED (Do NOT auto-play)
          let blob = await StorageService.getSongBlob(targetSong.id);
          if (!blob && targetSong.cloudId) {
            blob = await StorageService.getSongBlob(`cloud_${targetSong.cloudId}`);
            if (!blob) blob = await StorageService.getSongBlob(targetSong.cloudId);
          }
          if (blob && blob.size > 0) {
            await audioEngine.loadAudio(blob, restoredPosition);
          } else if (targetSong.audioUrl && !targetSong.audioUrl.startsWith('blob:')) {
            try {
              await audioEngine.loadAudio(targetSong.audioUrl, restoredPosition);
            } catch {
              // ignore
            }
          }

          if (targetSong.artworkUrl) {
            if (targetSong.palette) {
              setCurrentPalette({ ...targetSong.palette, hasCover: true });
            } else {
              extractPaletteFromImage(targetSong.artworkUrl).then((pal) => {
                setCurrentPalette(pal);
                StorageService.updateSongPalette(targetSong!.id, pal);
              });
            }
          } else {
            setCurrentPalette({
              main: '#00f0ff',
              primary: '#00f0ff',
              secondary: '#a855f7',
              accent: '#ec4899',
              glow: 'rgba(0, 240, 255, 0.45)',
              darkBg: '#070b18',
              hasCover: false,
            });
          }
        }

        StorageService.requestPersistentStorage();

        const stats = await StorageService.getStorageStats();
        setStorageStats(stats);
      } catch (err) {
        console.error('Initialization error:', err);
      }
    }

    initApp();
  }, []);

  // Listen for shared audio files from Service Worker Share Target or shortcut navigation
  useEffect(() => {
    const handlePopState = () => {
      try {
        const searchParams = new URLSearchParams(window.location.search);
        const tab = searchParams.get('tab');
        if (tab === 'library' || tab === 'cloud' || tab === 'playlists' || tab === 'search' || tab === 'home') {
          setCurrentTab(tab as NavTab);
        }
      } catch {
        // ignore
      }
    };

    window.addEventListener('popstate', handlePopState);

    const handleSWMessage = async (event: MessageEvent) => {
      if (event.data?.type === 'SHARED_SONGS_ADDED') {
        setCurrentTab('library');
        try {
          const freshSongs = await StorageService.getAllSongs();
          setSongs(freshSongs);
          const stats = await StorageService.getStorageStats();
          setStorageStats(stats);
        } catch (err) {
          console.warn('Failed to refresh songs following share event:', err);
        }
      }
    };

    if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSWMessage);
    }

    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSWMessage);
      }
    };
  }, []);

  // Hook Audio Engine events
  useEffect(() => {
    const unsubTime = audioEngine.onTimeUpdate((curr, dur) => {
      setCurrentTime(curr);
      setDuration(dur);
      MediaSessionManager.updatePositionState(curr, dur, effects.playbackRate);
    });

    const unsubPlayState = audioEngine.onPlayStateChange((playing) => {
      setIsPlaying(playing);
      MediaSessionManager.updatePlaybackState(playing);
    });

    const unsubEnded = audioEngine.onEnded(() => {
      handleSongEnded();
    });

    const unsubError = audioEngine.onError((errMsg) => {
      setGlobalError(errMsg);
      setTimeout(() => setGlobalError(null), 5000);
    });

    return () => {
      unsubTime();
      unsubPlayState();
      unsubEnded();
      unsubError();
    };
  }, [effects.playbackRate]);

  // Save current playback session (song, position in seconds, queue order, shuffle, repeat, theme)
  const persistSessionNow = useCallback(() => {
    const cur = currentSongRef.current;
    if (!cur) return;
    const session: PlaybackSessionState = {
      songId: cur.id,
      position: Math.round(currentTimeRef.current || 0),
      queueSongIds: queueRef.current.map((s) => s.id),
      isShuffle: isShuffleRef.current,
      repeatMode: repeatModeRef.current,
      visualizerTheme: settingsRef.current.visualizerMode,
      updatedAt: Date.now(),
    };
    StorageService.savePlaybackSession(session);
  }, []);

  // Periodic session saving while playing (every 3 seconds), and immediately on pause / visibilitychange / beforeunload
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isPlaying) {
      interval = setInterval(() => {
        persistSessionNow();
      }, 3000);
    } else {
      // Save on pause immediately
      persistSessionNow();
    }

    const handleVisibilityOrUnload = () => {
      persistSessionNow();
    };

    document.addEventListener('visibilitychange', handleVisibilityOrUnload);
    window.addEventListener('beforeunload', handleVisibilityOrUnload);
    window.addEventListener('pagehide', handleVisibilityOrUnload);

    return () => {
      if (interval) clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityOrUnload);
      window.removeEventListener('beforeunload', handleVisibilityOrUnload);
      window.removeEventListener('pagehide', handleVisibilityOrUnload);
    };
  }, [isPlaying, persistSessionNow]);

  // Handle Song Ended Flow (TASK 2: Auto-Next)
  const handleSongEnded = useCallback(() => {
    const currentRepeat = repeatModeRef.current;
    const currentQueue = queueRef.current;
    const cur = currentSongRef.current;
    const allSongs = songsRef.current;

    // 1. Single track repeat mode ('one')
    if (currentRepeat === 'one' && cur) {
      audioEngine.seek(0);
      audioEngine.play().catch((err) => console.warn('Repeat one playback error:', err));
      return;
    }

    // 2. Check if Auto Next is enabled in Settings
    const isAutoNextEnabled = settingsRef.current.autoplayNext ?? true;
    if (!isAutoNextEnabled) {
      setIsPlaying(false);
      return;
    }

    // Determine active queue list (currentQueue if populated, fallback to library)
    const activeQueue = currentQueue.length > 0 ? currentQueue : allSongs;
    if (activeQueue.length === 0 || !cur) {
      setIsPlaying(false);
      return;
    }

    // 2. Shuffle mode with auto-next
    if (isShuffleRef.current && activeQueue.length > 1) {
      const curIndex = activeQueue.findIndex((s) => s.id === cur.id);
      let rand = Math.floor(Math.random() * activeQueue.length);
      while (rand === curIndex && activeQueue.length > 1) {
        rand = Math.floor(Math.random() * activeQueue.length);
      }
      playSong(activeQueue[rand]);
      return;
    }

    // 3. Play next song in the queue
    const currentIndex = activeQueue.findIndex((s) => s.id === cur.id);
    if (currentIndex !== -1 && currentIndex + 1 < activeQueue.length) {
      playSong(activeQueue[currentIndex + 1]);
      return;
    }

    // 4. Last song in queue: respect repeat setting!
    // With repeat on ('all'), go back to the start. With repeat off ('off'), stop.
    if (currentRepeat === 'all') {
      playSong(activeQueue[0]);
      return;
    }

    // Repeat is off: stop playback
    setIsPlaying(false);
  }, []);

  // Play a specific song with optional context queue and optional start position
  const playSong = async (song: Song, contextQueue?: Song[], startPosition?: number) => {
    try {
      NotificationPermissionManager.checkAndRequestOnFirstPlay();
      setCurrentSong(song);
      MediaSessionManager.updateMetadata(song);

      // Cover-based color extraction: check cache first, or extract once and save to IndexedDB
      if (song.artworkUrl) {
        if (song.palette) {
          setCurrentPalette({ ...song.palette, hasCover: true });
        } else {
          extractPaletteFromImage(song.artworkUrl).then((pal) => {
            setCurrentPalette(pal);
            StorageService.updateSongPalette(song.id, pal);
            setSongs((prev) => prev.map((s) => (s.id === song.id ? { ...s, palette: pal } : s)));
          });
        }
      } else {
        // No cover: visualizer effects use their own original default colors
        setCurrentPalette({
          main: '#00f0ff',
          primary: '#00f0ff',
          secondary: '#a855f7',
          accent: '#ec4899',
          glow: 'rgba(0, 240, 255, 0.45)',
          darkBg: '#070b18',
          hasCover: false,
        });
      }

      // Manage queue: sync with context if given, or ensure queue has songs for auto next
      if (contextQueue && contextQueue.length > 0) {
        originalQueueRef.current = contextQueue;
        if (isShuffleRef.current) {
          // Keep current song first, shuffle the remainder
          const others = contextQueue.filter((s) => s.id !== song.id);
          for (let i = others.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [others[i], others[j]] = [others[j], others[i]];
          }
          setQueue([song, ...others]);
        } else {
          setQueue(contextQueue);
        }
      } else {
        setQueue((prev) => {
          if (prev.length <= 1 && songsRef.current.length > 1) {
            originalQueueRef.current = songsRef.current;
            return songsRef.current;
          }
          if (!prev.some((s) => s.id === song.id)) {
            const nextQ = [song, ...prev];
            originalQueueRef.current = nextQ;
            return nextQ;
          }
          return prev;
        });
      }

      // Fetch blob from IndexedDB (or stream from cloud audioUrl)
      let blob = await StorageService.getSongBlob(song.id);
      if (!blob && song.cloudId) {
        blob = await StorageService.getSongBlob(`cloud_${song.cloudId}`);
        if (!blob) {
          blob = await StorageService.getSongBlob(song.cloudId);
        }
      }
      if (!blob && song.fileHash) {
        const allSongs = await StorageService.getAllSongs();
        const offlineMatch = allSongs.find((s) => s.hasStoredBlob && s.fileHash === song.fileHash);
        if (offlineMatch) {
          blob = await StorageService.getSongBlob(offlineMatch.id);
        }
      }

      if (blob && blob.size > 0) {
        await audioEngine.loadAudio(blob, startPosition);
      } else if (song.audioUrl && !song.audioUrl.startsWith('blob:')) {
        try {
          await audioEngine.loadAudio(song.audioUrl, startPosition);
        } catch (streamErr) {
          console.warn('Direct audio stream failed, falling back to fetch blob:', streamErr);
          try {
            const resp = await fetch(song.audioUrl);
            if (resp.ok) {
              const fetchedBlob = await resp.blob();
              if (fetchedBlob.size > 0) {
                await audioEngine.loadAudio(fetchedBlob, startPosition);
              } else {
                throw new Error('Downloaded audio blob was empty');
              }
            } else {
              throw new Error(`Failed to stream audio (HTTP ${resp.status})`);
            }
          } catch (fetchErr) {
            console.warn('Audio fetch fallback error:', fetchErr);
            setGlobalError("JTEC MUSIC couldn't load this audio track. Please check your connection or re-import it.");
            setTimeout(() => setGlobalError(null), 5000);
            return;
          }
        }
      } else {
        setGlobalError("JTEC MUSIC couldn't find audio data for this track. Please download or re-import it.");
        setTimeout(() => setGlobalError(null), 5000);
        return;
      }

      audioEngine.applyEffects(effects);
      await audioEngine.play();

      // Record in Recently Played
      await StorageService.addRecentlyPlayed(song.id);
      const updatedRecents = await StorageService.getRecentlyPlayed();
      setRecentlyPlayedIds(updatedRecents);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      console.warn('Failed to play song:', err);
      setGlobalError("JTEC MUSIC couldn't play this file. The format may not be supported by your browser.");
      setTimeout(() => setGlobalError(null), 5000);
    }
  };

  // Toggle Play / Pause
  const handleTogglePlay = async () => {
    if (!currentSong && songs.length > 0) {
      playSong(songs[0]);
      return;
    }

    if (isPlaying) {
      audioEngine.pause();
    } else {
      if (!currentSong) return;
      NotificationPermissionManager.checkAndRequestOnFirstPlay();

      try {
        if (!audioEngine.hasSource()) {
          await playSong(currentSong, undefined, currentTime);
        } else {
          await audioEngine.play();
        }
      } catch (err) {
        console.warn('Direct resume notice, reloading song track:', err);
        try {
          await playSong(currentSong, undefined, currentTime);
        } catch (fallbackErr) {
          console.warn('Play reload fallback error:', fallbackErr);
        }
      }
    }
  };

  // Next Track (advances strictly top-to-bottom through the active queue/list)
  const handleNextTrack = () => {
    const cur = currentSong;
    const q = queue.length > 0 ? queue : songs;
    if (q.length === 0) return;

    if (isShuffle && q.length > 1) {
      const curIdx = cur ? q.findIndex((item) => item.id === cur.id) : -1;
      let rand = Math.floor(Math.random() * q.length);
      while (rand === curIdx && q.length > 1) {
        rand = Math.floor(Math.random() * q.length);
      }
      playSong(q[rand]);
      return;
    }

    if (!cur) {
      playSong(q[0]);
      return;
    }

    const curIdx = q.findIndex((item) => item.id === cur.id);
    if (curIdx !== -1 && curIdx + 1 < q.length) {
      // Next goes to the song below
      playSong(q[curIdx + 1]);
      return;
    }

    // At the last song, respect repeat: repeat ON goes back to first song, repeat OFF stops/rewinds
    if (repeatMode === 'all') {
      playSong(q[0]);
    } else {
      // Repeat off: stop playback or do not advance past the bottom
      audioEngine.pause();
      setIsPlaying(false);
    }
  };

  // Previous Track (goes to the song above in top-to-bottom order)
  const handlePreviousTrack = () => {
    if (currentTime > 3) {
      audioEngine.seek(0);
      return;
    }

    const cur = currentSong;
    const q = queue.length > 0 ? queue : songs;
    if (q.length === 0) return;

    if (!cur) {
      playSong(q[0]);
      return;
    }

    const curIdx = q.findIndex((item) => item.id === cur.id);
    if (curIdx > 0) {
      // Previous goes to the song above
      playSong(q[curIdx - 1]);
      return;
    }

    // At the top song
    if (repeatMode === 'all') {
      playSong(q[q.length - 1]);
    } else {
      audioEngine.seek(0);
    }
  };

  // Toggle Shuffle with top-to-bottom restoration from current song
  const handleToggleShuffle = () => {
    setIsShuffle((prevShuffle) => {
      const nextShuffle = !prevShuffle;
      if (nextShuffle) {
        // Turning shuffle ON: create randomized order
        const cur = currentSong;
        const base = queue.length > 0 ? [...queue] : [...songs];
        if (base.length > 1) {
          const others = cur ? base.filter((s) => s.id !== cur.id) : base;
          for (let i = others.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [others[i], others[j]] = [others[j], others[i]];
          }
          setQueue(cur ? [cur, ...others] : others);
        }
      } else {
        // Turning shuffle OFF: go back to top-to-bottom from the current song
        const base = originalQueueRef.current.length > 0
          ? originalQueueRef.current
          : songsRef.current;
        if (base.length > 0) {
          setQueue(base);
        }
      }
      return nextShuffle;
    });
  };

  // Seek
  const handleSeek = (seconds: number) => {
    audioEngine.seek(seconds);
    setCurrentTime(seconds);
    currentTimeRef.current = seconds;
    MediaSessionManager.updatePositionState(seconds, duration, effects.playbackRate, true);
    persistSessionNow();
  };

  // Register Media Session callbacks
  useEffect(() => {
    MediaSessionManager.registerActionHandlers({
      onPlay: () => handleTogglePlay(),
      onPause: () => audioEngine.pause(),
      onPrevious: () => handlePreviousTrack(),
      onNext: () => handleNextTrack(),
      onSeek: (seconds) => {
        handleSeek(seconds);
      },
      onSeekBackward: (offset = 10) => {
        handleSeek(Math.max(0, currentTimeRef.current - offset));
      },
      onSeekForward: (offset = 10) => {
        handleSeek(Math.min(duration || 0, currentTimeRef.current + offset));
      },
      onStop: () => {
        audioEngine.pause();
        audioEngine.seek(0);
        setCurrentTime(0);
        currentTimeRef.current = 0;
        MediaSessionManager.updatePlaybackState('none');
      },
    });
  }, [currentSong, queue, songs, isShuffle, repeatMode, currentTime, duration, effects.playbackRate]);

  // Effects handler
  const handleEffectsChange = (newEffects: AudioEffectsConfig) => {
    setEffects(newEffects);
    audioEngine.applyEffects(newEffects);
  };

  // Favorite toggle
  const handleToggleFavorite = async (song: Song) => {
    const newFav = !song.isFavorite;
    await StorageService.toggleFavorite(song.id, newFav);

    setSongs((prev) =>
      prev.map((s) => (s.id === song.id ? { ...s, isFavorite: newFav } : s))
    );

    if (currentSong?.id === song.id) {
      setCurrentSong((prev) => prev ? { ...prev, isFavorite: newFav } : null);
    }

    // Also update "Favorite Songs" playlist
    const favPlaylist = playlists.find((p) => p.name === 'Favorite Songs');
    if (favPlaylist) {
      const updatedSongIds = newFav
        ? [...new Set([...favPlaylist.songIds, song.id])]
        : favPlaylist.songIds.filter((id) => id !== song.id);
      const updatedPl = { ...favPlaylist, songIds: updatedSongIds, updatedAt: Date.now() };
      await StorageService.savePlaylist(updatedPl);
      setPlaylists((prev) => prev.map((p) => (p.id === updatedPl.id ? updatedPl : p)));
    }
  };

  // Cover management
  const handleUpdateSongCover = async (song: Song, artworkUrl: string) => {
    let newPalette: ArtworkPalette | undefined = undefined;
    if (artworkUrl) {
      newPalette = await extractPaletteFromImage(artworkUrl);
    }

    await StorageService.updateSongCover(song.id, artworkUrl, newPalette);

    setSongs((prev) =>
      prev.map((s) => (s.id === song.id ? { ...s, artworkUrl: artworkUrl || undefined, palette: newPalette } : s))
    );
    setQueue((prev) =>
      prev.map((s) => (s.id === song.id ? { ...s, artworkUrl: artworkUrl || undefined, palette: newPalette } : s))
    );

    if (currentSong?.id === song.id) {
      setCurrentSong((prev) => prev ? { ...prev, artworkUrl: artworkUrl || undefined, palette: newPalette } : null);
      if (newPalette) {
        setCurrentPalette({ ...newPalette, hasCover: true });
      } else {
        setCurrentPalette({
          main: '#00f0ff',
          primary: '#00f0ff',
          secondary: '#a855f7',
          accent: '#ec4899',
          glow: 'rgba(0, 240, 255, 0.45)',
          darkBg: '#070b18',
          hasCover: false,
        });
      }
    }
  };

  const handleRemoveSongCover = async (song: Song) => {
    await handleUpdateSongCover(song, '');
  };

  // Queue actions
  const handlePlayNext = (song: Song) => {
    setQueue((prev) => {
      const filtered = prev.filter((s) => s.id !== song.id);
      const curIdx = currentSong ? filtered.findIndex((s) => s.id === currentSong.id) : -1;
      if (curIdx >= 0) {
        filtered.splice(curIdx + 1, 0, song);
        return [...filtered];
      }
      return [song, ...filtered];
    });
  };

  const handleAddToQueue = (song: Song) => {
    setQueue((prev) => {
      if (prev.some((s) => s.id === song.id)) return prev;
      return [...prev, song];
    });
  };

  const handleRemoveFromQueue = (index: number) => {
    setQueue((prev) => prev.filter((_, i) => i !== index));
  };

  const handleMoveQueueItem = (fromIdx: number, toIdx: number) => {
    setQueue((prev) => {
      const next = [...prev];
      const [item] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, item);
      return next;
    });
  };

  const handleClearQueue = () => {
    setQueue(currentSong ? [currentSong] : []);
  };

  // Play entire playlist
  const handlePlayPlaylist = (playlist: Playlist) => {
    const plSongs = playlist.songIds
      .map((id) => songs.find((s) => s.id === id))
      .filter((s): s is Song => Boolean(s));

    if (plSongs.length === 0) return;
    setQueue(plSongs);
    playSong(plSongs[0]);
  };

  // Create playlist
  const handleCreatePlaylist = async (name: string, description: string, coverGradient: string) => {
    const newPlaylist: Playlist = {
      id: `pl_${Date.now()}`,
      name,
      description,
      coverGradient,
      songIds: songToAddPlaylist ? [songToAddPlaylist.id] : [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await StorageService.savePlaylist(newPlaylist);
    setPlaylists((prev) => [newPlaylist, ...prev]);
    setSongToAddPlaylist(null);
  };

  // Add song to existing playlist
  const handleAddSongToPlaylist = async (playlistId: string, songId: string) => {
    const pl = playlists.find((p) => p.id === playlistId);
    if (!pl) return;
    const updatedIds = [...new Set([...pl.songIds, songId])];
    const updatedPl = { ...pl, songIds: updatedIds, updatedAt: Date.now() };
    await StorageService.savePlaylist(updatedPl);
    setPlaylists((prev) => prev.map((p) => (p.id === playlistId ? updatedPl : p)));
    setSongToAddPlaylist(null);
  };

  // Rename playlist
  const handleRenamePlaylist = async (playlistId: string, newName: string) => {
    const pl = playlists.find((p) => p.id === playlistId);
    if (!pl) return;
    const updated = { ...pl, name: newName, updatedAt: Date.now() };
    await StorageService.savePlaylist(updated);
    setPlaylists((prev) => prev.map((p) => (p.id === playlistId ? updated : p)));
  };

  // Delete playlist
  const handleDeletePlaylist = async (playlistId: string) => {
    await StorageService.deletePlaylist(playlistId);
    setPlaylists((prev) => prev.filter((p) => p.id !== playlistId));
  };

  // Remove song from playlist
  const handleRemoveSongFromPlaylist = async (playlistId: string, songId: string) => {
    const pl = playlists.find((p) => p.id === playlistId);
    if (!pl) return;
    const updated = { ...pl, songIds: pl.songIds.filter((id) => id !== songId), updatedAt: Date.now() };
    await StorageService.savePlaylist(updated);
    setPlaylists((prev) => prev.map((p) => (p.id === playlistId ? updated : p)));
  };

  // Reorder songs inside playlist
  const handleReorderPlaylistSongs = async (playlistId: string, fromIdx: number, toIdx: number) => {
    const pl = playlists.find((p) => p.id === playlistId);
    if (!pl) return;
    const nextIds = [...pl.songIds];
    const [moved] = nextIds.splice(fromIdx, 1);
    nextIds.splice(toIdx, 0, moved);
    const updated = { ...pl, songIds: nextIds, updatedAt: Date.now() };
    await StorageService.savePlaylist(updated);
    setPlaylists((prev) => prev.map((p) => (p.id === playlistId ? updated : p)));
  };

  // Remove song from library
  const handleRemoveSongFromLibrary = async (song: Song) => {
    await StorageService.deleteSong(song.id);
    setSongs((prev) => prev.filter((s) => s.id !== song.id));
    setQueue((prev) => prev.filter((s) => s.id !== song.id));
    if (currentSong?.id === song.id) {
      audioEngine.pause();
      setCurrentSong(null);
    }
    const stats = await StorageService.getStorageStats();
    setStorageStats(stats);
  };

  // Clear entire library
  const handleClearEntireLibrary = async () => {
    audioEngine.pause();
    await StorageService.clearEntireLibrary();
    setSongs([]);
    setPlaylists([]);
    setQueue([]);
    setCurrentSong(null);
    setRecentlyPlayedIds([]);
    setStorageStats({ songCount: 0, estimatedBytes: 0 });
  };

  // Cloud Handlers
  const handleRefreshCloud = async () => {
    const fetched = await SupabaseService.fetchCloudSongs();
    setCloudSongs(fetched);
  };

  const handlePlayCloudSong = async (cloudSong: CloudSong) => {
    // Check if an offline downloaded copy exists
    const match = songs.find(
      (s) => s.cloudId === cloudSong.id || (cloudSong.file_hash && s.fileHash === cloudSong.file_hash)
    );
    if (match && match.hasStoredBlob) {
      await playSong(match);
      return;
    }

    // Stream from Supabase public audio_url
    const streamedSong: Song = {
      id: `stream_${cloudSong.id}`,
      title: cloudSong.title,
      artist: cloudSong.artist,
      album: cloudSong.album,
      duration: cloudSong.duration,
      genre: cloudSong.genre,
      artworkUrl: cloudSong.cover_url,
      format: (cloudSong.file_name.split('.').pop() || 'mp3').toLowerCase(),
      size: cloudSong.file_size,
      dateAdded: Date.now(),
      hasStoredBlob: false,
      cloudId: cloudSong.id,
      isCloud: true,
      audioUrl: cloudSong.audio_url,
      fileHash: cloudSong.file_hash,
    };

    await playSong(streamedSong);
  };

  const handleDownloadCloudSong = async (
    cloudSong: CloudSong,
    onProgress?: (percent: number) => void
  ) => {
    try {
      const { song, blob } = await SupabaseService.downloadForOffline(cloudSong, onProgress);
      await StorageService.saveSong(song, blob);

      setSongs((prev) => {
        const existingIdx = prev.findIndex(
          (s) => s.cloudId === cloudSong.id || (cloudSong.file_hash && s.fileHash === cloudSong.file_hash)
        );
        if (existingIdx >= 0) {
          const next = [...prev];
          next[existingIdx] = song;
          return next;
        }
        return [song, ...prev];
      });

      const stats = await StorageService.getStorageStats();
      setStorageStats(stats);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not download song';
      console.error('Failed to download cloud song:', err);
      throw new Error(msg);
    }
  };

  const handleRemoveOfflineSong = async (songId: string) => {
    await StorageService.removeOfflineBlobOnly(songId);
    setSongs((prev) =>
      prev.map((s) => (s.id === songId ? { ...s, hasStoredBlob: false } : s))
    );
    const stats = await StorageService.getStorageStats();
    setStorageStats(stats);
  };

  const handleDeleteCloudSong = async (cloudSong: CloudSong, deleteOfflineCopy = false) => {
    try {
      await SupabaseService.deleteSongFromCloud(cloudSong);
      setCloudSongs((prev) => prev.filter((s) => s.id !== cloudSong.id));

      if (deleteOfflineCopy) {
        const match = songs.find(
          (s) => s.cloudId === cloudSong.id || (cloudSong.file_hash && s.fileHash === cloudSong.file_hash)
        );
        if (match) {
          await StorageService.deleteSong(match.id);
          setSongs((prev) => prev.filter((s) => s.id !== match.id));
          setQueue((prev) => prev.filter((s) => s.id !== match.id));
          if (currentSong?.id === match.id) {
            audioEngine.pause();
            setCurrentSong(null);
          }
        }
      }

      const stats = await StorageService.getStorageStats();
      setStorageStats(stats);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not delete song';
      setGlobalError(msg);
      setTimeout(() => setGlobalError(null), 5000);
    }
  };

  const handleClearOfflineDownloads = async () => {
    await StorageService.clearOfflineDownloadsOnly();
    const allSongs = await StorageService.getAllSongs();
    setSongs(allSongs);
    const stats = await StorageService.getStorageStats();
    setStorageStats(stats);
  };

  // Import completion callback
  const handleImportComplete = async (newSongs: Song[]) => {
    setSongs((prev) => [...newSongs, ...prev]);
    setQueue((prev) => [...newSongs, ...prev]);
    setIsImportOpen(false);

    if (!currentSong && newSongs.length > 0) {
      playSong(newSongs[0]);
    }

    const stats = await StorageService.getStorageStats();
    setStorageStats(stats);
  };

  // Update settings
  const handleUpdateSettings = async (newSettings: AppSettings) => {
    setSettings(newSettings);
    await StorageService.saveSettings(newSettings);
  };

  // Derived recently played songs
  const recentlyPlayedSongs = recentlyPlayedIds
    .map((id) => songs.find((s) => s.id === id))
    .filter((s): s is Song => Boolean(s));

  return (
    <div className="h-[100dvh] min-h-[100dvh] w-full overflow-hidden bg-[#060810] text-slate-100 flex flex-col font-sans relative selection:bg-cyan-500/30">
      {/* Toast Error Alert */}
      {globalError && (
        <div className="fixed top-16 left-4 right-4 z-50 max-w-md mx-auto p-3.5 rounded-2xl bg-rose-950/90 border border-rose-500/40 text-rose-200 text-xs shadow-2xl backdrop-blur-md animate-in slide-in-from-top-4 flex items-center justify-between">
          <span>{globalError}</span>
          <button onClick={() => setGlobalError(null)} className="ml-2 font-bold text-rose-400">✕</button>
        </div>
      )}

      {/* Header */}
      <Header
        onOpenSearch={() => {
          setIsSettingsView(false);
          setCurrentTab('search');
        }}
        onOpenSettings={() => setIsSettingsView(true)}
        onOpenEffects={() => setIsEffectsModalOpen(true)}
        onOpenCloud={() => {
          setIsSettingsView(false);
          setCurrentTab('cloud');
        }}
        onLogoClick={() => {
          setIsSettingsView(false);
          setCurrentTab('home');
        }}
        isSettingsView={isSettingsView}
        onBackFromSettings={() => setIsSettingsView(false)}
      />

      {/* Main Body Content Router */}
      <main className="flex-1 w-full overflow-y-auto overflow-x-hidden min-h-0">
        {isSettingsView ? (
          <SettingsScreen
            settings={settings}
            storageStats={storageStats}
            onUpdateSettings={handleUpdateSettings}
            onClearLibrary={handleClearEntireLibrary}
            onOpenCloudSettings={() => setIsCloudSettingsOpen(true)}
            sleepTimer={sleepTimer}
            onStartSleepTimer={handleStartSleepTimer}
            onCancelSleepTimer={handleCancelSleepTimer}
            onExtendSleepTimer={handleExtendSleepTimer}
          />
        ) : currentTab === 'home' ? (
          <HomeScreen
            songs={songs}
            playlists={playlists}
            recentlyPlayed={recentlyPlayedSongs}
            currentSong={currentSong}
            isPlaying={isPlaying}
            onPlaySong={(song) => playSong(song, songs)}
            onOpenImport={() => setIsImportOpen(true)}
            onOpenPlaylists={() => setCurrentTab('playlists')}
            onSelectPlaylist={handlePlayPlaylist}
            onOpenSongOptions={(song) => setOptionsMenuSong(song)}
            onToggleFavorite={handleToggleFavorite}
            onOpenCloud={() => {
              setIsSettingsView(false);
              setCurrentTab('cloud');
            }}
          />
        ) : currentTab === 'library' ? (
          <LibraryScreen
            songs={songs}
            playlists={playlists}
            recentlyPlayed={recentlyPlayedSongs}
            currentSong={currentSong}
            isPlaying={isPlaying}
            onPlaySong={(song) => playSong(song, songs)}
            onOpenSongOptions={(song) => setOptionsMenuSong(song)}
            onToggleFavorite={handleToggleFavorite}
            onOpenImport={() => setIsImportOpen(true)}
            onOpenCloud={() => setCurrentTab('cloud')}
            onOpenCreatePlaylist={() => {
              setSongToAddPlaylist(null);
              setIsPlaylistModalOpen(true);
            }}
            onSelectPlaylist={handlePlayPlaylist}
          />
        ) : currentTab === 'cloud' ? (
          <CloudScreen
            offlineSongs={songs.filter((s) => s.hasStoredBlob)}
            currentSong={currentSong}
            isPlaying={isPlaying}
            onPlaySong={playSong}
            onPlayCloudSong={handlePlayCloudSong}
            onDownloadSong={handleDownloadCloudSong}
          />
        ) : currentTab === 'playlists' ? (
          <PlaylistsScreen
            playlists={playlists}
            songs={songs}
            currentSong={currentSong}
            isPlaying={isPlaying}
            onPlaySong={playSong}
            onPlayPlaylist={handlePlayPlaylist}
            onOpenCreatePlaylist={() => {
              setSongToAddPlaylist(null);
              setIsPlaylistModalOpen(true);
            }}
            onRenamePlaylist={handleRenamePlaylist}
            onDeletePlaylist={handleDeletePlaylist}
            onRemoveSongFromPlaylist={handleRemoveSongFromPlaylist}
            onReorderPlaylistSongs={handleReorderPlaylistSongs}
            onOpenSongOptions={(song) => setOptionsMenuSong(song)}
          />
        ) : (
          <SearchScreen
            songs={songs}
            playlists={playlists}
            currentSong={currentSong}
            isPlaying={isPlaying}
            onPlaySong={(song) => playSong(song, songs)}
            onSelectPlaylist={handlePlayPlaylist}
            onOpenSongOptions={(song) => setOptionsMenuSong(song)}
            onToggleFavorite={handleToggleFavorite}
          />
        )}
      </main>

      {/* Bottom dimming gradient backdrop so content smoothly fades behind mini-player & navbar */}
      <div className="fixed bottom-0 left-0 right-0 h-36 bg-gradient-to-t from-[#060810] via-[#060810]/80 to-transparent pointer-events-none z-20" />

      {/* Floating Mini Player (visible whenever a song exists) */}
      <MiniPlayer
        currentSong={currentSong}
        isPlaying={isPlaying}
        effects={effects}
        onTogglePlay={handleTogglePlay}
        onNext={handleNextTrack}
        onOpenFullPlayer={() => setIsFullPlayerOpen(true)}
        onOpenEffects={() => setIsEffectsModalOpen(true)}
      />

      {/* Bottom Navigation */}
      <Navbar
        currentTab={currentTab}
        onSelectTab={(tab) => {
          setIsSettingsView(false);
          setCurrentTab(tab);
        }}
      />

      {/* FULL PLAYER MODAL */}
      <FullPlayer
        isOpen={isFullPlayerOpen}
        onClose={() => setIsFullPlayerOpen(false)}
        currentSong={currentSong}
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={duration}
        effects={effects}
        visualizerMode={settings.visualizerMode}
        performanceMode={settings.performanceMode}
        reactionStrength={settings.reactionStrength}
        repeatMode={repeatMode}
        isShuffle={isShuffle}
        palette={currentPalette}
        onSeek={handleSeek}
        onTogglePlay={handleTogglePlay}
        onPrevious={handlePreviousTrack}
        onNext={handleNextTrack}
        onToggleFavorite={handleToggleFavorite}
        onToggleShuffle={handleToggleShuffle}
        onCycleRepeat={() => {
          setRepeatMode((prev) => {
            const next = prev === 'off' ? 'all' : prev === 'all' ? 'one' : 'off';
            repeatModeRef.current = next;
            persistSessionNow();
            return next;
          });
        }}
        onSelectScene={(scene) => {
          handleUpdateSettings({ ...settings, visualizerMode: scene });
          settingsRef.current = { ...settings, visualizerMode: scene };
          persistSessionNow();
        }}
        onOpenEffects={() => setIsEffectsModalOpen(true)}
        onOpenQueue={() => setIsQueueOpen(true)}
        onOpenSongOptions={(song) => setOptionsMenuSong(song)}
      />

      {/* SLOW + REVERB AUDIO EFFECTS MODAL */}
      <AudioEffectsModal
        isOpen={isEffectsModalOpen}
        onClose={() => setIsEffectsModalOpen(false)}
        effects={effects}
        onChange={handleEffectsChange}
        sleepTimer={sleepTimer}
        onStartSleepTimer={handleStartSleepTimer}
        onCancelSleepTimer={handleCancelSleepTimer}
        onExtendSleepTimer={handleExtendSleepTimer}
      />

      {/* QUEUE DRAWER */}
      <QueueDrawer
        isOpen={isQueueOpen}
        onClose={() => setIsQueueOpen(false)}
        queue={queue}
        currentSong={currentSong}
        autoplayNext={settings.autoplayNext}
        onToggleAutoplayNext={() => handleUpdateSettings({ ...settings, autoplayNext: !settings.autoplayNext })}
        onSelectSong={(song) => playSong(song)}
        onRemoveFromQueue={handleRemoveFromQueue}
        onClearQueue={handleClearQueue}
        onMoveQueueItem={handleMoveQueueItem}
      />

      {/* IMPORT MUSIC MODAL */}
      <ImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImportComplete={handleImportComplete}
      />

      {/* PLAYLIST MODAL */}
      <PlaylistModal
        isOpen={isPlaylistModalOpen}
        onClose={() => {
          setIsPlaylistModalOpen(false);
          setSongToAddPlaylist(null);
        }}
        playlists={playlists}
        songToAdd={songToAddPlaylist}
        onCreatePlaylist={handleCreatePlaylist}
        onAddSongToPlaylist={handleAddSongToPlaylist}
      />

      {/* SONG DETAILS MODAL */}
      <SongDetailsModal
        isOpen={Boolean(detailsSong)}
        onClose={() => setDetailsSong(null)}
        song={detailsSong}
      />

      {/* SONG OPTIONS MENU */}
      <SongOptionsMenu
        isOpen={Boolean(optionsMenuSong)}
        onClose={() => setOptionsMenuSong(null)}
        song={optionsMenuSong}
        onPlay={(song) => playSong(song)}
        onPlayNext={handlePlayNext}
        onAddToQueue={handleAddToQueue}
        onAddToPlaylist={(song) => {
          setSongToAddPlaylist(song);
          setIsPlaylistModalOpen(true);
        }}
        onToggleFavorite={handleToggleFavorite}
        onViewDetails={(song) => setDetailsSong(song)}
        onRemoveFromLibrary={handleRemoveSongFromLibrary}
        onUpdateCover={handleUpdateSongCover}
        onRemoveCover={handleRemoveSongCover}
      />

      {/* CLOUD SETTINGS MODAL */}
      <CloudSettingsModal
        isOpen={isCloudSettingsOpen}
        onClose={() => setIsCloudSettingsOpen(false)}
        onRefreshCloud={handleRefreshCloud}
        onClearOfflineDownloads={handleClearOfflineDownloads}
        onConfigChanged={handleRefreshCloud}
      />

      {/* PWA AUTOMATIC UPDATE BANNER */}
      {updateAvailable && (
        <PWAUpdateBanner
          onUpdate={handleUpdateApp}
          isUpdating={isPWAUpdating}
          hasMiniPlayer={Boolean(currentSong)}
        />
      )}

      {/* STARTUP / SPLASH SCREEN */}
      {showStartup && <StartupScreen onComplete={() => setShowStartup(false)} />}
    </div>
  );
}
