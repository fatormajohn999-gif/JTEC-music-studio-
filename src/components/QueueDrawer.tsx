import React from 'react';
import { X, Trash2, GripVertical, Play, ArrowDown, ArrowUp } from 'lucide-react';
import { Song } from '../types/music';

interface QueueDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  queue: Song[];
  currentSong: Song | null;
  onSelectSong: (song: Song, index: number) => void;
  onRemoveFromQueue: (index: number) => void;
  onClearQueue: () => void;
  onMoveQueueItem: (fromIndex: number, toIndex: number) => void;
}

export const QueueDrawer: React.FC<QueueDrawerProps> = ({
  isOpen,
  onClose,
  queue,
  currentSong,
  onSelectSong,
  onRemoveFromQueue,
  onClearQueue,
  onMoveQueueItem,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-end bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="w-full sm:max-w-md h-[85vh] flex flex-col rounded-t-3xl sm:rounded-l-3xl sm:rounded-r-none bg-[#090d20] border-t sm:border-l border-cyan-500/25 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-slate-900/60">
          <div>
            <h2 className="text-base font-bold text-white tracking-wide">Playing Queue</h2>
            <p className="text-xs text-cyan-400 font-medium">
              {queue.length} track{queue.length === 1 ? '' : 's'} queued
            </p>
          </div>

          <div className="flex items-center gap-2">
            {queue.length > 0 && (
              <button
                onClick={onClearQueue}
                title="Clear all tracks in queue"
                className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-white/5 transition text-xs flex items-center gap-1"
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden sm:inline">Clear</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Current Song Section */}
        {currentSong && (
          <div className="px-6 py-3.5 bg-cyan-950/20 border-b border-cyan-500/20">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-cyan-400">
              Now Playing
            </span>
            <div className="flex items-center gap-3 mt-1.5">
              <img
                src={currentSong.artworkUrl || '/pwa-192x192.png'}
                alt={currentSong.title}
                className="w-12 h-12 rounded-xl object-cover border border-cyan-500/30"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white truncate">{currentSong.title}</div>
                <div className="text-xs text-slate-400 truncate">{currentSong.artist}</div>
              </div>
              <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
            </div>
          </div>
        )}

        {/* Queue List */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 no-scrollbar">
          {queue.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
              <p className="text-sm font-medium">The queue is empty</p>
              <p className="text-xs text-slate-500 mt-1">
                Tap 'Play Next' or 'Add to Queue' on any song to queue it up.
              </p>
            </div>
          ) : (
            queue.map((song, index) => {
              const isCurrent = currentSong?.id === song.id;
              return (
                <div
                  key={`${song.id}-${index}`}
                  className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition ${
                    isCurrent
                      ? 'bg-cyan-500/15 border-cyan-400/50'
                      : 'bg-slate-900/40 border-white/5 hover:border-white/15'
                  }`}
                >
                  {/* Reorder Buttons */}
                  <div className="flex flex-col gap-0.5 text-slate-500">
                    <button
                      onClick={() => index > 0 && onMoveQueueItem(index, index - 1)}
                      disabled={index === 0}
                      className="p-0.5 hover:text-cyan-300 disabled:opacity-20"
                      title="Move up"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => index < queue.length - 1 && onMoveQueueItem(index, index + 1)}
                      disabled={index === queue.length - 1}
                      className="p-0.5 hover:text-cyan-300 disabled:opacity-20"
                      title="Move down"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Artwork */}
                  <div
                    onClick={() => onSelectSong(song, index)}
                    className="relative cursor-pointer shrink-0"
                  >
                    <img
                      src={song.artworkUrl || '/pwa-192x192.png'}
                      alt={song.title}
                      className="w-10 h-10 rounded-lg object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 rounded-lg flex items-center justify-center transition">
                      <Play className="w-4 h-4 text-white" />
                    </div>
                  </div>

                  {/* Info */}
                  <div
                    onClick={() => onSelectSong(song, index)}
                    className="flex-1 min-w-0 cursor-pointer"
                  >
                    <div className={`text-xs font-semibold truncate ${isCurrent ? 'text-cyan-300' : 'text-white'}`}>
                      {song.title}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">
                      {song.artist}
                    </div>
                  </div>

                  {/* Remove */}
                  <button
                    onClick={() => onRemoveFromQueue(index)}
                    className="p-1.5 text-slate-400 hover:text-rose-400 transition"
                    title="Remove from queue"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
