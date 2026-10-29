import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import {
  ArrowLeft, Search, RefreshCw, Play, Pause, Download, CheckCircle2,
  ExternalLink, Music, AlertCircle, X, Loader2,
  Wifi, Filter
} from 'lucide-react';
import { Network } from '@capacitor/network';
import { JamendoTrack, Song } from '../types/music';
import {
  JamendoService,
  formatLicenseLabel,
  JAMENDO_WEBSITE_URL,
  jamendoSessionState
} from '../services/jamendo';
import { CLOUD_CATALOGS } from '../config/cloudCatalogs';
import { 
  saveScrollPosition, 
  getSavedScrollPosition, 
  restoreScroll, 
  registerBackHandler 
} from '../services/navigation';
import { PersistentSettingsService } from '../services/persistentSettings';

interface JamendoCatalogViewProps {
  offlineSongs: Song[];
  isPlaying: boolean;
  onPlaySong: (song: Song, contextQueue?: Song[]) => void;
  onPauseMainPlayer: () => void;
  onSaveDownloadedSong: (song: Song, blob: Blob) => Promise<void>;
  onBack: () => void;
  downloadOnWifiOnly?: boolean;
}

const GENRE_CHIPS = [
  { id: 'all', label: 'All' },
  { id: 'pop', label: 'Pop' },
  { id: 'rock', label: 'Rock' },
  { id: 'hip hop', label: 'Hip Hop' },
  { id: 'electronic', label: 'Electronic' },
  { id: 'lofi', label: 'Lofi' },
  { id: 'jazz', label: 'Jazz' },
  { id: 'classical', label: 'Classical' },
  { id: 'ambient', label: 'Ambient' },
  { id: 'reggae', label: 'Reggae' },
  { id: 'soundtrack', label: 'Soundtrack' },
  { id: 'folk', label: 'Folk' },
  { id: 'metal', label: 'Metal' },
  { id: 'world', label: 'World' },
  { id: 'chillout', label: 'Chillout' },
];

