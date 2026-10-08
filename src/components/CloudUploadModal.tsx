import React, { useState, useRef } from 'react';
import { 
  X, Upload, Music, AlertTriangle, CheckCircle2, RefreshCw, 
  FileAudio, Play, AlertCircle, Settings, Copy, Check, HardDrive
} from 'lucide-react';
import { extractAudioMetadata } from '../services/id3Parser';
import { 
  SupabaseService, computeFileHash, formatBytes, getAudioMimeType, 
  SUPABASE_STORAGE_FIX_SQL, SUPABASE_STORAGE_SIZE_FIX_SQL 
} from '../services/supabase';
import { CloudSong, Song } from '../types/music';
import { StorageService } from '../services/storage';

interface CloudUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: (newSongs: CloudSong[]) => void;
  onOpenSettings?: () => void;
  onPlayCloudSong?: (song: CloudSong) => void;
  onSongSavedLocally?: (song: Song) => void;
}

interface QueuedUploadItem {
  id: string;
  file: File;
  fileHash: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  duration: number;
  artworkUrl?: string;
  artworkBlob?: Blob;
  isDuplicate: boolean;
  duplicateMatch?: CloudSong | null;
  forceUpload: boolean;
  uploadStatus: 'pending' | 'uploading' | 'completed' | 'error' | 'skipped';
  progress: number;
  errorMessage?: string;
  uploadedSong?: CloudSong;
}

