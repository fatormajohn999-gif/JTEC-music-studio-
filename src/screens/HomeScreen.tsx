import React from 'react';
import { 
  Upload, Play, Heart, Disc, Clock, Music2, MoreVertical, Flame,
  Download, Loader2, CheckCircle2, RefreshCw
} from 'lucide-react';
import { Song, Playlist } from '../types/music';
import { PWAInstallButton } from '../components/PWAInstallButton';
import { NativeUpdateInfo, NativeUpdateService } from '../services/nativeUpdate';

interface HomeScreenProps {
  songs: Song[];
  playlists: Playlist[];
  recentlyPlayed: Song[];
  currentSong: Song | null;
  isPlaying: boolean;
  onPlaySong: (song: Song, contextQueue?: Song[]) => void;
  onOpenImport: () => void;
  onOpenPlaylists: () => void;
  onSelectPlaylist: (playlist: Playlist) => void;
  onOpenSongOptions: (song: Song) => void;
  onToggleFavorite: (song: Song) => void;
  onOpenCloud?: () => void;

  // Native update props
  nativeUpdateInfo?: NativeUpdateInfo | null;
  isDownloadingUpdate?: boolean;
  updateDownloadProgress?: number;
  isUpdateDownloaded?: boolean;
  updateDownloadError?: string | null;
  onTriggerUpdate?: () => void;
  onOpenBrowserDownload?: () => void;

  // PWA update props
  isPWAUpdateAvailable?: boolean;
  isPWAUpdating?: boolean;
  onReloadPWA?: () => void;
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
  onOpenCloud,

  nativeUpdateInfo,
  isDownloadingUpdate = false,
  updateDownloadProgress = 0,
  isUpdateDownloaded = false,
  updateDownloadError = null,
  onTriggerUpdate,
  onOpenBrowserDownload,

