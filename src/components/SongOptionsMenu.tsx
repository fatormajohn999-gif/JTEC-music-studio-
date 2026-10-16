import React, { useRef } from 'react';
import { Play, ListPlus, Heart, Trash2, Info, ListEnd, X, Disc, Cloud, Image, ImageOff } from 'lucide-react';
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
  onUpdateCover?: (song: Song, artworkUrl: string) => void;
  onRemoveCover?: (song: Song) => void;
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
  onUpdateCover,
  onRemoveCover,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen || !song) return null;

  const hasCustomCover = Boolean(song.artworkUrl && song.artworkUrl !== './pwa-192x192.png');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !song) return;

    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        // Crop the chosen image to a perfect 512x512 square with object-fit: cover math
        const canvas = document.createElement('canvas');
        const size = 512;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const srcW = img.width;
          const srcH = img.height;
          let sx = 0;
          let sy = 0;
          let sWidth = srcW;
          let sHeight = srcH;

          if (srcW > srcH) {
            sWidth = srcH;
            sx = (srcW - sWidth) / 2;
          } else {
            sHeight = srcW;
            sy = (srcH - sHeight) / 2;
          }

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, size, size);

          const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.88);
          if (onUpdateCover) {
            onUpdateCover(song, croppedDataUrl);
          }
          onClose();
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);

    // Reset input so picking the same file again triggers change
    e.target.value = '';
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm animate-in fade-in duration-150 p-0 sm:p-4"
      onClick={onClose}
    >
      <div 
        className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl bg-[#0b1028] border border-cyan-500/25 p-5 shadow-2xl space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Hidden file input for native image picker */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />

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
          {/* Add / Change Cover */}
          {onUpdateCover && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center gap-3 p-3 rounded-xl text-white hover:bg-emerald-500/15 hover:text-emerald-300 transition text-left"
            >
              <Image className="w-4 h-4 text-emerald-400" />
              <span>{hasCustomCover ? 'Change Cover' : 'Add Cover'}</span>
            </button>
          )}

          {/* Remove Cover if one exists */}
          {hasCustomCover && onRemoveCover && (
            <button
              onClick={() => { onRemoveCover(song); onClose(); }}
              className="w-full flex items-center gap-3 p-3 rounded-xl text-amber-300 hover:bg-amber-500/15 transition text-left"
            >
              <ImageOff className="w-4 h-4 text-amber-400" />
              <span>Remove Cover</span>
            </button>
          )}

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