export const JamendoCatalogView: React.FC<JamendoCatalogViewProps> = ({
  offlineSongs,
  isPlaying: isMainPlayerPlaying,
  onPlaySong,
  onPauseMainPlayer,
  onSaveDownloadedSong,
  onBack,
  downloadOnWifiOnly = false,
}) => {
  // Restore scroll position on open if saved
  useLayoutEffect(() => {
    const main = document.querySelector('main');
    const saved = getSavedScrollPosition('cloud:jamendo');
    if (saved > 0) {
      restoreScroll(main, saved);
    }
  }, []);

  const handleBack = useCallback(() => {
    const main = document.querySelector('main');
    saveScrollPosition('cloud:jamendo', main ? main.scrollTop : 0);
    onBack();
  }, [onBack]);

  // Authoritative back handler for Jamendo catalog
  useEffect(() => {
    return registerBackHandler('jamendo_catalog', 40, () => {
      handleBack();
      return true;
    });
  }, [handleBack]);

  // Query & Filter States initialized from session memory and persistent settings
  const [activeTab, setActiveTab] = useState<'popularity_total' | 'releasedate_desc'>(() => {
    const s = PersistentSettingsService.getSortViewSettingsSync();
    if (s.jamendoOrder === 'popularity_total' || s.jamendoOrder === 'releasedate_desc') {
      return s.jamendoOrder;
    }
    return jamendoSessionState.activeTab;
  });
  const [searchQuery, setSearchQuery] = useState(jamendoSessionState.searchQuery);
  const [debouncedSearch, setDebouncedSearch] = useState(jamendoSessionState.searchQuery);
  const [activeGenre, setActiveGenre] = useState(jamendoSessionState.activeGenre);
  const [selectedArtist, setSelectedArtist] = useState<string | null>(
    jamendoSessionState.selectedArtist
  );
  const [downloadableOnly, setDownloadableOnly] = useState(
    jamendoSessionState.downloadableOnly
  );

  // Track List & Paging initialized from session memory
  const [tracks, setTracks] = useState<JamendoTrack[]>(jamendoSessionState.tracks);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [fullErrorMessage, setFullErrorMessage] = useState<string | null>(null);
  const [refreshBannerError, setRefreshBannerError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(jamendoSessionState.hasMore);
  const [offset, setOffset] = useState(jamendoSessionState.offset);

  // Sync state changes back into in-memory session object and persistent storage
  useEffect(() => { jamendoSessionState.tracks = tracks; }, [tracks]);
  useEffect(() => { 
    jamendoSessionState.activeTab = activeTab; 
    PersistentSettingsService.saveSortViewSettings({ jamendoOrder: activeTab });
  }, [activeTab]);
  useEffect(() => { jamendoSessionState.searchQuery = searchQuery; }, [searchQuery]);
  useEffect(() => { jamendoSessionState.activeGenre = activeGenre; }, [activeGenre]);
  useEffect(() => { jamendoSessionState.selectedArtist = selectedArtist; }, [selectedArtist]);
  useEffect(() => { jamendoSessionState.downloadableOnly = downloadableOnly; }, [downloadableOnly]);
  useEffect(() => { jamendoSessionState.offset = offset; }, [offset]);
  useEffect(() => { jamendoSessionState.hasMore = hasMore; }, [hasMore]);

  // In-card Preview HTML Audio Player (Zero Web Audio connection, zero visualizers)
  const [previewTrack, setPreviewTrack] = useState<JamendoTrack | null>(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [previewCurrentTime, setPreviewCurrentTime] = useState(0);
  const [previewDuration, setPreviewDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null);

  // Download state maps
  const [downloadProgress, setDownloadProgress] = useState<Map<string, number>>(new Map());
  const [downloadErrors, setDownloadErrors] = useState<Map<string, string>>(new Map());
  const [justDownloaded, setJustDownloaded] = useState<Set<string>>(new Set());

  // Mobile data confirmation dialog
  const [showMobilePrompt, setShowMobilePrompt] = useState(false);
  const pendingDownloadRef = useRef<(() => void) | null>(null);

  // Infinite scroll trigger observer
  const observerTargetRef = useRef<HTMLDivElement | null>(null);

  // Debounce search input by 400ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fast offline lookup: returns offline Song if downloaded
  const offlineMap = useMemo(() => {
    const map = new Map<string, Song>();
    for (const song of offlineSongs) {
      if (song.hasStoredBlob) {
        if (song.cloudId) map.set(song.cloudId, song);
        if (song.id) map.set(song.id, song);
        map.set(`${song.title.trim().toLowerCase()}:::${song.artist.trim().toLowerCase()}`, song);
      }
    }
    return map;
  }, [offlineSongs]);

  const getDownloadedSong = useCallback(
    (track: JamendoTrack): Song | undefined => {
      const jamendoId = `jamendo_${track.id}`;
      if (offlineMap.has(jamendoId)) return offlineMap.get(jamendoId);
      if (offlineMap.has(track.id)) return offlineMap.get(track.id);
      const nameKey = `${track.name.trim().toLowerCase()}:::${track.artist_name.trim().toLowerCase()}`;
      return offlineMap.get(nameKey);
    },
    [offlineMap]
  );

  const isTrackDownloaded = useCallback(
    (track: JamendoTrack): boolean => {
      if (justDownloaded.has(track.id)) return true;
      return Boolean(getDownloadedSong(track));
    },
    [justDownloaded, getDownloadedSong]
  );

  // Fetch tracks from Jamendo API
  const loadTracks = useCallback(
    async (resetPaging = false, forceRefresh = false) => {
      const nextOffset = resetPaging ? 0 : offset;
      if (resetPaging) {
        setIsLoading(true);
        setFullErrorMessage(null);
        setRefreshBannerError(null);
      } else {
        setIsLoadingMore(true);
        setRefreshBannerError(null);
      }

      try {
        const fetched = await JamendoService.fetchTracks(
          {
            order: activeTab,
            search: debouncedSearch,
            artist_name: selectedArtist || undefined,
            genre: activeGenre,
            offset: nextOffset,
            limit: 20,
          },
          forceRefresh
        );

        if (resetPaging) {
          setTracks(fetched);
          setOffset(20);
        } else {
          setTracks((prev) => {
            const seen = new Set(prev.map((t) => t.id));
            const newTracks = fetched.filter((t) => !seen.has(t.id));
            return [...prev, ...newTracks];
          });
          setOffset((prev) => prev + 20);
        }

        setHasMore(fetched.length >= 20);
        setFullErrorMessage(null);
        setRefreshBannerError(null);
      } catch (err: unknown) {
        // If results already on screen, keep them and show small banner
        setTracks((prev) => {
          if (prev.length > 0) {
            setRefreshBannerError("Couldn't refresh. Tap to retry");
            return prev;
          }
          setFullErrorMessage("Can't load Jamendo right now. Check your internet.");
          return prev;
        });
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [activeTab, debouncedSearch, selectedArtist, activeGenre, offset]
  );

  const isInitialMountRef = useRef(true);

  // Reload when search, tab, artist, or genre changes
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      if (jamendoSessionState.tracks.length > 0) {
        return;
      }
    }
    loadTracks(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, debouncedSearch, selectedArtist, activeGenre]);

  // Infinite scroll intersection observer
  useEffect(() => {
    const currentTarget = observerTargetRef.current;
    if (!currentTarget || isLoading || isLoadingMore || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading && !isLoadingMore) {
          loadTracks(false);
        }
      },
      { threshold: 0.1, rootMargin: '160px' }
    );

    observer.observe(currentTarget);
    return () => {
      if (currentTarget) observer.unobserve(currentTarget);
    };
  }, [loadTracks, hasMore, isLoading, isLoadingMore]);

  // Audio preview playback controller
  const stopPreview = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    setIsPreviewPlaying(false);
    setPreviewTrack(null);
    setPreviewCurrentTime(0);
    setPreviewDuration(0);
  }, []);

  // When main player starts, stop the Jamendo preview immediately
  useEffect(() => {
    if (isMainPlayerPlaying && isPreviewPlaying) {
      stopPreview();
    }
  }, [isMainPlayerPlaying, isPreviewPlaying, stopPreview]);

  // Handle preview play/pause
  const handleTogglePreview = (track: JamendoTrack) => {
    if (previewTrack?.id === track.id) {
      if (isPreviewPlaying) {
        audioRef.current?.pause();
        setIsPreviewPlaying(false);
      } else {
        onPauseMainPlayer();
        audioRef.current?.play().then(() => {
          setIsPreviewPlaying(true);
        }).catch(() => {
          setIsPreviewPlaying(false);
        });
      }
      return;
    }

    onPauseMainPlayer();
    setPreviewTrack(track);
    setPreviewCurrentTime(0);
    setPreviewDuration(track.duration || 0);

    if (audioRef.current) {
      audioRef.current.src = track.audio;
      audioRef.current.play().then(() => {
        setIsPreviewPlaying(true);
      }).catch((err) => {
        console.warn('Jamendo preview play notice:', err);
        setIsPreviewPlaying(false);
      });
    }
  };

  // Plain HTML audio event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setPreviewCurrentTime(audio.currentTime);
      if (audio.duration && !isNaN(audio.duration)) {
        setPreviewDuration(audio.duration);
      }
    };

    const handleEnded = () => {
      setIsPreviewPlaying(false);
      setPreviewCurrentTime(0);
    };

    const handlePause = () => {
      setIsPreviewPlaying(false);
    };

    const handlePlay = () => {
      setIsPreviewPlaying(true);
      onPauseMainPlayer();
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('play', handlePlay);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('play', handlePlay);
    };
  }, [onPauseMainPlayer]);

  // Seek on preview progress bar
  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || !audioRef.current || !previewDuration) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    const targetTime = percentage * previewDuration;
    audioRef.current.currentTime = targetTime;
    setPreviewCurrentTime(targetTime);
  };

  // Cleanup preview on unmount
  useEffect(() => {
    return () => {
      stopPreview();
    };
  }, [stopPreview]);

  // Download track handler
  const executeDownload = async (track: JamendoTrack) => {
    if (downloadProgress.has(track.id)) return;

    setDownloadErrors((prev) => {
      const next = new Map(prev);
      next.delete(track.id);
      return next;
    });

    setDownloadProgress((prev) => new Map(prev).set(track.id, 5));

    try {
      const { song, blob } = await JamendoService.downloadTrack(track, (pct) => {
        setDownloadProgress((prev) => new Map(prev).set(track.id, pct));
      });

      await onSaveDownloadedSong(song, blob);
      setJustDownloaded((prev) => new Set(prev).add(track.id));
    } catch {
      setDownloadErrors((prev) =>
        new Map(prev).set(track.id, "Can't load Jamendo right now. Check your internet.")
      );
    } finally {
      setDownloadProgress((prev) => {
        const next = new Map(prev);
        next.delete(track.id);
        return next;
      });
    }
  };

  const handleDownloadClick = async (track: JamendoTrack, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!track.audiodownload_allowed) return;

    if (downloadOnWifiOnly) {
      try {
        const status = await Network.getStatus();
        if (status.connected && status.connectionType === 'cellular') {
          pendingDownloadRef.current = () => executeDownload(track);
          setShowMobilePrompt(true);
          return;
        }
      } catch {
        // Continue if plugin fails
      }
    }

    await executeDownload(track);
  };

  // Row click: play in main player if downloaded, else toggle preview
  const handleRowClick = (track: JamendoTrack) => {
    const offlineSong = getDownloadedSong(track);
    if (offlineSong) {
      stopPreview();
      onPlaySong(offlineSong);
    } else {
      handleTogglePreview(track);
    }
  };

  // Tap artist name to filter by artist
  const handleArtistClick = (artistName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedArtist(artistName);
    setSearchQuery('');
  };

  const formatSeconds = (sec: number) => {
    if (!sec || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Filter tracks by downloadableOnly flag
  const displayedTracks = useMemo(() => {
    if (!downloadableOnly) return tracks;
    return tracks.filter((t) => t.audiodownload_allowed);
  }, [tracks, downloadableOnly]);

  return (
    <div className="space-y-4 animate-in fade-in pb-36 max-w-4xl mx-auto">
      {/* Hidden Plain HTML Audio Element for In-Card Preview */}
      <audio ref={audioRef} preload="none" />

      {/* Top Navigation */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleBack}
          className="px-3.5 py-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-2 transition cursor-pointer border border-white/10 active:scale-95"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Catalogs</span>
        </button>

        <button
          type="button"
          onClick={() => loadTracks(true, true)}
          disabled={isLoading}
          className="px-3.5 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border border-white/10 disabled:opacity-50 active:scale-95"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Toned Down Hero Banner: Smaller height with app navy & cyan/purple gradient overlay */}
      <div className="rounded-3xl overflow-hidden relative border border-cyan-500/30 shadow-xl min-h-[120px] sm:min-h-[140px] flex flex-col justify-end p-4 sm:p-5 bg-[#0c122c]">
        {/* Background artwork */}
        <div className="absolute inset-0 w-full h-full bg-[#0a0f24]">
          <img
            src={CLOUD_CATALOGS.find((c) => c.key === 'jamendo')?.image || './images/cards/jamendo.webp'}
            alt="Jamendo Music"
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/70 to-slate-950/55" />
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-950/60 via-purple-950/40 to-[#0c122c]/80 mix-blend-overlay" />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border bg-gradient-to-r from-cyan-500/20 to-purple-500/20 text-cyan-300 border-cyan-500/40 shadow-sm">
                Free & Legal
              </span>
              <span className="text-[11px] font-semibold text-slate-300 bg-black/40 backdrop-blur-md px-2.5 py-0.5 rounded-full border border-white/10">
                Jamendo v3.0
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-wide">
              JAMENDO MUSIC
            </h1>
            <p className="text-xs text-slate-300 font-medium line-clamp-1">
              Explore and download independent music directly from Jamendo
            </p>
          </div>

          <a
            href={JAMENDO_WEBSITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-cyan-300 hover:text-white bg-slate-900/80 hover:bg-slate-800 backdrop-blur-md px-3 py-1.5 rounded-xl border border-cyan-500/30 shrink-0 self-start sm:self-end transition hover:scale-105"
          >
            <span>Visit Jamendo</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Search Bar, Tabs & Genre Chips (Compact scrollable bar) */}
      <div className="space-y-2.5">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (selectedArtist) setSelectedArtist(null);
            }}
            placeholder="Search by song or artist..."
            className="w-full pl-10 pr-10 py-2.5 rounded-2xl bg-slate-900/80 border border-white/10 focus:border-cyan-400/80 text-sm text-white placeholder-slate-500 outline-none transition shadow-inner"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Selected Artist Active Filter Banner */}
        {selectedArtist && (
          <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-cyan-400 font-bold">Artist:</span>
              <span className="text-white font-semibold">{selectedArtist}</span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedArtist(null)}
              className="text-cyan-300 hover:text-white font-bold text-xs flex items-center gap-1 cursor-pointer"
            >
              <span>Clear</span>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Popular / New Tabs & Downloadable Only Chip */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex p-1 bg-slate-900/90 rounded-2xl border border-white/10">
            <button
              type="button"
              onClick={() => setActiveTab('popularity_total')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeTab === 'popularity_total'
                  ? 'bg-gradient-to-r from-cyan-500 to-purple-600 text-white shadow-md shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Popular
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('releasedate_desc')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeTab === 'releasedate_desc'
                  ? 'bg-gradient-to-r from-cyan-500 to-purple-600 text-white shadow-md shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              New
            </button>
          </div>

          {/* Downloadable only chip toggle */}
          <button
            type="button"
            onClick={() => setDownloadableOnly((prev) => !prev)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border ${
              downloadableOnly
                ? 'bg-gradient-to-r from-cyan-500/20 to-purple-500/20 text-cyan-300 border-cyan-400 shadow-sm'
                : 'bg-slate-900/60 text-slate-400 border-white/10 hover:text-slate-200 hover:border-white/20'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Downloadable only</span>
          </button>
        </div>

        {/* Compact, Horizontally Scrollable Genre Chips */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          {GENRE_CHIPS.map((chip) => {
            const isSelected = activeGenre === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => {
                  setActiveGenre(chip.id);
                  setSelectedArtist(null);
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition cursor-pointer border ${
                  isSelected
                    ? 'bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 text-white border-transparent shadow-sm shadow-cyan-500/25'
                    : 'bg-slate-900/60 border-white/5 text-slate-400 hover:border-white/20 hover:text-slate-200'
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Small Banner When Results Exist on Screen but Background Refresh Failed */}
      {refreshBannerError && tracks.length > 0 && (
        <div className="p-3 rounded-2xl bg-slate-900/90 border border-cyan-500/30 text-xs text-slate-300 flex items-center justify-between gap-3 animate-in fade-in shadow-lg">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>{refreshBannerError}</span>
          </div>
          <button
            type="button"
            onClick={() => loadTracks(true, true)}
            className="px-3 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 font-bold text-xs cursor-pointer shrink-0 transition"
          >
            Retry
          </button>
        </div>
      )}

      {/* Full Error Notice (Shown only when nothing is loaded) */}
      {fullErrorMessage && tracks.length === 0 && (
        <div className="p-5 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-xs text-rose-200 flex flex-col items-center justify-center text-center space-y-3 animate-in fade-in py-10">
          <AlertCircle className="w-8 h-8 text-rose-400" />
          <p className="font-semibold text-sm">{fullErrorMessage}</p>
          <button
            type="button"
            onClick={() => loadTracks(true, true)}
            className="px-4 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 font-bold text-xs cursor-pointer transition active:scale-95"
          >
            Tap to retry
          </button>
        </div>
      )}

      {/* Initial Loading Spinner with Skeletons */}
      {isLoading && (
        <div className="space-y-2.5 pt-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <div
              key={n}
              className="p-3 rounded-2xl bg-slate-900/40 border border-white/5 flex items-center gap-3 animate-pulse"
            >
              <div className="w-16 h-16 rounded-2xl bg-slate-800 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="w-1/2 h-3.5 bg-slate-800 rounded" />
                <div className="w-1/3 h-2.5 bg-slate-800 rounded" />
                <div className="w-1/4 h-2 bg-slate-800 rounded" />
              </div>
              <div className="w-16 h-8 bg-slate-800 rounded-xl" />
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && displayedTracks.length === 0 && !fullErrorMessage && (
        <div className="py-16 text-center space-y-3 p-6 rounded-3xl bg-slate-900/40 border border-white/5">
          <Music className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="text-sm font-bold text-white">No tracks found</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Try adjusting your search keywords, clear the artist filter, or toggle &quot;Downloadable only&quot;.
          </p>
        </div>
      )}

      {/* Tracks List */}
      {!isLoading && displayedTracks.length > 0 && (
        <div className="space-y-2">
          {displayedTracks.map((track) => {
            const isDownloaded = isTrackDownloaded(track);
            const isDownloading = downloadProgress.has(track.id);
            const downloadPct = downloadProgress.get(track.id) ?? 0;
            const trackError = downloadErrors.get(track.id);
            const isPreviewing = previewTrack?.id === track.id && isPreviewPlaying;
            const license = formatLicenseLabel(track.license_ccurl);

            return (
              <div
                key={track.id}
                onClick={() => handleRowClick(track)}
                className={`group p-3 rounded-2xl border transition-all duration-200 flex items-center justify-between gap-3 cursor-pointer select-none ${
                  isPreviewing
                    ? 'bg-gradient-to-r from-cyan-950/40 via-slate-900/90 to-purple-950/30 border-cyan-400/60 shadow-lg shadow-cyan-500/15'
                    : isDownloaded
                    ? 'bg-slate-900/80 border-emerald-500/30 hover:border-emerald-500/50'
                    : 'bg-slate-900/50 hover:bg-slate-900/80 border-white/5 hover:border-cyan-500/25'
                }`}
              >
                {/* Left: Rounded 64px cover on the left */}
                <div className="relative w-16 h-16 min-w-[64px] min-h-[64px] rounded-2xl overflow-hidden bg-slate-800 shrink-0 shadow-md">
                  {track.image ? (
                    <img
                      src={track.image}
                      alt={track.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-600">
                      <Music className="w-6 h-6" />
                    </div>
                  )}

                  {/* Play overlay / preview indicator */}
                  <div
                    className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity ${
                      isPreviewing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    {isPreviewing ? (
                      <Pause className="w-6 h-6 text-cyan-300 fill-cyan-300" />
                    ) : (
                      <Play className="w-6 h-6 text-white fill-white" />
                    )}
                  </div>
                </div>

                {/* Center: Track details */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-white truncate group-hover:text-cyan-300 transition">
                      {track.name}
                    </h4>

                    {/* Animated bars when previewing */}
                    {isPreviewing && (
                      <div className="flex items-end gap-0.5 h-3.5 px-1 shrink-0" title="Previewing">
                        <span className="w-0.5 bg-cyan-400 rounded-full animate-pulse h-3.5" />
                        <span className="w-0.5 bg-cyan-300 rounded-full animate-bounce h-2" />
                        <span className="w-0.5 bg-cyan-400 rounded-full animate-pulse h-3" />
                      </div>
                    )}
                  </div>

                  {/* Artist name below in muted color (tappable to see that artist's tracks) */}
                  <div className="truncate mt-0.5">
                    <button
                      type="button"
                      onClick={(e) => handleArtistClick(track.artist_name, e)}
                      className="text-xs text-slate-400 hover:text-cyan-300 font-medium truncate cursor-pointer text-left transition"
                      title="See more tracks by this artist"
                    >
                      {track.artist_name}
                    </button>
                  </div>

                  {/* One small line with duration, short license chip (never wraps), and link icon */}
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-1 whitespace-nowrap overflow-hidden">
                    <span>{formatSeconds(track.duration)}</span>
                    <span>•</span>
                    <span className="px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-slate-300 font-mono text-[10px] shrink-0 font-medium">
                      {license}
                    </span>
                    <span>•</span>
                    <a
                      href={track.shareurl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-slate-400 hover:text-cyan-300 p-0.5 transition shrink-0"
                      title="View track on Jamendo"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>

                  {trackError && (
                    <p className="text-[10px] text-rose-400 mt-0.5 font-medium">{trackError}</p>
                  )}
                </div>

                {/* Right: One Clear Action (Download / Progress ring / Downloaded / PRO) */}
                <div className="shrink-0 flex items-center justify-end pl-1" onClick={(e) => e.stopPropagation()}>
                  {isDownloading ? (
                    /* Circular progress ring */
                    <div className="relative w-8 h-8 flex items-center justify-center">
                      <svg className="w-8 h-8 -rotate-90" viewBox="0 0 36 36">
                        <path
                          className="text-slate-800"
                          strokeWidth="3"
                          stroke="currentColor"
                          fill="none"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                        <path
                          className="text-cyan-400 transition-all duration-200"
                          strokeDasharray={`${downloadPct}, 100`}
                          strokeWidth="3"
                          strokeLinecap="round"
                          stroke="currentColor"
                          fill="none"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                      </svg>
                      <span className="absolute text-[9px] font-bold text-cyan-300 font-mono">
                        {downloadPct}
                      </span>
                    </div>
                  ) : isDownloaded ? (
                    <div
                      className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1"
                      title="Downloaded offline"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                  ) : !track.audiodownload_allowed ? (
                    <div
                      className="px-2.5 py-1 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[10px] font-black uppercase tracking-wider select-none"
                      title="Download not available (PRO licensing required by artist)"
                    >
                      PRO
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => handleDownloadClick(track, e)}
                      className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs shadow-md shadow-cyan-500/20 active:scale-95 transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Download</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Skeletons while loading next page */}
          {isLoadingMore && (
            <div className="space-y-2.5 pt-2">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="p-3 rounded-2xl bg-slate-900/40 border border-white/5 flex items-center gap-3 animate-pulse"
                >
                  <div className="w-16 h-16 rounded-2xl bg-slate-800 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="w-1/2 h-3.5 bg-slate-800 rounded" />
                    <div className="w-1/3 h-2.5 bg-slate-800 rounded" />
                    <div className="w-1/4 h-2 bg-slate-800 rounded" />
                  </div>
                  <div className="w-16 h-8 bg-slate-800 rounded-xl" />
                </div>
              ))}
            </div>
          )}

          {/* Infinite Scroll Trigger */}
          <div ref={observerTargetRef} className="h-10" />

          {!hasMore && (
            <p className="text-center text-xs text-slate-500 py-4">
              You&apos;ve reached the end of the catalog.
            </p>
          )}
        </div>
      )}

      {/* Attribution & Legal Notice at bottom of card */}
      <div className="pt-4 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 text-center sm:text-left select-none">
        <p>
          Music provided freely by{' '}
          <a
            href={JAMENDO_WEBSITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-400 hover:underline font-bold"
          >
            Jamendo
          </a>{' '}
            under Creative Commons licenses.
        </p>
        <a
          href="https://www.jamendo.com/legal/licenses"
          target="_blank"
          rel="noopener noreferrer"
          className="text-slate-400 hover:text-white underline text-[11px]"
        >
          Jamendo License Terms
        </a>
      </div>

      {/* In-Card Mini Preview Player: App palette with cyan gradient seekable progress bar */}
      {previewTrack && (
        <div className="fixed bottom-20 left-4 right-4 max-w-xl mx-auto z-40 animate-in slide-in-from-bottom duration-200">
          <div className="rounded-2xl bg-[#0c122c]/95 border border-cyan-500/30 p-3 shadow-2xl shadow-black/80 backdrop-blur-md">
            {/* Seekable progress bar in app gradient */}
            <div
              ref={progressBarRef}
              onClick={handleSeek}
              className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mb-2 relative cursor-pointer group"
            >
              <div
                className="bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500 h-full rounded-full transition-all duration-100"
                style={{
                  width: `${
                    previewDuration > 0
                      ? Math.min(100, (previewCurrentTime / previewDuration) * 100)
                      : 0
                  }%`,
                }}
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              {/* Cover & Title */}
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-800 shrink-0">
                  <img
                    src={previewTrack.image}
                    alt={previewTrack.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                      PREVIEW
                    </span>
                    <h5 className="text-xs font-bold text-white truncate">{previewTrack.name}</h5>
                  </div>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">
                    {previewTrack.artist_name} • {formatSeconds(previewCurrentTime)} / {formatSeconds(previewDuration || previewTrack.duration)}
                  </p>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleTogglePreview(previewTrack)}
                  className="w-9 h-9 rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 flex items-center justify-center transition active:scale-95 cursor-pointer shadow-md shadow-cyan-500/25"
                >
                  {isPreviewPlaying ? (
                    <Pause className="w-4 h-4 fill-slate-950" />
                  ) : (
                    <Play className="w-4 h-4 fill-slate-950 ml-0.5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={stopPreview}
                  className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
                  title="Close preview"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Data Download Confirmation Prompt */}
      {showMobilePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-cyan-500/30 p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-cyan-400">
              <Wifi className="w-5 h-5" />
              <h4 className="text-sm font-bold text-white">Mobile Data Warning</h4>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              You are on mobile data. Download anyway?
            </p>
            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowMobilePrompt(false);
                  pendingDownloadRef.current = null;
                }}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowMobilePrompt(false);
                  if (pendingDownloadRef.current) {
                    pendingDownloadRef.current();
                    pendingDownloadRef.current = null;
                  }
                }}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 text-xs font-bold transition cursor-pointer shadow-lg shadow-cyan-500/25"
              >
                Download anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
