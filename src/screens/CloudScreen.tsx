import React, { useState, useMemo } from 'react';
import { 
  Cloud, HardDrive, Download, CheckCircle2, Upload, Database, RefreshCw, 
  Trash2, Play, MoreVertical, Heart, Plus, Search, Sparkles, Filter, 
  Check, ArrowUpDown, Disc, Music, AlertCircle, FileCheck
} from 'lucide-react';
import { CloudSong, Song, Playlist, CloudStorageStats } from '../types/music';
import { SupabaseService, formatBytes } from '../services/supabase';

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
  onDeleteCloudSong: (cloudSong: CloudSong) => Promise<void>;
  onToggleFavorite: (song: Song) => void;
  onOpenUpload: () => void;
  onOpenConnect: () => void;
  onRefresh: () => Promise<void>;
  onAddToPlaylist: (song: Song) => void;
  onAddToQueue: (song: Song) => void;
  onPlayNext: (song: Song) => void;
}

type CloudTab = 'all' | 'offline' | 'cloud_only' | 'storage';

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
  onOpenConnect,
  onRefresh,
  onAddToPlaylist,
  onAddToQueue,
  onPlayNext,
}) => {
  const [activeTab, setActiveTab] = useState<CloudTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [confirmRemoveOfflineId, setConfirmRemoveOfflineId] = useState<string | null>(null);
  const [confirmDeleteCloudSong, setConfirmDeleteCloudSong] = useState<CloudSong | null>(null);
  const [activeMenuSongId, setActiveMenuSongId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const supabaseConfig = SupabaseService.getConfig();

  // Create quick lookup set of downloaded song cloudIds / fileHashes / titles
  const offlineCloudIdMap = useMemo(() => {
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
    const offlineBytes = offlineSongs.reduce((acc, s) => acc + (s.size || 0), 0);
    const favoriteCount = offlineSongs.filter((s) => s.isFavorite).length;
    return SupabaseService.calculateStorageStats(
      cloudSongs,
      offlineSongs.length,
      offlineBytes,
      playlists.length,
      favoriteCount
    );
  }, [cloudSongs, offlineSongs, playlists]);

  // Filtered tracks
  const filteredTracks = useMemo(() => {
    let list = cloudSongs;

    if (activeTab === 'offline') {
      list = list.filter((cs) => {
        return (
          offlineCloudIdMap.has(cs.id) ||
          (cs.file_hash && offlineCloudIdMap.has(cs.file_hash)) ||
          offlineCloudIdMap.has(`${cs.title.toLowerCase()}_${cs.artist.toLowerCase()}`)
        );
      });
    } else if (activeTab === 'cloud_only') {
      list = list.filter((cs) => {
        const isOffline =
          offlineCloudIdMap.has(cs.id) ||
          (cs.file_hash && offlineCloudIdMap.has(cs.file_hash)) ||
          offlineCloudIdMap.has(`${cs.title.toLowerCase()}_${cs.artist.toLowerCase()}`);
        return !isOffline;
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (cs) =>
          cs.title.toLowerCase().includes(q) ||
          cs.artist.toLowerCase().includes(q) ||
          cs.album.toLowerCase().includes(q)
      );
    }

    return list;
  }, [cloudSongs, activeTab, searchQuery, offlineCloudIdMap]);

  // Tracks sorted by size descending for Storage Analytics
  const largestSongs = useMemo(() => {
    return [...cloudSongs].sort((a, b) => b.file_size - a.file_size).slice(0, 10);
  }, [cloudSongs]);

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

  const handleRefreshClick = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  const getOfflineMatch = (cs: CloudSong): Song | undefined => {
    return (
      offlineCloudIdMap.get(cs.id) ||
      (cs.file_hash ? offlineCloudIdMap.get(cs.file_hash) : undefined) ||
      offlineCloudIdMap.get(`${cs.title.toLowerCase()}_${cs.artist.toLowerCase()}`)
    );
  };

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="pb-36 pt-4 px-4 max-w-4xl mx-auto space-y-6">
      {/* 1. CLOUD DASHBOARD HEADER */}
      <div className="relative rounded-3xl p-6 bg-gradient-to-br from-[#0c1024] via-[#090d20] to-[#070b18] border border-cyan-500/30 shadow-2xl overflow-hidden space-y-5">
        {/* Ambient neon backdrop glow */}
        <div className="absolute top-0 right-0 w-80 h-80 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-80 h-80 rounded-full bg-purple-600/10 blur-3xl pointer-events-none" />

        {/* Top Header Bar */}
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-400 to-purple-600 flex items-center justify-center shadow-lg shadow-cyan-500/30">
              <Cloud className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  JTEC <span className="text-gradient-cyan-purple">CLOUD</span>
                </h1>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                    supabaseConfig.isConfigured
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  }`}
                >
                  {supabaseConfig.isConfigured ? 'Supabase Live' : 'Local Cloud Mode'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Storage Manager & Offline Synchronizer
              </p>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefreshClick}
              disabled={isRefreshing}
              title="Refresh and sync cloud tracks"
              className="p-2.5 rounded-xl bg-slate-900/80 border border-white/10 text-slate-300 hover:text-white hover:border-cyan-500/30 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
            </button>

            <button
              onClick={onOpenConnect}
              title="Configure Supabase Database & Storage credentials"
              className="px-3 py-2.5 rounded-xl bg-slate-900/80 border border-white/10 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/30 transition flex items-center gap-1.5 text-xs font-semibold"
            >
              <Database className="w-4 h-4 text-cyan-400" />
              <span>Settings</span>
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

        {/* 2. REAL STORAGE PROGRESS & METRICS */}
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
          {/* Cloud Storage Card */}
          <div className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium flex items-center gap-1.5">
                <Cloud className="w-3.5 h-3.5 text-cyan-400" />
                Cloud Storage
              </span>
              <span className="font-bold text-white font-mono">
                {formatBytes(stats.usedBytes)} / {formatBytes(stats.maxBytes)}
              </span>
            </div>

            {/* Storage Progress Bar */}
            <div className="w-full h-2 rounded-full bg-slate-950 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  stats.usagePercentage > 90
                    ? 'bg-rose-500'
                    : stats.usagePercentage > 75
                    ? 'bg-amber-400'
                    : 'bg-gradient-to-r from-cyan-400 to-purple-500'
                }`}
                style={{ width: `${Math.max(2, stats.usagePercentage)}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
              <span>{stats.usagePercentage}% used</span>
              <span className="text-cyan-300">{formatBytes(stats.availableBytes)} available</span>
            </div>
          </div>

          {/* Cloud Song Summary */}
          <div className="p-4 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 font-medium">Cloud Library</p>
              <h3 className="text-2xl font-black text-white mt-1">
                {stats.totalSongs}{' '}
                <span className="text-xs font-normal text-slate-400">Tracks</span>
              </h3>
            </div>
            <div className="text-right text-[11px] text-slate-400 space-y-0.5">
              <p className="text-purple-300">{playlists.length} Playlists</p>
              <p className="text-pink-300">{stats.favoriteCount} Favorites</p>
            </div>
          </div>

          {/* Offline Downloaded Summary */}
          <div className="p-4 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Available Offline
              </p>
              <h3 className="text-2xl font-black text-emerald-300 mt-1">
                {stats.offlineSongsCount}{' '}
                <span className="text-xs font-normal text-slate-400">Downloaded</span>
              </h3>
            </div>
            <div className="text-right text-[11px] text-slate-400">
              <span className="font-mono text-white text-xs block font-bold">
                {formatBytes(stats.offlineBytes)}
              </span>
              <span>Device storage</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. TABS & SEARCH BAR */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2">
          {/* Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                activeTab === 'all'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              All Cloud ({cloudSongs.length})
            </button>

            <button
              onClick={() => setActiveTab('offline')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'offline'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Offline ({stats.offlineSongsCount})</span>
            </button>

            <button
              onClick={() => setActiveTab('cloud_only')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'cloud_only'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                  : 'text-slate-400 hover:text-white'
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
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>Manage Storage</span>
            </button>
          </div>

          {/* Search Input */}
          {activeTab !== 'storage' && (
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search cloud music..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-900/60 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
              />
            </div>
          )}
        </div>
      </div>

      {/* 4. TAB CONTENTS */}
      {activeTab === 'storage' ? (
        /* MANAGE STORAGE ANALYTICS VIEW */
        <div className="space-y-5 animate-in fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Cloud Storage Quota Card */}
            <div className="p-5 rounded-3xl bg-slate-900/60 border border-white/10 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Cloud className="w-4 h-4 text-cyan-400" />
                  Supabase Cloud Quota
                </h3>
                <span className="text-xs font-mono text-cyan-300 font-bold">
                  {stats.usagePercentage}%
                </span>
              </div>

              <div className="space-y-1.5">
                <div className="w-full h-3 rounded-full bg-slate-950 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-400 to-purple-500"
                    style={{ width: `${stats.usagePercentage}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-slate-400 font-mono">
                  <span>Used: {formatBytes(stats.usedBytes)}</span>
                  <span>Total: {formatBytes(stats.maxBytes)}</span>
                </div>
              </div>

              <div className="pt-2 border-t border-white/10 text-xs text-slate-400 space-y-1.5">
                <div className="flex justify-between">
                  <span>Total Cloud Songs:</span>
                  <span className="font-bold text-white">{stats.totalSongs}</span>
                </div>
                <div className="flex justify-between">
                  <span>Average Song Size:</span>
                  <span className="font-bold text-white">
                    {stats.totalSongs > 0
                      ? formatBytes(stats.usedBytes / stats.totalSongs)
                      : '0 MB'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Available Space:</span>
                  <span className="font-bold text-emerald-400 font-mono">
                    {formatBytes(stats.availableBytes)}
                  </span>
                </div>
              </div>
            </div>

            {/* Offline Device Storage Card */}
            <div className="p-5 rounded-3xl bg-slate-900/60 border border-white/10 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Offline Device Storage
                </h3>
                <span className="text-xs font-mono text-emerald-300 font-bold">
                  {stats.offlineSongsCount} Tracks
                </span>
              </div>

              <div className="space-y-1.5">
                <p className="text-2xl font-black text-white font-mono">
                  {formatBytes(stats.offlineBytes)}
                </p>
                <p className="text-xs text-slate-400">
                  Total audio binary data cached in browser IndexedDB
                </p>
              </div>

              <div className="pt-2 border-t border-white/10 text-xs text-slate-400 space-y-1.5">
                <div className="flex justify-between">
                  <span>Playable without internet:</span>
                  <span className="text-emerald-400 font-bold">100% Offline Ready</span>
                </div>
                <div className="flex justify-between">
                  <span>Storage Engine:</span>
                  <span className="font-mono text-slate-300">IndexedDB (High Speed)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Largest Songs Breakdown */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <ArrowUpDown className="w-4 h-4 text-purple-400" />
              Largest Songs in Cloud
            </h3>

            <div className="space-y-2">
              {largestSongs.map((song, rank) => {
                const offlineMatch = getOfflineMatch(song);
                const isOffline = Boolean(offlineMatch);

                return (
                  <div
                    key={song.id}
                    className="flex items-center justify-between p-3 rounded-2xl bg-slate-900/40 border border-white/5 hover:border-white/15 transition"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xs font-mono text-slate-500 w-5 text-center">
                        #{rank + 1}
                      </span>
                      <img
                        src={song.cover_url || './logo.png'}
                        alt=""
                        className="w-10 h-10 rounded-xl object-cover border border-white/10 shrink-0"
                      />
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-white truncate">
                          {song.title}
                        </h4>
                        <p className="text-[11px] text-slate-400 truncate">
                          {song.artist}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs font-mono font-bold text-cyan-300 px-2 py-0.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                        {formatBytes(song.file_size)}
                      </span>
                      {isOffline ? (
                        <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Offline
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">Cloud</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* CLOUD SONGS LIST */
        <div className="space-y-2.5 animate-in fade-in">
          {filteredTracks.length === 0 ? (
            <div className="text-center py-16 px-4 rounded-3xl bg-slate-900/30 border border-dashed border-white/10 space-y-3">
              <Cloud className="w-12 h-12 text-slate-600 mx-auto" />
              <p className="text-sm font-bold text-slate-300">
                {activeTab === 'offline'
                  ? 'No offline songs downloaded yet'
                  : 'No cloud tracks found'}
              </p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {activeTab === 'offline'
                  ? 'Tap the "Download" button on any cloud song to make it available without internet.'
                  : 'Upload songs to JTEC CLOUD to listen from any device or download for offline playback.'}
              </p>
              <button
                onClick={onOpenUpload}
                className="mt-2 px-4 py-2 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-bold hover:bg-cyan-500/30 transition"
              >
                + Upload Your First Cloud Track
              </button>
            </div>
          ) : (
            filteredTracks.map((song) => {
              const offlineMatch = getOfflineMatch(song);
              const isOffline = Boolean(offlineMatch && offlineMatch.hasStoredBlob !== false);
              const isThisPlaying =
                (currentSong?.id === song.id || currentSong?.cloudId === song.id) && isPlaying;
              const isDownloading = downloadingIds.has(song.id);

              return (
                <div
                  key={song.id}
                  className={`flex items-center gap-3 p-3 rounded-2xl border transition group ${
                    isThisPlaying
                      ? 'bg-cyan-500/15 border-cyan-400/50 shadow-lg shadow-cyan-500/10'
                      : 'bg-slate-900/50 border-white/5 hover:border-white/20'
                  }`}
                >
                  {/* Artwork & Play button */}
                  <div
                    onClick={() => {
                      if (offlineMatch) {
                        onPlaySong(offlineMatch);
                      } else {
                        onPlayCloudSong(song);
                      }
                    }}
                    className="relative w-12 h-12 rounded-xl overflow-hidden cursor-pointer shrink-0 border border-white/10"
                  >
                    <img
                      src={song.cover_url || './logo.png'}
                      alt={song.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                      <Play className="w-4 h-4 text-white fill-white" />
                    </div>
                    {isThisPlaying && (
                      <div className="absolute bottom-1 right-1 w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
                    )}
                  </div>

                  {/* Song Metadata */}
                  <div
                    onClick={() => {
                      if (offlineMatch) {
                        onPlaySong(offlineMatch);
                      } else {
                        onPlayCloudSong(song);
                      }
                    }}
                    className="flex-1 min-w-0 cursor-pointer"
                  >
                    <div className="flex items-center gap-1.5">
                      <h4
                        className={`text-xs font-bold truncate ${
                          isThisPlaying ? 'text-cyan-300' : 'text-white'
                        }`}
                      >
                        {song.title}
                      </h4>
                    </div>

                    <p className="text-[11px] text-slate-400 truncate mt-0.5">
                      {song.artist} • {song.album}
                    </p>

                    <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-500 font-mono">
                      <span>{formatBytes(song.file_size)}</span>
                      <span>•</span>
                      <span>{formatSeconds(song.duration)}</span>
                    </div>
                  </div>

                  {/* Offline / Download Status Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {isOffline ? (
                      <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-bold text-emerald-300">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        <span>Offline</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleDownload(song)}
                        disabled={isDownloading}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-xs font-semibold text-cyan-300 active:scale-95 transition disabled:opacity-50"
                      >
                        {isDownloading ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Downloading...</span>
                          </>
                        ) : (
                          <>
                            <Download className="w-3.5 h-3.5" />
                            <span>Download</span>
                          </>
                        )}
                      </button>
                    )}

                    {/* Track Options Menu */}
                    <div className="relative">
                      <button
                        onClick={() =>
                          setActiveMenuSongId(activeMenuSongId === song.id ? null : song.id)
                        }
                        className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {/* Dropdown Menu */}
                      {activeMenuSongId === song.id && (
                        <div className="absolute right-0 top-10 w-48 rounded-2xl bg-[#090d20]/95 backdrop-blur-xl border border-white/15 p-1.5 shadow-2xl z-30 space-y-1 text-xs">
                          <button
                            onClick={() => {
                              const s = offlineMatch || {
                                id: song.id,
                                title: song.title,
                                artist: song.artist,
                                album: song.album,
                                duration: song.duration,
                                artworkUrl: song.cover_url,
                                format: 'mp3',
                                size: song.file_size,
                                dateAdded: Date.now(),
                                hasStoredBlob: false,
                                isCloud: true,
                                audioUrl: song.audio_url,
                              };
                              onPlayNext(s);
                              setActiveMenuSongId(null);
                            }}
                            className="w-full text-left px-3 py-2 rounded-xl text-slate-300 hover:bg-white/5 hover:text-white transition"
                          >
                            Play Next
                          </button>

                          <button
                            onClick={() => {
                              const s = offlineMatch || {
                                id: song.id,
                                title: song.title,
                                artist: song.artist,
                                album: song.album,
                                duration: song.duration,
                                artworkUrl: song.cover_url,
                                format: 'mp3',
                                size: song.file_size,
                                dateAdded: Date.now(),
                                hasStoredBlob: false,
                                isCloud: true,
                                audioUrl: song.audio_url,
                              };
                              onAddToQueue(s);
                              setActiveMenuSongId(null);
                            }}
                            className="w-full text-left px-3 py-2 rounded-xl text-slate-300 hover:bg-white/5 hover:text-white transition"
                          >
                            Add to Queue
                          </button>

                          {offlineMatch && (
                            <button
                              onClick={() => {
                                onToggleFavorite(offlineMatch);
                                setActiveMenuSongId(null);
                              }}
                              className="w-full text-left px-3 py-2 rounded-xl text-slate-300 hover:bg-white/5 hover:text-white transition flex items-center justify-between"
                            >
                              <span>{offlineMatch.isFavorite ? 'Remove Favorite' : 'Favorite'}</span>
                              <Heart
                                className={`w-3.5 h-3.5 ${
                                  offlineMatch.isFavorite ? 'fill-pink-500 text-pink-500' : ''
                                }`}
                              />
                            </button>
                          )}

                          {isOffline && offlineMatch && (
                            <button
                              onClick={() => {
                                setConfirmRemoveOfflineId(offlineMatch.id);
                                setActiveMenuSongId(null);
                              }}
                              className="w-full text-left px-3 py-2 rounded-xl text-amber-400 hover:bg-amber-500/10 transition"
                            >
                              Remove Offline Copy
                            </button>
                          )}

                          <button
                            onClick={() => {
                              setConfirmDeleteCloudSong(song);
                              setActiveMenuSongId(null);
                            }}
                            className="w-full text-left px-3 py-2 rounded-xl text-rose-400 hover:bg-rose-500/10 transition flex items-center gap-1.5"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete from Cloud</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 5. CONFIRM: REMOVE OFFLINE COPY MODAL */}
      {confirmRemoveOfflineId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-sm rounded-3xl bg-[#090d20] border border-amber-500/30 p-6 shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 mx-auto flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Remove Offline Copy?</h3>
              <p className="text-xs text-slate-400 mt-1.5">
                This will only remove the local downloaded file from this device to free storage space. The track remains safely stored in JTEC CLOUD and can be re-downloaded anytime.
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setConfirmRemoveOfflineId(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs font-bold text-slate-300 hover:text-white"
              >
                Keep Download
              </button>
              <button
                onClick={async () => {
                  const id = confirmRemoveOfflineId;
                  setConfirmRemoveOfflineId(null);
                  await onRemoveOfflineSong(id);
                }}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold shadow-lg"
              >
                Remove Copy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. CONFIRM: PERMANENT CLOUD DELETION MODAL */}
      {confirmDeleteCloudSong && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-sm rounded-3xl bg-[#090d20] border border-rose-500/30 p-6 shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 mx-auto flex items-center justify-center">
              <Trash2 className="w-6 h-6 text-rose-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Delete from JTEC CLOUD?</h3>
              <p className="text-xs text-slate-400 mt-1.5">
                Are you sure you want to delete <span className="text-white font-semibold">{confirmDeleteCloudSong.title}</span>? This will permanently delete the audio file from your Supabase storage bucket and database.
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setConfirmDeleteCloudSong(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs font-bold text-slate-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const song = confirmDeleteCloudSong;
                  setConfirmDeleteCloudSong(null);
                  await onDeleteCloudSong(song);
                }}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-600/30"
              >
                Delete Forever
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
