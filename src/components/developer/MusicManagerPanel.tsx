import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Music, Upload, Trash2, Edit2, RefreshCw, AlertCircle,
  CheckCircle2, Search, Image as ImageIcon, FileAudio,
  X, Check, HardDrive, Server
} from 'lucide-react';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  SupabaseService,
  CloudCategoryKey,
  CLOUD_CATEGORIES,
  sanitizeSecretText
} from '../../services/supabase';
import {
  MusicAdminError,
  ProjectStorageStatsResult,
  ServerProjectStatus,
  checkMusicAdminServerStatus,
  listProjectSongsAdmin,
  fetchAllStorageStatsAdmin,
  uploadSongAdmin,
  updateSongMetadataAdmin,
  replaceSongAudioAdmin,
  replaceSongCoverAdmin,
  deleteSongAdmin,
  getMaskedCategoryHost,
} from '../../services/musicAdminApi';
import {
  extractAudioMetadata,
  ExtractedMetadata
} from '../../services/id3Parser';
import {
  resizeImageToJpegDataUrl
} from '../../services/imageUtils';
import { CloudSong } from '../../types/music';

export { measureBucketStorageRecursive } from '../../services/musicAdminApi';

interface MusicManagerPanelProps {
  adminClient: SupabaseClient | null;
  onUnauthorized: () => void;
}

type ManagerTab = 'catalogue' | 'storage_monitor';

type ProjectStorageStats = ProjectStorageStatsResult & {
  isLoading: boolean;
};

