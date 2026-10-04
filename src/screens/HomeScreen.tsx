import React from 'react';
import { 
  Upload, Play, Heart, Disc, Sparkles, Clock, Music2, MoreVertical, Flame 
} from 'lucide-react';
import { Song, Playlist } from '../types/music';
import { PWAInstallButton } from '../components/PWAInstallButton';

interface HomeScreenProps {
  songs: Song[];
  playlists: Playlist[];
  recentlyPlayed: Song[];
  currentSong: Song | null;
  isPlaying: boolean;
  onPlaySong: (song: Song) => void;
  onOpenImport: () => void;
  onOpenPlaylists: () => void;
  onSelectPlaylist: (playlist: Playlist) => void;
  onOpenSongOptions: (song: Song) => void;
  onToggleFavorite: (song: Song) => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  songs,
  playlists,
  recentlyPlayed,
  currentSong,
  isPlaying,
  onPlaySong,
  onOpenImport,
  onOpenPlaylists,
  onSelectPlaylist,
  onOpenSongOptions,
  onToggleFavorite,
}) => {
  const favoriteSongs = songs.filter((s) => s.isFavorite);
  const recentlyAdded = [...songs].sort((a, b) => b.dateAdded - a.dateAdded).slice(0, 6);

  return (
    <div className="space-y-7 pb-36 px-4 pt-3 max-w-4xl mx-auto">
      {/* PWA Install Alert Banner */}
      <PWAInstallButton />

      {/* Hero Welcome / Big Import CTA */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0c122c] via-[#090d20] to-[#140b28] border border-cyan-500/25 p-6 sm:p-8 shadow-2xl">
        {/* Glow lights */}
        <div className="absolute top-0 right-0 w-60 h-60 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-60 h-60 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="text-center sm:text-left space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Offline Master Audio Engine</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Bring Your <span className="text-gradient-cyan-purple">Vibe Offline</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 max-w-md">
              Zero streaming lag. True Web Audio Slow+Reverb DSP, custom visualizers, and offline storage.
            </p>
          </div>

          <button
            onClick={onOpenImport}
            className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-gradient-to-r from-cyan-500 via-purple-600 to-pink-500 text-white font-bold text-sm shadow-xl shadow-cyan-500/25 hover:shadow-cyan-400/40 active:scale-95 transition flex items-center justify-center gap-2.5 shrink-0 group"
          >
            <Upload className="w-5 h-5 group-hover:-translate-y-0.5 transition" />
            <span>Import Music</span>
          </button>
        </div>
      </div>

      {/* Quick Playlists Access */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Disc className="w-4 h-4 text-cyan-400" />
            Quick Playlists
          </h3>
          <button
            onClick={onOpenPlaylists}
            className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition"
          >
            See all ({playlists.length})
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {playlists.slice(0, 4).map((pl) => (
            <div
              key={pl.id}
              onClick={() => onSelectPlaylist(pl)}
              className="group cursor-pointer p-3 rounded-2xl bg-slate-900/60 border border-white/5 hover:border-cyan-500/40 transition active:scale-98 flex items-center gap-3"
            >
              <div className={`w-11 h-11 rounded-xl bg-gradient-to-tr ${pl.coverGradient || 'from-cyan-500 to-purple-600'} flex items-center justify-center text-white shadow-md shrink-0 group-hover:scale-105 transition`}>
                <Disc className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-bold text-white truncate group-hover:text-cyan-300 transition">
                  {pl.name}
                </h4>
                <p className="text-[10px] text-slate-400">{pl.songIds.length} tracks</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recently Played */}
      {recentlyPlayed.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-purple-400" />
              Recently Played
            </h3>
          </div>

          <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
            {recentlyPlayed.slice(0, 8).map((song) => {
              const isThisPlaying = currentSong?.id === song.id && isPlaying;
              return (
                <div
                  key={song.id}
                  onClick={() => onPlaySong(song)}
                  className="w-36 shrink-0 group cursor-pointer space-y-2 p-2.5 rounded-2xl bg-slate-900/50 border border-white/5 hover:border-cyan-500/30 transition"
                >
                  <div className="relative aspect-square rounded-xl overflow-hidden bg-slate-950">
                    <img
                      src={song.artworkUrl || './pwa-192x192.png'}
                      alt={song.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                      <div className="w-10 h-10 rounded-full bg-cyan-400 text-black flex items-center justify-center shadow-lg">
                        <Play className="w-4 h-4 fill-black ml-0.5" />
                      </div>
                    </div>
                    {isThisPlaying && (
                      <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-cyan-500 text-black text-[9px] font-bold">
                        PLAYING
                      </div>
                    )}
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-white truncate">{song.title}</h4>
                    <p className="text-[11px] text-slate-400 truncate">{song.artist}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Favorites Showcase */}
      {favoriteSongs.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Heart className="w-4 h-4 text-pink-500 fill-pink-500" />
              Favorite Songs
            </h3>
            <span className="text-xs text-slate-400">{favoriteSongs.length} favorites</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {favoriteSongs.slice(0, 4).map((song) => {
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
                    className="relative w-12 h-12 rounded-xl overflow-hidden cursor-pointer shrink-0"
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
                    <h4 className="text-xs font-bold text-white truncate group-hover:text-cyan-300">
                      {song.title}
                    </h4>
                    <p className="text-[11px] text-slate-400 truncate">{song.artist}</p>
                  </div>

                  <button
                    onClick={() => onToggleFavorite(song)}
                    className="p-2 text-pink-500 hover:scale-110 transition"
                  >
                    <Heart className="w-4 h-4 fill-pink-500" />
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
        </div>
      )}

      {/* Recently Added Songs */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Flame className="w-4 h-4 text-amber-400" />
            Recently Added
          </h3>
          <span className="text-xs text-slate-400">{songs.length} total tracks</span>
        </div>

        <div className="space-y-2">
          {recentlyAdded.map((song) => {
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
                  className="relative w-12 h-12 rounded-xl overflow-hidden cursor-pointer shrink-0"
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
                  <div className="flex items-center gap-1.5">
                    <h4 className="text-xs font-bold text-white truncate group-hover:text-cyan-300">
                      {song.title}
                    </h4>
                    {song.isDemo && (
                      <span className="shrink-0 text-[9px] px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-semibold">
                        DEMO
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">{song.artist}</p>
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
      </div>
    </div>
  );
};
