import React, { useState, useRef } from 'react';
import { X, Upload, Music, AlertTriangle, CheckCircle2, RefreshCw, FileAudio, Tag, User, Disc, Radio } from 'lucide-react';
import { extractAudioMetadata } from '../services/id3Parser';
import { SupabaseService, computeFileHash, formatBytes } from '../services/supabase';
import { CloudSong } from '../types/music';

interface CloudUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: (newSongs: CloudSong[]) => void;
}

interface QueuedUploadItem {
  file: File;
  fileHash: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  duration: number;
  artworkUrl?: string;
  isDuplicate: boolean;
  duplicateMatch?: CloudSong | null;
  forceUpload: boolean;
  uploadStatus: 'pending' | 'uploading' | 'completed' | 'error' | 'skipped';
  progress: number;
  errorMessage?: string;
}

export const CloudUploadModal: React.FC<CloudUploadModalProps> = ({
  isOpen,
  onClose,
  onUploadSuccess,
}) => {
  const [items, setItems] = useState<QueuedUploadItem[]>([]);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsProcessingFiles(true);
    const newItems: QueuedUploadItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const metadata = await extractAudioMetadata(file);
        const hash = await computeFileHash(file);
        const duplicateMatch = await SupabaseService.checkDuplicate(
          hash,
          metadata.title,
          metadata.artist,
          file.size
        );

        newItems.push({
          file,
          fileHash: hash,
          title: metadata.title,
          artist: metadata.artist,
          album: metadata.album,
          genre: 'Music',
          duration: metadata.duration || 0,
          artworkUrl: metadata.artworkUrl,
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

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
    if (editingIndex === index) setEditingIndex(null);
  };

  const handleUpdateItem = (index: number, field: 'title' | 'artist' | 'album' | 'genre', val: string) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: val } : item))
    );
  };

  const handleStartUpload = async () => {
    if (items.length === 0 || isUploading) return;

    setIsUploading(true);
    const completedSongs: CloudSong[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.uploadStatus === 'completed') continue;

      if (item.isDuplicate && !item.forceUpload) {
        setItems((prev) =>
          prev.map((it, idx) =>
            idx === i ? { ...it, uploadStatus: 'skipped' } : it
          )
        );
        continue;
      }

      setItems((prev) =>
        prev.map((it, idx) =>
          idx === i ? { ...it, uploadStatus: 'uploading', progress: 5 } : it
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
            artworkUrl: item.artworkUrl,
            fileHash: item.fileHash,
          },
          (percent) => {
            setItems((prev) =>
              prev.map((it, idx) =>
                idx === i ? { ...it, progress: percent } : it
              )
            );
          }
        );

        completedSongs.push(uploadedSong);

        setItems((prev) =>
          prev.map((it, idx) =>
            idx === i
              ? { ...it, uploadStatus: 'completed', progress: 100 }
              : it
          )
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Upload failed';
        setItems((prev) =>
          prev.map((it, idx) =>
            idx === i
              ? { ...it, uploadStatus: 'error', errorMessage: msg }
              : it
          )
        );
      }
    }

    setIsUploading(false);
    if (completedSongs.length > 0) {
      onUploadSuccess(completedSongs);
    }
  };

  const allDone = items.length > 0 && items.every((it) => it.uploadStatus === 'completed' || it.uploadStatus === 'skipped');

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
                Store music files & metadata in your Supabase bucket
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

        {/* File Select Dropzone */}
        {items.length === 0 && (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-cyan-500/30 hover:border-cyan-400/60 rounded-3xl p-8 text-center cursor-pointer bg-slate-900/40 hover:bg-slate-900/70 transition space-y-3 group"
          >
            <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 mx-auto flex items-center justify-center group-hover:scale-110 transition">
              <FileAudio className="w-8 h-8 text-cyan-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">
                Select Audio Files from Device
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Supports MP3, M4A, AAC, WAV, OGG, and FLAC
              </p>
            </div>
            <span className="inline-block px-4 py-2 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-semibold">
              Browse Tracks
            </span>
          </div>
        )}

        {/* Hidden native input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.flac"
          multiple
          onChange={handleFilesSelected}
          className="hidden"
        />

        {/* Queued Files List */}
        {items.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>{items.length} track(s) selected</span>
              {!isUploading && !allDone && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-cyan-400 hover:underline font-medium"
                >
                  + Add more files
                </button>
              )}
            </div>

            <div className="space-y-2.5 max-h-64 overflow-y-auto custom-scrollbar pr-1">
              {items.map((item, idx) => (
                <div
                  key={idx}
                  className={`p-3.5 rounded-2xl border transition ${
                    item.uploadStatus === 'completed'
                      ? 'bg-emerald-500/10 border-emerald-500/30'
                      : item.uploadStatus === 'error'
                      ? 'bg-rose-500/10 border-rose-500/30'
                      : item.isDuplicate && !item.forceUpload
                      ? 'bg-amber-500/10 border-amber-500/30'
                      : 'bg-slate-900/60 border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={item.artworkUrl || './logo.png'}
                      alt=""
                      className="w-11 h-11 rounded-xl object-cover border border-white/10 shrink-0"
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <h4 className="text-xs font-bold text-white truncate">
                          {item.title}
                        </h4>
                        <span className="text-[10px] font-mono text-slate-400 shrink-0">
                          {formatBytes(item.file.size)}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 truncate">
                        {item.artist} • {item.album}
                      </p>

                      {/* Duplicate Warning */}
                      {item.isDuplicate && item.uploadStatus === 'pending' && (
                        <div className="mt-2 p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-[11px] text-amber-300 space-y-1.5">
                          <p className="flex items-center gap-1 font-semibold">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            This song already exists in JTEC CLOUD.
                          </p>
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() =>
                                setItems((prev) =>
                                  prev.map((it, i) =>
                                    i === idx ? { ...it, forceUpload: false } : it
                                  )
                                )
                              }
                              className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold ${
                                !item.forceUpload
                                  ? 'bg-amber-500 text-black border-amber-400'
                                  : 'bg-black/30 text-amber-200 border-amber-500/30'
                              }`}
                            >
                              Keep Existing
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setItems((prev) =>
                                  prev.map((it, i) =>
                                    i === idx ? { ...it, forceUpload: true } : it
                                  )
                                )
                              }
                              className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold ${
                                item.forceUpload
                                  ? 'bg-cyan-500 text-black border-cyan-400'
                                  : 'bg-black/30 text-cyan-200 border-cyan-500/30'
                              }`}
                            >
                              Upload Anyway
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Progress Bar */}
                      {item.uploadStatus === 'uploading' && (
                        <div className="mt-2 space-y-1">
                          <div className="flex justify-between text-[10px] font-mono text-cyan-300">
                            <span>Uploading...</span>
                            <span>{item.progress}%</span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-slate-950 overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-cyan-400 to-purple-500 transition-all duration-200"
                              style={{ width: `${item.progress}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Success / Status text */}
                      {item.uploadStatus === 'completed' && (
                        <p className="text-[10px] text-emerald-400 flex items-center gap-1 mt-1 font-bold">
                          <CheckCircle2 className="w-3 h-3" /> ✓ Uploaded to JTEC CLOUD
                        </p>
                      )}
                      {item.uploadStatus === 'skipped' && (
                        <p className="text-[10px] text-slate-400 mt-1">
                          Skipped (Kept existing cloud version)
                        </p>
                      )}
                      {item.uploadStatus === 'error' && (
                        <p className="text-[10px] text-rose-400 mt-1 font-medium">
                          Error: {item.errorMessage}
                        </p>
                      )}
                    </div>

                    {!isUploading && item.uploadStatus === 'pending' && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => setEditingIndex(editingIndex === idx ? null : idx)}
                          title="Edit metadata"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition"
                        >
                          <Tag className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          title="Remove file"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-white/5 transition"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Metadata Editor Drawer */}
                  {editingIndex === idx && (
                    <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">Title</label>
                        <input
                          type="text"
                          value={item.title}
                          onChange={(e) => handleUpdateItem(idx, 'title', e.target.value)}
                          className="w-full px-2 py-1 rounded-lg bg-black/50 border border-white/15 text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">Artist</label>
                        <input
                          type="text"
                          value={item.artist}
                          onChange={(e) => handleUpdateItem(idx, 'artist', e.target.value)}
                          className="w-full px-2 py-1 rounded-lg bg-black/50 border border-white/15 text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">Album</label>
                        <input
                          type="text"
                          value={item.album}
                          onChange={(e) => handleUpdateItem(idx, 'album', e.target.value)}
                          className="w-full px-2 py-1 rounded-lg bg-black/50 border border-white/15 text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">Genre</label>
                        <input
                          type="text"
                          value={item.genre}
                          onChange={(e) => handleUpdateItem(idx, 'genre', e.target.value)}
                          className="w-full px-2 py-1 rounded-lg bg-black/50 border border-white/15 text-white"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isUploading}
                className="py-3 px-4 rounded-xl bg-slate-900 border border-white/10 text-slate-300 font-bold hover:text-white transition cursor-pointer"
              >
                {allDone ? 'Close' : 'Cancel'}
              </button>

              {!allDone && (
                <button
                  type="button"
                  onClick={handleStartUpload}
                  disabled={isUploading || isProcessingFiles}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-400 hover:to-purple-500 text-white font-bold transition flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-cyan-500/20 cursor-pointer active:scale-95"
                >
                  {isUploading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Uploading to Cloud...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Start Upload ({items.length} track{items.length > 1 ? 's' : ''})
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