export const MusicManagerPanel: React.FC<MusicManagerPanelProps> = ({ adminClient, onUnauthorized }) => {
  const [activeTab, setActiveTab] = useState<ManagerTab>('catalogue');
  const [activeCategory, setActiveCategory] = useState<CloudCategoryKey>('jtec_main');
  const [songs, setSongs] = useState<CloudSong[]>([]);
  const [isLoadingSongs, setIsLoadingSongs] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [storageAuditCount, setStorageAuditCount] = useState<number | null>(null);
  const [catalogSource, setCatalogSource] = useState<'server' | 'direct_admin' | 'direct_public' | null>(null);
  const [serverStatus, setServerStatus] = useState<{
    checked: boolean;
    available: boolean;
    projects: Partial<Record<CloudCategoryKey, ServerProjectStatus>>;
    message?: string;
  }>({
    checked: false,
    available: false,
    projects: {},
  });

  // Storage Monitor States
  const [storageStats, setStorageStats] = useState<Record<CloudCategoryKey, ProjectStorageStats>>({
    jtec_main: { categoryKey: 'jtec_main', projectName: 'JTEC Music', isConfigured: false, musicFilesCount: 0, musicBytes: 0, artworkFilesCount: 0, artworkBytes: 0, totalBytes: 0, recentUploads: [], isLoading: false },
    nasheed: { categoryKey: 'nasheed', projectName: 'JTEC Nasheed', isConfigured: false, musicFilesCount: 0, musicBytes: 0, artworkFilesCount: 0, artworkBytes: 0, totalBytes: 0, recentUploads: [], isLoading: false },
    love_chill: { categoryKey: 'love_chill', projectName: 'Love & Chill', isConfigured: false, musicFilesCount: 0, musicBytes: 0, artworkFilesCount: 0, artworkBytes: 0, totalBytes: 0, recentUploads: [], isLoading: false },
  });
  const [storageSourceMode, setStorageSourceMode] = useState<'server' | 'direct_fallback' | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [isRefreshingStorage, setIsRefreshingStorage] = useState(false);

  // Upload Modal State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [audioFileToUpload, setAudioFileToUpload] = useState<File | null>(null);
  const [coverFileToUpload, setCoverFileToUpload] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadArtist, setUploadArtist] = useState('');
  const [uploadAlbum, setUploadAlbum] = useState('');
  const [uploadGenre, setUploadGenre] = useState('');
  const [uploadDuration, setUploadDuration] = useState(0);
  const [previewCoverUrl, setPreviewCoverUrl] = useState<string>('');
  const [isAnalyzingAudio, setIsAnalyzingAudio] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState('');

  // Edit Metadata Modal State
  const [editingSong, setEditingSong] = useState<CloudSong | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editArtist, setEditArtist] = useState('');
  const [editAlbum, setEditAlbum] = useState('');
  const [editGenre, setEditGenre] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Delete Confirmation State
  const [songToDelete, setSongToDelete] = useState<CloudSong | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Replace Audio / Cover States
  const [replacingSongAudio, setReplacingSongAudio] = useState<CloudSong | null>(null);
  const [replacingSongCover, setReplacingSongCover] = useState<CloudSong | null>(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);

  const audioFileInputRef = useRef<HTMLInputElement>(null);
  const coverFileInputRef = useRef<HTMLInputElement>(null);
  const replaceAudioInputRef = useRef<HTMLInputElement>(null);
  const replaceCoverInputRef = useRef<HTMLInputElement>(null);

  const categoryConfig = SupabaseService.getCategoryConfig(activeCategory);
  const activeMeta = CLOUD_CATEGORIES.find((c) => c.key === activeCategory);

  const handleMusicAdminFailure = useCallback((err: unknown, fallbackMessage: string) => {
    if (err instanceof MusicAdminError && err.code === 'unauthorized') {
      onUnauthorized();
    }
    setErrorMsg(sanitizeSecretText(err instanceof Error ? err.message : fallbackMessage));
  }, [onUnauthorized]);

  // Check Edge Function readiness once per portal mount without wiping session if undeployed
  useEffect(() => {
    let cancelled = false;
    checkMusicAdminServerStatus(adminClient)
      .then((res) => {
        if (!cancelled) {
          setServerStatus({
            checked: true,
            available: res.available,
            projects: res.projects,
            message: res.message,
          });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          if (err instanceof MusicAdminError && err.code === 'unauthorized') {
            onUnauthorized();
          } else {
            setServerStatus({ checked: true, available: false, projects: {} });
          }
        }
      });
    return () => {
      cancelled = true;
    };
  }, [adminClient, onUnauthorized]);

  const loadCatalogSongs = useCallback(async () => {
    setIsLoadingSongs(true);
    setErrorMsg(null);
    try {
      const result = await listProjectSongsAdmin(adminClient, activeCategory);
      setSongs(result.songs);
      setStorageAuditCount(result.storageAudioCount);
      setCatalogSource(result.source);
    } catch (err: unknown) {
      setStorageAuditCount(null);
      setCatalogSource(null);
      handleMusicAdminFailure(err, `Failed to load ${activeMeta?.title || activeCategory} tracks.`);
      setSongs([]);
    } finally {
      setIsLoadingSongs(false);
    }
  }, [adminClient, activeCategory, activeMeta, handleMusicAdminFailure]);

  useEffect(() => {
    loadCatalogSongs();
  }, [loadCatalogSongs]);

  // Load storage statistics for all 3 projects independently with recursive measurement & error reporting
  const loadAllStorageStats = useCallback(async () => {
    setIsRefreshingStorage(true);
    setStorageWarning(null);
    setStorageStats((prev) => ({
      jtec_main: { ...prev.jtec_main, isLoading: true, error: undefined },
      nasheed: { ...prev.nasheed, isLoading: true, error: undefined },
      love_chill: { ...prev.love_chill, isLoading: true, error: undefined },
    }));

    try {
      const res = await fetchAllStorageStatsAdmin(adminClient);
      setStorageSourceMode(res.source);
      setStorageWarning(res.warning || null);
      setStorageStats({
        jtec_main: { ...res.stats.jtec_main, isLoading: false },
        nasheed: { ...res.stats.nasheed, isLoading: false },
        love_chill: { ...res.stats.love_chill, isLoading: false },
      });
    } catch (err: unknown) {
      handleMusicAdminFailure(err, 'Failed to measure storage statistics.');
      setStorageStats((prev) => ({
        jtec_main: { ...prev.jtec_main, isLoading: false },
        nasheed: { ...prev.nasheed, isLoading: false },
        love_chill: { ...prev.love_chill, isLoading: false },
      }));
    } finally {
      setIsRefreshingStorage(false);
    }
  }, [adminClient, handleMusicAdminFailure]);

  useEffect(() => {
    if (activeTab === 'storage_monitor') {
      loadAllStorageStats();
    }
  }, [activeTab, loadAllStorageStats]);

  // Handle Audio File Selection & ID3 Extraction for Upload
  const handleAudioFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAudioFileToUpload(file);
    setIsAnalyzingAudio(true);
    setErrorMsg(null);

    try {
      const meta: ExtractedMetadata = await extractAudioMetadata(file);
      setUploadTitle(meta.title || file.name.replace(/\.[^/.]+$/, ''));
      setUploadArtist(meta.artist || 'Unknown Artist');
      setUploadAlbum(meta.album || 'Single');
      setUploadDuration(meta.duration || 0);
      setUploadGenre(activeCategory === 'nasheed' ? 'Nasheed' : activeCategory === 'love_chill' ? 'Chill' : 'Super Bass');
      if (meta.artworkUrl) {
        setPreviewCoverUrl(meta.artworkUrl);
      }
    } catch (err: any) {
      setErrorMsg('Could not parse audio metadata. You can enter details manually.');
      setUploadTitle(file.name.replace(/\.[^/.]+$/, ''));
      setUploadArtist('Unknown Artist');
      setUploadAlbum('Single');
      setUploadDuration(0);
    } finally {
      setIsAnalyzingAudio(false);
    }
  };

  // Handle Cover Image Selection for Upload
  const handleCoverFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverFileToUpload(file);
    try {
      const dataUrl = await resizeImageToJpegDataUrl(file, 512, 0.85);
      setPreviewCoverUrl(dataUrl);
    } catch (err) {
      setErrorMsg('Could not process cover image.');
    }
  };

  // Execute Upload using verified JTEC Main AAL2 session & server-side gateway (or direct jtec_main AAL2)
  const handleExecuteUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!audioFileToUpload || !uploadTitle.trim()) {
      setErrorMsg('Please select an audio file and enter a song title.');
      return;
    }

    setIsUploading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    setUploadProgressText('Verifying owner AAL2 session...');

    try {
      await uploadSongAdmin(
        adminClient,
        activeCategory,
        {
          audioFile: audioFileToUpload,
          coverFile: coverFileToUpload,
          previewCoverDataUrl: previewCoverUrl,
          title: uploadTitle.trim(),
          artist: uploadArtist.trim() || 'Unknown Artist',
          album: uploadAlbum.trim() || 'Single',
          genre: uploadGenre.trim() || 'Music',
          duration: uploadDuration || 0,
        },
        (progressText) => setUploadProgressText(progressText)
      );

      setSuccessMsg(`Successfully uploaded "${uploadTitle}" to ${activeMeta?.title || activeCategory}!`);
      setShowUploadModal(false);
      setAudioFileToUpload(null);
      setCoverFileToUpload(null);
      setUploadTitle('');
      setUploadArtist('');
      setUploadAlbum('');
      setPreviewCoverUrl('');
      loadCatalogSongs();
    } catch (err: unknown) {
      handleMusicAdminFailure(err, 'Upload failed.');
    } finally {
      setIsUploading(false);
      setUploadProgressText('');
    }
  };

  // Save Edit Metadata using verified JTEC Main AAL2 session
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSong || !editTitle.trim()) return;

    setIsSavingEdit(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await updateSongMetadataAdmin(adminClient, activeCategory, editingSong.id, {
        title: editTitle.trim(),
        artist: editArtist.trim() || 'Unknown Artist',
        album: editAlbum.trim() || 'Single',
        genre: editGenre.trim() || 'Music',
      });

      setSuccessMsg(`Successfully updated metadata for "${editTitle}".`);
      setEditingSong(null);
      loadCatalogSongs();
    } catch (err: unknown) {
      handleMusicAdminFailure(err, 'Failed to update song metadata.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Replace Audio File for Existing Song using verified JTEC Main AAL2 session
  const handleReplaceAudioFile = async (song: CloudSong, file: File) => {
    setIsProcessingFile(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const meta = await extractAudioMetadata(file);
      await replaceSongAudioAdmin(adminClient, activeCategory, song, file, meta.duration || song.duration);
      setSuccessMsg(`Successfully replaced audio file for "${song.title}".`);
      loadCatalogSongs();
    } catch (err: unknown) {
      handleMusicAdminFailure(err, 'Failed to replace audio file.');
    } finally {
      setIsProcessingFile(false);
      setReplacingSongAudio(null);
    }
  };

  // Replace Cover Image for Existing Song using verified JTEC Main AAL2 session
  const handleReplaceCoverImage = async (song: CloudSong, file: File) => {
    setIsProcessingFile(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const jpegDataUrl = await resizeImageToJpegDataUrl(file, 512, 0.85);
      await replaceSongCoverAdmin(adminClient, activeCategory, song, jpegDataUrl);
      setSuccessMsg(`Successfully updated cover artwork for "${song.title}".`);
      loadCatalogSongs();
    } catch (err: unknown) {
      handleMusicAdminFailure(err, 'Failed to update cover image.');
    } finally {
      setIsProcessingFile(false);
      setReplacingSongCover(null);
    }
  };

  // Delete Song & Associated Storage Files using verified JTEC Main AAL2 session
  const handleConfirmDelete = async () => {
    if (!songToDelete) return;
    setIsDeleting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await deleteSongAdmin(adminClient, activeCategory, songToDelete);
      setSuccessMsg(`Successfully deleted "${songToDelete.title}".`);
      setSongToDelete(null);
      loadCatalogSongs();
    } catch (err: unknown) {
      handleMusicAdminFailure(err, 'Failed to delete song.');
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredSongs = songs.filter((s) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      s.title.toLowerCase().includes(q) ||
      s.artist.toLowerCase().includes(q) ||
      s.genre.toLowerCase().includes(q) ||
      s.album.toLowerCase().includes(q)
    );
  });

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    if (mb < 1024) return `${mb.toFixed(2)} MB`;
    return `${(mb / 1024).toFixed(2)} GB`;
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-2 sm:px-4">
      {/* Top Header & Navigation Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/90 p-4 sm:p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
              Verified Owner AAL2 (TOTP)
            </span>
            <span className="text-xs text-slate-400 font-mono">
              Host: {getMaskedCategoryHost(activeCategory)}
            </span>
            {catalogSource && (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                {catalogSource === 'server'
                  ? 'Server Authorized'
                  : catalogSource === 'direct_admin'
                  ? 'Direct AAL2 Session'
                  : 'Public Read'}
              </span>
            )}
          </div>
          <h3 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <Music className="w-6 h-6 text-cyan-400 shrink-0" />
            <span>JTEC Unified Music Manager &amp; Storage</span>
          </h3>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Manage catalogues and monitor storage independently across isolated projects. JTEC Party is protected.
          </p>
        </div>

        {/* Two Main Navigation Tabs */}
        <div className="flex items-center gap-2 p-1.5 rounded-xl bg-slate-950 border border-slate-800 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('catalogue')}
            className={`min-h-[40px] px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'catalogue'
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Music className="w-4 h-4 shrink-0" />
            <span>Music Manager</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('storage_monitor')}
            className={`min-h-[40px] px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'storage_monitor'
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-900'
            }`}
          >
            <HardDrive className="w-4 h-4 shrink-0" />
            <span>Storage Monitor</span>
          </button>
        </div>
      </div>

      {/* Cross-project server gateway notice for Nasheed / Love & Chill when Edge Function is not yet deployed */}
      {serverStatus.checked && activeCategory !== 'jtec_main' && (!serverStatus.available || serverStatus.projects[activeCategory]?.configured === false) && (
        <div className="p-4 rounded-xl bg-amber-950/50 border border-amber-500/35 text-xs text-amber-200 flex items-start gap-3">
          <Server className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">
              {!serverStatus.available
                ? `Server gateway (music-admin Edge Function) is not deployed on jtec_main yet`
                : `Server credentials for ${activeMeta?.title || activeCategory} are not set on music-admin`}
            </p>
            <p className="text-amber-200/80 leading-relaxed">
              Your JTEC Main owner session stays active without re-login. Deploy <code className="font-mono text-amber-100">supabase/functions/music-admin</code> on <code className="font-mono text-amber-100">jtec_main</code> with server-only credentials to upload, edit, replace, or delete tracks in {activeMeta?.title || activeCategory}.
            </p>
          </div>
        </div>
      )}

      {/* Read-only Storage vs Catalogue diagnostic if storage has files missing from songs table */}
      {!isLoadingSongs && storageAuditCount !== null && storageAuditCount > songs.length && (
        <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-500/35 text-xs text-amber-200 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">
              Catalogue mismatch detected: {storageAuditCount} file(s) in the music bucket vs {songs.length} row(s) in {categoryConfig.tableName || 'songs'}.
            </p>
            <p className="text-amber-200/80 leading-relaxed">
              Existing storage files are preserved. If previously uploaded songs are missing from the list, verify <code className="font-mono text-amber-100">public.songs</code> rows and public SELECT RLS policies on this project.
            </p>
          </div>
        </div>
      )}

      {/* Notifications */}
      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-500/35 text-xs sm:text-sm text-emerald-200 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="flex-1">{successMsg}</span>
          <button type="button" onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-950/60 border border-rose-500/35 text-xs sm:text-sm text-rose-200 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          <span className="flex-1">{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* =========================================================================
          TAB 1: MUSIC MANAGER CATALOGUES
         ========================================================================= */}
      {activeTab === 'catalogue' && (
        <div className="space-y-6">
          {/* Category Switcher & Upload Action Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900/60 p-4 sm:p-5 rounded-2xl border border-slate-800">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 flex-1">
              {CLOUD_CATEGORIES.map((cat) => {
                const isActive = activeCategory === cat.key;
                const cfg = SupabaseService.getCategoryConfig(cat.key);

                return (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => setActiveCategory(cat.key)}
                    className={`p-3.5 rounded-xl border text-left transition cursor-pointer flex items-center justify-between gap-3 ${
                      isActive
                        ? 'bg-slate-900 border-cyan-400/80 shadow-md shadow-cyan-500/10'
                        : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold text-cyan-300 block uppercase tracking-wider">{cat.badge}</span>
                      <h4 className="text-sm font-bold text-white truncate mt-0.5">{cat.title}</h4>
                    </div>
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.isConfigured ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowUploadModal(true);
                  setAudioFileToUpload(null);
                  setCoverFileToUpload(null);
                  setUploadTitle('');
                  setUploadArtist('');
                  setUploadAlbum('');
                  setPreviewCoverUrl('');
                }}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs sm:text-sm flex items-center gap-2 transition cursor-pointer shadow-lg shadow-cyan-500/20 whitespace-nowrap"
              >
                <Upload className="w-4 h-4 shrink-0" />
                <span>Upload New Song</span>
              </button>

              <button
                type="button"
                onClick={loadCatalogSongs}
                disabled={isLoadingSongs}
                className="min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-200 text-xs sm:text-sm font-semibold flex items-center gap-2 border border-slate-800 transition cursor-pointer"
                title="Refresh tracks"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingSongs ? 'animate-spin text-cyan-400' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>
          </div>

          {/* Song Search Bar */}
          <div className="flex items-center gap-3 bg-slate-900/80 p-3.5 rounded-xl border border-slate-800">
            <Search className="w-4 h-4 text-slate-400 ml-2 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${activeMeta?.title || activeCategory} tracks by title, artist, or genre...`}
              className="w-full bg-transparent text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none"
            />
            <span className="text-xs text-slate-400 whitespace-nowrap px-2 font-mono">
              {filteredSongs.length} {filteredSongs.length === 1 ? 'song' : 'songs'}
            </span>
          </div>

          {/* Songs Grid */}
          {isLoadingSongs ? (
            <div className="p-16 text-center text-xs sm:text-sm text-slate-400 bg-slate-900/40 rounded-2xl border border-slate-800 flex flex-col items-center justify-center gap-3">
              <RefreshCw className="w-7 h-7 animate-spin text-cyan-400" />
              <span>Loading catalogue songs from Supabase...</span>
            </div>
          ) : errorMsg && songs.length === 0 ? (
            <div className="p-12 text-center text-xs sm:text-sm text-rose-200 bg-rose-950/25 rounded-2xl border border-rose-500/30 space-y-3">
              <AlertCircle className="w-10 h-10 text-rose-400 mx-auto" />
              <p className="text-base font-bold text-white">Could Not Load {activeMeta?.title || activeCategory} Catalogue</p>
              <p className="text-xs text-rose-200/85 max-w-md mx-auto">{errorMsg}</p>
              <button
                type="button"
                onClick={loadCatalogSongs}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs inline-flex items-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Loading</span>
              </button>
            </div>
          ) : filteredSongs.length === 0 ? (
            <div className="p-16 text-center text-xs sm:text-sm text-slate-400 bg-slate-900/40 rounded-2xl border border-slate-800 space-y-3">
              <Music className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="text-base font-bold text-white">No tracks found in {activeMeta?.title || activeCategory}</p>
              <p className="text-xs text-slate-400 max-w-md mx-auto">Click &quot;Upload New Song&quot; above to add music tracks and cover artwork to this isolated project catalogue.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredSongs.map((song) => (
                <div
                  key={song.id}
                  className="p-4 sm:p-5 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-cyan-500/40 transition flex flex-col justify-between gap-4 group shadow-lg"
                >
                  <div className="flex items-start gap-4">
                    <img
                      src={song.cover_url || './images/cloud/jtec_main.jpg'}
                      alt={song.title}
                      className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl object-cover border border-slate-800 shrink-0 bg-slate-950 shadow-inner"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = './images/cloud/jtec_main.jpg';
                      }}
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-cyan-300 uppercase tracking-wider">
                        {song.genre || 'Music'}
                      </span>
                      <h4 className="text-sm sm:text-base font-bold text-white truncate" title={song.title}>
                        {song.title}
                      </h4>
                      <p className="text-xs sm:text-sm text-slate-300 truncate" title={song.artist}>
                        {song.artist}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate" title={song.album}>
                        {song.album || 'Single'}
                      </p>
                    </div>
                  </div>

                  {/* Track Details & File Info */}
                  <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-800 text-xs text-slate-400 font-mono">
                    <div>
                      <span>Duration: </span>
                      <strong className="text-slate-200">
                        {Math.floor(song.duration / 60)}:{Math.floor(song.duration % 60).toString().padStart(2, '0')}
                      </strong>
                    </div>
                    <div className="text-right truncate">
                      <span>Size: </span>
                      <strong className="text-slate-200">
                        {song.file_size ? `${(song.file_size / (1024 * 1024)).toFixed(1)} MB` : 'N/A'}
                      </strong>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="grid grid-cols-4 gap-1.5 pt-3 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingSong(song);
                        setEditTitle(song.title);
                        setEditArtist(song.artist);
                        setEditAlbum(song.album || '');
                        setEditGenre(song.genre || '');
                      }}
                      className="min-h-[38px] px-2 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-200 hover:text-cyan-300 text-xs font-semibold flex items-center justify-center gap-1 transition cursor-pointer border border-slate-800"
                      title="Edit Metadata"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Edit</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setReplacingSongAudio(song);
                        if (replaceAudioInputRef.current) replaceAudioInputRef.current.click();
                      }}
                      disabled={isProcessingFile}
                      className="min-h-[38px] px-2 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-200 hover:text-cyan-300 text-xs font-semibold flex items-center justify-center gap-1 transition cursor-pointer border border-slate-800"
                      title="Replace Audio File"
                    >
                      <FileAudio className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Audio</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setReplacingSongCover(song);
                        if (replaceCoverInputRef.current) replaceCoverInputRef.current.click();
                      }}
                      disabled={isProcessingFile}
                      className="min-h-[38px] px-2 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-200 hover:text-cyan-300 text-xs font-semibold flex items-center justify-center gap-1 transition cursor-pointer border border-slate-800"
                      title="Replace Cover Image"
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Cover</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSongToDelete(song)}
                      className="min-h-[38px] px-2 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 flex items-center justify-center transition cursor-pointer border border-rose-500/20"
                      title="Delete Song"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 2: STORAGE MONITOR
         ========================================================================= */}
      {activeTab === 'storage_monitor' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/80 p-4 sm:p-6 rounded-2xl border border-slate-800">
            <div>
              <h4 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-cyan-400" />
                <span>Independent Supabase Storage Monitor</span>
                {storageSourceMode && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    {storageSourceMode === 'server' ? 'Server Verified' : 'Direct Client'}
                  </span>
                )}
              </h4>
              <p className="text-xs text-slate-400 mt-1">
                Real-time measured storage consumption, complete recursive pagination across all folders, file counts, and breakdown across all three isolated music projects.
              </p>
              {storageWarning && (
                <p className="text-[11px] text-amber-300 mt-1.5">
                  {storageWarning}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={loadAllStorageStats}
              disabled={isRefreshingStorage}
              className="min-h-[42px] px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50 whitespace-nowrap shadow-lg shadow-cyan-500/20"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshingStorage ? 'animate-spin' : ''}`} />
              <span>{isRefreshingStorage ? 'Scanning Storage...' : 'Refresh Storage Stats'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {(['jtec_main', 'nasheed', 'love_chill'] as CloudCategoryKey[]).map((catKey) => {
              const stats = storageStats[catKey];
              const meta = CLOUD_CATEGORIES.find((c) => c.key === catKey);

              return (
                <div
                  key={catKey}
                  className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 sm:p-6 space-y-5 shadow-xl flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: meta?.themeColor || '#00f0ff' }} />
                        <h5 className="text-base font-bold text-white">{stats.projectName}</h5>
                      </div>
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border uppercase tracking-wider ${
                        !stats.isConfigured ? 'bg-amber-500/15 text-amber-300 border-amber-500/35' : stats.error ? 'bg-rose-500/15 text-rose-300 border-rose-500/35' : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                      }`}>
                        {!stats.isConfigured ? 'Unconfigured' : stats.error ? 'Failed' : 'Successful'}
                      </span>
                    </div>

                    {stats.isLoading ? (
                      <div className="p-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                        <span>Measuring storage across all folders...</span>
                      </div>
                    ) : stats.error ? (
                      <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/35 text-xs text-rose-200 space-y-1">
                        <p className="font-bold">Storage Error:</p>
                        <p>{stats.error}</p>
                      </div>
                    ) : !stats.isConfigured ? (
                      <div className="p-6 text-center text-xs text-slate-400">
                        Project environment variables are not configured.
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Total Storage Used */}
                        <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
                          <span className="text-xs text-slate-400 font-medium block">Total Measured Storage</span>
                          <div className="text-2xl font-black text-white font-mono tracking-tight">
                            {formatBytes(stats.totalBytes)}
                          </div>
                          <span className="text-[11px] text-cyan-300 block">
                            {stats.musicFilesCount + stats.artworkFilesCount} total files indexed
                          </span>
                        </div>

                        {/* Breakdown per bucket */}
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1">
                            <span className="text-[11px] text-slate-400 block">Music Bucket ({stats.musicFilesCount} files)</span>
                            <span className="font-mono text-sm font-bold text-slate-200 block">{formatBytes(stats.musicBytes)}</span>
                          </div>
                          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1">
                            <span className="text-[11px] text-slate-400 block">Artwork Bucket ({stats.artworkFilesCount} files)</span>
                            <span className="font-mono text-sm font-bold text-slate-200 block">{formatBytes(stats.artworkBytes)}</span>
                          </div>
                        </div>

                        {/* Recent Upload Activity */}
                        <div className="space-y-2 pt-2 border-t border-slate-800">
                          <span className="text-xs font-bold text-slate-300 block">Recent Upload Activity</span>
                          {stats.recentUploads.length === 0 ? (
                            <p className="text-xs text-slate-500 italic">No upload activity recorded yet.</p>
                          ) : (
                            <div className="space-y-2">
                              {stats.recentUploads.map((up, idx) => (
                                <div key={idx} className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-950/50 border border-slate-800">
                                  <div className="min-w-0 pr-2">
                                    <p className="text-white font-medium truncate">{up.title}</p>
                                    <p className="text-[11px] text-slate-400 truncate">{up.artist} · {up.date}</p>
                                  </div>
                                  <span className="font-mono text-[11px] text-cyan-300 shrink-0">{formatBytes(up.size)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Hidden file inputs for replacing audio or cover */}
      <input
        type="file"
        ref={replaceAudioInputRef}
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && replacingSongAudio) {
            handleReplaceAudioFile(replacingSongAudio, file);
          }
          e.target.value = '';
        }}
      />
      <input
        type="file"
        ref={replaceCoverInputRef}
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && replacingSongCover) {
            handleReplaceCoverImage(replacingSongCover, file);
          }
          e.target.value = '';
        }}
      />

      {/* UPLOAD MODAL */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl p-6 space-y-6 shadow-2xl my-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <Upload className="w-5 h-5 text-cyan-400" />
                <span>Upload to {activeMeta?.title || activeCategory}</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleExecuteUpload} className="space-y-4">
              {/* Audio File Picker */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 block">Audio File (MP3, FLAC, WAV, AAC)</label>
                <div 
                  onClick={() => audioFileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-700 hover:border-cyan-400 p-4 sm:p-5 rounded-xl text-center cursor-pointer bg-slate-950/50 transition space-y-1.5"
                >
                  <FileAudio className="w-8 h-8 text-cyan-400 mx-auto" />
                  <p className="text-xs sm:text-sm font-semibold text-white">
                    {audioFileToUpload ? audioFileToUpload.name : 'Click to select audio file'}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {isAnalyzingAudio ? 'Extracting ID3 tags and duration...' : 'ID3 metadata & cover art auto-extracted'}
                  </p>
                </div>
                <input
                  type="file"
                  ref={audioFileInputRef}
                  accept="audio/*"
                  className="hidden"
                  onChange={handleAudioFileSelected}
                />
              </div>

              {/* Song Metadata Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Song Title *</label>
                  <input
                    type="text"
                    required
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    placeholder="Song title"
                    className="w-full min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs sm:text-sm focus:border-cyan-400 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Artist *</label>
                  <input
                    type="text"
                    required
                    value={uploadArtist}
                    onChange={(e) => setUploadArtist(e.target.value)}
                    placeholder="Artist name"
                    className="w-full min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs sm:text-sm focus:border-cyan-400 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Album</label>
                  <input
                    type="text"
                    value={uploadAlbum}
                    onChange={(e) => setUploadAlbum(e.target.value)}
                    placeholder="Album name"
                    className="w-full min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs sm:text-sm focus:border-cyan-400 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Genre</label>
                  <input
                    type="text"
                    value={uploadGenre}
                    onChange={(e) => setUploadGenre(e.target.value)}
                    placeholder="Genre"
                    className="w-full min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs sm:text-sm focus:border-cyan-400 focus:outline-none"
                  />
                </div>
              </div>

              {/* Cover Artwork Section */}
              <div className="space-y-2 pt-1">
                <label className="text-xs font-semibold text-slate-300 block">Cover Artwork (Embedded or Custom)</label>
                <div className="flex items-center gap-4">
                  <img
                    src={previewCoverUrl || './images/cloud/jtec_main.jpg'}
                    alt="Cover Preview"
                    className="w-16 h-16 rounded-xl object-cover border border-slate-700 bg-slate-950 shrink-0"
                  />
                  <div className="flex-1 space-y-2">
                    <button
                      type="button"
                      onClick={() => coverFileInputRef.current?.click()}
                      className="min-h-[38px] px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span>Choose Custom Cover Image</span>
                    </button>
                    <p className="text-[11px] text-slate-400">
                      {previewCoverUrl.startsWith('data:image/svg+xml') ? 'Using procedural neon artwork (or extracted ID3 cover).' : 'Cover ready.'}
                    </p>
                  </div>
                </div>
                <input
                  type="file"
                  ref={coverFileInputRef}
                  accept="image/*"
                  className="hidden"
                  onChange={handleCoverFileSelected}
                />
              </div>

              {/* Upload Progress & Action */}
              <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isUploading || !audioFileToUpload || !uploadTitle.trim()}
                  className="min-h-[40px] px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition cursor-pointer flex items-center gap-2 disabled:opacity-50"
                >
                  {isUploading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>{uploadProgressText || 'Uploading...'}</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>Upload &amp; Save Song</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT METADATA MODAL */}
      {editingSong && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-cyan-400" />
                <span>Edit Song Metadata</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingSong(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Title</label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Artist</label>
                <input
                  type="text"
                  required
                  value={editArtist}
                  onChange={(e) => setEditArtist(e.target.value)}
                  className="w-full min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Album</label>
                <input
                  type="text"
                  value={editAlbum}
                  onChange={(e) => setEditAlbum(e.target.value)}
                  className="w-full min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Genre</label>
                <input
                  type="text"
                  value={editGenre}
                  onChange={(e) => setEditGenre(e.target.value)}
                  className="w-full min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingSong(null)}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="min-h-[40px] px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-2 disabled:opacity-50"
                >
                  {isSavingEdit ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {songToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-500/30 rounded-2xl w-full max-w-md p-6 space-y-6 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertCircle className="w-6 h-6 shrink-0" />
              <h3 className="text-lg font-bold text-white">Delete Song &amp; Files</h3>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Are you sure you want to delete <strong className="text-white">&quot;{songToDelete.title}&quot;</strong> by <strong className="text-white">{songToDelete.artist}</strong>? This will permanently remove the database row and its storage files from the <span className="font-mono text-cyan-300">{activeCategory}</span> project.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSongToDelete(null)}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="min-h-[40px] px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-2 disabled:opacity-50"
              >
                {isDeleting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span>Delete Permanently</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
