import React from 'react';
import { X, Music, HardDrive, Calendar, Clock, Tag, Disc, Cloud } from 'lucide-react';
import { Song } from '../types/music';

interface SongDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  song: Song | null;
}

export const SongDetailsModal: React.FC<SongDetailsModalProps> = ({
  isOpen,
  onClose,
  song,
}) => {
  if (!isOpen || !song) return null;

  const formatFileSize = (bytes: number) => {
    if (!bytes) return 'Unknown';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div 
        className="w-full max-w-sm rounded-3xl bg-[#090d22] border border-cyan-500/30 p-6 shadow-2xl relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Artwork Header */}
        <div className="flex flex-col items-center text-center mb-5">
          <img
            src={song.artworkUrl || './pwa-192x192.png'}
            alt={song.title}
            className="w-24 h-24 rounded-2xl object-cover border-2 border-cyan-500/40 shadow-xl shadow-cyan-500/20 mb-3"
          />
          <h3 className="text-base font-bold text-white truncate max-w-full">{song.title}</h3>
          <p className="text-xs text-cyan-300 truncate max-w-full">{song.artist}</p>
        </div>

        {/* Details Grid */}
        <div className="space-y-2.5 text-xs text-slate-300">
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/60 border border-white/5">
            <span className="flex items-center gap-2 text-slate-400">
              <Disc className="w-4 h-4 text-purple-400" /> Album
            </span>
            <span className="font-semibold text-white truncate max-w-[160px]">{song.album || 'Unknown'}</span>
          </div>

          <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/60 border border-white/5">
            <span className="flex items-center gap-2 text-slate-400">
              <Tag className="w-4 h-4 text-cyan-400" /> Format
            </span>
            <span className="font-mono uppercase font-semibold text-cyan-300">{song.format}</span>
          </div>

          <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/60 border border-white/5">
            <span className="flex items-center gap-2 text-slate-400">
              <Clock className="w-4 h-4 text-pink-400" /> Duration
            </span>
            <span className="font-mono text-white">{formatDuration(song.duration)}</span>
          </div>

          <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/60 border border-white/5">
            <span className="flex items-center gap-2 text-slate-400">
              {song.isCloud ? <Cloud className="w-4 h-4 text-cyan-400" /> : <HardDrive className="w-4 h-4 text-amber-400" />} 
              Storage Source
            </span>
            <span className={`font-semibold ${song.isCloud ? 'text-cyan-300' : 'text-amber-300'}`}>
              {song.isCloud 
                ? (song.hasStoredBlob ? '☁️ Supabase Cloud (Saved Offline)' : '☁️ Supabase Cloud (Streaming)') 
                : '📱 Local Device Storage'}
            </span>
          </div>

          <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/60 border border-white/5">
            <span className="flex items-center gap-2 text-slate-400">
              <HardDrive className="w-4 h-4 text-blue-400" /> File Size
            </span>
            <span className="font-mono text-white">{formatFileSize(song.size)}</span>
          </div>

          <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/60 border border-white/5">
            <span className="flex items-center gap-2 text-slate-400">
              <Calendar className="w-4 h-4 text-emerald-400" /> Added
            </span>
            <span className="text-slate-300">{new Date(song.dateAdded).toLocaleDateString()}</span>
          </div>
        </div>

        <button
          onClick={onClose}
          className="mt-5 w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs transition"
        >
          Close
        </button>
      </div>
    </div>
  );
};
