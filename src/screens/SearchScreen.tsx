import React, { useState, useMemo } from 'react';
import { Search, X, Play, Music, User, Disc, Heart, MoreVertical } from 'lucide-react';
import { Song, Playlist } from '../types/music';

interface SearchScreenProps {
  songs: Song[];
  playlists: Playlist[];
  currentSong: Song | null;
  isPlaying: boolean;
  onPlaySong: (song: Song) => void;
  onSelectPlaylist: (playlist: Playlist) => void;
  onOpenSongOptions: (song: Song) => void;
  onToggleFavorite: (song: Song) => void;
}

export const SearchScreen: React.FC<SearchScreenProps> = ({
  songs,
  playlists,
  currentSong,
  isPlaying,
  onPlaySong,
  onSelectPlaylist,
  onOpenSongOptions,
  onToggleFavorite,
}) => {
  const [query, setQuery] = useState('');

  const clean = query.trim().toLowerCase();

  const matchingSongs = useMemo(() => {
    if (!clean) return [];
    return songs.filter(
      (s) =>
        s.title.toLowerCase().includes(clean) ||
        s.artist.toLowerCase().includes(clean) ||
        (s.album && s.album.toLowerCase().includes(clean))
    );
  }, [songs, clean]);

  const matchingPlaylists = useMemo(() => {
    if (!clean) return [];
    return playlists.filter(
      (pl) =>
        pl.name.toLowerCase().includes(clean) ||
        (pl.description && pl.description.toLowerCase().includes(clean))
    );
  }, [playlists, clean]);

  return (
    <div className="space-y-5 pb-36 px-4 pt-3 max-w-4xl mx-auto">
      {/* Search Input Bar */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
          <Search className="w-5 h-5 text-cyan-400" />
        </div>
        <input
          type="text"
          autoFocus
          placeholder="Search songs, artists, albums, playlists..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full pl-11 pr-10 py-3.5 rounded-2xl bg-slate-900/80 border border-cyan-500/30 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-400 shadow-xl shadow-cyan-500/10"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* No Query: Quick Exploration Chips */}
      {!clean && (
        <div className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Browse By Category
          </h3>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { label: 'Favorites', query: 'favorite', icon: Heart, color: 'from-pink-500 to-rose-600' },
              { label: 'Synthwave', query: 'synth', icon: Disc, color: 'from-cyan-500 to-blue-600' },
              { label: 'Lo-Fi Chill', query: 'chill', icon: Music, color: 'from-purple-500 to-indigo-600' },
              { label: 'Reverie', query: 'reverie', icon: Disc, color: 'from-fuchsia-600 to-pink-600' },
            ].map((chip) => {
              const Icon = chip.icon;
              return (
                <button
                  key={chip.label}
                  onClick={() => setQuery(chip.query)}
                  className={`p-4 rounded-2xl bg-gradient-to-tr ${chip.color} text-white font-bold text-sm shadow-lg flex items-center justify-between group active:scale-98 transition`}
                >
                  <span>{chip.label}</span>
                  <Icon className="w-5 h-5 opacity-80 group-hover:scale-110 transition" />
                </button>
              );
            })}
          </div>

          <div className="pt-2 text-center text-xs text-slate-500">
            Real-time offline instant indexing across all local audio files.
          </div>
        </div>
      )}

      {/* Results */}
      {clean && (
        <div className="space-y-6">
          {/* Matching Playlists */}
          {matchingPlaylists.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Playlists ({matchingPlaylists.length})
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {matchingPlaylists.map((pl) => (
                  <div
                    key={pl.id}
                    onClick={() => onSelectPlaylist(pl)}
                    className="flex items-center gap-3 p-3 rounded-2xl bg-slate-900/60 border border-white/5 hover:border-cyan-500/30 cursor-pointer transition"
                  >
                    <div className={`w-11 h-11 rounded-xl bg-gradient-to-tr ${pl.coverGradient || 'from-cyan-500 to-purple-600'} flex items-center justify-center text-white shrink-0`}>
                      <Disc className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h5 className="text-xs font-bold text-white truncate">{pl.name}</h5>
                      <p className="text-[10px] text-slate-400">{pl.songIds.length} tracks</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Matching Songs */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Songs ({matchingSongs.length})
            </h4>

            {matchingSongs.length === 0 ? (
              <p className="text-center py-8 text-xs text-slate-500">
                No matching songs found for "{query}"
              </p>
            ) : (
              <div className="space-y-2">
                {matchingSongs.map((song) => {
                  const isThisPlaying = currentSong?.id === song.id && isPlaying;
                  return (
                    <div
                      key={song.id}
                      className={`flex items-center gap-3 p-2.5 rounded-2xl border transition group ${
                        isThisPlaying
                          ? 'bg-cyan-500/15 border-cyan-400/50'
                          : 'bg-slate-900/40 border-white/5 hover:border-white/15'
                      }`}
                    >
                      <div
                        onClick={() => onPlaySong(song)}
                        className="relative w-11 h-11 rounded-xl overflow-hidden cursor-pointer shrink-0"
                      >
                        <img
                          src={song.artworkUrl || './pwa-192x192.png'}
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
                        <h5 className="text-xs font-bold text-white truncate group-hover:text-cyan-300">
                          {song.title}
                        </h5>
                        <p className="text-[11px] text-slate-400 truncate">
                          {song.artist} • {song.album}
                        </p>
                      </div>

                      <button
                        onClick={() => onToggleFavorite(song)}
                        className="p-2 text-slate-400 hover:text-pink-500 transition"
                      >
                        <Heart className={`w-4 h-4 ${song.isFavorite ? 'fill-pink-500 text-pink-500' : ''}`} />
                      </button>

                      <button
                        onClick={() => onOpenSongOptions(song)}
                        className="p-2 text-slate-400 hover:text-white"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
