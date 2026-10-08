import React from 'react';
import { Play, ListPlus, Heart, Trash2, Info, ListEnd, X, Disc, Cloud } from 'lucide-react';
import { Song } from '../types/music';

interface SongOptionsMenuProps {
  isOpen: boolean;
  onClose: () => void;
  song: Song | null;
  onPlay: (song: Song) => void;
  onPlayNext: (song: Song) => void;
  onAddToQueue: (song: Song) => void;
  onAddToPlaylist: (song: Song) => void;
  onToggleFavorite: (song: Song) => void;
  onViewDetails: (song: Song) => void;
  onRemoveFromLibrary: (song: Song) => void;
  onUploadToCloud?: (song: Song) => void;
}

export const SongOptionsMenu: React.FC<SongOptionsMenuProps> = ({
  isOpen,
  onClose,
  song,
  onPlay,
  onPlayNext,
  onAddToQueue,
  onAddToPlaylist,
  onToggleFavorite,
  onViewDetails,
  onRemoveFromLibrary,
  onUploadToCloud,
}) => {
  if (!isOpen || !song) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm animate-in fade-in duration-150 p-0 sm:p-4"
      onClick={onClose}
    >
      <div 
        className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl bg-[#0b1028] border border-cyan-500/25 p-5 shadow-2xl space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Track preview */}
        <div className="flex items-center gap-3 pb-3 border-b border-white/10">
          <img
            src={song.artworkUrl || './pwa-192x192.png'}
            alt={song.title}
            className="w-12 h-12 rounded-xl object-cover border border-cyan-500/30"
          />
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-bold text-white truncate">{song.title}</h4>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs text-slate-400 truncate">{song.artist}</p>
              <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${
                song.isCloud 
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' 
                  : 'bg-slate-800 text-slate-400 border-white/10'
              }`}>
                {song.isCloud ? '☁️ Cloud' : '📱 Local'}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action List */}
        <div className="space-y-1 text-sm font-medium">
          <button
            onClick={() => { onPlay(song); onClose(); }}
            className="w-full flex items-center gap-3 p-3 rounded-xl text-white hover:bg-cyan-500/15 hover:text-cyan-300 transition text-left"
          >
            <Play className="w-4 h-4 text-cyan-400" />
            <span>Play Now</span>
          </button>

          <button
            onClick={() => { onPlayNext(song); onClose(); }}
            className="w-full flex items-center gap-3 p-3 rounded-xl text-white hover:bg-cyan-500/15 hover:text-cyan-300 transition text-left"
          >
            <ListEnd className="w-4 h-4 text-cyan-400" />
            <span>Play Next</span>
          </button>

          <button
            onClick={() => { onAddToQueue(song); onClose(); }}
            className="w-full flex items-center gap-3 p-3 rounded-xl text-white hover:bg-cyan-500/15 hover:text-cyan-300 transition text-left"
          >
            <ListPlus className="w-4 h-4 text-purple-400" />
            <span>Add to Queue</span>
          </button>

          <button
            onClick={() => { onAddToPlaylist(song); onClose(); }}
            className="w-full flex items-center gap-3 p-3 rounded-xl text-white hover:bg-purple-500/15 hover:text-purple-300 transition text-left"
          >
            <Disc className="w-4 h-4 text-pink-400" />
            <span>Add to Playlist</span>
          </button>

          {/* Upload to Cloud option if local only */}
          {!song.isCloud && onUploadToCloud && (
            <button
              onClick={() => { onUploadToCloud(song); onClose(); }}
              className="w-full flex items-center gap-3 p-3 rounded-xl text-cyan-300 hover:bg-cyan-500/20 transition text-left"
            >
              <Cloud className="w-4 h-4 text-cyan-400" />
              <span>Upload to JTEC CLOUD</span>
            </button>
          )}

          <button
            onClick={() => { onToggleFavorite(song); onClose(); }}
            className="w-full flex items-center gap-3 p-3 rounded-xl text-white hover:bg-pink-500/15 hover:text-pink-300 transition text-left"
          >
            <Heart className={`w-4 h-4 ${song.isFavorite ? 'fill-pink-500 text-pink-500' : 'text-pink-400'}`} />
            <span>{song.isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}</span>
          </button>

          <button
            onClick={() => { onViewDetails(song); onClose(); }}
            className="w-full flex items-center gap-3 p-3 rounded-xl text-white hover:bg-blue-500/15 hover:text-blue-300 transition text-left"
          >
            <Info className="w-4 h-4 text-blue-400" />
            <span>View Details</span>
          </button>

          <button
            onClick={() => { onRemoveFromLibrary(song); onClose(); }}
            className="w-full flex items-center gap-3 p-3 rounded-xl text-rose-400 hover:bg-rose-500/15 transition text-left"
          >
            <Trash2 className="w-4 h-4 text-rose-400" />
            <span>Remove from Library</span>
          </button>
        </div>
      </div>
    </div>
  );
};
