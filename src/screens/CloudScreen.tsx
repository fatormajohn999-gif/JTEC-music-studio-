import React, { useState, useMemo } from 'react';
import { 
  Cloud, HardDrive, Download, CheckCircle2, Upload, Database, RefreshCw, 
  Trash2, Play, MoreVertical, Heart, Plus, Search, Sparkles, Filter, 
  Check, ArrowUpDown, Disc, Music, AlertCircle, AlertTriangle, Settings2,
  ExternalLink, ArrowDownUp
} from 'lucide-react';
import { CloudSong, Song, Playlist, CloudStorageStats } from '../types/music';
import { SupabaseService, formatBytes, CloudSettings } from '../services/supabase';

interface CloudScreenProps {
  cloudSongs: CloudSong[];
  offlineSongs: Song[];
  playlists: Playlist[];
  currentSong: Song | null;
  isPlaying: boolean;
  onPlaySong: (song: Song) => void;
  onPlayCloudSong: (cloudSong: CloudSong) => void;
  onDownloadSong: (cloudSong: CloudSong) => Promise<void>;
  onRemoveOfflineSong: (songId: string) => Promise<void>;
  onDeleteCloudSong: (cloudSong: CloudSong, deleteOfflineCopy?: boolean) => Promise<void>;
  onToggleFavorite: (song: Song) => void;
  onOpenUpload: () => void;
  onOpenSettings: () => void;
  onRefresh: () => Promise<void>;
  onAddToPlaylist: (song: Song) => void;
  onAddToQueue: (song: Song) => void;
  onPlayNext: (song: Song) => void;
}

type CloudTab = 'all' | 'offline' | 'cloud_only' | 'storage';
type SortOption = 'largest' | 'smallest' | 'newest' | 'oldest' | 'artist' | 'title';

