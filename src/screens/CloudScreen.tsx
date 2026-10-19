import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Cloud, ArrowLeft, Download, CheckCircle2, Play, Pause, Search, 
  RefreshCw, Music, AlertCircle, ShieldCheck, Database, Volume2,
  Sparkles, Disc
} from 'lucide-react';
import { CloudSong, Song } from '../types/music';
import { 
  SupabaseService, 
  CloudCategoryKey, 
  CLOUD_CATEGORIES, 
  formatBytes,
  CategoryMetadata,
  CategoryConnectionDiagnostic,
  getMaskedHost 
} from '../services/supabase';

interface CloudScreenProps {
  offlineSongs: Song[];
  currentSong: Song | null;
  isPlaying: boolean;
  onPlaySong: (song: Song, contextQueue?: Song[]) => void;
  onPlayCloudSong: (cloudSong: CloudSong, contextQueue?: Song[]) => void;
  onDownloadSong: (cloudSong: CloudSong, onProgress?: (percent: number) => void) => Promise<void>;
}

export const CloudScreen: React.FC<CloudScreenProps> = ({
  offlineSongs,
  currentSong,
  isPlaying,
  onPlaySong,
  onPlayCloudSong,
  onDownloadSong,
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

  // Fetch songs for a specific category
  const loadCategorySongs = useCallback(async (catKey: CloudCategoryKey, force = false) => {
    const config = SupabaseService.getCategoryConfig(catKey);
    if (!config.isConfigured) {
      setErrorMap((prev) => ({ ...prev, [catKey]: null }));
      return;
    }

    // Return cached if not forced
    if (!force && categorySongs[catKey].length > 0) {
      return;
    }

    setLoadingMap((prev) => ({ ...prev, [catKey]: true }));
    setErrorMap((prev) => ({ ...prev, [catKey]: null }));

    try {
      const tracks = await SupabaseService.fetchSongsForCategory(catKey);
      setCategorySongs((prev) => ({ ...prev, [catKey]: tracks }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to connect to Supabase catalog.';
      setErrorMap((prev) => ({ ...prev, [catKey]: msg }));

      // Run diagnostic on failure to populate detailed status
      try {
        const diag = await SupabaseService.testCategoryConnection(catKey);
        setStatusMap((prev) => ({ ...prev, [catKey]: diag }));
      } catch {
        // ignore
      }
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

  // Safe download handler
  const handleDownload = async (cs: CloudSong) => {
    if (isSongDownloaded(cs)) return;
    if (downloadProgress.has(cs.id)) return; // Already downloading

    // Clear previous error if any
    setDownloadErrors((prev) => {
      const next = new Map(prev);
      next.delete(cs.id);
      return next;
    });

    // Set initial progress
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
      const errorMsg = err instanceof Error ? err.message : 'Download failed';
      setDownloadErrors((prev) => new Map(prev).set(cs.id, errorMsg));
      setDownloadProgress((prev) => {
        const next = new Map(prev);
        next.delete(cs.id);
        return next;
      });
    }
  };

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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300 shadow-lg shadow-cyan-500/10 shrink-0">
                <Cloud className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-black text-white tracking-wide">
                    Cloud Discovery
                  </h1>
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-500/40 text-cyan-300">
                    3 Vaults
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Stream & download curated music directly into your offline library
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={checkAllConnections}
                disabled={isCheckingStatus}
                className="px-3.5 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-white/10 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-2 transition cursor-pointer disabled:opacity-50 shadow-sm"
                title="Test all Supabase vault connections"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isCheckingStatus ? 'animate-spin' : ''}`} />
                <span>{isCheckingStatus ? 'Checking...' : 'Check Vaults'}</span>
              </button>
            </div>
          </div>

          {/* Three Music Category Cards — Image-based, Full-bleed, Zero decorative moon/heart icons */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
            {CLOUD_CATEGORIES.map((category) => {
              const config = SupabaseService.getCategoryConfig(category.key);
              const isConfigured = config.isConfigured;
              const diag = statusMap[category.key];
              const count = categorySongs[category.key]?.length || 0;

              return (
                <div
                  key={category.key}
                  onClick={() => handleOpenCategory(category.key)}
                  className={`group relative rounded-3xl overflow-hidden border ${category.borderColor} shadow-2xl ${category.glowColor} transition-all duration-300 hover:-translate-y-1.5 cursor-pointer flex flex-col justify-between min-h-[300px] sm:min-h-[320px]`}
                >
                  {/* Full-bleed Background Image with Zoom on Hover */}
                  <div className="absolute inset-0 w-full h-full bg-slate-950">
                    <img
                      src={category.imagePath}
                      alt={category.title}
                      className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                      loading="lazy"
                      onError={(e) => {
                        // Tasteful fallback if image is unavailable
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  </div>

                  {/* High-Contrast Multi-stop Dark Gradients for Crystal Clear Legibility */}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-slate-950/30" />
                  <div className={`absolute inset-0 bg-gradient-to-br ${category.accentBg} opacity-50 mix-blend-overlay`} />

                  {/* Card Content Top: Badge and Status */}
                  <div className="relative z-10 p-5 sm:p-6 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border shadow-sm ${getBadgeStyle(category.key)}`}>
                        {category.badge}
                      </span>

                      {/* Connection Status Pill */}
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[11px] font-medium text-slate-300">
                        <span
                          className={`w-2 h-2 rounded-full ${isCheckingStatus ? 'animate-pulse' : ''}`}
                          style={{
                            backgroundColor: !isConfigured
                              ? '#94a3b8' // slate / setup required
                              : isCheckingStatus
                              ? '#38bdf8' // checking
                              : diag?.status === 'connected'
                              ? '#10b981' // live emerald
                              : diag?.status === 'partial'
                              ? '#f59e0b' // partial
                              : diag?.status === 'error'
                              ? '#f43f5e' // error rose
                              : category.themeColor,
                          }}
                        />
                        <span className="truncate max-w-[120px]">
                          {!isConfigured
                            ? 'Setup Required'
                            : isCheckingStatus
                            ? 'Checking...'
                            : diag?.status === 'connected'
                            ? 'Live'
                            : diag?.status === 'partial'
                            ? 'Schema Needed'
                            : diag?.status === 'error'
                            ? 'Offline'
                            : 'Connected'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card Content Bottom: Title, Subtitle, Description, CTA */}
                  <div className="relative z-10 p-5 sm:p-6 pt-0 space-y-3">
                    <div className="space-y-1">
                      <h2 className="text-2xl font-black text-white tracking-wider drop-shadow-md">
                        {category.title}
                      </h2>
                      <p
                        className="text-xs font-bold tracking-wide"
                        style={{ color: category.themeColor }}
                      >
                        {category.subtitle}
                      </p>
                    </div>

                    <p className="text-xs text-slate-300/90 leading-relaxed line-clamp-2">
                      {category.description}
                    </p>

                    {/* Metadata and Explore CTA */}
                    <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                      <div className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                        {isConfigured ? (
                          <span>
                            {count > 0 ? `${count} tracks available` : 'Ready to explore'}
                          </span>
                        ) : (
                          <span className="text-slate-400">Vault setup required</span>
                        )}
                      </div>

                      <div
                        className="px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm group-hover:brightness-110"
                        style={{
                          backgroundColor: `${category.themeColor}25`,
                          color: category.themeColor,
                          border: `1px solid ${category.themeColor}50`,
                        }}
                      >
                        <span>Explore</span>
                        <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Safety & Persistence Information Banner */}
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/5 flex items-start sm:items-center gap-3.5 text-slate-400 text-xs">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5 sm:mt-0" />
            <div className="space-y-0.5 leading-relaxed">
              <span className="text-slate-200 font-semibold">100% Offline Persistence: </span>
              <span>
                Downloaded songs are stored directly into your device's persistent offline storage.
                They will always remain playable offline even without internet and after the app restarts.
              </span>
            </div>
          </div>
        </div>
      ) : (
        /* =========================================================================
            VIEW 2: CATEGORY MUSIC LIST WITH MATCHING CINEMATIC BANNER IMAGE
           ========================================================================= */
        <div className="space-y-5 animate-in fade-in">
          {/* Back Navigation Bar */}
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={handleBackToHome}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold transition cursor-pointer border border-white/10 shadow-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Vaults</span>
            </button>

            <div className="flex items-center gap-2">
              <button
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
          </div>

          {/* Cinematic Category Banner Image — Full-bleed Matching Background */}
          {activeCategoryMeta && (
            <div
              className={`rounded-3xl overflow-hidden relative border ${activeCategoryMeta.borderColor} shadow-2xl min-h-[180px] sm:min-h-[210px] flex flex-col justify-end p-6 sm:p-7`}
            >
              {/* Full-bleed Background Image */}
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

              {/* Multi-stop dark gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-slate-950/25" />
              <div className={`absolute inset-0 bg-gradient-to-r ${activeCategoryMeta.accentBg} opacity-60 mix-blend-overlay`} />

              {/* Banner Details */}
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
                        ? 'Live Vault'
                        : 'Setup Required'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Search bar inside category */}
          <div className="relative">
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
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs px-1.5 py-0.5 rounded cursor-pointer"
              >
                Clear
              </button>
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
            /* Rich Diagnostic Error State — No Manual Credential Form */
            <div className="p-6 rounded-3xl bg-rose-500/10 border border-rose-500/30 space-y-4 max-w-xl mx-auto">
              <div className="flex items-center justify-between border-b border-rose-500/20 pb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-rose-500/20 text-rose-300 flex items-center justify-center shrink-0">
                    <AlertCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Connection Failure</h3>
                    <p className="text-[11px] text-slate-400 font-mono">
                      Host: {getMaskedHost(SupabaseService.getCategoryConfig(selectedCategory).url)}
                    </p>
                  </div>
                </div>

                {statusMap[selectedCategory]?.errorType && (
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider bg-rose-500/20 border border-rose-500/40 text-rose-300">
                    {statusMap[selectedCategory]?.errorType}
                  </span>
                )}
              </div>

              <div className="space-y-1.5">
                <p className="text-xs text-rose-200/90 leading-relaxed font-medium">
                  {errorMap[selectedCategory]}
                </p>
              </div>

              {/* Status Breakdown if diagnostic available */}
              {statusMap[selectedCategory] && (
                <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                  <div className="bg-black/30 p-2.5 rounded-xl border border-white/5">
                    <span className="text-slate-400 block text-[10px]">Database:</span>
                    <span className="font-semibold text-slate-200">
                      {statusMap[selectedCategory]?.databaseStatus === 'ready'
                        ? '✓ Ready'
                        : statusMap[selectedCategory]?.databaseStatus === 'missing_table'
                        ? '✗ Missing Table'
                        : statusMap[selectedCategory]?.databaseStatus === 'permission_denied'
                        ? '✗ RLS Denied'
                        : '✗ Failed'}
                    </span>
                  </div>

                  <div className="bg-black/30 p-2.5 rounded-xl border border-white/5">
                    <span className="text-slate-400 block text-[10px]">Storage Bucket:</span>
                    <span className="font-semibold text-slate-200">
                      {statusMap[selectedCategory]?.storageStatus === 'ready'
                        ? '✓ Ready'
                        : statusMap[selectedCategory]?.storageStatus === 'missing_bucket'
                        ? '✗ Bucket Missing'
                        : statusMap[selectedCategory]?.storageStatus === 'permission_denied'
                        ? '✗ Access Denied'
                        : '✗ Failed'}
                    </span>
                  </div>
                </div>
              )}

              {/* Actionable Tip */}
              {statusMap[selectedCategory]?.suggestion && (
                <div className="p-3 rounded-2xl bg-black/40 border border-white/5 text-[11px] text-slate-300 flex items-start gap-2">
                  <span className="font-bold text-cyan-400 shrink-0">Tip:</span>
                  <span>{statusMap[selectedCategory]?.suggestion}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-rose-500/20">
                <button
                  onClick={() => loadCategorySongs(selectedCategory, true)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition cursor-pointer"
                >
                  Retry Connection
                </button>
              </div>
            </div>
          ) : !SupabaseService.getCategoryConfig(selectedCategory).isConfigured ? (
            /* Unconfigured State (e.g. LOVE & CHILL) — Informative CI/CD Setup Notice */
            <div className="p-8 rounded-3xl bg-slate-900/70 border border-white/10 text-center space-y-4 max-w-lg mx-auto">
              <div
                className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center border shadow-lg"
                style={{
                  backgroundColor: `${activeCategoryMeta?.themeColor}20`,
                  borderColor: `${activeCategoryMeta?.themeColor}40`,
                  color: activeCategoryMeta?.themeColor,
                }}
              >
                <Database className="w-7 h-7" />
              </div>
              <div className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300">
                  Setup Required
                </span>
                <h3 className="text-base font-bold text-white">
                  {activeCategoryMeta?.title} Vault Configuration
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed max-w-md mx-auto">
                  This category is configured through GitHub Actions repository variables and secrets.
                  To activate music streaming and downloads for {activeCategoryMeta?.title}, add the following variables in your GitHub Repository Settings:
                </p>
                <div className="p-3 rounded-2xl bg-black/50 border border-white/5 text-left text-[11px] font-mono text-slate-300 space-y-1">
                  <div><span className="text-cyan-400">URL:</span> VITE_SUPABASE_{activeCategoryMeta?.key.toUpperCase()}_URL</div>
                  <div><span className="text-cyan-400">KEY:</span> VITE_SUPABASE_{activeCategoryMeta?.key.toUpperCase()}_ANON_KEY</div>
                </div>
                <p className="text-[11px] text-slate-400">
                  Once set, the next GitHub Actions build will automatically connect this vault.
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
                          onClick={() => onPlayCloudSong(song)}
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
                            onClick={() => onPlayCloudSong(song)}
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

                        {/* Unboxed metadata with typographic separators */}
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
                          {song.file_size > 0 && (
                            <>
                              <span aria-hidden="true" className="text-slate-600">·</span>
                              <span>{formatBytes(song.file_size)}</span>
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
                        onClick={() => onPlayCloudSong(song)}
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
                          onClick={() => handleDownload(song)}
                          className="px-3.5 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Retry</span>
                        </button>
                      ) : (
                        <button
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
    </div>
  );
};
