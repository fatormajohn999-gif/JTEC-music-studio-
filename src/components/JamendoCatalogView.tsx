import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  ArrowLeft, Search, RefreshCw, Play, Pause, Download, CheckCircle2,
  ExternalLink, Music, AlertCircle, X, Shield, Sparkles, Loader2,
  Wifi, SlidersHorizontal
} from 'lucide-react';
import { Network } from '@capacitor/network';
import { JamendoTrack, Song } from '../types/music';
import {
  JamendoService,
  formatLicenseLabel,
  JAMENDO_WEBSITE_URL
} from '../services/jamendo';
import { formatBytes } from '../services/supabase';

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
  // Query & Filter States
  const [activeTab, setActiveTab] = useState<'popularity_total' | 'releasedate_desc'>('popularity_total');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeGenre, setActiveGenre] = useState('all');
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);

  // Track List & Paging
  const [tracks, setTracks] = useState<JamendoTrack[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);

  // In-card Preview HTML Audio Player (Zero Web Audio connection, zero visualizers)
  const [previewTrack, setPreviewTrack] = useState<JamendoTrack | null>(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [previewCurrentTime, setPreviewCurrentTime] = useState(0);
  const [previewDuration, setPreviewDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
    async (resetPaging = false) => {
      const nextOffset = resetPaging ? 0 : offset;
      if (resetPaging) {
        setIsLoading(true);
        setErrorMessage(null);
      } else {
        setIsLoadingMore(true);
      }

      try {
        const fetched = await JamendoService.fetchTracks({
          order: activeTab,
          search: debouncedSearch,
          artist_name: selectedArtist || undefined,
          genre: activeGenre,
          offset: nextOffset,
          limit: 20,
        });

        if (resetPaging) {
          setTracks(fetched);
          setOffset(20);
        } else {
          setTracks((prev) => {
            // Deduplicate
            const seen = new Set(prev.map((t) => t.id));
            const newTracks = fetched.filter((t) => !seen.has(t.id));
            return [...prev, ...newTracks];
          });
          setOffset((prev) => prev + 20);
        }

        setHasMore(fetched.length >= 20);
      } catch (err: unknown) {
        setErrorMessage("Can't load Jamendo right now. Check your internet.");
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [activeTab, debouncedSearch, selectedArtist, activeGenre, offset]
  );

  // Reload when search, tab, artist, or genre changes
  useEffect(() => {
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
      { threshold: 0.1, rootMargin: '120px' }
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
        // Pause main player first
        onPauseMainPlayer();
        audioRef.current?.play().then(() => {
          setIsPreviewPlaying(true);
        }).catch(() => {
          setIsPreviewPlaying(false);
        });
      }
      return;
    }

    // New preview track
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

    // Check Wi-Fi only setting on cellular network
    if (downloadOnWifiOnly) {
      try {
        const status = await Network.getStatus();
        if (status.connected && status.connectionType === 'cellular') {
          pendingDownloadRef.current = () => executeDownload(track);
          setShowMobilePrompt(true);
          return;
        }
      } catch {
        // Continue download if Network plugin is unavailable
      }
    }

    await executeDownload(track);
  };

  // Row click: play in main player if downloaded, else toggle preview
  const handleRowClick = (track: JamendoTrack) => {
    const offlineSong = getDownloadedSong(track);
    if (offlineSong) {
      // Stop in-card preview if active
      stopPreview();
      // Play in main player with all animations and DSP
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

  return (
    <div className="space-y-4 animate-in fade-in pb-36">
      {/* Hidden Plain HTML Audio Element for In-Card Preview */}
      <audio ref={audioRef} preload="none" />

      {/* Top Navigation */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            stopPreview();
            onBack();
          }}
          className="px-3.5 py-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-2 transition cursor-pointer border border-white/10 active:scale-95"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Catalogs</span>
        </button>

        <button
          type="button"
          onClick={() => loadTracks(true)}
          disabled={isLoading}
          className="px-3.5 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border border-white/10 disabled:opacity-50 active:scale-95"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-amber-400' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Cinematic Jamendo Banner */}
      <div className="rounded-3xl overflow-hidden relative border border-amber-500/30 shadow-2xl min-h-[170px] sm:min-h-[190px] flex flex-col justify-end p-5 sm:p-6 bg-slate-950">
        {/* Background artwork */}
        <div className="absolute inset-0 w-full h-full">
          <img
            src="./images/cloud/jamendo.jpg"
            alt="Jamendo Music"
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-slate-950/25" />
        <div className="absolute inset-0 bg-gradient-to-r from-amber-950/80 via-purple-950/40 to-slate-950/60 mix-blend-overlay" />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm">
                Free & Legal Catalog
              </span>
              <span className="text-[11px] font-semibold text-slate-300 bg-black/50 backdrop-blur-md px-2.5 py-0.5 rounded-full border border-white/10">
                Jamendo Music v3.0
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-wide drop-shadow-md">
              JAMENDO MUSIC
            </h1>
            <p className="text-xs sm:text-sm text-slate-200 font-medium">
              Explore and download independent music directly from Jamendo
            </p>
          </div>

          <a
            href={JAMENDO_WEBSITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-amber-300 hover:text-amber-200 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl border border-amber-500/30 shrink-0 self-start sm:self-end transition hover:scale-105"
          >
            <span>Visit Jamendo</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Search Bar & Active Filter Pills */}
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
            className="w-full pl-10 pr-10 py-3 rounded-2xl bg-slate-900/80 border border-white/10 focus:border-amber-400/80 text-sm text-white placeholder-slate-500 outline-none transition shadow-inner"
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
          <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-amber-400 font-bold">Artist Filter:</span>
              <span className="text-white font-semibold">{selectedArtist}</span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedArtist(null)}
              className="text-amber-300 hover:text-white font-bold text-xs flex items-center gap-1 cursor-pointer"
            >
              <span>Clear</span>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Tabs: Popular & New */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex p-1 bg-slate-900/90 rounded-2xl border border-white/10">
            <button
              type="button"
              onClick={() => {
                setActiveTab('popularity_total');
              }}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeTab === 'popularity_total'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Popular
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('releasedate_desc');
              }}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeTab === 'releasedate_desc'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              New
            </button>
          </div>

          <div className="text-[11px] text-slate-400 font-medium">
            {tracks.length > 0 && <span>{tracks.length} tracks loaded</span>}
          </div>
        </div>

        {/* Genre Chips (Horizontally scrollable) */}
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
                    ? 'bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 border-amber-300 shadow-sm shadow-amber-500/30'
                    : 'bg-slate-900/60 border-white/5 text-slate-400 hover:border-white/20 hover:text-slate-200'
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Error Notice */}
      {errorMessage && (
        <div className="p-4 rounded-2xl bg-rose-950/50 border border-rose-500/40 text-xs text-rose-200 flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => loadTracks(true)}
            className="px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-bold text-xs cursor-pointer shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Initial Loading Spinner */}
      {isLoading && (
        <div className="py-20 flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
          <p className="text-xs font-semibold text-slate-400">Loading Jamendo tracks...</p>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && tracks.length === 0 && !errorMessage && (
        <div className="py-16 text-center space-y-3 p-6 rounded-3xl bg-slate-900/40 border border-white/5">
          <Music className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="text-sm font-bold text-white">No tracks found</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Try adjusting your search keywords, clear the artist filter, or pick a different genre.
          </p>
        </div>
      )}

      {/* Tracks List */}
      {!isLoading && tracks.length > 0 && (
        <div className="space-y-2">
          {tracks.map((track) => {
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
                    ? 'bg-amber-950/30 border-amber-500/50 shadow-md shadow-amber-500/10'
                    : isDownloaded
                    ? 'bg-slate-900/80 border-emerald-500/30 hover:border-emerald-500/50'
                    : 'bg-slate-900/50 hover:bg-slate-900/80 border-white/5 hover:border-white/15'
                }`}
              >
                {/* Left: Cover & Play Icon */}
                <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-slate-800 shrink-0">
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
                      <Music className="w-5 h-5" />
                    </div>
                  )}

                  {/* Play overlay */}
                  <div
                    className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity ${
                      isPreviewing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    {isPreviewing ? (
                      <Pause className="w-5 h-5 text-amber-400 fill-amber-400" />
                    ) : (
                      <Play className="w-5 h-5 text-white fill-white" />
                    )}
                  </div>
                </div>

                {/* Center: Track details */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs sm:text-sm font-bold text-white truncate group-hover:text-amber-300 transition">
                      {track.name}
                    </h4>
                    {isDownloaded && (
                      <span className="shrink-0 text-[10px] font-bold text-emerald-400 px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span className="hidden sm:inline">Downloaded</span>
                      </span>
                    )}
                  </div>

                  {/* Artist (clickable) & Album */}
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 truncate mt-0.5">
                    <button
                      type="button"
                      onClick={(e) => handleArtistClick(track.artist_name, e)}
                      className="text-amber-400 hover:text-amber-300 hover:underline font-semibold truncate cursor-pointer text-left"
                      title="See more tracks by this artist"
                    >
                      {track.artist_name}
                    </button>
                    <span>•</span>
                    <span className="truncate text-slate-500 text-[11px]">{track.album_name || 'Single'}</span>
                  </div>

                  {/* Duration, License & Jamendo track page link */}
                  <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-1">
                    <span>{formatSeconds(track.duration)}</span>
                    <span>•</span>
                    <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-mono">
                      {license}
                    </span>
                    <span>•</span>
                    <a
                      href={track.shareurl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-slate-400 hover:text-amber-300 flex items-center gap-0.5 transition"
                      title="View track on Jamendo"
                    >
                      <span>Jamendo page</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>

                  {trackError && (
                    <p className="text-[10px] text-rose-400 mt-0.5 font-medium">{trackError}</p>
                  )}
                </div>

                {/* Right: Actions (Download / PRO / Downloaded / Downloading) */}
                <div className="shrink-0 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  {isDownloading ? (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-bold">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>{downloadPct}%</span>
                    </div>
                  ) : isDownloaded ? (
                    <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" title="Downloaded offline">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                  ) : !track.audiodownload_allowed ? (
                    <div
                      className="flex flex-col items-end"
                      title="Download not available (PRO licensing required by artist)"
                    >
                      <span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[10px] font-black uppercase tracking-wider">
                        PRO
                      </span>
                      <span className="text-[9px] text-slate-500 mt-0.5 hidden sm:inline">
                        Download not available
                      </span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => handleDownloadClick(track, e)}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-200 border border-white/10 hover:border-amber-400 text-xs font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow-sm"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Download</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Infinite Scroll Trigger & Loader */}
          <div ref={observerTargetRef} className="py-6 flex items-center justify-center">
            {isLoadingMore ? (
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Loading more Jamendo tracks...</span>
              </div>
            ) : !hasMore ? (
              <p className="text-xs text-slate-500">You&apos;ve reached the end of the catalog.</p>
            ) : null}
          </div>
        </div>
      )}

      {/* Attribution & Legal Notice at bottom of card */}
      <div className="pt-4 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 text-center sm:text-left select-none">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>
            Music provided freely by{' '}
            <a
              href={JAMENDO_WEBSITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-400 hover:underline font-bold"
            >
              Jamendo
            </a>{' '}
            under Creative Commons licenses.
          </span>
        </div>
        <a
          href="https://www.jamendo.com/legal/licenses"
          target="_blank"
          rel="noopener noreferrer"
          className="text-slate-400 hover:text-white underline text-[11px]"
        >
          Jamendo License Terms
        </a>
      </div>

      {/* In-Card Mini Preview Player (Sticky at bottom of card, zero Web Audio connection) */}
      {previewTrack && (
        <div className="fixed bottom-20 left-4 right-4 max-w-xl mx-auto z-40 animate-in slide-in-from-bottom duration-200">
          <div className="rounded-2xl bg-slate-900/95 border border-amber-500/40 p-3 shadow-2xl shadow-black/80 backdrop-blur-md">
            {/* Progress bar */}
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mb-2 relative">
              <div
                className="bg-gradient-to-r from-amber-400 to-amber-500 h-full rounded-full transition-all duration-150"
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
                <div className="w-9 h-9 rounded-lg overflow-hidden bg-slate-800 shrink-0">
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
                    <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      PREVIEW
                    </span>
                    <h5 className="text-xs font-bold text-white truncate">{previewTrack.name}</h5>
                  </div>
                  <p className="text-[11px] text-slate-400 truncate">
                    {previewTrack.artist_name} • {formatSeconds(previewCurrentTime)} / {formatSeconds(previewDuration || previewTrack.duration)}
                  </p>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleTogglePreview(previewTrack)}
                  className="w-9 h-9 rounded-full bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center transition active:scale-95 cursor-pointer shadow-md shadow-amber-500/30"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-white/10 p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-amber-400">
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
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition cursor-pointer shadow-lg shadow-amber-500/30"
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