export const CloudScreen: React.FC<CloudScreenProps> = ({
  cloudSongs,
  offlineSongs,
  playlists,
  currentSong,
  isPlaying,
  onPlaySong,
  onPlayCloudSong,
  onDownloadSong,
  onRemoveOfflineSong,
  onDeleteCloudSong,
  onToggleFavorite,
  onOpenUpload,
  onOpenSettings,
  onRefresh,
  onAddToPlaylist,
  onAddToQueue,
  onPlayNext,
}) => {
  const [activeTab, setActiveTab] = useState<CloudTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>('largest');
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Deletion modals state
  const [deleteModalSong, setDeleteModalSong] = useState<CloudSong | null>(null);
  const [removeOfflineModalSong, setRemoveOfflineModalSong] = useState<CloudSong | null>(null);
  const [activeMenuSongId, setActiveMenuSongId] = useState<string | null>(null);

  const supabaseConfig = SupabaseService.getConfig();
  const cloudSettings = SupabaseService.getCloudSettings();

  // Map offline songs by cloudId, fileHash, or lowercased title+artist
  const offlineMap = useMemo(() => {
    const map = new Map<string, Song>();
    for (const song of offlineSongs) {
      if (song.cloudId) map.set(song.cloudId, song);
      if (song.fileHash) map.set(song.fileHash, song);
      map.set(`${song.title.toLowerCase()}_${song.artist.toLowerCase()}`, song);
    }
    return map;
  }, [offlineSongs]);

  // Real Storage Statistics
  const stats: CloudStorageStats = useMemo(() => {
    const offlineBytes = offlineSongs.reduce((sum, s) => sum + (s.size || 0), 0);
    return SupabaseService.calculateStorageStats(
      cloudSongs,
      offlineSongs.length,
      offlineBytes,
      playlists.length,
      0,
      cloudSettings.maxCloudQuotaBytes
    );
  }, [cloudSongs, offlineSongs, playlists, cloudSettings.maxCloudQuotaBytes]);

  // Distinct Albums and Artists count from real cloud songs
  const totalAlbumsCount = useMemo(() => {
    const set = new Set(cloudSongs.map((s) => (s.album || 'Single').trim().toLowerCase()));
    return set.size;
  }, [cloudSongs]);

  const totalArtistsCount = useMemo(() => {
    const set = new Set(cloudSongs.map((s) => (s.artist || 'Unknown Artist').trim().toLowerCase()));
    return set.size;
  }, [cloudSongs]);

  // Determine offline match for a cloud song
  const getOfflineMatch = (cs: CloudSong): Song | undefined => {
    return (
      offlineMap.get(cs.id) ||
      (cs.file_hash ? offlineMap.get(cs.file_hash) : undefined) ||
      offlineMap.get(`${cs.title.toLowerCase()}_${cs.artist.toLowerCase()}`)
    );
  };

  const isSongDownloaded = (cs: CloudSong): boolean => {
    const match = getOfflineMatch(cs);
    return Boolean(match && match.hasStoredBlob);
  };

  // Filtered tracks based on tab and search
  const filteredTracks = useMemo(() => {
    let list = [...cloudSongs];

    if (activeTab === 'offline') {
      list = list.filter((cs) => isSongDownloaded(cs));
    } else if (activeTab === 'cloud_only') {
      list = list.filter((cs) => !isSongDownloaded(cs));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (cs) =>
          cs.title.toLowerCase().includes(q) ||
          cs.artist.toLowerCase().includes(q) ||
          cs.album.toLowerCase().includes(q) ||
          (cs.genre && cs.genre.toLowerCase().includes(q))
      );
    }

    // Sort order
    if (activeTab === 'storage' || sortOption !== 'newest') {
      list.sort((a, b) => {
        switch (sortOption) {
          case 'largest':
            return (b.file_size || 0) - (a.file_size || 0);
          case 'smallest':
            return (a.file_size || 0) - (b.file_size || 0);
          case 'newest':
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          case 'oldest':
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          case 'artist':
            return a.artist.localeCompare(b.artist);
          case 'title':
            return a.title.localeCompare(b.title);
          default:
            return 0;
        }
      });
    }

    return list;
  }, [cloudSongs, activeTab, searchQuery, sortOption, offlineMap]);

  // Handle Download
  const handleDownload = async (cs: CloudSong) => {
    if (downloadingIds.has(cs.id)) return;
    setDownloadingIds((prev) => new Set(prev).add(cs.id));
    try {
      await onDownloadSong(cs);
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev);
        next.delete(cs.id);
        return next;
      });
    }
  };

  // Handle Refresh
  const handleRefreshClick = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Storage warning status
  const isStorageCritical = stats.usagePercentage >= 90;
  const isStorageWarning = stats.usagePercentage >= 75 && !isStorageCritical;
  const isStorageFull = stats.usagePercentage >= 100;

  return (
    <div className="pb-36 pt-4 px-4 max-w-4xl mx-auto space-y-6 animate-in fade-in">
      {/* 1. JTEC CLOUD HEADER & ACTION BUTTONS */}
      <div className="relative rounded-3xl p-6 bg-gradient-to-br from-[#0c1024] via-[#090d20] to-[#070b18] border border-cyan-500/30 shadow-2xl overflow-hidden space-y-5">
        {/* Ambient neon backdrop glow */}
        <div className="absolute top-0 right-0 w-80 h-80 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-80 h-80 rounded-full bg-purple-600/10 blur-3xl pointer-events-none" />

        {/* Top Header Row */}
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-400 to-purple-600 flex items-center justify-center shadow-lg shadow-cyan-500/30">
              <Cloud className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  ☁ JTEC <span className="text-gradient-cyan-purple">CLOUD</span>
                </h1>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                    supabaseConfig.isConfigured
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  }`}
                >
                  {supabaseConfig.isConfigured ? 'Supabase Connected' : 'Not Connected'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 font-medium">
                Cloud Music Storage
              </p>
            </div>
          </div>

          {/* Header Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefreshClick}
              disabled={isRefreshing}
              title="Refresh cloud library"
              className="p-2.5 rounded-xl bg-slate-900/80 border border-white/10 text-slate-300 hover:text-white hover:border-cyan-500/30 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
            </button>

            <button
              onClick={onOpenSettings}
              title="Open Cloud Settings & Storage Quota"
              className="px-3 py-2.5 rounded-xl bg-slate-900/80 border border-white/10 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/30 transition flex items-center gap-1.5 text-xs font-semibold"
            >
              <Settings2 className="w-4 h-4 text-cyan-400" />
              <span>Cloud Settings ⚙</span>
            </button>

            <button
              onClick={onOpenUpload}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-400 hover:to-purple-500 text-white font-bold text-xs transition flex items-center gap-1.5 shadow-lg shadow-cyan-500/25 active:scale-95 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>+ Upload Music</span>
            </button>
          </div>
        </div>

        {/* Not Configured Banner */}
        {!supabaseConfig.isConfigured && (
          <div className="relative z-10 p-3.5 rounded-2xl bg-amber-950/40 border border-amber-500/30 text-amber-200 text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                Supabase project is not configured. Connect your Supabase project in Cloud Settings to store music.
              </span>
            </div>
            <button
              onClick={onOpenSettings}
              className="px-3 py-1 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold hover:bg-amber-500/30 transition shrink-0"
            >
              Connect
            </button>
          </div>
        )}

        {/* Real Storage Warnings */}
        {cloudSettings.storageWarnings && (
          <>
            {isStorageFull && (
              <div className="relative z-10 p-3 rounded-2xl bg-rose-950/50 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2 font-medium">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>Cloud storage full ({stats.usagePercentage}% used). Free up space or upgrade storage in Supabase.</span>
              </div>
            )}
            {isStorageCritical && !isStorageFull && (
              <div className="relative z-10 p-3 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-rose-200 text-xs flex items-center gap-2 font-medium">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>Storage critically low ({stats.usagePercentage}% used).</span>
              </div>
            )}
            {isStorageWarning && (
              <div className="relative z-10 p-3 rounded-2xl bg-amber-950/40 border border-amber-500/30 text-amber-200 text-xs flex items-center gap-2 font-medium">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Storage almost full ({stats.usagePercentage}% used).</span>
              </div>
            )}
          </>
        )}

        {/* 2. CLOUD STORAGE DASHBOARD PROGRESS */}
        <div className="relative z-10 p-4 rounded-2xl bg-black/40 border border-white/10 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
              <Cloud className="w-3.5 h-3.5 text-cyan-400" />
              Cloud Storage
            </span>
            <span className="font-bold text-white font-mono text-sm">
              {formatBytes(stats.usedBytes)} / {formatBytes(stats.maxBytes)}
            </span>
          </div>

          {/* Neon Storage Progress Bar */}
          <div className="w-full h-2.5 rounded-full bg-slate-950 overflow-hidden p-0.5 border border-white/5">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                stats.usagePercentage >= 90
                  ? 'bg-rose-500 shadow-sm shadow-rose-500'
                  : stats.usagePercentage >= 75
                  ? 'bg-amber-400 shadow-sm shadow-amber-400'
                  : 'bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500 shadow-sm shadow-cyan-400/50'
              }`}
              style={{ width: `${Math.max(stats.usedBytes > 0 ? 2 : 0, stats.usagePercentage)}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-400">{stats.usagePercentage}% used</span>
            <span className="text-cyan-300 font-bold">{formatBytes(stats.availableBytes)} available</span>
          </div>
        </div>

        {/* 3. YOUR CLOUD & OFFLINE METRICS */}
        <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* YOUR CLOUD */}
          <div className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-2">
            <p className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
              <Cloud className="w-3.5 h-3.5" />
              YOUR CLOUD
            </p>
            <div className="grid grid-cols-3 gap-2 pt-1 text-center">
              <div className="p-2 rounded-xl bg-slate-900/60 border border-white/5">
                <span className="text-base font-black text-white block">{stats.totalSongs}</span>
                <span className="text-[10px] text-slate-400 uppercase font-medium">Songs</span>
              </div>
              <div className="p-2 rounded-xl bg-slate-900/60 border border-white/5">
                <span className="text-base font-black text-purple-300 block">{totalAlbumsCount}</span>
                <span className="text-[10px] text-slate-400 uppercase font-medium">Albums</span>
              </div>
              <div className="p-2 rounded-xl bg-slate-900/60 border border-white/5">
                <span className="text-base font-black text-pink-300 block">{totalArtistsCount}</span>
                <span className="text-[10px] text-slate-400 uppercase font-medium">Artists</span>
              </div>
            </div>
          </div>

          {/* OFFLINE ON THIS DEVICE */}
          <div className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-2">
            <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              OFFLINE ON THIS DEVICE
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1 text-center">
              <div className="p-2 rounded-xl bg-slate-900/60 border border-white/5">
                <span className="text-base font-black text-emerald-300 block">{stats.offlineSongsCount}</span>
                <span className="text-[10px] text-slate-400 uppercase font-medium">Songs Offline</span>
              </div>
              <div className="p-2 rounded-xl bg-slate-900/60 border border-white/5">
                <span className="text-base font-black text-white block font-mono">{formatBytes(stats.offlineBytes)}</span>
                <span className="text-[10px] text-slate-400 uppercase font-medium">Device Storage</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. SEARCH & FILTER TABS */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
          {/* Navigation Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar py-1">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                activeTab === 'all'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              All Cloud ({cloudSongs.length})
            </button>

            <button
              onClick={() => setActiveTab('offline')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'offline'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Downloaded ({stats.offlineSongsCount})</span>
            </button>

            <button
              onClick={() => setActiveTab('cloud_only')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'cloud_only'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm shadow-purple-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Cloud className="w-3.5 h-3.5" />
              <span>Cloud Only ({Math.max(0, cloudSongs.length - stats.offlineSongsCount)})</span>
            </button>

            <button
              onClick={() => setActiveTab('storage')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'storage'
                  ? 'bg-gradient-to-r from-cyan-500/20 to-purple-500/20 text-white border border-cyan-400/30'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>Storage Management</span>
            </button>
          </div>

          {/* Search Cloud Music */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search Cloud Music..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900/80 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
            />
          </div>
        </div>

        {/* Sort Controls (shown in All, Offline, Cloud Only and Storage) */}
        <div className="flex items-center justify-between text-xs text-slate-400 px-1">
          <span>
            Showing {filteredTracks.length} song{filteredTracks.length === 1 ? '' : 's'}
          </span>

          <div className="flex items-center gap-1.5">
            <ArrowDownUp className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-[11px] text-slate-500">Sort:</span>
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as SortOption)}
              className="bg-slate-900 border border-white/10 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
            >
              <option value="largest">Largest File</option>
              <option value="smallest">Smallest File</option>
              <option value="newest">Newest Upload</option>
              <option value="oldest">Oldest Upload</option>
              <option value="artist">Artist (A-Z)</option>
              <option value="title">Title (A-Z)</option>
            </select>
          </div>
        </div>
      </div>

      {/* 5. STORAGE MANAGEMENT VIEW (When activeTab === 'storage') */}
      {activeTab === 'storage' && (
        <div className="space-y-4 animate-in fade-in">
          <div className="p-5 rounded-3xl bg-slate-900/60 border border-white/10 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-cyan-400" />
                <span>Storage Management Breakdown</span>
              </h3>
              <span className="text-xs font-mono text-cyan-300 font-bold">
                {formatBytes(stats.usedBytes)} Total
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-2xl bg-black/40 border border-white/5 space-y-1">
                <span className="text-slate-400 text-[11px] block">Cloud Storage</span>
                <span className="text-sm font-bold text-white font-mono">{formatBytes(stats.usedBytes)} used</span>
              </div>

              <div className="p-3 rounded-2xl bg-black/40 border border-white/5 space-y-1">
                <span className="text-slate-400 text-[11px] block">Available</span>
                <span className="text-sm font-bold text-cyan-300 font-mono">{formatBytes(stats.availableBytes)}</span>
              </div>

              <div className="p-3 rounded-2xl bg-black/40 border border-white/5 space-y-1">
                <span className="text-slate-400 text-[11px] block">Cloud Songs</span>
                <span className="text-sm font-bold text-white">{stats.totalSongs}</span>
              </div>

              <div className="p-3 rounded-2xl bg-black/40 border border-white/5 space-y-1">
                <span className="text-slate-400 text-[11px] block">Offline Storage</span>
                <span className="text-sm font-bold text-emerald-300 font-mono">{formatBytes(stats.offlineBytes)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. CLOUD LIBRARY SONG CARDS */}
      <div className="space-y-3">
        {filteredTracks.length === 0 ? (
          /* Real Empty State (Zero Songs) */
          <div className="p-10 rounded-3xl bg-slate-900/30 border border-white/5 text-center space-y-3">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
              <Cloud className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {cloudSongs.length === 0 ? 'No music uploaded yet' : 'No matching cloud songs'}
              </h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                {cloudSongs.length === 0
                  ? 'Your JTEC CLOUD storage is empty (0 B used). Upload your favourite audio files to stream or download anywhere.'
                  : 'Try adjusting your search terms or filter tabs.'}
              </p>
            </div>
            {cloudSongs.length === 0 && (
              <button
                onClick={onOpenUpload}
                className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-bold text-xs shadow-lg shadow-cyan-500/25 hover:brightness-110 active:scale-95 transition inline-flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                <span>+ Upload Music</span>
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredTracks.map((song) => {
              const isDownloaded = isSongDownloaded(song);
              const isDownloading = downloadingIds.has(song.id);
              const offlineMatch = getOfflineMatch(song);
              const isCurrentPlaying =
                isPlaying && currentSong && (currentSong.cloudId === song.id || currentSong.id === song.id);

              return (
                <div
                  key={song.id}
                  className={`group p-3 sm:p-4 rounded-2xl bg-slate-900/60 hover:bg-slate-900/90 border transition flex items-center justify-between gap-3 ${
                    isCurrentPlaying
                      ? 'border-cyan-500/50 shadow-lg shadow-cyan-500/10'
                      : 'border-white/5 hover:border-cyan-500/25'
                  }`}
                >
                  {/* Left: Artwork & Metadata */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="relative w-11 h-11 rounded-xl bg-slate-800 flex items-center justify-center shrink-0 overflow-hidden border border-white/10 shadow-sm">
                      {song.cover_url ? (
                        <img
                          src={song.cover_url}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Music className="w-5 h-5 text-slate-400" />
                      )}

                      {/* Play overlay on hover or current */}
                      <button
                        onClick={() => {
                          if (offlineMatch && offlineMatch.hasStoredBlob) {
                            onPlaySong(offlineMatch);
                          } else {
                            onPlayCloudSong(song);
                          }
                        }}
                        className={`absolute inset-0 bg-black/50 backdrop-blur-[2px] flex items-center justify-center transition ${
                          isCurrentPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                        }`}
                      >
                        <Play
                          className={`w-4 h-4 ${
                            isCurrentPlaying ? 'fill-cyan-400 text-cyan-400' : 'fill-white text-white'
                          }`}
                        />
                      </button>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className={`font-bold text-xs sm:text-sm truncate ${
                          isCurrentPlaying ? 'text-cyan-300' : 'text-white'
                        }`}>
                          {song.title}
                        </p>
                      </div>

                      <p className="text-[11px] text-slate-400 truncate">
                        {song.artist} • {song.album}
                      </p>

                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500 font-mono">
                        <span>{formatBytes(song.file_size)}</span>

                        {/* Status Badges */}
                        {isDownloaded ? (
                          <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Available Offline</span>
                          </span>
                        ) : isDownloading ? (
                          <span className="flex items-center gap-1 text-cyan-400 font-semibold animate-pulse">
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            <span>Downloading...</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-purple-400">
                            <Cloud className="w-3 h-3" />
                            <span>Cloud Only</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Play Button */}
                    <button
                      onClick={() => {
                        if (offlineMatch && offlineMatch.hasStoredBlob) {
                          onPlaySong(offlineMatch);
                        } else {
                          onPlayCloudSong(song);
                        }
                      }}
                      title="Play track"
                      className="p-2 sm:px-3 sm:py-1.5 rounded-xl bg-slate-800/80 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 border border-white/5 transition flex items-center gap-1 text-xs font-semibold"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span className="hidden sm:inline">Play</span>
                    </button>

                    {/* Download Button (if not already downloaded) */}
                    {!isDownloaded ? (
                      <button
                        onClick={() => handleDownload(song)}
                        disabled={isDownloading}
                        title="Download for 100% offline playback"
                        className="p-2 sm:px-3 sm:py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 transition flex items-center gap-1 text-xs font-semibold disabled:opacity-50"
                      >
                        <Download className={`w-3.5 h-3.5 ${isDownloading ? 'animate-bounce' : ''}`} />
                        <span className="hidden sm:inline">
                          {isDownloading ? 'Downloading...' : 'Download'}
                        </span>
                      </button>
                    ) : (
                      <span
                        title="Stored locally in IndexedDB"
                        className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Offline</span>
                      </span>
                    )}

                    {/* More Menu Dropdown */}
                    <div className="relative">
                      <button
                        onClick={() =>
                          setActiveMenuSongId(activeMenuSongId === song.id ? null : song.id)
                        }
                        className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {activeMenuSongId === song.id && (
                        <div
                          className="absolute right-0 top-full mt-1 w-48 rounded-2xl bg-[#0c1024] border border-cyan-500/30 shadow-2xl p-1.5 z-40 space-y-1 text-xs animate-in fade-in"
                          onClick={() => setActiveMenuSongId(null)}
                        >
                          <button
                            onClick={() => {
                              if (offlineMatch && offlineMatch.hasStoredBlob) {
                                onPlaySong(offlineMatch);
                              } else {
                                onPlayCloudSong(song);
                              }
                            }}
                            className="w-full text-left px-3 py-2 rounded-xl hover:bg-white/5 text-slate-200 flex items-center gap-2"
                          >
                            <Play className="w-3.5 h-3.5 text-cyan-400" />
                            <span>Play Now</span>
                          </button>

                          <button
                            onClick={() => {
                              const s = offlineMatch || {
                                id: `stream_${song.id}`,
                                title: song.title,
                                artist: song.artist,
                                album: song.album,
                                duration: song.duration,
                                format: song.file_name.split('.').pop() || 'mp3',
                                size: song.file_size,
                                dateAdded: Date.now(),
                                hasStoredBlob: false,
                                cloudId: song.id,
                                isCloud: true,
                                audioUrl: song.audio_url,
                              };
                              onPlayNext(s);
                            }}
                            className="w-full text-left px-3 py-2 rounded-xl hover:bg-white/5 text-slate-200 flex items-center gap-2"
                          >
                            <Plus className="w-3.5 h-3.5 text-purple-400" />
                            <span>Play Next</span>
                          </button>

                          <button
                            onClick={() => {
                              const s = offlineMatch || {
                                id: `stream_${song.id}`,
                                title: song.title,
                                artist: song.artist,
                                album: song.album,
                                duration: song.duration,
                                format: song.file_name.split('.').pop() || 'mp3',
                                size: song.file_size,
                                dateAdded: Date.now(),
                                hasStoredBlob: false,
                                cloudId: song.id,
                                isCloud: true,
                                audioUrl: song.audio_url,
                              };
                              onAddToQueue(s);
                            }}
                            className="w-full text-left px-3 py-2 rounded-xl hover:bg-white/5 text-slate-200 flex items-center gap-2"
                          >
                            <Disc className="w-3.5 h-3.5 text-pink-400" />
                            <span>Add to Queue</span>
                          </button>

                          <button
                            onClick={() => {
                              const s = offlineMatch || {
                                id: `stream_${song.id}`,
                                title: song.title,
                                artist: song.artist,
                                album: song.album,
                                duration: song.duration,
                                format: song.file_name.split('.').pop() || 'mp3',
                                size: song.file_size,
                                dateAdded: Date.now(),
                                hasStoredBlob: false,
                                cloudId: song.id,
                                isCloud: true,
                                audioUrl: song.audio_url,
                              };
                              onAddToPlaylist(s);
                            }}
                            className="w-full text-left px-3 py-2 rounded-xl hover:bg-white/5 text-slate-200 flex items-center gap-2"
                          >
                            <Plus className="w-3.5 h-3.5 text-cyan-400" />
                            <span>Add to Playlist</span>
                          </button>

                          {/* Remove Offline Only */}
                          {isDownloaded && offlineMatch && (
                            <button
                              onClick={() => setRemoveOfflineModalSong(song)}
                              className="w-full text-left px-3 py-2 rounded-xl hover:bg-amber-950/20 text-amber-300 flex items-center gap-2"
                            >
                              <HardDrive className="w-3.5 h-3.5 text-amber-400" />
                              <span>Remove Offline Only</span>
                            </button>
                          )}

                          {/* Delete from Cloud */}
                          <button
                            onClick={() => setDeleteModalSong(song)}
                            className="w-full text-left px-3 py-2 rounded-xl hover:bg-rose-950/20 text-rose-300 flex items-center gap-2"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                            <span>Delete from Cloud</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 7. CONFIRMATION MODAL: DELETE FROM CLOUD */}
      {deleteModalSong && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-md rounded-3xl bg-[#090d20] border border-rose-500/30 p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center">
              <Trash2 className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-extrabold text-white">
                Delete from JTEC CLOUD?
              </h3>
              <p className="text-xs text-slate-300 mt-1">
                Are you sure you want to remove <span className="text-white font-bold">"{deleteModalSong.title}"</span> from Supabase Cloud? This removes the audio file from Supabase Storage and the database record.
              </p>
            </div>

            {isSongDownloaded(deleteModalSong) ? (
              <div className="p-3 rounded-2xl bg-amber-950/30 border border-amber-500/30 text-xs text-amber-200 space-y-1">
                <p className="font-bold flex items-center gap-1.5 text-amber-300">
                  <AlertTriangle className="w-4 h-4" />
                  <span>This song is also downloaded offline.</span>
                </p>
                <p className="text-[11px] text-amber-200/90">
                  Do you want to delete both the cloud copy and the offline downloaded file?
                </p>
              </div>
            ) : null}

            <div className="flex flex-col sm:flex-row items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteModalSong(null)}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold"
              >
                Cancel
              </button>

              {isSongDownloaded(deleteModalSong) ? (
                <>
                  <button
                    onClick={async () => {
                      const s = deleteModalSong;
                      setDeleteModalSong(null);
                      await onDeleteCloudSong(s, false);
                    }}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold"
                  >
                    Delete Cloud Only
                  </button>

                  <button
                    onClick={async () => {
                      const s = deleteModalSong;
                      setDeleteModalSong(null);
                      await onDeleteCloudSong(s, true);
                    }}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-600/30"
                  >
                    Delete Both
                  </button>
                </>
              ) : (
                <button
                  onClick={async () => {
                    const s = deleteModalSong;
                    setDeleteModalSong(null);
                    await onDeleteCloudSong(s, false);
                  }}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-600/30"
                >
                  Delete from Cloud
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 8. CONFIRMATION MODAL: REMOVE OFFLINE ONLY */}
      {removeOfflineModalSong && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-md rounded-3xl bg-[#090d20] border border-cyan-500/30 p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <HardDrive className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-extrabold text-white">
                Remove Offline Copy Only?
              </h3>
              <p className="text-xs text-slate-300 mt-1">
                This frees up device storage by removing the local IndexedDB copy of{' '}
                <span className="text-white font-bold">"{removeOfflineModalSong.title}"</span>. The song will remain stored in JTEC CLOUD and can still be streamed online or re-downloaded at any time.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setRemoveOfflineModalSong(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold"
              >
                Cancel
              </button>

              <button
                onClick={async () => {
                  const s = removeOfflineModalSong;
                  setRemoveOfflineModalSong(null);
                  const match = getOfflineMatch(s);
                  if (match) {
                    await onRemoveOfflineSong(match.id);
                  }
                }}
                className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-lg shadow-amber-600/30"
              >
                Remove Offline
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
