import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import {
  ArrowLeft, Search, RefreshCw, Play, Pause, Download, CheckCircle2,
  ExternalLink, Music, AlertCircle, X, Loader2,
  Wifi, Filter, ChevronRight, Layers, AlertTriangle
} from 'lucide-react';
import { Network } from '@capacitor/network';
import { Song } from '../types/music';
import {
  ArchiveOrgService,
  ArchiveItemDoc,
  ArchiveItemDetail,
  ArchiveAudioFile,
  ArchiveSortOption,
  archiveSessionState,
  formatArchiveLicense,
  formatArchiveCreator,
  formatArchiveBytes,
  formatArchiveDuration,
  cleanTrackTitle
} from '../services/archiveOrg';
import { CLOUD_CATALOGS } from '../config/cloudCatalogs';
import { 
  saveScrollPosition, 
  getSavedScrollPosition, 
  restoreScroll, 
  registerBackHandler 
} from '../services/navigation';
import { PersistentSettingsService } from '../services/persistentSettings';

interface ArchiveNasheedCatalogViewProps {
  offlineSongs: Song[];
  isPlaying: boolean;
  onPlaySong: (song: Song, contextQueue?: Song[]) => void;
  onPauseMainPlayer: () => void;
  onSaveDownloadedSong: (song: Song, blob: Blob) => Promise<void>;
  onBack: () => void;
  downloadOnWifiOnly?: boolean;
}

const TOPIC_CHIPS = [
  { id: 'all', label: 'All' },
  { id: 'nasheed', label: 'Nasheed' },
  { id: 'anasheed', label: 'Anasheed' },
  { id: 'nashid', label: 'Nashid' },
  { id: 'arabic', label: 'Arabic (نشيد)' },
  { id: 'ilahi', label: 'Ilahi' },
  { id: 'islamic', label: 'Islamic' },
];

/**
 * Reusable generated cover for Archive.org items:
 * Dark navy square with subtle cyan/purple glow and title initials or music icon.
 */
export const ArchiveGeneratedCover: React.FC<{
  title: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}> = ({ title, className = '', size = 'md' }) => {
  const initials = useMemo(() => {
    if (!title) return '';
    const words = title
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .trim()
      .split(/\s+/);
    if (!words.length || !words[0]) return '';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  }, [title]);

  const sizeClasses = {
    sm: 'w-10 h-10 rounded-xl text-xs',
    md: 'w-14 h-14 rounded-2xl text-sm',
    lg: 'w-16 h-16 rounded-2xl text-base',
  }[size];

  return (
    <div
      className={`relative shrink-0 flex items-center justify-center font-black tracking-wider border border-cyan-500/30 shadow-md shadow-cyan-950/40 select-none overflow-hidden bg-gradient-to-br from-[#16234b] via-[#0d1430] to-[#20103a] text-cyan-300 ${sizeClasses} ${className}`}
    >
      <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/10 via-transparent to-purple-500/15 pointer-events-none" />
      {initials ? (
        <span className="relative z-10 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
          {initials}
        </span>
      ) : (
        <Music className="w-5 h-5 text-cyan-400/80 relative z-10" />
      )}
    </div>
  );
};

