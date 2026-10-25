import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  Cloud, ArrowLeft, Download, CheckCircle2, Play, Pause, Search, 
  RefreshCw, Music, AlertCircle, ShieldCheck, Volume2,
  Sparkles, Disc, Wifi, X
} from 'lucide-react';
import { Network } from '@capacitor/network';
import { CloudSong, Song } from '../types/music';
import { 
  SupabaseService, 
  CloudCategoryKey, 
  CLOUD_CATEGORIES, 
  formatBytes,
  CategoryMetadata,
  CategoryConnectionDiagnostic
} from '../services/supabase';

interface CloudScreenProps {
  offlineSongs: Song[];
  currentSong: Song | null;
  isPlaying: boolean;
  onPlaySong: (song: Song, contextQueue?: Song[]) => void;
  onPlayCloudSong: (cloudSong: CloudSong, contextQueue?: Song[]) => void;
  onDownloadSong: (cloudSong: CloudSong, onProgress?: (percent: number) => void) => Promise<void>;
  downloadOnWifiOnly?: boolean;
}

export const CloudScreen: React.FC<CloudScreenProps> = ({
  offlineSongs,
  currentSong,
  isPlaying,
  onPlaySong,
  onPlayCloudSong,
  onDownloadSong,
  downloadOnWifiOnly = false,
}) => {
  // Navigation state: null = Cloud Home, string = Category Page
  const [selectedCategory, setSelectedCategory] = useState<CloudCategoryKey | null>(null);

  // Cached tracks per category
  const [categorySongs, setCategorySongs] = useState<Record<CloudCategoryKey, CloudSong[]>>({
    nasheed: [],
    love_chill: [],
    jtec_main: [],
  });

  const [loadingMap, setLoadingMap] = useState<Record<CloudCategoryKey, boolean>>({
    nasheed: false,
    love_chill: false,
    jtec_main: false,
  });

  const [errorMap, setErrorMap] = useState<Record<CloudCategoryKey, string | null>>({
    nasheed: null,
    love_chill: null,
    jtec_main: null,
  });

  // Diagnostic status per category
  const [statusMap, setStatusMap] = useState<Record<CloudCategoryKey, CategoryConnectionDiagnostic | null>>({
    nasheed: null,
    love_chill: null,
    jtec_main: null,
  });
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  // File size cache (from song records or HEAD requests)
  const [fileSizes, setFileSizes] = useState<Record<string, number>>({});

  // Mobile data confirmation prompt state
  const [showMobileDataPrompt, setShowMobileDataPrompt] = useState(false);
  const pendingDownloadActionRef = useRef<(() => void) | null>(null);

  // Batch "Download all" state
  const [batchState, setBatchState] = useState<{
    isActive: boolean;
    isPaused: boolean;
    total: number;
    completed: number;
    currentSong: CloudSong | null;
    currentProgress: number;
  }>({
    isActive: false,
    isPaused: false,
    total: 0,
    completed: 0,
    currentSong: null,
    currentProgress: 0,
  });

  const batchCancelledRef = useRef<boolean>(false);
  const batchPausedRef = useRef<boolean>(false);

  // Check all three category connections
  const checkAllConnections = useCallback(async () => {
    setIsCheckingStatus(true);
    const updated: Record<CloudCategoryKey, CategoryConnectionDiagnostic | null> = {
      nasheed: null,
      love_chill: null,
      jtec_main: null,
    };

    await Promise.all(
      CLOUD_CATEGORIES.map(async (cat) => {
        try {
          const diag = await SupabaseService.testCategoryConnection(cat.key);
          updated[cat.key] = diag;
        } catch {
          // keep fallback
        }
      })
    );

    setStatusMap(updated);
    setIsCheckingStatus(false);
  }, []);

  // Initial connection check on mount
  useEffect(() => {
    checkAllConnections();
  }, [checkAllConnections]);

  // Track download states
  const [downloadProgress, setDownloadProgress] = useState<Map<string, number>>(new Map());
  const [downloadErrors, setDownloadErrors] = useState<Map<string, string>>(new Map());
  const [justDownloaded, setJustDownloaded] = useState<Set<string>>(new Set());

  // Search filter inside category
  const [searchQuery, setSearchQuery] = useState('');

  // Fast offline lookup map to check if a cloud song is already downloaded into local storage
  const offlineSet = useMemo(() => {
    const set = new Set<string>();
    for (const song of offlineSongs) {
      if (song.hasStoredBlob) {
        if (song.cloudId) set.add(song.cloudId);
        if (song.fileHash) set.add(song.fileHash);
        set.add(`${song.title.trim().toLowerCase()}:::${song.artist.trim().toLowerCase()}`);
      }
    }
    return set;
  }, [offlineSongs]);

  const isSongDownloaded = useCallback(
    (cs: CloudSong): boolean => {
      if (justDownloaded.has(cs.id)) return true;
      if (offlineSet.has(cs.id)) return true;
      if (cs.file_hash && offlineSet.has(cs.file_hash)) return true;
      const key = `${cs.title.trim().toLowerCase()}:::${cs.artist.trim().toLowerCase()}`;
      return offlineSet.has(key);
    },
    [offlineSet, justDownloaded]
  );

  // Fetch file size: use song record size or HEAD request
  const fetchSongSize = useCallback(async (song: CloudSong): Promise<number | undefined> => {
    if (song.file_size && song.file_size > 0) return song.file_size;
    if (fileSizes[song.id] && fileSizes[song.id] > 0) return fileSizes[song.id];

    try {
      const res = await fetch(song.audio_url, { method: 'HEAD' });
      const cl = res.headers.get('content-length');
      if (cl) {
        const bytes = parseInt(cl, 10);
        if (!isNaN(bytes) && bytes > 0) {
          setFileSizes((prev) => ({ ...prev, [song.id]: bytes }));
          return bytes;
        }
      }
    } catch {
      // ignore
    }
    return undefined;
  }, [fileSizes]);

  // Pre-fetch file sizes for songs in category that lack file_size
  useEffect(() => {
    if (!selectedCategory) return;
    const tracks = categorySongs[selectedCategory] || [];
    tracks.forEach((track) => {
      if (!track.file_size && !fileSizes[track.id]) {
        fetchSongSize(track);
      }
    });
  }, [selectedCategory, categorySongs, fetchSongSize, fileSizes]);

  // Fetch songs for a specific category
  const loadCategorySongs = useCallback(async (catKey: CloudCategoryKey, force = false) => {
    const config = SupabaseService.getCategoryConfig(catKey);
    if (!config.isConfigured) {
      setErrorMap((prev) => ({ ...prev, [catKey]: null }));
      return;
    }

    if (!force && categorySongs[catKey].length > 0) {
      return;
    }

    setLoadingMap((prev) => ({ ...prev, [catKey]: true }));
    setErrorMap((prev) => ({ ...prev, [catKey]: null }));

    try {
      const tracks = await SupabaseService.fetchSongsForCategory(catKey);
      setCategorySongs((prev) => ({ ...prev, [catKey]: tracks }));
    } catch (err: unknown) {
      console.warn(`JTEC Cloud category fetch warning for ${catKey}:`, err);
      setErrorMap((prev) => ({
        ...prev,
        [catKey]: "Can't reach JTEC Cloud right now. Check your internet and try again.",
      }));
    } finally {
      setLoadingMap((prev) => ({ ...prev, [catKey]: false }));
    }
  }, [categorySongs]);

  // When a category is opened, fetch its tracks
  useEffect(() => {
    if (selectedCategory) {
      loadCategorySongs(selectedCategory);
    }
  }, [selectedCategory, loadCategorySongs]);

  // Pre-load track counts for configured categories on mount
  useEffect(() => {
    CLOUD_CATEGORIES.forEach((cat) => {
      const config = SupabaseService.getCategoryConfig(cat.key);
      if (config.isConfigured && categorySongs[cat.key].length === 0) {
        SupabaseService.fetchSongsForCategory(cat.key)
          .then((tracks) => {
            setCategorySongs((prev) => ({ ...prev, [cat.key]: tracks }));
          })
          .catch(() => {
            // will be retried when user clicks
          });
      }
    });
  }, []);

  // Handle hardware & browser back buttons
  useEffect(() => {
    const handlePopState = () => {
      if (selectedCategory) {
        setSelectedCategory(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [selectedCategory]);

  const handleOpenCategory = (catKey: CloudCategoryKey) => {
    setSelectedCategory(catKey);
    setSearchQuery('');
    window.history.pushState({ category: catKey }, '');
  };

  const handleBackToHome = () => {
    setSelectedCategory(null);
    setSearchQuery('');
  };

  // Wi-Fi policy checker: if "Download on Wi-Fi only" is on and device is on mobile cellular data, ask
  const executeWithWifiCheck = async (action: () => void) => {
    if (downloadOnWifiOnly) {
      try {
        const status = await Network.getStatus();
        if (status.connected && status.connectionType === 'cellular') {
          pendingDownloadActionRef.current = action;
          setShowMobileDataPrompt(true);
          return;
        }
      } catch (e) {
        console.warn('Network status check error:', e);
      }
    }
    action();
  };

  // Safe single download handler
  const handleDownload = (cs: CloudSong) => {
    executeWithWifiCheck(() => {
      runSingleDownload(cs);
    });
  };

  const runSingleDownload = async (cs: CloudSong) => {
    if (isSongDownloaded(cs)) return;
    if (downloadProgress.has(cs.id)) return; // Already downloading

    // Ensure file size is known before download starts
    await fetchSongSize(cs);

    // Clear previous error if any
    setDownloadErrors((prev) => {
      const next = new Map(prev);
      next.delete(cs.id);
      return next;
    });

    setDownloadProgress((prev) => new Map(prev).set(cs.id, 5));

    try {
      await onDownloadSong(cs, (percent) => {
        setDownloadProgress((prev) => new Map(prev).set(cs.id, percent));
      });

      // Mark as just downloaded
      setJustDownloaded((prev) => new Set(prev).add(cs.id));
      setDownloadProgress((prev) => {
        const next = new Map(prev);
        next.delete(cs.id);
        return next;
      });
    } catch (err: unknown) {
      console.warn('Download failed:', err);
      const errorMsg = "Can't reach JTEC Cloud right now. Check your internet and try again.";
      setDownloadErrors((prev) => new Map(prev).set(cs.id, errorMsg));
      setDownloadProgress((prev) => {
        const next = new Map(prev);
        next.delete(cs.id);
        return next;
      });
    }
  };

  // Batch "Download all" handler
  const handleDownloadAll = (songsToDownload: CloudSong[]) => {
    executeWithWifiCheck(() => {
      runBatchDownload(songsToDownload);
    });
  };

  const runBatchDownload = async (songsList: CloudSong[]) => {
    if (songsList.length === 0) return;
    batchCancelledRef.current = false;
    batchPausedRef.current = false;

    setBatchState({
      isActive: true,
      isPaused: false,
      total: songsList.length,
      completed: 0,
      currentSong: null,
      currentProgress: 0,
    });

    for (let i = 0; i < songsList.length; i++) {
      if (batchCancelledRef.current) break;
      const current = songsList[i];

      if (isSongDownloaded(current)) {
        setBatchState((prev) => ({ ...prev, completed: prev.completed + 1 }));
        continue;
      }

      // Ensure file size is known before download starts
      await fetchSongSize(current);

      let complete = false;
      while (!complete && !batchCancelledRef.current) {
        // If connection dropped, wait until internet returns
        while (batchPausedRef.current && !batchCancelledRef.current) {
          await new Promise((r) => setTimeout(r, 1000));
        }
        if (batchCancelledRef.current) break;

        setBatchState((prev) => ({
          ...prev,
          currentSong: current,
          currentProgress: 5,
          isPaused: false,
        }));

        try {
          await onDownloadSong(current, (pct) => {
            setBatchState((prev) => ({ ...prev, currentProgress: pct }));
          });

          // A song only counts as downloaded when it is complete!
          complete = true;
          setJustDownloaded((prev) => new Set(prev).add(current.id));
          setBatchState((prev) => ({
            ...prev,
            completed: prev.completed + 1,
            currentProgress: 100,
          }));
        } catch (err) {
          if (batchCancelledRef.current) break;

          // Check if connection dropped
          const status = await Network.getStatus().catch(() => ({ connected: false }));
          if (!status.connected) {
            batchPausedRef.current = true;
            setBatchState((prev) => ({ ...prev, isPaused: true, currentProgress: 0 }));
          } else {
            // Other error, wait 2 seconds and retry this song
            await new Promise((r) => setTimeout(r, 2000));
          }
        }
      }
    }

    setBatchState({
      isActive: false,
      isPaused: false,
      total: 0,
      completed: 0,
      currentSong: null,
      currentProgress: 0,
    });
  };

  const handleCancelBatch = () => {
    batchCancelledRef.current = true;
    batchPausedRef.current = false;
    setBatchState({
      isActive: false,
      isPaused: false,
      total: 0,
      completed: 0,
      currentSong: null,
      currentProgress: 0,
    });
  };

  // Network listener to auto-pause on drop and resume on return
  useEffect(() => {
    let removeHandler: (() => void) | null = null;
    Network.addListener('networkStatusChange', (status) => {
      if (!status.connected) {
        if (!batchCancelledRef.current && batchState.isActive) {
          batchPausedRef.current = true;
          setBatchState((prev) => ({ ...prev, isPaused: true }));
        }
      } else {
        if (batchPausedRef.current) {
          batchPausedRef.current = false;
          setBatchState((prev) => ({ ...prev, isPaused: false }));
        }
      }
    }).then((handle) => {
      removeHandler = () => handle.remove();
    });

    return () => {
      if (removeHandler) removeHandler();
    };
  }, [batchState.isActive]);

  // Active category details
  const activeCategoryMeta = useMemo(() => {
    if (!selectedCategory) return null;
    return CLOUD_CATEGORIES.find((c) => c.key === selectedCategory) || null;
  }, [selectedCategory]);

  // Filtered tracks in active category
  const filteredCategoryTracks = useMemo(() => {
    if (!selectedCategory) return [];
    const list = categorySongs[selectedCategory] || [];
    if (!searchQuery.trim()) return list;

    const q = searchQuery.toLowerCase().trim();
    return list.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q) ||
        s.album.toLowerCase().includes(q) ||
        (s.genre && s.genre.toLowerCase().includes(q))
    );
  }, [selectedCategory, categorySongs, searchQuery]);

  // Songs remaining to download in active category
  const songsToDownload = useMemo(() => {
    return filteredCategoryTracks.filter((s) => !isSongDownloaded(s));
  }, [filteredCategoryTracks, isSongDownloaded]);

  // Map active category tracks to Song queue in exact top-to-bottom order
  const categoryAsSongQueue = useMemo(() => {
    return filteredCategoryTracks.map((cs) => {
      const match = offlineSongs.find(
        (s) => s.cloudId === cs.id || (cs.file_hash && s.fileHash === cs.file_hash)
      );
      if (match && match.hasStoredBlob) {
        return match;
      }
      return {
        id: `stream_${cs.id}`,
        title: cs.title,
        artist: cs.artist,
        album: cs.album,
        duration: cs.duration,
        genre: cs.genre,
        artworkUrl: cs.cover_url,
        coverUrl: cs.cover_url,
        format: (cs.file_name.split('.').pop() || 'mp3').toLowerCase(),
        size: cs.file_size || fileSizes[cs.id],
        dateAdded: Date.now(),
        hasStoredBlob: false,
        cloudId: cs.id,
        isCloud: true,
        audioUrl: cs.audio_url,
        fileHash: cs.file_hash,
      } as Song;
    });
  }, [filteredCategoryTracks, offlineSongs, fileSizes]);

  // Format seconds to mm:ss
  const formatTime = (secs: number) => {
    if (!secs || isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Helper for category badge styling
  const getBadgeStyle = (categoryKey: CloudCategoryKey) => {
    switch (categoryKey) {
      case 'nasheed':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'love_chill':
        return 'bg-pink-500/20 text-pink-300 border-pink-500/40';
      case 'jtec_main':
      default:
        return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
    }
  };

  return (
    <div className="space-y-6 pb-36 px-4 pt-3 max-w-5xl mx-auto animate-in fade-in">
      {/* =========================================================================
          VIEW 1: CLOUD HOME — PREMIUM IMAGE-BASED CATEGORY CARDS
         ========================================================================= */}
      {!selectedCategory ? (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Cloud className="w-5 h-5 text-cyan-400" />
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-wide">
                  JTEC CLOUD
                </h1>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Stream or download curated tracks directly into your offline library
              </p>
            </div>

            <button
              type="button"
              onClick={checkAllConnections}
              disabled={isCheckingStatus}
              className="px-3.5 py-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-2 transition cursor-pointer border border-white/10 self-start sm:self-auto disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCheckingStatus ? 'animate-spin text-cyan-400' : ''}`} />
              <span>{isCheckingStatus ? 'Checking cloud...' : 'Check Status'}</span>
            </button>
          </div>

          {/* Categories Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {CLOUD_CATEGORIES.map((cat) => {
              const config = SupabaseService.getCategoryConfig(cat.key);
              const isConfigured = config.isConfigured;
              const trackCount = categorySongs[cat.key]?.length || 0;
              const diag = statusMap[cat.key];

              return (
                <div
                  key={cat.key}
                  onClick={() => handleOpenCategory(cat.key)}
                  className={`group relative rounded-3xl overflow-hidden border ${cat.borderColor} bg-slate-900/60 shadow-xl cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl flex flex-col justify-between min-h-[300px]`}
                >
                  {/* Background Cover Image */}
                  <div className="absolute inset-0 w-full h-full bg-slate-950">
                    <img
                      src={cat.imagePath}
                      alt={cat.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  </div>

                  {/* Gradient Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/70 to-slate-950/20" />
                  <div className={`absolute inset-0 bg-gradient-to-br ${cat.accentBg} opacity-40 mix-blend-overlay`} />

                  {/* Top: Badges */}
                  <div className="relative z-10 p-5 flex items-center justify-between gap-2">
                    <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border shadow-sm ${getBadgeStyle(cat.key)}`}>
                      {cat.badge}
                    </span>

                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[11px] font-semibold text-slate-200">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{
                          backgroundColor: isConfigured
                            ? diag?.status === 'connected'
                              ? '#10b981'
                              : '#06b6d4'
                            : '#94a3b8',
                        }}
                      />
                      <span>{isConfigured ? `${trackCount} tracks` : 'Coming Soon'}</span>
                    </div>
                  </div>

                  {/* Bottom: Title & Description */}
                  <div className="relative z-10 p-5 space-y-2">
                    <h3 className="text-xl font-black text-white tracking-wide group-hover:text-cyan-300 transition drop-shadow-md">
                      {cat.title}
                    </h3>
                    <p className="text-xs text-slate-300 font-medium leading-relaxed drop-shadow">
                      {cat.description}
                    </p>

                    <div className="pt-2 flex items-center justify-between text-xs font-bold text-cyan-400 group-hover:translate-x-1 transition">
                      <span>Explore Catalog</span>
                      <span>→</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* =========================================================================
            VIEW 2: CATEGORY TRACKS LIST
           ========================================================================= */
        <div className="space-y-4">
          {/* Top navigation */}
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleBackToHome}
              className="px-3.5 py-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-2 transition cursor-pointer border border-white/10"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Catalogs</span>
            </button>

            <button
              type="button"
              onClick={() => loadCategorySongs(selectedCategory, true)}
              disabled={loadingMap[selectedCategory]}
              className="px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border border-white/10 disabled:opacity-50"
              title="Refresh tracks"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loadingMap[selectedCategory] ? 'animate-spin text-cyan-400' : ''}`}
              />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>

          {/* Cinematic Category Banner Image */}
          {activeCategoryMeta && (
            <div
              className={`rounded-3xl overflow-hidden relative border ${activeCategoryMeta.borderColor} shadow-2xl min-h-[180px] sm:min-h-[210px] flex flex-col justify-end p-6 sm:p-7`}
            >
              <div className="absolute inset-0 w-full h-full bg-slate-950">
                <img
                  src={activeCategoryMeta.imagePath}
                  alt={activeCategoryMeta.title}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              </div>

              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-slate-950/25" />
              <div className={`absolute inset-0 bg-gradient-to-r ${activeCategoryMeta.accentBg} opacity-60 mix-blend-overlay`} />

              <div className="relative z-10 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2.5">
                    <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border shadow-sm ${getBadgeStyle(activeCategoryMeta.key)}`}>
                      {activeCategoryMeta.badge}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-300 bg-black/50 backdrop-blur-md px-2.5 py-0.5 rounded-full border border-white/10">
                      Cloud Vault
                    </span>
                  </div>

                  <h1 className="text-2xl sm:text-3xl font-black text-white tracking-wide drop-shadow-md">
                    {activeCategoryMeta.title}
                  </h1>

                  <p className="text-xs sm:text-sm text-slate-200 font-medium">
                    {activeCategoryMeta.subtitle}
                  </p>
                </div>

                <div className="flex items-center gap-3 text-xs bg-black/60 backdrop-blur-md px-3.5 py-2 rounded-2xl border border-white/10 shrink-0 self-start sm:self-end">
                  <div className="flex items-center gap-1.5">
                    <span className="text-white font-black text-sm">
                      {categorySongs[selectedCategory]?.length || 0}
                    </span>
                    <span className="text-slate-400">Tracks</span>
                  </div>
                  <span className="text-slate-600">|</span>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{
                        backgroundColor: SupabaseService.getCategoryConfig(selectedCategory).isConfigured
                          ? '#10b981'
                          : '#94a3b8',
                      }}
                    />
                    <span className="text-slate-300 font-medium">
                      {SupabaseService.getCategoryConfig(selectedCategory).isConfigured
                        ? 'JTEC Cloud'
                        : 'Coming Soon'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Batch Download Progress Banner (Active during Download All) */}
          {batchState.isActive && (
            <div className="p-4 rounded-2xl bg-cyan-950/60 border border-cyan-500/40 shadow-xl space-y-2.5 animate-in fade-in">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <RefreshCw className={`w-4 h-4 text-cyan-400 shrink-0 ${batchState.isPaused ? '' : 'animate-spin'}`} />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">
                      {batchState.isPaused ? (
                        <span className="text-amber-300">Connection dropped. Paused — will resume automatically when internet returns...</span>
                      ) : (
                        <span>Downloading all: {batchState.completed} of {batchState.total}</span>
                      )}
                    </p>
                    {batchState.currentSong && (
                      <p className="text-[11px] text-cyan-300/80 truncate mt-0.5">
                        {batchState.currentSong.title} ({batchState.currentProgress}%)
                      </p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCancelBatch}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer shrink-0 transition"
                >
                  Cancel
                </button>
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-400 to-purple-500 rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.round(((batchState.completed + (batchState.currentProgress / 100)) / Math.max(1, batchState.total)) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Category Action Bar: Search & Download All button */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Search bar inside category */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder={`Search ${activeCategoryMeta?.title || ''} tracks by title, artist, or album...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-900/90 border border-white/10 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-400 transition shadow-inner"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs px-1.5 py-0.5 rounded cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Download All Button */}
            {SupabaseService.getCategoryConfig(selectedCategory).isConfigured && !batchState.isActive && (
              <div className="shrink-0 flex items-center justify-end">
                {songsToDownload.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => handleDownloadAll(songsToDownload)}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-400 hover:to-purple-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 active:scale-95 transition cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download all ({songsToDownload.length})</span>
                  </button>
                ) : filteredCategoryTracks.length > 0 ? (
                  <div className="px-3.5 py-2 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold text-xs flex items-center gap-1.5 select-none">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>All downloaded</span>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {/* Content: Loading, Error, Unconfigured, or Track List */}
          {loadingMap[selectedCategory] ? (
            /* Skeleton Loading State */
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="p-4 rounded-2xl bg-slate-900/50 border border-white/5 animate-pulse flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-slate-800" />
                    <div className="space-y-2">
                      <div className="w-36 h-3.5 bg-slate-800 rounded" />
                      <div className="w-24 h-2.5 bg-slate-800/60 rounded" />
                    </div>
                  </div>
                  <div className="w-24 h-8 bg-slate-800 rounded-xl" />
                </div>
              ))}
            </div>
          ) : errorMap[selectedCategory] ? (
            /* Friendly Error State */
            <div className="p-8 rounded-3xl bg-rose-500/10 border border-rose-500/30 space-y-4 max-w-md mx-auto text-center">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-300 mx-auto flex items-center justify-center">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-sm font-bold text-white">Can't Reach JTEC Cloud</h3>
                <p className="text-xs text-rose-200/90 leading-relaxed">
                  Can't reach JTEC Cloud right now. Check your internet and try again.
                </p>
              </div>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => loadCategorySongs(selectedCategory, true)}
                  className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition cursor-pointer active:scale-95 shadow-lg shadow-cyan-500/20"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : !SupabaseService.getCategoryConfig(selectedCategory).isConfigured ? (
            /* Friendly Coming Soon State */
            <div className="p-8 rounded-3xl bg-slate-900/70 border border-white/10 text-center space-y-3 max-w-md mx-auto">
              <div
                className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center border shadow-lg"
                style={{
                  backgroundColor: `${activeCategoryMeta?.themeColor}20`,
                  borderColor: `${activeCategoryMeta?.themeColor}40`,
                  color: activeCategoryMeta?.themeColor,
                }}
              >
                <Music className="w-7 h-7" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-bold text-white">
                  {activeCategoryMeta?.title}
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  This catalog is currently being prepared. Check back soon for new tracks!
                </p>
              </div>
            </div>
          ) : filteredCategoryTracks.length === 0 ? (
            /* Empty State */
            <div className="p-8 rounded-3xl bg-slate-900/50 border border-white/5 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-800 text-slate-400 mx-auto flex items-center justify-center">
                <Disc className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-white">No Music Tracks Found</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                {searchQuery
                  ? `No tracks matching "${searchQuery}" in this catalog.`
                  : `This cloud catalog currently has no tracks available.`}
              </p>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold transition cursor-pointer"
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            /* Tracks List */
            <div className="space-y-2.5">
              {filteredCategoryTracks.map((song) => {
                const isDownloaded = isSongDownloaded(song);
                const progress = downloadProgress.get(song.id);
                const isDownloading = progress !== undefined;
                const downloadError = downloadErrors.get(song.id);
                const isCurrentPlaying =
                  currentSong?.cloudId === song.id || currentSong?.audioUrl === song.audio_url;

                // File size: show from song record or from HEAD request
                const displaySize = song.file_size || fileSizes[song.id];

                return (
                  <div
                    key={song.id}
                    className={`p-3 sm:p-4 rounded-2xl border transition-all duration-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isCurrentPlaying
                        ? 'bg-cyan-500/10 border-cyan-500/40 shadow-md shadow-cyan-500/10'
                        : 'bg-slate-900/70 border-white/5 hover:border-white/15 hover:bg-slate-900/90'
                    }`}
                  >
                    {/* Left: Thumbnail & Info */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {/* Artwork thumbnail */}
                      <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-slate-800 border border-white/10 shrink-0 group/cover">
                        {song.cover_url ? (
                          <img
                            src={song.cover_url}
                            alt={song.title}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div
                            className="w-full h-full flex items-center justify-center"
                            style={{ color: activeCategoryMeta?.themeColor }}
                          >
                            <Music className="w-5 h-5" />
                          </div>
                        )}

                        {/* Stream / Play Overlay button */}
                        <button
                          type="button"
                          onClick={() => onPlayCloudSong(song, categoryAsSongQueue)}
                          className="absolute inset-0 bg-black/50 opacity-0 group-hover/cover:opacity-100 flex items-center justify-center transition cursor-pointer"
                          title="Stream track"
                        >
                          {isCurrentPlaying && isPlaying ? (
                            <Pause className="w-5 h-5 text-white" />
                          ) : (
                            <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                          )}
                        </button>
                      </div>

                      {/* Song details */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h4
                            onClick={() => onPlayCloudSong(song, categoryAsSongQueue)}
                            className="text-sm font-bold text-white truncate cursor-pointer hover:underline"
                          >
                            {song.title}
                          </h4>
                          {isCurrentPlaying && (
                            <div className="flex items-center gap-1 text-[10px] text-cyan-400 font-semibold shrink-0">
                              <Volume2 className="w-3.5 h-3.5 animate-pulse" />
                              <span className="hidden sm:inline">Playing</span>
                            </div>
                          )}
                        </div>

                        {/* Metadata line with formatted file size */}
                        <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5 truncate">
                          <span className="truncate">{song.artist || 'Unknown Artist'}</span>
                          <span aria-hidden="true" className="text-slate-600">·</span>
                          <span className="truncate">{song.album || 'Single'}</span>
                          {song.duration > 0 && (
                            <>
                              <span aria-hidden="true" className="text-slate-600">·</span>
                              <span>{formatTime(song.duration)}</span>
                            </>
                          )}
                          {displaySize !== undefined && displaySize > 0 && (
                            <>
                              <span aria-hidden="true" className="text-slate-600">·</span>
                              <span className="text-cyan-300/90 font-mono font-medium">{formatBytes(displaySize)}</span>
                            </>
                          )}
                        </div>

                        {downloadError && (
                          <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3 shrink-0" />
                            <span>{downloadError}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Right: Actions (Play & Download) */}
                    <div className="flex items-center gap-2.5 sm:self-center shrink-0 justify-end">
                      {/* Play Stream button */}
                      <button
                        type="button"
                        onClick={() => onPlayCloudSong(song, categoryAsSongQueue)}
                        className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                          isCurrentPlaying
                            ? 'bg-cyan-500 text-black border-cyan-400 font-bold'
                            : 'bg-slate-800/90 hover:bg-slate-700 text-slate-200 border-white/10 hover:text-white'
                        }`}
                        title="Stream audio"
                      >
                        {isCurrentPlaying && isPlaying ? (
                          <>
                            <Pause className="w-4 h-4" />
                            <span className="text-xs">Pause</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4 fill-current ml-0.5" />
                            <span className="text-xs">Stream</span>
                          </>
                        )}
                      </button>

                      {/* Download to Local Storage Button */}
                      {isDownloaded ? (
                        <div className="px-3.5 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-1.5 select-none">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span>Downloaded</span>
                        </div>
                      ) : isDownloading ? (
                        <div className="px-3.5 py-2 rounded-xl bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 text-xs font-bold flex items-center gap-2 min-w-[110px] justify-center">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                          <span>{progress}%</span>
                        </div>
                      ) : downloadError ? (
                        <button
                          type="button"
                          onClick={() => handleDownload(song)}
                          className="px-3.5 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Retry</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleDownload(song)}
                          className="px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md transition cursor-pointer hover:brightness-110 active:scale-95"
                          style={{
                            backgroundColor: activeCategoryMeta?.themeColor || '#00f0ff',
                            color: '#000',
                          }}
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Confirmation Modal: Cellular / Mobile Data Download Warning */}
      {showMobileDataPrompt && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-cyan-500/40 p-6 space-y-4 shadow-2xl text-center">
            <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 text-cyan-400 mx-auto flex items-center justify-center">
              <Wifi className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-sm font-bold text-white">Mobile Data Alert</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                You are on mobile data. Download anyway?
              </p>
            </div>
            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowMobileDataPrompt(false);
                  pendingDownloadActionRef.current = null;
                }}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowMobileDataPrompt(false);
                  const action = pendingDownloadActionRef.current;
                  pendingDownloadActionRef.current = null;
                  if (action) action();
                }}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-cyan-400 to-cyan-500 text-slate-950 text-xs font-bold transition shadow-lg shadow-cyan-500/25 cursor-pointer active:scale-95"
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