export const CloudUploadModal: React.FC<CloudUploadModalProps> = ({
  isOpen,
  onClose,
  onUploadSuccess,
  onOpenSettings,
  onPlayCloudSong,
  onSongSavedLocally,
}) => {
  const [items, setItems] = useState<QueuedUploadItem[]>([]);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);
  const [copiedSizeSql, setCopiedSizeSql] = useState(false);
  const [showFixSnippet, setShowFixSnippet] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const supabaseConfig = SupabaseService.getConfig();

  if (!isOpen) return null;

  const getAudioDuration = (file: File): Promise<number> => {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const audio = new Audio();
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => {
        const dur = audio.duration || 0;
        URL.revokeObjectURL(url);
        resolve(Math.round(dur));
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(0);
      };
      audio.src = url;
    });
  };

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsProcessingFiles(true);
    setSuccessBanner(null);
    const newItems: QueuedUploadItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Validate supported audio file
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const isAudio = file.type.startsWith('audio/') || ['mp3', 'wav', 'm4a', 'mp4', 'aac', 'ogg', 'oga', 'flac', 'webm'].includes(ext);

      if (!isAudio) {
        console.warn('Skipping non-audio file:', file.name);
        continue;
      }

      try {
        const metadata = await extractAudioMetadata(file);
        let duration = metadata.duration || 0;
        if (!duration || duration === 0) {
          duration = await getAudioDuration(file);
        }

        const hash = await computeFileHash(file);
        const duplicateMatch = await SupabaseService.checkDuplicate(
          hash,
          file.name,
          metadata.title,
          metadata.artist,
          file.size
        );

        newItems.push({
          id: `item_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 7)}`,
          file,
          fileHash: hash,
          title: metadata.title || file.name.replace(/\.[^/.]+$/, ''),
          artist: metadata.artist || 'Unknown Artist',
          album: metadata.album || 'Single',
          genre: 'Music',
          duration,
          artworkUrl: metadata.artworkUrl,
          artworkBlob: metadata.artworkBlob,
          isDuplicate: Boolean(duplicateMatch),
          duplicateMatch,
          forceUpload: false,
          uploadStatus: 'pending',
          progress: 0,
        });
      } catch (err) {
        console.error('Metadata reading error for', file.name, err);
      }
    }

    setItems((prev) => [...prev, ...newItems]);
    setIsProcessingFiles(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const handleForceUpload = (id: string) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, forceUpload: true } : it))
    );
  };

  const handleStartUpload = async () => {
    if (items.length === 0 || isUploading) return;

    if (!supabaseConfig.isConfigured) {
      if (onOpenSettings) onOpenSettings();
      return;
    }

    setIsUploading(true);
    setSuccessBanner(null);
    const completedSongs: CloudSong[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.uploadStatus === 'completed') continue;

      if (item.isDuplicate && !item.forceUpload) {
        setItems((prev) =>
          prev.map((it) =>
            it.id === item.id ? { ...it, uploadStatus: 'skipped' } : it
          )
        );
        continue;
      }

      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id ? { ...it, uploadStatus: 'uploading', progress: 15, errorMessage: undefined } : it
        )
      );

      try {
        const uploadedSong = await SupabaseService.uploadMusicFile(
          item.file,
          {
            title: item.title,
            artist: item.artist,
            album: item.album,
            genre: item.genre,
            duration: item.duration,
            artworkBlob: item.artworkBlob,
            artworkUrl: item.artworkUrl,
            fileHash: item.fileHash,
          },
          (percent) => {
            setItems((prev) =>
              prev.map((it) =>
                it.id === item.id ? { ...it, progress: percent } : it
              )
            );
          }
        );

        completedSongs.push(uploadedSong);

        // Cache locally in IndexedDB for immediate offline access
        try {
          const localSong: Song = {
            id: `cloud_${uploadedSong.id}`,
            title: uploadedSong.title,
            artist: uploadedSong.artist,
            album: uploadedSong.album,
            duration: uploadedSong.duration,
            genre: uploadedSong.genre,
            artworkUrl: uploadedSong.cover_url,
            format: (uploadedSong.file_name.split('.').pop() || 'mp3').toLowerCase(),
            size: uploadedSong.file_size,
            dateAdded: Date.now(),
            hasStoredBlob: true,
            cloudId: uploadedSong.id,
            isCloud: true,
            audioUrl: uploadedSong.audio_url,
            fileHash: uploadedSong.file_hash,
          };
          await StorageService.saveSong(localSong, item.file);
        } catch (storageErr) {
          console.warn('Could not cache uploaded song locally in IndexedDB', storageErr);
        }

        setItems((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? { ...it, uploadStatus: 'completed', progress: 100, uploadedSong }
              : it
          )
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Upload failed.';
        setItems((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? { ...it, uploadStatus: 'error', errorMessage: msg, progress: 0 }
              : it
          )
        );
      }
    }

    setIsUploading(false);
    if (completedSongs.length > 0) {
      setSuccessBanner(
        `Successfully uploaded ${completedSongs.length} track${completedSongs.length === 1 ? '' : 's'} to JTEC CLOUD!`
      );
      onUploadSuccess(completedSongs);
    }
  };

  const handleRetryItem = async (itemId: string) => {
    const item = items.find((it) => it.id === itemId);
    if (!item || isUploading) return;

    setItems((prev) =>
      prev.map((it) =>
        it.id === itemId ? { ...it, uploadStatus: 'uploading', progress: 15, errorMessage: undefined } : it
      )
    );

    try {
      const uploadedSong = await SupabaseService.uploadMusicFile(
        item.file,
        {
          title: item.title,
          artist: item.artist,
          album: item.album,
          genre: item.genre,
          duration: item.duration,
          artworkBlob: item.artworkBlob,
          artworkUrl: item.artworkUrl,
          fileHash: item.fileHash,
        },
        (percent) => {
          setItems((prev) =>
            prev.map((it) => (it.id === itemId ? { ...it, progress: percent } : it))
          );
        }
      );

      // Cache locally in IndexedDB
      try {
        const localSong: Song = {
          id: `cloud_${uploadedSong.id}`,
          title: uploadedSong.title,
          artist: uploadedSong.artist,
          album: uploadedSong.album,
          duration: uploadedSong.duration,
          genre: uploadedSong.genre,
          artworkUrl: uploadedSong.cover_url,
          format: (uploadedSong.file_name.split('.').pop() || 'mp3').toLowerCase(),
          size: uploadedSong.file_size,
          dateAdded: Date.now(),
          hasStoredBlob: true,
          cloudId: uploadedSong.id,
          isCloud: true,
          audioUrl: uploadedSong.audio_url,
          fileHash: uploadedSong.file_hash,
        };
        await StorageService.saveSong(localSong, item.file);
      } catch (storageErr) {
        console.warn('Could not cache uploaded song locally in IndexedDB', storageErr);
      }

      setItems((prev) =>
        prev.map((it) =>
          it.id === itemId ? { ...it, uploadStatus: 'completed', progress: 100, uploadedSong } : it
        )
      );

      setSuccessBanner(`Uploaded "${uploadedSong.title}" to JTEC CLOUD!`);
      onUploadSuccess([uploadedSong]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed.';
      setItems((prev) =>
        prev.map((it) =>
          it.id === itemId ? { ...it, uploadStatus: 'error', errorMessage: msg } : it
        )
      );
    }
  };

  const handleCopyStorageFixSql = () => {
    navigator.clipboard.writeText(SUPABASE_STORAGE_FIX_SQL);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 3000);
  };

  const handleCopySizeFixSql = () => {
    navigator.clipboard.writeText(SUPABASE_STORAGE_SIZE_FIX_SQL);
    setCopiedSizeSql(true);
    setTimeout(() => setCopiedSizeSql(false), 3000);
  };

  const handleSaveItemLocally = async (itemId: string) => {
    const item = items.find((it) => it.id === itemId);
    if (!item) return;

    try {
      const localSong: Song = {
        id: `local_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        title: item.title,
        artist: item.artist,
        album: item.album,
        duration: item.duration,
        genre: item.genre,
        artworkUrl: item.artworkUrl,
        format: (item.file.name.split('.').pop() || 'mp3').toLowerCase(),
        size: item.file.size,
        dateAdded: Date.now(),
        hasStoredBlob: true,
        isCloud: false,
        fileHash: item.fileHash,
      };

      await StorageService.saveSong(localSong, item.file);

      setItems((prev) =>
        prev.map((it) =>
          it.id === itemId
            ? {
                ...it,
                uploadStatus: 'completed',
                progress: 100,
                errorMessage: undefined,
              }
            : it
        )
      );

      setSuccessBanner(`Saved "${localSong.title}" directly to Local Library!`);
      if (onSongSavedLocally) {
        onSongSavedLocally(localSong);
      }
    } catch (err) {
      console.error('Failed to save song locally:', err);
    }
  };

  const handleSaveAllFailedLocally = async () => {
    const failedItems = items.filter((it) => it.uploadStatus === 'error');
    for (const item of failedItems) {
      await handleSaveItemLocally(item.id);
    }
  };

  const pendingCount = items.filter(
    (it) => (it.uploadStatus === 'pending' || it.uploadStatus === 'error') && (!it.isDuplicate || it.forceUpload)
  ).length;

  const completedCount = items.filter((it) => it.uploadStatus === 'completed').length;
  const failedCount = items.filter((it) => it.uploadStatus === 'error').length;
  const allCompleted = items.length > 0 && completedCount === items.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-xl rounded-3xl bg-[#090d20] border border-cyan-500/30 p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto custom-scrollbar">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-400 to-purple-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Upload className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                Upload to JTEC CLOUD
              </h2>
              <p className="text-xs text-slate-400">
                Supabase Storage (`music` bucket) & metadata database
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isUploading}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Warning if Supabase is not connected */}
        {!supabaseConfig.isConfigured && (
          <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-500/30 text-amber-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <p className="font-bold text-white">Supabase Connection Required</p>
                <p className="text-[11px] text-amber-300/90 mt-0.5">
                  Connect your project with your URL and public Anon Key to upload audio to Supabase.
                </p>
              </div>
            </div>
            {onOpenSettings && (
              <button
                onClick={() => {
                  onClose();
                  onOpenSettings();
                }}
                className="px-3 py-1.5 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold hover:bg-amber-500/30 transition text-xs shrink-0 flex items-center gap-1.5"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Connect</span>
              </button>
            )}
          </div>
        )}

        {/* Success Banner */}
        {successBanner && (
          <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2.5 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-semibold">{successBanner}</span>
          </div>
        )}

        {/* File Select Dropzone */}
        <div
          onClick={() => fileInputRef.current?.click()}
          className="p-6 rounded-2xl border-2 border-dashed border-cyan-500/30 hover:border-cyan-400 bg-black/30 hover:bg-black/50 text-center cursor-pointer transition space-y-2 group"
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".mp3,.wav,.m4a,.mp4,.aac,.ogg,.flac,.webm,audio/*"
            className="hidden"
            onChange={handleFilesSelected}
          />
          <div className="w-12 h-12 mx-auto rounded-full bg-cyan-500/10 text-cyan-400 flex items-center justify-center group-hover:scale-110 transition-transform">
            <FileAudio className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">
              {isProcessingFiles ? 'Reading audio metadata...' : 'Select Music Files to Upload'}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Supports MP3, WAV, M4A, MP4, AAC, OGG & FLAC (Multiple files supported)
            </p>
          </div>
        </div>

        {/* Upload Queue Section */}
        {items.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span className="font-bold">
                Upload Queue ({items.length} track{items.length === 1 ? '' : 's'})
              </span>
              <span className="text-slate-400 font-mono">
                {completedCount} completed
              </span>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-1">
              {items.map((item) => (
                <div
                  key={item.id}
                  className={`p-3.5 rounded-2xl border transition text-xs space-y-2 ${
                    item.uploadStatus === 'completed'
                      ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200'
                      : item.uploadStatus === 'error'
                      ? 'bg-rose-950/20 border-rose-500/30 text-rose-200'
                      : item.uploadStatus === 'skipped'
                      ? 'bg-slate-900/40 border-slate-700/40 text-slate-400'
                      : 'bg-slate-900/60 border-white/10 text-white'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center shrink-0 overflow-hidden border border-white/10">
                        {item.artworkUrl ? (
                          <img
                            src={item.artworkUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Music className="w-4 h-4 text-slate-400" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-bold truncate text-white">{item.title}</p>
                          {item.file.size > 48 * 1024 * 1024 && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[9px] font-mono border border-amber-500/30 shrink-0">
                              Large ({formatBytes(item.file.size)})
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 truncate">
                          {item.artist} • {formatBytes(item.file.size)} • {getAudioMimeType(item.file.name, item.file.type)}
                        </p>
                      </div>
                    </div>

                    {/* Status Badge & Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {item.uploadStatus === 'completed' && (
                        <div className="flex items-center gap-2">
                          <span className="flex items-center gap-1 text-emerald-400 font-semibold font-mono text-[11px]">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Uploaded</span>
                          </span>

                          {onPlayCloudSong && item.uploadedSong && (
                            <button
                              onClick={() => onPlayCloudSong(item.uploadedSong!)}
                              className="px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-bold text-[11px] flex items-center gap-1 transition"
                            >
                              <Play className="w-3 h-3 fill-current" />
                              <span>Play</span>
                            </button>
                          )}
                        </div>
                      )}

                      {item.uploadStatus === 'uploading' && (
                        <span className="flex items-center gap-1 text-cyan-400 font-mono text-[11px]">
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          <span>{item.progress}%</span>
                        </span>
                      )}

                      {item.uploadStatus === 'pending' && !item.isDuplicate && (
                        <span className="text-[11px] text-slate-400 font-mono">
                          Waiting...
                        </span>
                      )}

                      {item.uploadStatus === 'error' && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-rose-400">Failed</span>
                          <button
                            onClick={() => handleRetryItem(item.id)}
                            className="px-2 py-0.5 rounded-lg bg-rose-500/20 text-rose-300 text-[10px] hover:bg-rose-500/30 transition cursor-pointer"
                          >
                            Retry
                          </button>
                        </div>
                      )}

                      {/* Remove button if not uploading */}
                      {item.uploadStatus !== 'uploading' && item.uploadStatus !== 'completed' && (
                        <button
                          onClick={() => handleRemoveItem(item.id)}
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-white/5 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Progress bar during upload */}
                  {item.uploadStatus === 'uploading' && (
                    <div className="w-full h-1.5 rounded-full bg-slate-950 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-400 to-purple-500 transition-all duration-300"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  )}

                  {/* Duplicate warning & resolution */}
                  {item.isDuplicate && !item.forceUpload && item.uploadStatus !== 'completed' && (
                    <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-200 text-[11px] flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>Already in JTEC CLOUD.</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleRemoveItem(item.id)}
                          className="px-2 py-0.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleForceUpload(item.id)}
                          className="px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold hover:bg-amber-500/30"
                        >
                          Upload Anyway
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Real, exact error reason & Action Helpers */}
                  {item.errorMessage && (() => {
                    const errLower = item.errorMessage.toLowerCase();
                    const isSizeError = errLower.includes('size') || errLower.includes('entitytoolarge') || errLower.includes('413') || errLower.includes('too large');
                    const isRlsError = errLower.includes('storage rls policy') || errLower.includes('permission denied') || errLower.includes('row-level security') || errLower.includes('storage policy');

                    return (
                      <div className={`p-3 rounded-2xl border text-[11px] space-y-2.5 ${isSizeError ? 'bg-amber-950/40 border-amber-500/40 text-amber-200' : 'bg-rose-950/40 border-rose-500/40 text-rose-200'}`}>
                        <div className="flex items-start gap-2">
                          {isSizeError ? (
                            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                          )}
                          <div className="flex-1">
                            <p className="font-bold">{item.errorMessage}</p>
                            <p className="text-[10px] opacity-80 mt-0.5">
                              {isSizeError 
                                ? `HTTP 413 (EntityTooLarge). Audio file size is ${formatBytes(item.file.size)}. Supabase free tier caps individual files at 50MB.` 
                                : isRlsError 
                                ? 'HTTP 403 (AccessDenied). Supabase Storage rejected upload due to bucket RLS policy.' 
                                : 'Database or cloud storage operation failed.'}
                            </p>
                          </div>
                        </div>

                        {/* If Size Limit error: Offer prominent Save to Local Library & SQL fix */}
                        {isSizeError && (
                          <div className="p-3 rounded-xl bg-black/60 border border-amber-500/40 space-y-2.5 mt-1">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                              <div>
                                <p className="text-[11px] text-emerald-300 font-bold flex items-center gap-1.5">
                                  <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>Play Immediately: Save to Local Library</span>
                                </p>
                                <p className="text-[10px] text-slate-300 mt-0.5">
                                  Saves full audio ({formatBytes(item.file.size)}) directly to your browser's IndexedDB — no size limits, full visualizer support!
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleSaveItemLocally(item.id)}
                                className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-black font-black text-xs flex items-center justify-center gap-1.5 hover:brightness-110 transition shrink-0 cursor-pointer shadow-lg shadow-emerald-500/25 active:scale-95"
                              >
                                <HardDrive className="w-3.5 h-3.5" />
                                <span>Save to Local Library Now</span>
                              </button>
                            </div>

                            <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2">
                              <span className="text-[10px] text-slate-400 font-mono">
                                SQL to remove bucket limit:
                              </span>
                              <button
                                type="button"
                                onClick={handleCopySizeFixSql}
                                className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold flex items-center gap-1 hover:bg-amber-500/30 transition cursor-pointer"
                              >
                                {copiedSizeSql ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-400" />
                                    <span>Copied Size SQL!</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" />
                                    <span>Copy Size SQL Fix</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* If RLS policy error */}
                        {isRlsError && (
                          <div className="p-2.5 rounded-xl bg-black/60 border border-cyan-500/30 space-y-2 mt-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] text-cyan-300 font-mono">
                                💡 Fix Storage RLS in Supabase SQL Editor:
                              </span>
                              <button
                                type="button"
                                onClick={handleCopyStorageFixSql}
                                className="px-2 py-0.5 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[10px] font-bold flex items-center gap-1 hover:bg-cyan-500/30 transition cursor-pointer"
                              >
                                {copiedSql ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-400" />
                                    <span>Copied SQL!</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" />
                                    <span>Copy SQL Fix</span>
                                  </>
                                )}
                              </button>
                            </div>

                            <pre className="p-2 rounded-lg bg-slate-950/90 text-[9px] text-cyan-200/90 font-mono overflow-x-auto whitespace-pre">
{`-- Run in Supabase SQL Editor:
insert into storage.buckets (id, name, public, file_size_limit) values ('music', 'music', true, null) on conflict (id) do update set public = true, file_size_limit = null;
create policy "Public Upload music" on storage.objects for insert to public with check (bucket_id = 'music');
create policy "Public Update music" on storage.objects for update to public using (bucket_id = 'music');
create policy "Public Access music" on storage.objects for select to public using (bucket_id = 'music');`}
                            </pre>

                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-white/5">
                              <span className="text-[10px] text-slate-300">
                                Or save directly to your local library now:
                              </span>
                              <button
                                type="button"
                                onClick={() => handleSaveItemLocally(item.id)}
                                className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold flex items-center gap-1.5 hover:bg-emerald-500/30 transition shrink-0 cursor-pointer"
                              >
                                <HardDrive className="w-3 h-3" />
                                <span>Save to Local Library Instead</span>
                              </button>
                            </div>
                          </div>
                        )}

                        {/* General error fallback */}
                        {!isSizeError && !isRlsError && (
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-white/10">
                            <span className="text-[10px] text-slate-300">
                              Save directly to your local device library:
                            </span>
                            <button
                              type="button"
                              onClick={() => handleSaveItemLocally(item.id)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold flex items-center gap-1.5 hover:bg-emerald-500/30 transition shrink-0 cursor-pointer"
                            >
                              <HardDrive className="w-3 h-3" />
                              <span>Save to Local Library Instead</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-white/10">
          <button
            onClick={() => {
              setItems([]);
              setSuccessBanner(null);
            }}
            disabled={isUploading || items.length === 0}
            className="text-xs text-slate-400 hover:text-white transition disabled:opacity-40"
          >
            Clear All
          </button>

          <div className="flex items-center gap-2">
            {failedCount > 0 && (
              <button
                type="button"
                onClick={handleSaveAllFailedLocally}
                className="px-3 py-2 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold hover:bg-emerald-500/30 transition flex items-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-500/10"
              >
                <HardDrive className="w-3.5 h-3.5" />
                <span>Save Failed to Local ({failedCount})</span>
              </button>
            )}

            <button
              onClick={onClose}
              disabled={isUploading}
              className="px-4 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-slate-300 hover:text-white transition disabled:opacity-50 cursor-pointer"
            >
              {allCompleted ? 'Done' : 'Close'}
            </button>

            {!allCompleted && (
              <button
                onClick={handleStartUpload}
                disabled={isUploading || items.length === 0 || pendingCount === 0 || !supabaseConfig.isConfigured}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-400 to-purple-600 text-white font-bold text-xs shadow-lg shadow-cyan-500/25 hover:brightness-110 active:scale-95 transition disabled:opacity-50 flex items-center gap-2 cursor-pointer"
              >
                {isUploading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Uploading...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload {pendingCount > 0 ? `(${pendingCount})` : ''}</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
