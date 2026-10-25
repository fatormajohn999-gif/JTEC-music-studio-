import React, { useState, useMemo } from 'react';
import { 
  X, HardDrive, Trash2, CheckSquare, Square, ArrowUpDown, 
  AlertTriangle, Music, Calendar, Check
} from 'lucide-react';
import { Song } from '../types/music';
import { formatBytes } from '../services/supabase';

interface ManageDownloadsModalProps {
  isOpen: boolean;
  onClose: () => void;
  downloadedSongs: Song[];
  onDeleteSong: (songId: string) => Promise<void>;
  onDeleteMultipleSongs: (songIds: string[]) => Promise<void>;
}

type SortField = 'size' | 'date' | 'name';
type SortDirection = 'desc' | 'asc';

export const ManageDownloadsModal: React.FC<ManageDownloadsModalProps> = ({
  isOpen,
  onClose,
  downloadedSongs,
  onDeleteSong,
  onDeleteMultipleSongs,
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<SortField>('size');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState<'single' | 'multiple' | null>(null);
  const [songToDelete, setSongToDelete] = useState<Song | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Compute total storage
  const totalBytes = useMemo(() => {
    return downloadedSongs.reduce((sum, s) => sum + (s.size || 0), 0);
  }, [downloadedSongs]);

  // Sort songs
  const sortedSongs = useMemo(() => {
    return [...downloadedSongs].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'size') {
        cmp = (a.size || 0) - (b.size || 0);
      } else if (sortField === 'date') {
        cmp = (a.dateAdded || 0) - (b.dateAdded || 0);
      } else {
        cmp = a.title.localeCompare(b.title);
      }
      return sortDirection === 'desc' ? -cmp : cmp;
    });
  }, [downloadedSongs, sortField, sortDirection]);

  if (!isOpen) return null;

  const handleToggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortField(field);
      setSortDirection(field === 'name' ? 'asc' : 'desc');
    }
  };

  const handleToggleSelectAll = () => {
    if (selectedIds.size === downloadedSongs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(downloadedSongs.map((s) => s.id)));
    }
  };

  const handleToggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handlePromptSingleDelete = (song: Song) => {
    setSongToDelete(song);
    setConfirmDeleteTarget('single');
  };

  const handlePromptMultipleDelete = () => {
    if (selectedIds.size === 0) return;
    setConfirmDeleteTarget('multiple');
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      if (confirmDeleteTarget === 'single' && songToDelete) {
        await onDeleteSong(songToDelete.id);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(songToDelete.id);
          return next;
        });
      } else if (confirmDeleteTarget === 'multiple' && selectedIds.size > 0) {
        await onDeleteMultipleSongs(Array.from(selectedIds));
        setSelectedIds(new Set());
      }
    } catch (e) {
      console.warn('Failed to delete downloaded songs:', e);
    } finally {
      setIsDeleting(false);
      setConfirmDeleteTarget(null);
      setSongToDelete(null);
    }
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return 'Unknown';
    try {
      const date = new Date(timestamp);
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return 'Unknown';
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Manage Downloads"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-in fade-in"
    >
      <div className="relative w-full max-w-2xl max-h-[90dvh] flex flex-col rounded-3xl bg-[#090d1c] border border-cyan-500/30 shadow-2xl overflow-hidden">
        {/* Top Header */}
        <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 flex items-center justify-center shrink-0">
              <HardDrive className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-white truncate">
                Manage Downloads
              </h2>
              <p className="text-xs text-slate-400 truncate">
                Total Storage: <span className="text-cyan-300 font-mono font-bold">{formatBytes(totalBytes)}</span> ({downloadedSongs.length} tracks)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sorting & Selection Bar */}
        <div className="px-4 sm:px-5 py-3 bg-slate-950/60 border-b border-white/5 flex flex-wrap items-center justify-between gap-2.5 shrink-0 text-xs">
          {/* Sorting controls */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <span className="text-slate-400 font-medium mr-1 flex items-center gap-1">
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span>Sort:</span>
            </span>
            {(['size', 'date', 'name'] as SortField[]).map((field) => {
              const isActive = sortField === field;
              return (
                <button
                  key={field}
                  type="button"
                  onClick={() => handleToggleSort(field)}
                  className={`px-2.5 py-1 rounded-lg border font-semibold transition flex items-center gap-1 cursor-pointer ${
                    isActive
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                      : 'bg-slate-900 border-white/10 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="capitalize">{field}</span>
                  {isActive && (
                    <span className="text-[10px]">{sortDirection === 'desc' ? '↓' : '↑'}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Select all and multi-delete */}
          <div className="flex items-center gap-2 ml-auto">
            {downloadedSongs.length > 0 && (
              <button
                type="button"
                onClick={handleToggleSelectAll}
                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-white/10 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              >
                {selectedIds.size === downloadedSongs.length ? (
                  <CheckSquare className="w-3.5 h-3.5 text-cyan-400" />
                ) : (
                  <Square className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span>{selectedIds.size === downloadedSongs.length ? 'Deselect All' : 'Select All'}</span>
              </button>
            )}

            {selectedIds.size > 0 && (
              <button
                type="button"
                onClick={handlePromptMultipleDelete}
                className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-md shadow-rose-600/30 active:scale-95"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete ({selectedIds.size})</span>
              </button>
            )}
          </div>
        </div>

        {/* Songs List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-2 min-h-[220px]">
          {sortedSongs.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-white/5 text-slate-500 mx-auto flex items-center justify-center">
                <HardDrive className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-slate-300">No downloaded songs yet</p>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Download songs from JTEC Cloud or import music from your device for offline listening.
              </p>
            </div>
          ) : (
            sortedSongs.map((song) => {
              const isSelected = selectedIds.has(song.id);
              return (
                <div
                  key={song.id}
                  className={`p-3 rounded-2xl border transition-all flex items-center gap-3 ${
                    isSelected
                      ? 'bg-cyan-950/40 border-cyan-500/40'
                      : 'bg-slate-900/60 border-white/5 hover:border-white/15'
                  }`}
                >
                  {/* Select Checkbox */}
                  <button
                    type="button"
                    onClick={() => handleToggleSelectOne(song.id)}
                    className="p-1 rounded text-slate-400 hover:text-cyan-300 cursor-pointer shrink-0"
                    aria-label={isSelected ? `Deselect ${song.title}` : `Select ${song.title}`}
                  >
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4 text-cyan-400" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-500" />
                    )}
                  </button>

                  {/* Artwork Thumbnail */}
                  <div className="relative w-11 h-11 rounded-xl overflow-hidden bg-slate-950 border border-white/10 shrink-0">
                    {song.artworkUrl ? (
                      <img
                        src={song.artworkUrl}
                        alt={song.title}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-500">
                        <Music className="w-5 h-5" />
                      </div>
                    )}
                  </div>

                  {/* Metadata */}
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs sm:text-sm font-bold text-white truncate">
                      {song.title}
                    </h4>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">
                      {song.artist || 'Unknown Artist'}
                    </p>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-1 font-mono">
                      <span className="text-cyan-400/90 font-semibold">{formatBytes(song.size || 0)}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1 font-sans">
                        <Calendar className="w-3 h-3 text-slate-500" />
                        <span>{formatDate(song.dateAdded)}</span>
                      </span>
                    </div>
                  </div>

                  {/* Single Delete Button */}
                  <button
                    type="button"
                    onClick={() => handlePromptSingleDelete(song)}
                    className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer shrink-0 active:scale-95"
                    title="Delete song"
                    aria-label={`Delete ${song.title}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Confirmation Modal Overlay */}
        {confirmDeleteTarget && (
          <div className="absolute inset-0 z-20 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
            <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-rose-500/40 p-5 space-y-4 shadow-2xl text-center">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 mx-auto flex items-center justify-center">
                <AlertTriangle className="w-6 h-6" />
              </div>

              <div className="space-y-1.5">
                <h3 className="text-sm font-bold text-white">
                  {confirmDeleteTarget === 'single'
                    ? `Delete "${songToDelete?.title}"?`
                    : `Delete ${selectedIds.size} songs?`}
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  This will remove the downloaded audio, cover art, and stored data from your device, playlists, and the queue.
                </p>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => {
                    setConfirmDeleteTarget(null);
                    setSongToDelete(null);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleConfirmDelete}
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition shadow-lg shadow-rose-600/30 cursor-pointer active:scale-95 disabled:opacity-50"
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
