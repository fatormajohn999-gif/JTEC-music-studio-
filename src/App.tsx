import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Song, Playlist, AudioEffectsConfig, VisualizerMode, PerformanceMode, RepeatMode, AppSettings, 
  ArtworkPalette, CinematicScene, CloudSong 
} from './types/music';
import { StorageService } from './services/storage';
import { SupabaseService } from './services/supabase';
import { audioEngine } from './services/audioEngine';
import { MediaSessionManager } from './services/mediaSession';
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
import { CloudUploadModal } from './components/CloudUploadModal';

// Screens
import { HomeScreen } from './screens/HomeScreen';
import { LibraryScreen } from './screens/LibraryScreen';
import { SearchScreen } from './screens/SearchScreen';
import { PlaylistsScreen } from './screens/PlaylistsScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { CloudScreen } from './screens/CloudScreen';

export default function App() {
  // Navigation & Screen state
  const [currentTab, setCurrentTab] = useState<NavTab>('home');
  const [isSettingsView, setIsSettingsView] = useState(false);
  const [showStartup, setShowStartup] = useState(true);

  // Music & Library State
  const [songs, setSongs] = useState<Song[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [recentlyPlayedIds, setRecentlyPlayedIds] = useState<string[]>([]);
  const [storageStats, setStorageStats] = useState({ songCount: 0, estimatedBytes: 0 });

  // Supabase Cloud State
  const [cloudSongs, setCloudSongs] = useState<CloudSong[]>([]);
  const [isCloudSettingsOpen, setIsCloudSettingsOpen] = useState(false);
  const [isCloudUploadOpen, setIsCloudUploadOpen] = useState(false);

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
    primary: '#00f0ff',
    secondary: '#a855f7',
    accent: '#ec4899',
    glow: 'rgba(0, 240, 255, 0.45)',
    darkBg: '#070b18',
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
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const repeatModeRef = useRef(repeatMode);
  repeatModeRef.current = repeatMode;
  const isShuffleRef = useRef(isShuffle);
  isShuffleRef.current = isShuffle;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

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

        setSongs(storedSongs);
        setPlaylists(storedPlaylists);
        setRecentlyPlayedIds(storedRecents);
        setQueue(storedSongs);

        if (storedSongs.length > 0 && storedSettings.rememberLastSong) {
          setCurrentSong(storedSongs[0]);
          extractPaletteFromImage(storedSongs[0].artworkUrl).then(setCurrentPalette);
        }

        StorageService.requestPersistentStorage();

        const stats = await StorageService.getStorageStats();
        setStorageStats(stats);

        // Fetch Supabase cloud songs (real data only)
        const initialCloud = await SupabaseService.fetchCloudSongs();
        setCloudSongs(initialCloud);
      } catch (err) {
        console.error('Initialization error:', err);
      }
    }

    initApp();
  }, []);

  // Sync cloud tracks when user opens Cloud tab
  useEffect(() => {
    if (currentTab === 'cloud') {
      SupabaseService.fetchCloudSongs().then((cs) => setCloudSongs(cs));
    }
  }, [currentTab]);

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

  // Handle Song Ended Flow
  const handleSongEnded = useCallback(() => {
    const currentRepeat = repeatModeRef.current;
    const currentQueue = queueRef.current;
    const cur = currentSongRef.current;
    const appSet = settingsRef.current;

    if (!appSet.autoplayNext) {
      setIsPlaying(false);
      return;
    }

    if (currentRepeat === 'one') {
      audioEngine.seek(0);
      audioEngine.play();
      return;
    }

    if (!cur || currentQueue.length === 0) return;

    const currentIndex = currentQueue.findIndex((s) => s.id === cur.id);
    let nextIndex = currentIndex + 1;

    if (isShuffleRef.current && currentQueue.length > 1) {
      let rand = Math.floor(Math.random() * currentQueue.length);
      while (rand === currentIndex) {
        rand = Math.floor(Math.random() * currentQueue.length);
      }
      nextIndex = rand;
    }

    if (nextIndex < currentQueue.length) {
      playSong(currentQueue[nextIndex]);
    } else if (currentRepeat === 'all' && currentQueue.length > 0) {
      playSong(currentQueue[0]);
    } else {
      setIsPlaying(false);
    }
  }, []);

  // Play a specific song
  const playSong = async (song: Song) => {
    try {
      setCurrentSong(song);
      MediaSessionManager.updateMetadata(song);
      extractPaletteFromImage(song.artworkUrl).then((pal) => setCurrentPalette(pal));

      // If song not in queue, insert it
      setQueue((prev) => {
        if (!prev.some((s) => s.id === song.id)) {
          return [song, ...prev];
        }
        return prev;
      });

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

      if (blob) {
        await audioEngine.loadAudio(blob);
      } else if (song.audioUrl) {
        await audioEngine.loadAudio(song.audioUrl);
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
      try {
        if (currentSong && currentTime === 0) {
          await playSong(currentSong);
        } else {
          await audioEngine.play();
        }
      } catch (err) {
        console.error('Play resume error', err);
      }
    }
  };

  // Next Track
  const handleNextTrack = () => {
    if (queue.length === 0) return;
    const currentIndex = currentSong ? queue.findIndex((s) => s.id === currentSong.id) : -1;
    let nextIndex = currentIndex + 1;

    if (isShuffle && queue.length > 1) {
      let rand = Math.floor(Math.random() * queue.length);
      while (rand === currentIndex) {
        rand = Math.floor(Math.random() * queue.length);
      }
      nextIndex = rand;
    }

    if (nextIndex < queue.length) {
      playSong(queue[nextIndex]);
    } else if (repeatMode === 'all') {
      playSong(queue[0]);
    }
  };

  // Previous Track
  const handlePreviousTrack = () => {
    if (currentTime > 3) {
      audioEngine.seek(0);
      return;
    }
    if (queue.length === 0) return;
    const currentIndex = currentSong ? queue.findIndex((s) => s.id === currentSong.id) : 0;
    const prevIndex = currentIndex - 1 >= 0 ? currentIndex - 1 : queue.length - 1;
    playSong(queue[prevIndex]);
  };

  // Seek
  const handleSeek = (seconds: number) => {
    audioEngine.seek(seconds);
    setCurrentTime(seconds);
  };

  // Register Media Session callbacks
  useEffect(() => {
    MediaSessionManager.registerActionHandlers({
      onPlay: () => handleTogglePlay(),
      onPause: () => audioEngine.pause(),
      onPrevious: () => handlePreviousTrack(),
      onNext: () => handleNextTrack(),
      onSeek: (seconds) => {
        if (seconds < 0) {
          handleSeek(Math.max(0, currentTime + seconds));
        } else {
          handleSeek(seconds);
        }
      },
    });
  }, [currentSong, queue, isShuffle, repeatMode, currentTime]);

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

  const handleDownloadCloudSong = async (cloudSong: CloudSong) => {
    try {
      const { song, blob } = await SupabaseService.downloadForOffline(cloudSong);
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
      setGlobalError(msg);
      setTimeout(() => setGlobalError(null), 5000);
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

  const handleUploadSuccess = async (newSongs: CloudSong[]) => {
    setCloudSongs((prev) => [...newSongs, ...prev]);
    const allSongs = await StorageService.getAllSongs();
    setSongs(allSongs);
    const stats = await StorageService.getStorageStats();
    setStorageStats(stats);
    setIsCloudUploadOpen(false);
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
    <div className="min-h-screen bg-[#060810] text-slate-100 flex flex-col font-sans relative selection:bg-cyan-500/30">
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
      />

      {/* Main Body Content Router */}
      <main className="flex-1 w-full overflow-y-auto">
        {isSettingsView ? (
          <SettingsScreen
            settings={settings}
            storageStats={storageStats}
            onUpdateSettings={handleUpdateSettings}
            onClearLibrary={handleClearEntireLibrary}
          />
        ) : currentTab === 'home' ? (
          <HomeScreen
            songs={songs}
            playlists={playlists}
            recentlyPlayed={recentlyPlayedSongs}
            currentSong={currentSong}
            isPlaying={isPlaying}
            onPlaySong={playSong}
            onOpenImport={() => setIsImportOpen(true)}
            onOpenPlaylists={() => setCurrentTab('playlists')}
            onSelectPlaylist={handlePlayPlaylist}
            onOpenSongOptions={(song) => setOptionsMenuSong(song)}
            onToggleFavorite={handleToggleFavorite}
          />
        ) : currentTab === 'library' ? (
          <LibraryScreen
            songs={songs}
            playlists={playlists}
            recentlyPlayed={recentlyPlayedSongs}
            currentSong={currentSong}
            isPlaying={isPlaying}
            onPlaySong={playSong}
            onOpenSongOptions={(song) => setOptionsMenuSong(song)}
            onToggleFavorite={handleToggleFavorite}
            onOpenImport={() => setIsImportOpen(true)}
            onOpenCreatePlaylist={() => {
              setSongToAddPlaylist(null);
              setIsPlaylistModalOpen(true);
            }}
            onSelectPlaylist={handlePlayPlaylist}
          />
        ) : currentTab === 'cloud' ? (
          <CloudScreen
            cloudSongs={cloudSongs}
            offlineSongs={songs.filter((s) => s.hasStoredBlob)}
            playlists={playlists}
            currentSong={currentSong}
            isPlaying={isPlaying}
            onPlaySong={playSong}
            onPlayCloudSong={handlePlayCloudSong}
            onDownloadSong={handleDownloadCloudSong}
            onRemoveOfflineSong={handleRemoveOfflineSong}
            onDeleteCloudSong={handleDeleteCloudSong}
            onToggleFavorite={handleToggleFavorite}
            onOpenUpload={() => setIsCloudUploadOpen(true)}
            onOpenSettings={() => setIsCloudSettingsOpen(true)}
            onRefresh={handleRefreshCloud}
            onAddToPlaylist={(song) => {
              setSongToAddPlaylist(song);
              setIsPlaylistModalOpen(true);
            }}
            onAddToQueue={handleAddToQueue}
            onPlayNext={handlePlayNext}
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
            onPlaySong={playSong}
            onSelectPlaylist={handlePlayPlaylist}
            onOpenSongOptions={(song) => setOptionsMenuSong(song)}
            onToggleFavorite={handleToggleFavorite}
          />
        )}
      </main>

      {/* Floating Mini Player (visible whenever a song exists) */}
      <MiniPlayer
        currentSong={currentSong}
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={duration}
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
        repeatMode={repeatMode}
        isShuffle={isShuffle}
        palette={currentPalette}
        onTogglePlay={handleTogglePlay}
        onPrevious={handlePreviousTrack}
        onNext={handleNextTrack}
        onSeek={handleSeek}
        onToggleFavorite={handleToggleFavorite}
        onToggleShuffle={() => setIsShuffle((prev) => !prev)}
        onCycleRepeat={() =>
          setRepeatMode((prev) => (prev === 'off' ? 'all' : prev === 'all' ? 'one' : 'off'))
        }
        onSelectScene={(scene) => handleUpdateSettings({ ...settings, visualizerMode: scene })}
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
      />

      {/* QUEUE DRAWER */}
      <QueueDrawer
        isOpen={isQueueOpen}
        onClose={() => setIsQueueOpen(false)}
        queue={queue}
        currentSong={currentSong}
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
      />

      {/* CLOUD UPLOAD MODAL */}
      <CloudUploadModal
        isOpen={isCloudUploadOpen}
        onClose={() => setIsCloudUploadOpen(false)}
        onUploadSuccess={handleUploadSuccess}
        onOpenSettings={() => {
          setIsCloudUploadOpen(false);
          setIsCloudSettingsOpen(true);
        }}
      />

      {/* CLOUD SETTINGS MODAL */}
      <CloudSettingsModal
        isOpen={isCloudSettingsOpen}
        onClose={() => setIsCloudSettingsOpen(false)}
        onRefreshCloud={handleRefreshCloud}
        onClearOfflineDownloads={handleClearOfflineDownloads}
        onConfigChanged={handleRefreshCloud}
      />

      {/* STARTUP / SPLASH SCREEN */}
      {showStartup && <StartupScreen onComplete={() => setShowStartup(false)} />}
    </div>
  );
}