  isPWAUpdateAvailable = false,
  isPWAUpdating = false,
  onReloadPWA,
}) => {
  const favoriteSongs = songs.filter((s) => s.isFavorite);
  const recentlyAdded = [...songs].sort((a, b) => b.dateAdded - a.dateAdded).slice(0, 6);

  const hasNativeUpdate = Boolean(nativeUpdateInfo?.hasUpdate);
  const hasUpdate = hasNativeUpdate || isPWAUpdateAvailable;

  return (
    <div className="space-y-7 pb-36 px-4 sm:px-6 pt-3 max-w-3xl mx-auto w-full min-w-0">
      {/* PWA Install Alert Banner */}
      <PWAInstallButton />

      {/* Hero Welcome / Update Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0c122c] via-[#090d20] to-[#140b28] border border-cyan-500/25 p-6 sm:p-8 shadow-2xl">
        {/* Background Artwork */}
        <picture className="absolute inset-0 w-full h-full pointer-events-none">
          <source srcSet="./images/home-hero.webp" type="image/webp" />
          <img
            src="./images/home-hero.jpg"
            alt=""
            aria-hidden="true"
            className="w-full h-full object-cover object-center"
          />
        </picture>

        {/* Dark Navy Overlay: Stronger (85-98%) when update is available for peak legibility */}
        <div
          className={`absolute inset-0 pointer-events-none ${
            hasUpdate
              ? 'bg-gradient-to-b from-[#060918]/85 via-[#060918]/92 to-[#040612]/98'
              : 'bg-gradient-to-b from-[#070b19]/60 via-[#070b19]/70 to-[#050813]/90'
          }`}
        />

        {/* Glow lights */}
        <div className="absolute top-0 right-0 w-60 h-60 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-60 h-60 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-5">
          {hasNativeUpdate && nativeUpdateInfo ? (
            /* NATIVE ANDROID UPDATE CARD */
            <div className="space-y-4">
              <div className="space-y-2 text-center sm:text-left">
                <div className="inline-flex items-center px-3 py-1 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-xs font-semibold tracking-wide">
                  <span>UPDATE AVAILABLE • {nativeUpdateInfo.versionName}</span>
                </div>

                <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                  A new version is <span className="text-gradient-cyan-purple">ready</span>
                </h2>

                <p className="text-xs sm:text-sm text-slate-300 max-w-xl">
                  Update JTEC MUSIC directly without losing your saved songs, playlists, or sound settings.
                </p>
              </div>

              {/* What's New notes & file size */}
              <div className="rounded-2xl bg-slate-950/70 border border-white/5 p-4 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                  <span className="uppercase tracking-wider text-[11px] text-slate-400">What&apos;s new</span>
                  {nativeUpdateInfo.formattedSize && (
                    <span className="text-cyan-400 font-semibold text-xs">{nativeUpdateInfo.formattedSize}</span>
                  )}
                </div>

                <div className="space-y-1.5 pt-0.5 max-h-36 overflow-y-auto">
                  {nativeUpdateInfo.notesBullets.length > 0 ? (
                    nativeUpdateInfo.notesBullets.map((bullet, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-xs text-slate-200">
                        <span className="text-cyan-400 font-bold shrink-0 leading-relaxed">•</span>
                        <span className="leading-relaxed">{bullet}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-slate-300 leading-relaxed">
                      • Enhanced playback engine, smoother offline performance, and catalog improvements.
                    </div>
                  )}
                </div>
              </div>

              {/* Download Progress Bar */}
              {isDownloadingUpdate && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-cyan-300">Downloading package...</span>
                    <span className="text-white">{updateDownloadProgress}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden border border-cyan-500/20">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500 rounded-full transition-all duration-200"
                      style={{ width: `${updateDownloadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Download Error Notice & Browser Download Link */}
              {updateDownloadError && (
                <div className="space-y-1.5 pt-0.5 text-center sm:text-left">
                  <p className="text-xs text-rose-300 font-medium leading-relaxed">
                    {updateDownloadError}
                  </p>
                  <div>
                    <button
                      type="button"
                      onClick={() => {
                        if (onOpenBrowserDownload) {
                          onOpenBrowserDownload();
                        } else {
                          NativeUpdateService.openBrowserDownload();
                        }
                      }}
                      className="text-[11px] text-cyan-400 hover:text-cyan-300 underline font-semibold cursor-pointer active:opacity-75 transition inline-block"
                    >
                      Download from browser instead
                    </button>
                  </div>
                </div>
              )}

              {/* Action Buttons & Hint */}
              <div className="space-y-2 pt-1">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <button
                    onClick={onTriggerUpdate}
                    disabled={isDownloadingUpdate}
                    className={`w-full sm:w-auto px-7 py-3.5 rounded-2xl font-bold text-sm shadow-xl active:scale-95 transition flex items-center justify-center gap-2.5 shrink-0 cursor-pointer ${
                      isDownloadingUpdate
                        ? 'bg-slate-800 text-slate-400 cursor-wait'
                        : isUpdateDownloaded && !updateDownloadError
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-emerald-500/25 hover:shadow-emerald-400/40'
                        : 'bg-gradient-to-r from-cyan-500 via-purple-600 to-pink-500 text-white shadow-cyan-500/25 hover:shadow-cyan-400/40'
                    }`}
                  >
                    {isDownloadingUpdate ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                        <span>Downloading ({updateDownloadProgress}%)...</span>
                      </>
                    ) : isUpdateDownloaded && !updateDownloadError ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Install update</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        <span>{updateDownloadError ? 'Retry update' : 'Update now'}</span>
                      </>
                    )}
                  </button>
                </div>

                <p className="text-[11px] text-slate-400 text-center sm:text-left pt-0.5">
                  Tap to download and install. Android may ask you to allow installs from JTEC MUSIC.
                </p>
              </div>

              {/* Secondary Navigation (Import & Cloud) */}
              <div className="pt-3 border-t border-white/5 flex flex-wrap items-center gap-2.5">
                {onOpenCloud && (
                  <button
                    onClick={onOpenCloud}
                    className="px-4 py-2.5 rounded-xl bg-slate-900/80 border border-cyan-500/30 hover:border-cyan-400 text-cyan-300 font-semibold text-xs hover:bg-slate-900 transition flex items-center justify-center gap-2 shrink-0 active:scale-95 cursor-pointer"
                  >
                    <span>☁️ JTEC CLOUD</span>
                  </button>
                )}

                <button
                  onClick={onOpenImport}
                  className="px-4 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-white/10 hover:border-white/20 text-slate-200 font-semibold text-xs active:scale-95 transition flex items-center justify-center gap-2 shrink-0 cursor-pointer"
                >
                  <Upload className="w-4 h-4 text-cyan-400" />
                  <span>Import Music</span>
                </button>
              </div>
            </div>
          ) : isPWAUpdateAvailable ? (
            /* WEB PWA UPDATE CARD */
            <div className="space-y-4">
              <div className="space-y-2 text-center sm:text-left">
                <div className="inline-flex items-center px-3 py-1 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-xs font-semibold tracking-wide">
                  <span>UPDATE READY • WEB APP</span>
                </div>

                <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                  A new version is <span className="text-gradient-cyan-purple">ready</span>
                </h2>

                <p className="text-xs sm:text-sm text-slate-300 max-w-xl">
                  An updated version of JTEC MUSIC has been prepared in the background. Reload to activate the new engine and features.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <button
                  onClick={onReloadPWA}
                  disabled={isPWAUpdating}
                  className="w-full sm:w-auto px-7 py-3.5 rounded-2xl bg-gradient-to-r from-cyan-500 via-purple-600 to-pink-500 text-white font-bold text-sm shadow-xl shadow-cyan-500/25 hover:shadow-cyan-400/40 active:scale-95 transition flex items-center justify-center gap-2.5 shrink-0 cursor-pointer"
                >
                  {isPWAUpdating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Reloading...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      <span>Reload to update</span>
                    </>
                  )}
                </button>
              </div>

              <div className="pt-3 border-t border-white/5 flex flex-wrap items-center gap-2.5">
                {onOpenCloud && (
                  <button
                    onClick={onOpenCloud}
                    className="px-4 py-2.5 rounded-xl bg-slate-900/80 border border-cyan-500/30 hover:border-cyan-400 text-cyan-300 font-semibold text-xs hover:bg-slate-900 transition flex items-center justify-center gap-2 shrink-0 active:scale-95 cursor-pointer"
                  >
                    <span>☁️ JTEC CLOUD</span>
                  </button>
                )}

                <button
                  onClick={onOpenImport}
                  className="px-4 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-white/10 hover:border-white/20 text-slate-200 font-semibold text-xs active:scale-95 transition flex items-center justify-center gap-2 shrink-0 cursor-pointer"
                >
                  <Upload className="w-4 h-4 text-cyan-400" />
                  <span>Import Music</span>
                </button>
              </div>
            </div>
          ) : (
            /* STANDARD HOME HERO BANNER */
            <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="text-center sm:text-left space-y-2">
                <div className="inline-flex items-center px-3 py-1 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-xs font-semibold">
                  <span>Offline Master Audio Engine • JTEC CLOUD</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                  Bring Your <span className="text-gradient-cyan-purple">Vibe Offline</span>
                </h2>
                <p className="text-xs sm:text-sm text-slate-300 max-w-md">
                  Zero streaming lag. True Web Audio Slow+Reverb DSP, custom visualizers, JTEC Cloud sync, and offline storage.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full sm:w-auto">
                {onOpenCloud && (
                  <button
                    onClick={onOpenCloud}
                    className="w-full sm:w-auto px-5 py-3.5 rounded-2xl bg-slate-900/80 border border-cyan-500/30 hover:border-cyan-400 text-cyan-300 font-bold text-sm hover:bg-slate-900 transition flex items-center justify-center gap-2 shrink-0 active:scale-95 cursor-pointer shadow-lg shadow-cyan-500/10"
                  >
                    <span>☁️ JTEC CLOUD</span>
                  </button>
                )}

                <button
                  onClick={onOpenImport}
                  className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-gradient-to-r from-cyan-500 via-purple-600 to-pink-500 text-white font-bold text-sm shadow-xl shadow-cyan-500/25 hover:shadow-cyan-400/40 active:scale-95 transition flex items-center justify-center gap-2.5 shrink-0 group cursor-pointer"
                >
                  <Upload className="w-5 h-5 group-hover:-translate-y-0.5 transition" />
                  <span>Import Music</span>
                </button>
              </div>
            </div>
          )}
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
                  onClick={() => onPlaySong(song, recentlyPlayed)}
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
                    onClick={() => onPlaySong(song, favoriteSongs)}
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
                    onClick={() => onPlaySong(song, favoriteSongs)}
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
          {recentlyAdded.length === 0 ? (
            <div className="p-8 rounded-3xl bg-slate-900/30 border border-white/5 text-center space-y-3">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
                <Music2 className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Your Library is Empty</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                  Import audio files from your device to build your offline music library.
                </p>
              </div>
              <button
                onClick={onOpenImport}
                className="px-4 py-2 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold text-xs hover:bg-cyan-500/30 transition inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>+ Import Music</span>
              </button>
            </div>
          ) : (
            recentlyAdded.map((song) => {
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
                    onClick={() => onPlaySong(song, recentlyAdded)}
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
                    onClick={() => onPlaySong(song, recentlyAdded)}
                    className="flex-1 min-w-0 cursor-pointer"
                  >
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-xs font-bold text-white truncate group-hover:text-cyan-300">
                        {song.title}
                      </h4>
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
            })
          )}
        </div>
      </div>
    </div>
  );
};
