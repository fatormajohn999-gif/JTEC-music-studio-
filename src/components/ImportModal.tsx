import React, { useState, useRef } from 'react';
import { Upload, X, Music, CheckCircle2, AlertCircle, FileAudio, Sparkles, Cloud, HardDrive } from 'lucide-react';
import { Song } from '../types/music';
import { extractAudioMetadata } from '../services/id3Parser';
import { StorageService } from '../services/storage';
import { SupabaseService } from '../services/supabase';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: (songs: Song[]) => void;
  onOpenCloudUpload?: () => void;
}

export const ImportModal: React.FC<ImportModalProps> = ({
  isOpen,
  onClose,
  onImportComplete,
  onOpenCloudUpload,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const supabaseConfig = SupabaseService.getConfig();

  if (!isOpen) return null;

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList);
    const audioFiles = files.filter((f) => {
      const ext = f.name.split('.').pop()?.toLowerCase() || '';
      return f.type.startsWith('audio/') || ['mp3', 'wav', 'm4a', 'mp4', 'aac', 'ogg', 'oga', 'flac', 'webm'].includes(ext);
    });

    if (audioFiles.length === 0) {
      setErrorMessage("No supported audio files found. Please select MP3, WAV, M4A, AAC, OGG, or FLAC files.");
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setResultMessage(null);

    const savedSongs: Song[] = [];
    const itemsToSave: { song: Song; blob?: Blob }[] = [];

    for (let i = 0; i < audioFiles.length; i++) {
      const file = audioFiles[i];
      setProgressText(`Processing (${i + 1}/${audioFiles.length}): ${file.name}`);
      setProgressPercent(Math.round(((i + 0.5) / audioFiles.length) * 100));

      try {
        const meta = await extractAudioMetadata(file);
        const ext = file.name.split('.').pop()?.toLowerCase() || 'audio';
        
        const song: Song = {
          id: `song_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          title: meta.title || file.name.replace(/\.[^/.]+$/, ''),
          artist: meta.artist || 'Unknown Artist',
          album: meta.album || 'Local Library',
          duration: meta.duration || 0,
          artworkUrl: meta.artworkUrl,
          format: ext,
          size: file.size,
          dateAdded: Date.now(),
          isFavorite: false,
          hasStoredBlob: true,
          isCloud: false,
          year: meta.year,
        };

        savedSongs.push(song);
        itemsToSave.push({ song, blob: file });
      } catch (err) {
        console.warn(`Could not process ${file.name}`, err);
      }
    }

    // Save batch to IndexedDB
    setProgressText('Saving to local offline device storage...');
    setProgressPercent(95);

    try {
      await StorageService.saveMultipleSongs(itemsToSave);
      setProgressPercent(100);
      setResultMessage(`${savedSongs.length} local song${savedSongs.length === 1 ? '' : 's'} added to your library!`);
      setTimeout(() => {
        onImportComplete(savedSongs);
      }, 900);
    } catch (err) {
      console.error('IndexedDB save failed', err);
      setErrorMessage('Could not save some songs to offline storage. Check browser storage permissions.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const resetState = () => {
    setIsProcessing(false);
    setResultMessage(null);
    setErrorMessage(null);
    setProgressPercent(0);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div 
        className="w-full max-w-md rounded-3xl bg-[#0a0e22] border border-cyan-500/30 p-6 sm:p-7 shadow-2xl relative overflow-hidden"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {/* Glow ambient accent */}
        <div className="absolute -top-20 -right-20 w-48 h-48 bg-cyan-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-48 h-48 bg-purple-500/15 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={resetState}
          disabled={isProcessing}
          className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition disabled:opacity-30"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Content */}
        <div className="text-center space-y-4">
          {/* Glowing Icon */}
          <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-tr from-cyan-500/20 via-purple-500/20 to-pink-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300 shadow-xl shadow-cyan-500/20 group">
            <Upload className="w-8 h-8 group-hover:scale-110 transition duration-300" />
          </div>

          <div>
            <h2 className="text-xl font-bold text-white tracking-wide">Add Music to Library</h2>
            <p className="text-xs text-slate-400 mt-1">
              Store locally or upload to Supabase cloud storage
            </p>
          </div>

          {/* Cloud Option Banner if Supabase connected */}
          {onOpenCloudUpload && (
            <div className="p-3 rounded-2xl bg-gradient-to-r from-cyan-500/15 to-purple-600/15 border border-cyan-500/30 flex items-center justify-between gap-3 text-left">
              <div className="flex items-center gap-2.5">
                <Cloud className="w-5 h-5 text-cyan-400 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-white">Want Cloud Persistence?</p>
                  <p className="text-[11px] text-slate-400">
                    Upload to JTEC CLOUD (Supabase) to keep tracks across browser data clears.
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  onClose();
                  onOpenCloudUpload();
                }}
                className="px-3 py-1.5 rounded-xl bg-cyan-500 text-slate-950 font-bold text-xs hover:bg-cyan-400 transition shrink-0 shadow-md shadow-cyan-500/20"
              >
                Cloud Upload
              </button>
            </div>
          )}

          {/* Drag & Drop Box */}
          <div
            onClick={() => !isProcessing && fileInputRef.current?.click()}
            className={`cursor-pointer p-6 rounded-2xl border-2 border-dashed transition flex flex-col items-center justify-center gap-2 ${
              isDragOver
                ? 'border-cyan-400 bg-cyan-500/10 scale-[1.02]'
                : 'border-white/15 bg-slate-900/40 hover:border-cyan-500/50 hover:bg-slate-900/70'
            }`}
          >
            <FileAudio className="w-8 h-8 text-cyan-400 mb-1" />
            <span className="text-sm font-medium text-slate-200">
              Select files for Local Storage
            </span>
            <span className="text-xs text-slate-500">
              MP3, WAV, M4A, AAC, OGG, FLAC
            </span>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.mp4,.aac,.ogg,.flac"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />

          {/* Privacy & Offline Guarantee notice */}
          <div className="flex items-center justify-center gap-1.5 text-xs text-cyan-300/80 bg-cyan-950/40 py-2 px-3 rounded-xl border border-cyan-500/20">
            <HardDrive className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span>Saved directly to your device IndexedDB</span>
          </div>

          {/* Progress / Status Display */}
          {isProcessing && (
            <div className="space-y-2 pt-2 animate-in fade-in">
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-white/10">
                <div
                  className="bg-gradient-to-r from-cyan-400 to-purple-500 h-full rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="text-xs text-slate-300 truncate">{progressText}</p>
            </div>
          )}

          {/* Success Message */}
          {resultMessage && (
            <div className="flex items-center justify-center gap-2 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-sm font-semibold animate-in zoom-in-95">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <span>{resultMessage}</span>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="flex items-center justify-center gap-2 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs text-left">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Action Button */}
          <div className="pt-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-cyan-500 via-purple-600 to-pink-500 text-white font-semibold text-sm shadow-xl shadow-cyan-500/25 hover:opacity-95 active:scale-98 transition disabled:opacity-50 cursor-pointer"
            >
              Browse Local Audio Files
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