export const ArchiveNasheedCatalogView: React.FC<ArchiveNasheedCatalogViewProps> = ({
  offlineSongs,
  isPlaying: isMainPlayerPlaying,
  onPlaySong,
  onPauseMainPlayer,
  onSaveDownloadedSong,
  onBack,
  downloadOnWifiOnly = false,
}) => {
  // Query & Filter States initialized from session memory
  const [searchQuery, setSearchQuery] = useState(archiveSessionState.searchQuery);
  const [debouncedSearch, setDebouncedSearch] = useState(archiveSessionState.searchQuery);
  const [activeChip, setActiveChip] = useState(archiveSessionState.activeChip);
  const [sort, setSort] = useState<ArchiveSortOption>(() => {
    const s = PersistentSettingsService.getSortViewSettingsSync();
    if (s.archiveSort) return s.archiveSort as ArchiveSortOption;
    return archiveSessionState.sort;
  });
  const [ccOnly, setCcOnly] = useState(false);

  // Sync state back into in-memory session object and persistent storage
  useEffect(() => {
    archiveSessionState.searchQuery = searchQuery;
  }, [searchQuery]);

  useEffect(() => {
    archiveSessionState.activeChip = activeChip;
  }, [activeChip]);

  useEffect(() => {
    archiveSessionState.sort = sort;
    PersistentSettingsService.saveSortViewSettings({ archiveSort: sort });
  }, [sort]);

  // Results & Paging initialized from session memory
  const [items, setItems] = useState<ArchiveItemDoc[]>(archiveSessionState.items);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [page, setPage] = useState(archiveSessionState.page);
  const [hasMore, setHasMore] = useState(archiveSessionState.hasMore);
  const [totalFound, setTotalFound] = useState(archiveSessionState.totalFound);

  // Item details cache: identifier -> ArchiveItemDetail
  const [itemDetailsMap, setItemDetailsMap] = useState<Map<string, ArchiveItemDetail>>(new Map());
  const [loadingDetailsId, setLoadingDetailsId] = useState<string | null>(null);

  // Selected item modal for multi-file albums/collections
  const [activeDetailItem, setActiveDetailItem] = useState<ArchiveItemDetail | null>(
    archiveSessionState.activeDetailItem
  );

  // Sync state back into in-memory session object
  useEffect(() => { archiveSessionState.items = items; }, [items]);
  useEffect(() => { archiveSessionState.page = page; }, [page]);
  useEffect(() => { archiveSessionState.hasMore = hasMore; }, [hasMore]);
  useEffect(() => { archiveSessionState.totalFound = totalFound; }, [totalFound]);
  useEffect(() => { archiveSessionState.activeDetailItem = activeDetailItem; }, [activeDetailItem]);

  // Restore scroll position on mount if saved
  useLayoutEffect(() => {
    if (!archiveSessionState.activeDetailItem) {
      const main = document.querySelector('main');
      const saved = getSavedScrollPosition('cloud:archive:list');
      if (saved > 0) {
        restoreScroll(main, saved);
      }
    }
  }, []);

  // In-card Preview HTML Audio Player (plain HTML audio, zero Web Audio, zero visualizer canvas)
  const [previewTrack, setPreviewTrack] = useState<{
    item: ArchiveItemDoc | ArchiveItemDetail;
    file: ArchiveAudioFile;
  } | null>(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [previewCurrentTime, setPreviewCurrentTime] = useState(0);
  const [previewDuration, setPreviewDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null);

  // Download state maps (key: identifier + file.name)
  const [downloadProgress, setDownloadProgress] = useState<Map<string, number>>(new Map());
  const [justDownloaded, setJustDownloaded] = useState<Set<string>>(new Set());

  // Confirmations
  const [sizeConfirmData, setSizeConfirmData] = useState<{
    item: ArchiveItemDetail;
    file: ArchiveAudioFile;
  } | null>(null);
  const [sizeExceededMessage, setSizeExceededMessage] = useState<string | null>(null);

  // Mobile data prompt
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
    (itemIdentifier: string, fileName?: string): Song | undefined => {
      if (fileName) {
        const expectedId = `archive_${itemIdentifier}_${fileName.replace(/[^a-zA-Z0-9_]/g, '_')}`;
        if (offlineMap.has(expectedId)) return offlineMap.get(expectedId);
      }
      // Check partial match
      for (const [key, song] of offlineMap.entries()) {
        if (key.includes(itemIdentifier)) return song;
      }
      return undefined;
    },
    [offlineMap]
  );

  const isDownloaded = useCallback(
    (itemIdentifier: string, fileName?: string): boolean => {
      const fileKey = fileName ? `${itemIdentifier}::${fileName}` : itemIdentifier;
      if (justDownloaded.has(fileKey)) return true;
      return Boolean(getDownloadedSong(itemIdentifier, fileName));
    },
    [justDownloaded, getDownloadedSong]
  );

  // Saved scroll position for restoring when going back from item detail
  const savedScrollPositionRef = useRef<number>(0);
  const isInitialMountRef = useRef<boolean>(true);

  // Fetch search items
  const loadSearch = useCallback(
    async (resetPaging = false, forceRefresh = false) => {
      const nextPage = resetPaging ? 1 : page;
      if (resetPaging) {
        setIsLoading(true);
        setErrorMessage(null);
        setBannerError(null);
      } else {
        setIsLoadingMore(true);
        setBannerError(null);
      }

      try {
        const res = await ArchiveOrgService.searchItems({
          searchTerm: debouncedSearch,
          chip: activeChip,
          ccOnly,
          sort,
          page: nextPage,
          forceRefresh,
        });

        setTotalFound(res.numFound);

        if (resetPaging) {
          setItems(res.docs);
          setPage(2);
          setHasMore(res.docs.length >= 25 && res.docs.length < res.numFound && 25 < 10000);
        } else {
          setItems((prev) => {
            const seen = new Set(prev.map((d) => d.identifier));
            const newDocs = res.docs.filter((d) => !seen.has(d.identifier));
            return [...prev, ...newDocs];
          });
          const newStart = res.start + res.docs.length;
          setPage(nextPage + 1);
          setHasMore(res.docs.length >= 25 && newStart < res.numFound && newStart < 10000);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Can't load Internet Archive right now.";
        if (resetPaging) {
          setErrorMessage(msg);
        } else {
          setBannerError(msg);
        }
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [debouncedSearch, activeChip, ccOnly, sort, page]
  );

  // Reload when search, chip, ccOnly or sort changes
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      if (archiveSessionState.items.length > 0) {
        return;
      }
    }
    loadSearch(true);
  }, [debouncedSearch, activeChip, ccOnly, sort]);

  // Infinite scroll trigger
  useEffect(() => {
    if (!observerTargetRef.current || !hasMore || isLoading || isLoadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading && !isLoadingMore) {
          loadSearch(false);
        }
      },
      { root: null, rootMargin: '300px', threshold: 0.1 }
    );

    observer.observe(observerTargetRef.current);
    return () => observer.disconnect();
  }, [hasMore, isLoading, isLoadingMore, loadSearch]);

  // When main player starts, pause preview
  useEffect(() => {
    if (isMainPlayerPlaying && isPreviewPlaying) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setIsPreviewPlaying(false);
    }
  }, [isMainPlayerPlaying, isPreviewPlaying]);

  // Toggle preview
  const handleTogglePreview = async (
    item: ArchiveItemDoc | ArchiveItemDetail,
    file: ArchiveAudioFile
  ) => {
    const isCurrent = previewTrack?.file.downloadUrl === file.downloadUrl;

    if (isCurrent && isPreviewPlaying) {
      if (audioRef.current) audioRef.current.pause();
      setIsPreviewPlaying(false);
      return;
    }

    onPauseMainPlayer();

    if (!audioRef.current) {
      audioRef.current = new Audio();
    }

    const audio = audioRef.current;

    if (!isCurrent) {
      audio.pause();
      audio.src = file.downloadUrl;
      audio.load();
      setPreviewTrack({ item, file });
      setPreviewCurrentTime(0);
      setPreviewDuration(file.length || 0);
    }

    audio.ontimeupdate = () => {
      setPreviewCurrentTime(audio.currentTime);
      if (audio.duration && !isNaN(audio.duration) && audio.duration !== Infinity) {
        setPreviewDuration(audio.duration);
      }
    };

    audio.onended = () => {
      setIsPreviewPlaying(false);
      setPreviewCurrentTime(0);
    };

    audio.onerror = () => {
      setIsPreviewPlaying(false);
      setBannerError("Couldn't stream this audio track. Check your connection.");
    };

    try {
      await audio.play();
      setIsPreviewPlaying(true);
    } catch {
      setIsPreviewPlaying(false);
    }
  };

  const stopPreview = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPreviewPlaying(false);
    setPreviewTrack(null);
  };

  // Seek preview
  const handleSeekPreview = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !previewDuration || !progressBarRef.current) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const targetFraction = clickX / rect.width;
    const targetTime = targetFraction * previewDuration;
    audioRef.current.currentTime = targetTime;
    setPreviewCurrentTime(targetTime);
  };

  // Open item detail (saves current scroll position and loads files)
  const handleOpenItem = async (doc: ArchiveItemDoc) => {
    const main = document.querySelector('main');
    if (main) {
      saveScrollPosition('cloud:archive:list', main.scrollTop);
      savedScrollPositionRef.current = main.scrollTop;
    }

    if (itemDetailsMap.has(doc.identifier)) {
      setActiveDetailItem(itemDetailsMap.get(doc.identifier)!);
      return;
    }

    setLoadingDetailsId(doc.identifier);
    try {
      const detail = await ArchiveOrgService.getItemDetails(doc.identifier);
      setItemDetailsMap((prev) => new Map(prev).set(doc.identifier, detail));
      setActiveDetailItem(detail);
    } catch (err: unknown) {
      setBannerError(err instanceof Error ? err.message : "Couldn't load item files.");
    } finally {
      setLoadingDetailsId(null);
    }
  };

  // Close item detail and restore the previous scroll position of the list
  const handleCloseDetail = () => {
    stopPreview();
    setActiveDetailItem(null);
    const main = document.querySelector('main');
    const saved = getSavedScrollPosition('cloud:archive:list') || savedScrollPositionRef.current;
    if (main && saved > 0) {
      restoreScroll(main, saved);
    }
  };

  const handleBackToCatalogs = () => {
    stopPreview();
    const main = document.querySelector('main');
    if (main) {
      saveScrollPosition('cloud:archive:list', main.scrollTop);
    }
    onBack();
  };

  // Register back handler
  useEffect(() => {
    if (activeDetailItem) {
      return registerBackHandler(() => {
        handleCloseDetail();
        return true;
      }, 60);
    }
    return registerBackHandler(() => {
      handleBackToCatalogs();
      return true;
    }, 40);
  }, [activeDetailItem, onBack]);

  // Execute download with safety checks
  const performDownload = async (item: ArchiveItemDetail, file: ArchiveAudioFile) => {
    // 150 MB hard limit check
    if (file.size > 150 * 1024 * 1024) {
      setSizeExceededMessage(
        `"${file.title}" is ${formatArchiveBytes(file.size)}. Files over 150 MB cannot be stored offline.`
      );
      return;
    }

    // 40 MB confirmation check
    if (file.size > 40 * 1024 * 1024) {
      setSizeConfirmData({ item, file });
      return;
    }

    await startDownloadProcess(item, file);
  };

  const startDownloadProcess = async (item: ArchiveItemDetail, file: ArchiveAudioFile) => {
    const fileKey = `${item.identifier}::${file.name}`;
    setDownloadProgress((prev) => new Map(prev).set(fileKey, 10));

    try {
      const { song, blob } = await ArchiveOrgService.downloadFileBlob(item, file, (pct) => {
        setDownloadProgress((prev) => new Map(prev).set(fileKey, pct));
      });

      await onSaveDownloadedSong(song, blob);
      setJustDownloaded((prev) => new Set(prev).add(fileKey).add(item.identifier));
      setDownloadProgress((prev) => {
        const next = new Map(prev);
        next.delete(fileKey);
        return next;
      });
    } catch (err: unknown) {
      setDownloadProgress((prev) => {
        const next = new Map(prev);
        next.delete(fileKey);
        return next;
      });
      setBannerError(err instanceof Error ? err.message : 'Download failed. Check your internet.');
    }
  };

  // Wrapper with Wi-Fi check
  const handleDownloadClick = async (item: ArchiveItemDetail, file: ArchiveAudioFile) => {
    if (downloadOnWifiOnly) {
      try {
        const status = await Network.getStatus();
        if (status.connected && status.connectionType === 'cellular') {
          pendingDownloadRef.current = () => performDownload(item, file);
          setShowMobilePrompt(true);
          return;
        }
      } catch {
        // Fall through
      }
    }
    performDownload(item, file);
  };

  // Direct download for single-file or list view
  const handleDirectDownloadDoc = async (doc: ArchiveItemDoc) => {
    let detail = itemDetailsMap.get(doc.identifier);
    if (!detail) {
      setLoadingDetailsId(doc.identifier);
      try {
        detail = await ArchiveOrgService.getItemDetails(doc.identifier);
        setItemDetailsMap((prev) => new Map(prev).set(doc.identifier, detail));
      } catch {
        setBannerError("Couldn't fetch file details for download.");
        setLoadingDetailsId(null);
        return;
      } finally {
        setLoadingDetailsId(null);
      }
    }

    if (!detail.audioFiles || detail.audioFiles.length === 0) {
      setBannerError('No downloadable audio files found in this item.');
      return;
    }

    if (detail.audioFiles.length === 1) {
      handleDownloadClick(detail, detail.audioFiles[0]);
    } else {
      setActiveDetailItem(detail);
    }
  };

  // Direct preview for single file or first track
  const handleDirectPreviewDoc = async (doc: ArchiveItemDoc) => {
    let detail = itemDetailsMap.get(doc.identifier);
    if (!detail) {
      setLoadingDetailsId(doc.identifier);
      try {
        detail = await ArchiveOrgService.getItemDetails(doc.identifier);
        setItemDetailsMap((prev) => new Map(prev).set(doc.identifier, detail));
      } catch {
        setBannerError("Couldn't stream this audio track.");
        setLoadingDetailsId(null);
        return;
      } finally {
        setLoadingDetailsId(null);
      }
    }

    if (!detail.audioFiles || detail.audioFiles.length === 0) {
      setBannerError('No audio files found in this item.');
      return;
    }

    handleTogglePreview(detail, detail.audioFiles[0]);
  };

  return (
    <div className="space-y-5 pb-36 px-4 pt-2 max-w-4xl mx-auto animate-in fade-in select-none">
      {/* Top Header Bar with Back Button */}
      <div className="flex items-center justify-between gap-3 pb-2 border-b border-white/10">
        <button
          type="button"
          onClick={handleBackToCatalogs}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-white/10 text-cyan-300 font-semibold text-xs active:scale-95 transition cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Catalogs</span>
        </button>

        <button
          type="button"
          onClick={() => loadSearch(true, true)}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-white/10 text-slate-300 hover:text-white font-semibold text-xs active:scale-95 transition cursor-pointer disabled:opacity-50"
          title="Refresh results"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {/* Hero Banner (Same dark navy, cyan and purple gradient style as Jamendo) */}
      <div className="relative overflow-hidden rounded-3xl border border-cyan-500/30 min-h-[140px] sm:min-h-[160px] flex flex-col justify-end p-5 sm:p-6 shadow-2xl bg-[#0a0f24]">
        {/* Background artwork */}
        <div className="absolute inset-0 w-full h-full bg-[#0a0f24]">
          <img
            src={CLOUD_CATALOGS.find((c) => c.key === 'archive_nasheed')?.image || './images/cards/archive_nasheed.webp'}
            alt="Archive Nasheeds"
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
        </div>
        {/* Dark navy gradient overlay (55% to 70% dark) */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/70 to-slate-950/55" />
        <div className="absolute inset-0 bg-gradient-to-r from-purple-950/60 via-cyan-950/40 to-slate-950/80 mix-blend-overlay" />

        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-[10px] font-bold uppercase tracking-wider">
              <span>Internet Archive • Free & Open Audio</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Archive <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400">Nasheeds</span>
            </h2>
            <p className="text-xs text-slate-300 max-w-lg leading-relaxed">
              Explore thousands of historical and modern nasheeds preserved on archive.org. Stream previews instantly or download for 100% offline playback.
            </p>
          </div>

          <a
            href="https://archive.org/details/audio"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-cyan-500/30 text-cyan-300 text-xs font-bold transition shrink-0 active:scale-95"
          >
            <span>Visit Archive.org</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Search Bar & Filters */}
      <div className="space-y-3">
        {/* Search Input Box */}
        <div className="relative">
          <Search className="w-4 h-4 text-cyan-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search nasheeds, vocalists, or topics (e.g. Alafasi, Maher Zain, نشيد)..."
            className="w-full pl-10 pr-10 py-3 rounded-2xl bg-slate-900/80 border border-white/10 focus:border-cyan-400 focus:outline-none text-white text-xs sm:text-sm placeholder:text-slate-500 transition shadow-inner"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Chips & Sort Options */}
        <div className="flex flex-col gap-2.5">
          {/* Horizontally scrollable topic chips */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
            {TOPIC_CHIPS.map((chip) => {
              const isSelected = activeChip === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setActiveChip(chip.id)}
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

          {/* Sort selector and CC toggle */}
          <div className="flex items-center justify-between gap-2 pt-0.5 flex-wrap">
            {/* Sort Toggle */}
            <div className="flex items-center p-0.5 rounded-xl bg-slate-900/80 border border-white/10 text-xs">
              <button
                type="button"
                onClick={() => setSort('downloads desc')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  sort === 'downloads desc'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Most downloaded
              </button>
              <button
                type="button"
                onClick={() => setSort('publicdate desc')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  sort === 'publicdate desc'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Newest
              </button>
            </div>

            {/* CC and Public Domain Only toggle chip */}
            <button
              type="button"
              onClick={() => setCcOnly((prev) => !prev)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border shrink-0 ${
                ccOnly
                  ? 'bg-gradient-to-r from-cyan-500/20 to-purple-500/20 text-cyan-300 border-cyan-400 shadow-sm'
                  : 'bg-slate-900/60 text-slate-400 border-white/10 hover:text-slate-200 hover:border-white/20'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>CC & Public Domain only</span>
            </button>
          </div>
        </div>
      </div>

      {/* Results Count Banner */}
      {!isLoading && items.length > 0 && (
        <div className="flex items-center justify-between text-xs text-slate-400 px-1">
          <span>
            Found <strong className="text-cyan-300">{totalFound > 0 ? totalFound.toLocaleString() : items.length}</strong> nasheed collections
          </span>
          {ccOnly && <span className="text-emerald-400 font-medium">✓ CC / Public Domain Filter Active</span>}
        </div>
      )}

      {/* Banner Error Notification */}
      {bannerError && (
        <div className="p-3 rounded-2xl bg-rose-950/70 border border-rose-500/30 text-xs text-rose-200 flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{bannerError}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerError(null)}
            className="p-1 text-rose-300 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Full Error Notice (When zero items loaded) */}
      {errorMessage && items.length === 0 && (
        <div className="p-8 rounded-3xl bg-slate-900/60 border border-rose-500/30 text-center space-y-3 py-12">
          <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
          <h3 className="text-sm font-bold text-white">{errorMessage}</h3>
          <button
            type="button"
            onClick={() => loadSearch(true, true)}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-bold text-xs shadow-lg active:scale-95 transition cursor-pointer"
          >
            Retry Search
          </button>
        </div>
      )}

      {/* Skeletons while initial loading */}
      {isLoading && (
        <div className="space-y-3 pt-1">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div
              key={n}
              className="p-3.5 rounded-2xl bg-slate-900/40 border border-white/5 flex items-center gap-3 animate-pulse"
            >
              <div className="w-16 h-16 rounded-2xl bg-slate-800 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="w-3/4 h-3.5 bg-slate-800 rounded" />
                <div className="w-1/2 h-2.5 bg-slate-800 rounded" />
                <div className="w-1/4 h-2 bg-slate-800 rounded" />
              </div>
              <div className="w-16 h-8 bg-slate-800 rounded-xl" />
            </div>
          ))}
        </div>
      )}

      {/* Items List */}
      {!isLoading && items.length > 0 && (
        <div className="space-y-2">
          {items.map((doc) => {
            const licenseText = formatArchiveLicense(doc.licenseurl);
            const creatorText = formatArchiveCreator(doc.creator);
            const cachedDetail = itemDetailsMap.get(doc.identifier);
            const audioCount = cachedDetail?.audioFiles?.length;
            const isItemDownloaded = isDownloaded(doc.identifier);
            const isSingleFile = audioCount === 1;
            const singleAudioFile = isSingleFile ? cachedDetail?.audioFiles[0] : null;
            const isFilePreviewing =
              singleAudioFile && previewTrack?.file.downloadUrl === singleAudioFile.downloadUrl && isPreviewPlaying;
            const isDetailLoading = loadingDetailsId === doc.identifier;

            return (
              <div
                key={doc.identifier}
                className="group relative p-2.5 sm:p-3 rounded-2xl bg-slate-900/60 hover:bg-slate-900 border border-white/5 hover:border-cyan-500/30 transition-all duration-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 cursor-pointer shadow-sm"
                onClick={() => handleOpenItem(doc)}
              >
                {/* Left: Cover & Title/Creator */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {/* Generated Cover ALWAYS in results list */}
                  <ArchiveGeneratedCover title={doc.title} size="md" />

                  {/* Info */}
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <h3
                      dir="auto"
                      className="text-xs sm:text-sm font-bold text-white line-clamp-2 group-hover:text-cyan-300 transition text-start leading-snug"
                    >
                      {doc.title}
                    </h3>

                    <p
                      dir="auto"
                      className="text-[11px] text-slate-400 truncate text-start"
                    >
                      {creatorText}
                    </p>

                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {/* Small muted license label that never wraps */}
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-white/5 whitespace-nowrap">
                        {licenseText}
                      </span>

                      {/* Tracks count if known */}
                      {audioCount !== undefined && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 whitespace-nowrap">
                          {audioCount} {audioCount === 1 ? 'track' : 'tracks'}
                        </span>
                      )}

                      {/* Downloaded indicator */}
                      {isItemDownloaded && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 whitespace-nowrap">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Offline</span>
                        </span>
                      )}

                      {/* External Archive link */}
                      <a
                        href={`https://archive.org/details/${doc.identifier}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-[10px] text-slate-500 hover:text-cyan-400 flex items-center gap-0.5 ml-1 transition"
                        title="View on archive.org"
                      >
                        <ExternalLink className="w-2.5 h-2.5" />
                        <span>Archive</span>
                      </a>
                    </div>
                  </div>
                </div>

                {/* Right: Action Buttons */}
                <div
                  className="flex items-center gap-2 self-end sm:self-center shrink-0 pt-0.5 sm:pt-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  {isDetailLoading ? (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 text-cyan-300 text-xs font-semibold">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Loading...</span>
                    </div>
                  ) : isSingleFile && singleAudioFile ? (
                    <>
                      {/* Direct Preview */}
                      <button
                        type="button"
                        onClick={() => handleTogglePreview(doc, singleAudioFile)}
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition active:scale-95 cursor-pointer border ${
                          isFilePreviewing
                            ? 'bg-cyan-400 text-slate-950 border-cyan-300 shadow-md shadow-cyan-500/30'
                            : 'bg-slate-800 hover:bg-slate-700 text-cyan-300 border-white/10'
                        }`}
                        title="Preview audio"
                      >
                        {isFilePreviewing ? (
                          <Pause className="w-3.5 h-3.5 fill-current" />
                        ) : (
                          <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                        )}
                      </button>

                      {/* Direct Download */}
                      <button
                        type="button"
                        onClick={() => handleDirectDownloadDoc(doc)}
                        className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-bold text-xs shadow-md shadow-cyan-500/20 active:scale-95 transition flex items-center gap-1.5 cursor-pointer"
                        title="Download track for offline playback"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download</span>
                      </button>
                    </>
                  ) : (
                    /* Multi-track item button - compact */
                    <button
                      type="button"
                      onClick={() => handleOpenItem(doc)}
                      className="px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-white/10 text-cyan-300 hover:text-white font-semibold text-xs transition flex items-center gap-1 cursor-pointer active:scale-95 shadow-sm"
                    >
                      <Layers className="w-3.5 h-3.5 text-cyan-400" />
                      <span>View tracks</span>
                      <ChevronRight className="w-3.5 h-3.5 ml-0.5 text-slate-400" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Infinite Scroll Trigger & Skeleton loader */}
      {hasMore && (
        <div ref={observerTargetRef} className="py-6 flex flex-col items-center justify-center space-y-2">
          {isLoadingMore ? (
            <div className="flex items-center gap-2 text-xs text-cyan-300 font-semibold">
              <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
              <span>Loading more nasheeds from Archive...</span>
            </div>
          ) : (
            <span className="text-[11px] text-slate-500">Scroll for more results</span>
          )}
        </div>
      )}

      {/* Reached End */}
      {!hasMore && items.length > 0 && (
        <div className="text-center py-6 text-xs text-slate-500 border-t border-white/5">
          <span>You&apos;ve reached the end of the Archive results.</span>
        </div>
      )}

      {/* =========================================================================
          ITEM TRACKS MODAL / SHEET (For Multi-File Items)
         ========================================================================= */}
      {activeDetailItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-5 animate-in fade-in">
          <div className="w-full max-w-2xl max-h-[85vh] rounded-3xl bg-slate-900 border border-cyan-500/30 flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-white/10 flex items-start justify-between gap-3 bg-gradient-to-r from-cyan-950/30 via-slate-900 to-purple-950/20">
              <div className="flex items-center gap-3 min-w-0">
                {activeDetailItem.hasRealImage && activeDetailItem.coverUrl ? (
                  <div className="w-14 h-14 rounded-2xl overflow-hidden bg-slate-800 shrink-0 border border-cyan-500/30 shadow-md">
                    <img
                      src={activeDetailItem.coverUrl}
                      alt={activeDetailItem.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  </div>
                ) : (
                  <ArchiveGeneratedCover title={activeDetailItem.title} size="md" />
                )}
                <div className="min-w-0">
                  <h3 dir="auto" className="text-sm sm:text-base font-bold text-white line-clamp-1">
                    {activeDetailItem.title}
                  </h3>
                  <p dir="auto" className="text-xs text-slate-400 truncate mt-0.5">
                    {formatArchiveCreator(activeDetailItem.creator)} • {activeDetailItem.audioFiles.length} audio tracks
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-white/5">
                      {formatArchiveLicense(activeDetailItem.licenseurl)}
                    </span>
                    <a
                      href={activeDetailItem.archiveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-cyan-400 hover:underline flex items-center gap-0.5"
                    >
                      Archive page <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCloseDetail}
                className="p-1.5 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Track List */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-2 flex-1">
              {activeDetailItem.audioFiles.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No compatible audio files found for this collection.
                </div>
              ) : (
                activeDetailItem.audioFiles.map((file) => {
                  const fileKey = `${activeDetailItem.identifier}::${file.name}`;
                  const isFileDownloaded = isDownloaded(activeDetailItem.identifier, file.name);
                  const isFilePreviewing =
                    previewTrack?.file.downloadUrl === file.downloadUrl && isPreviewPlaying;
                  const progress = downloadProgress.get(fileKey);
                  const isDownloading = progress !== undefined;

                  return (
                    <div
                      key={file.name}
                      className="p-3 rounded-xl bg-slate-950/60 border border-white/5 hover:border-cyan-500/25 flex items-center justify-between gap-3 transition"
                    >
                      <div className="min-w-0 flex-1">
                        <h4 dir="auto" className="text-xs sm:text-sm font-bold text-white truncate text-start">
                          {file.title}
                        </h4>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {formatArchiveDuration(file.length)} • {formatArchiveBytes(file.size)} • {file.format.toUpperCase()}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {/* Preview button */}
                        <button
                          type="button"
                          onClick={() => handleTogglePreview(activeDetailItem, file)}
                          className={`w-8 h-8 rounded-full flex items-center justify-center transition active:scale-95 cursor-pointer border ${
                            isFilePreviewing
                              ? 'bg-cyan-400 text-slate-950 border-cyan-300'
                              : 'bg-slate-800 hover:bg-slate-700 text-cyan-300 border-white/10'
                          }`}
                          title="Preview"
                        >
                          {isFilePreviewing ? (
                            <Pause className="w-3.5 h-3.5 fill-current" />
                          ) : (
                            <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                          )}
                        </button>

                        {/* Download button or offline check */}
                        {isFileDownloaded ? (
                          <div className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Saved</span>
                          </div>
                        ) : isDownloading ? (
                          <div className="px-2.5 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 text-[11px] font-bold flex items-center gap-1.5">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>{progress}%</span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleDownloadClick(activeDetailItem, file)}
                            className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-400 hover:to-purple-500 text-white font-bold text-xs transition active:scale-95 cursor-pointer flex items-center gap-1"
                          >
                            <Download className="w-3 h-3" />
                            <span>Download</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 sm:p-4 border-t border-white/10 bg-slate-950/80 flex items-center justify-between text-xs text-slate-400">
              <span>{activeDetailItem.audioFiles.length} tracks available</span>
              <button
                type="button"
                onClick={handleCloseDetail}
                className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          IN-CARD PREVIEW MINI PLAYER (Plain HTML5 Audio)
         ========================================================================= */}
      {previewTrack && (
        <div className="fixed bottom-20 left-4 right-4 z-40 max-w-xl mx-auto animate-in slide-in-from-bottom-3 duration-200">
          <div className="p-3 sm:p-3.5 rounded-2xl bg-slate-900/95 backdrop-blur-xl border border-cyan-500/40 shadow-2xl shadow-black/60 space-y-2">
            {/* Seekable Progress Bar */}
            <div
              ref={progressBarRef}
              onClick={handleSeekPreview}
              className="w-full h-1.5 bg-slate-800 hover:h-2 rounded-full overflow-hidden cursor-pointer transition-all"
            >
              <div
                className="h-full bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 rounded-full transition-all"
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
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                      PREVIEW
                    </span>
                    <h5 dir="auto" className="text-xs font-bold text-white truncate">
                      {previewTrack.file.title}
                    </h5>
                  </div>
                  <p dir="auto" className="text-[11px] text-slate-400 truncate mt-0.5">
                    {previewTrack.item.creator || 'Internet Archive'} • {formatArchiveDuration(previewCurrentTime)} / {formatArchiveDuration(previewDuration || previewTrack.file.length)}
                  </p>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleTogglePreview(previewTrack.item, previewTrack.file)}
                  className="w-9 h-9 rounded-full bg-gradient-to-r from-cyan-400 to-purple-500 hover:from-cyan-300 hover:to-purple-400 text-slate-950 flex items-center justify-center transition active:scale-95 cursor-pointer shadow-md shadow-cyan-500/25"
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

      {/* =========================================================================
          LARGE FILE SIZE CONFIRMATION MODAL (> 40 MB)
         ========================================================================= */}
      {sizeConfirmData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-amber-500/40 p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-amber-400">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h4 className="text-sm font-bold text-white">Large Download Confirmation</h4>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              This file is <strong>{formatArchiveBytes(sizeConfirmData.file.size)}</strong>. Download?
            </p>

            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setSizeConfirmData(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const data = sizeConfirmData;
                  setSizeConfirmData(null);
                  startDownloadProcess(data.item, data.file);
                }}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 via-purple-600 to-pink-500 text-white text-xs font-bold transition cursor-pointer shadow-lg shadow-cyan-500/25"
              >
                Download
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          FILE EXCEEDED 150 MB NOTICE
         ========================================================================= */}
      {sizeExceededMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-rose-500/40 p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <h4 className="text-sm font-bold text-white">File Too Large</h4>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">{sizeExceededMessage}</p>

            <button
              type="button"
              onClick={() => setSizeExceededMessage(null)}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition cursor-pointer"
            >
              Understood
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
          MOBILE DATA PROMPT
         ========================================================================= */}
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
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 text-white text-xs font-bold transition cursor-pointer shadow-lg shadow-cyan-500/25"
              >
                Download anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Attribution & Legal Notice at bottom of card */}
      <div className="pt-4 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 text-center sm:text-left select-none">
        <p>
          Content provided by the{' '}
          <a
            href="https://archive.org"
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-400 hover:underline font-bold"
          >
            Internet Archive
          </a>
          . Rights belong to their owners.
        </p>

        <a
          href="https://archive.org/about/terms.php"
          target="_blank"
          rel="noopener noreferrer"
          className="text-slate-400 hover:text-cyan-400 transition"
        >
          Archive Terms
        </a>
      </div>
    </div>
  );
};
