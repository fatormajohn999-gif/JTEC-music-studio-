import React, { useState } from 'react';
import { X, Plus, Music, Check, Disc } from 'lucide-react';
import { Playlist, Song } from '../types/music';

interface PlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  playlists: Playlist[];
  songToAdd?: Song | null;
  onCreatePlaylist: (name: string, description: string, coverGradient: string) => void;
  onAddSongToPlaylist: (playlistId: string, songId: string) => void;
}

const GRADIENTS = [
  'from-cyan-500 to-blue-600',
  'from-purple-500 to-pink-600',
  'from-fuchsia-600 to-rose-500',
  'from-emerald-500 to-teal-700',
  'from-amber-500 to-orange-600',
  'from-indigo-600 to-purple-800',
];

export const PlaylistModal: React.FC<PlaylistModalProps> = ({
  isOpen,
  onClose,
  playlists,
  songToAdd,
  onCreatePlaylist,
  onAddSongToPlaylist,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [selectedGradient, setSelectedGradient] = useState(GRADIENTS[0]);

  if (!isOpen) return null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    onCreatePlaylist(newTitle.trim(), newDesc.trim(), selectedGradient);
    setNewTitle('');
    setNewDesc('');
    setIsCreating(false);
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

        {isCreating ? (
          <div>
            <h3 className="text-base font-bold text-white mb-4">Create New Playlist</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Playlist Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Late Night Vibes"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/15 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Description (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Slowed beats for coding"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/15 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Cover Theme</label>
                <div className="grid grid-cols-6 gap-2">
                  {GRADIENTS.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setSelectedGradient(g)}
                      className={`h-8 rounded-lg bg-gradient-to-tr ${g} flex items-center justify-center transition ${
                        selectedGradient === g ? 'ring-2 ring-white scale-105' : 'opacity-70 hover:opacity-100'
                      }`}
                    >
                      {selectedGradient === g && <Check className="w-4 h-4 text-white" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm font-medium hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 text-white text-sm font-semibold hover:opacity-95"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div>
            <div className="mb-4">
              <h3 className="text-base font-bold text-white">
                {songToAdd ? 'Add to Playlist' : 'Your Playlists'}
              </h3>
              {songToAdd && (
                <p className="text-xs text-cyan-300 truncate mt-0.5">
                  Adding: {songToAdd.title}
                </p>
              )}
            </div>

            <button
              onClick={() => setIsCreating(true)}
              className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-cyan-500/40 bg-cyan-500/10 text-cyan-300 font-semibold text-xs hover:bg-cyan-500/20 transition mb-3"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Playlist</span>
            </button>

            <div className="max-h-60 overflow-y-auto space-y-2 no-scrollbar">
              {playlists.length === 0 ? (
                <p className="text-center text-xs text-slate-500 py-4">No playlists created yet.</p>
              ) : (
                playlists.map((pl) => (
                  <button
                    key={pl.id}
                    onClick={() => {
                      if (songToAdd) {
                        onAddSongToPlaylist(pl.id, songToAdd.id);
                        onClose();
                      }
                    }}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-slate-900/60 border border-white/5 hover:border-cyan-500/30 transition text-left"
                  >
                    <div className={`w-10 h-10 rounded-lg bg-gradient-to-tr ${pl.coverGradient || 'from-cyan-500 to-purple-600'} flex items-center justify-center text-white shrink-0`}>
                      <Disc className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-white truncate">{pl.name}</div>
                      <div className="text-xs text-slate-400">{pl.songIds.length} tracks</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
