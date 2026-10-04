import React, { useState } from 'react';
import { 
  Disc, Plus, Play, Trash2, Edit2, Music, MoreVertical, Heart, X, Check, ArrowUp, ArrowDown 
} from 'lucide-react';
import { Playlist, Song } from '../types/music';

interface PlaylistsScreenProps {
  playlists: Playlist[];
  songs: Song[];
  currentSong: Song | null;
  isPlaying: boolean;
  onPlaySong: (song: Song) => void;
  onPlayPlaylist: (playlist: Playlist) => void;
  onOpenCreatePlaylist: () => void;
  onRenamePlaylist: (playlistId: string, newName: string) => void;
  onDeletePlaylist: (playlistId: string) => void;
  onRemoveSongFromPlaylist: (playlistId: string, songId: string) => void;
  onReorderPlaylistSongs: (playlistId: string, fromIndex: number, toIndex: number) => void;
  onOpenSongOptions: (song: Song) => void;
}

export const PlaylistsScreen: React.FC<PlaylistsScreenProps> = ({
  playlists,
  songs,
  currentSong,
  isPlaying,
  onPlaySong,
  onPlayPlaylist,
  onOpenCreatePlaylist,
  onRenamePlaylist,
  onDeletePlaylist,
  onRemoveSongFromPlaylist,
  onReorderPlaylistSongs,
  onOpenSongOptions,
}) => {
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const selectedPlaylist = playlists.find((p) => p.id === selectedPlaylistId);

  const playlistSongs = selectedPlaylist
    ? selectedPlaylist.songIds
        .map((id) => songs.find((s) => s.id === id))
        .filter((s): s is Song => Boolean(s))
    : [];

  const handleStartRename = (pl: Playlist) => {
    setEditingPlaylistId(pl.id);
    setRenameValue(pl.name);
  };

  const handleSaveRename = (playlistId: string) => {
    if (renameValue.trim()) {
      onRenamePlaylist(playlistId, renameValue.trim());
    }
    setEditingPlaylistId(null);
  };

  return (
    <div className="space-y-6 pb-36 px-4 pt-3 max-w-4xl mx-auto">
      {/* If a playlist is selected, show detail view */}
      {selectedPlaylist ? (
        <div className="space-y-5 animate-in fade-in">
          {/* Header Card */}
          <div className="flex flex-col sm:flex-row items-center sm:items-end gap-5 p-6 rounded-3xl bg-slate-900/60 border border-cyan-500/25 relative overflow-hidden">
            <div className={`w-28 h-28 rounded-2xl bg-gradient-to-tr ${selectedPlaylist.coverGradient || 'from-cyan-500 to-purple-600'} flex items-center justify-center text-white shadow-xl shadow-cyan-500/20 shrink-0`}>
              <Disc className="w-12 h-12" />
            </div>

            <div className="flex-1 text-center sm:text-left space-y-1">
              <span className="text-[11px] font-bold tracking-wider text-cyan-400 uppercase">
                Playlist
              </span>
              <h2 className="text-xl sm:text-2xl font-extrabold text-white">
                {selectedPlaylist.name}
              </h2>
              {selectedPlaylist.description && (
                <p className="text-xs text-slate-400">{selectedPlaylist.description}</p>
              )}
              <p className="text-xs text-slate-500 font-mono">
                {playlistSongs.length} track{playlistSongs.length === 1 ? '' : 's'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => onPlayPlaylist(selectedPlaylist)}
                disabled={playlistSongs.length === 0}
                className="px-5 py-3 rounded-2xl bg-gradient-to-r from-cyan-400 to-purple-600 text-white font-bold text-xs shadow-lg shadow-cyan-500/25 flex items-center gap-2 hover:brightness-110 active:scale-95 transition disabled:opacity-40"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>Play All</span>
              </button>

              <button
                onClick={() => setSelectedPlaylistId(null)}
                className="p-3 rounded-2xl bg-slate-800 text-slate-300 hover:text-white"
              >
                Back
              </button>
            </div>
          </div>

          {/* Songs in Playlist */}
          <div className="space-y-2">
            {playlistSongs.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs">
                No songs in this playlist yet. Add songs from your Library or song options!
              </div>
            ) : (
              playlistSongs.map((song, index) => {
                const isThisPlaying = currentSong?.id === song.id && isPlaying;
                return (
                  <div
                    key={`${song.id}-${index}`}
                    className={`flex items-center gap-3 p-2.5 rounded-2xl border transition group ${
                      isThisPlaying
                        ? 'bg-cyan-500/15 border-cyan-400/50'
                        : 'bg-slate-900/40 border-white/5 hover:border-white/15'
                    }`}
                  >
                    {/* Reorder Up/Down */}
                    <div className="flex flex-col gap-0.5 text-slate-500">
                      <button
                        onClick={() => index > 0 && onReorderPlaylistSongs(selectedPlaylist.id, index, index - 1)}
                        disabled={index === 0}
                        className="p-0.5 hover:text-cyan-300 disabled:opacity-20"
                        title="Move up"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => index < playlistSongs.length - 1 && onReorderPlaylistSongs(selectedPlaylist.id, index, index + 1)}
                        disabled={index === playlistSongs.length - 1}
                        className="p-0.5 hover:text-cyan-300 disabled:opacity-20"
                        title="Move down"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div
                      onClick={() => onPlaySong(song)}
                      className="relative w-11 h-11 rounded-xl overflow-hidden cursor-pointer shrink-0"
                    >
                      <img
                        src={song.artworkUrl || '/pwa-192x192.png'}
                        alt={song.title}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                        <Play className="w-4 h-4 text-white" />
                      </div>
                    </div>

                    <div
                      onClick={() => onPlaySong(song)}
                      className="flex-1 min-w-0 cursor-pointer"
                    >
                      <h4 className="text-xs font-bold text-white truncate group-hover:text-cyan-300">
                        {song.title}
                      </h4>
                      <p className="text-[11px] text-slate-400 truncate">{song.artist}</p>
                    </div>

                    {/* Remove from this playlist */}
                    <button
                      onClick={() => onRemoveSongFromPlaylist(selectedPlaylist.id, song.id)}
                      className="p-2 text-slate-500 hover:text-rose-400 transition"
                      title="Remove from playlist"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => onOpenSongOptions(song)}
                      className="p-2 text-slate-400 hover:text-white"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        /* Playlist Grid List */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide">Your Playlists</h2>
              <p className="text-xs text-slate-400">Custom mixes saved on device</p>
            </div>

            <button
              onClick={onOpenCreatePlaylist}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-semibold text-xs shadow-md shadow-cyan-500/20 flex items-center gap-1.5 active:scale-95 transition"
            >
              <Plus className="w-4 h-4" />
              <span>Create</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {playlists.map((pl) => (
              <div
                key={pl.id}
                className="p-4 rounded-2xl bg-slate-900/60 border border-white/5 hover:border-cyan-500/30 transition flex items-center justify-between group"
              >
                <div
                  onClick={() => setSelectedPlaylistId(pl.id)}
                  className="flex items-center gap-3.5 flex-1 min-w-0 cursor-pointer"
                >
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-tr ${pl.coverGradient || 'from-cyan-500 to-purple-600'} flex items-center justify-center text-white shadow-lg shrink-0 group-hover:scale-105 transition`}>
                    <Disc className="w-7 h-7" />
                  </div>

                  <div className="min-w-0 flex-1">
                    {editingPlaylistId === pl.id ? (
                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          className="px-2 py-1 rounded bg-slate-800 text-xs text-white border border-cyan-400 focus:outline-none"
                          autoFocus
                        />
                        <button
                          onClick={() => handleSaveRename(pl.id)}
                          className="p-1 rounded bg-cyan-500 text-black hover:bg-cyan-400"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <h3 className="text-sm font-bold text-white truncate group-hover:text-cyan-300 transition">
                          {pl.name}
                        </h3>
                        <p className="text-xs text-slate-400 truncate mt-0.5">
                          {pl.songIds.length} track{pl.songIds.length === 1 ? '' : 's'}
                        </p>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleStartRename(pl)}
                    className="p-2 text-slate-400 hover:text-cyan-300 transition"
                    title="Rename Playlist"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => onDeletePlaylist(pl.id)}
                    className="p-2 text-slate-400 hover:text-rose-400 transition"
                    title="Delete Playlist"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
