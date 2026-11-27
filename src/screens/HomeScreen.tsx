import React from 'react';
import {
  Upload,
  Play,
  Pause,
  Heart,
  Disc,
  Clock,
  Music2,
  MoreVertical,
  Flame,
  Download,
  Loader2,
  CheckCircle2,
  RefreshCw,
  Cloud,
  Radio,
  ChevronRight,
  Headphones,
} from 'lucide-react';
import { Song, Playlist } from '../types/music';
import { PWAInstallButton } from '../components/PWAInstallButton';
import { NativeUpdateInfo, NativeUpdateService } from '../services/nativeUpdate';
import { isNativeAndroid } from '../services/appConfig';

interface HomeScreenProps {
  songs: Song[];
  playlists: Playlist[];
  recentlyPlayed: Song[];
  currentSong: Song | null;
  isPlaying: boolean;
  onPlaySong: (song: Song, contextQueue?: Song[]) => void;
  onTogglePlay?: () => void;
  onOpenFullPlayer?: () => void;
  onOpenImport: () => void;
  onOpenPlaylists: () => void;
  onSelectPlaylist: (playlist: Playlist) => void;
  onOpenSongOptions: (song: Song) => void;
  onToggleFavorite: (song: Song) => void;
  onOpenCloud?: () => void;
  onOpenParty?: () => void;
  partyRoomCode?: string | null;
  partyMemberCount?: number;

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
  onTogglePlay,
  onOpenFullPlayer,
  onOpenImport,
  onOpenPlaylists,
  onSelectPlaylist,
  onOpenSongOptions,
  onToggleFavorite,
  onOpenCloud,
  onOpenParty,
  partyRoomCode,
  partyMemberCount = 0,

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
  const recentlyAdded = [...songs]
    .sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0))
    .slice(0, 6);

  const featuredSong = currentSong || recentlyAdded[0] || null;
  const isFeaturedCurrentlyActive = Boolean(currentSong && featuredSong?.id === currentSong.id);

  const hasNativeUpdate = isNativeAndroid() && Boolean(nativeUpdateInfo?.hasUpdate);
  const showWebUpdateBanner = !isNativeAndroid() && Boolean(isPWAUpdateAvailable);

  return (
    <div className="space-y-6 pb-36 px-4 sm:px-6 pt-3 max-w-3xl mx-auto w-full min-w-0">
      {/* PWA Install Alert Banner */}
      <PWAInstallButton />

      {/* Small non-blocking Web update banner shown when update is ready */}
      {showWebUpdateBanner && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-gradient-to-r from-[#142338] to-[#171B30] border border-cyan-400/35 shadow-lg animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" />
            <span className="text-xs font-semibold text-white truncate">
              New version ready
            </span>
          </div>
          <button
            type="button"
            onClick={onReloadPWA}
            disabled={isPWAUpdating}
            className="shrink-0 min-h-[36px] flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 hover:brightness-110 text-white font-bold text-xs shadow-md shadow-cyan-500/20 active:scale-95 transition disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isPWAUpdating ? 'animate-spin' : ''}`} />
            <span>{isPWAUpdating ? 'Reloading...' : 'Reload'}</span>
          </button>
        </div>
      )}

      {/* 1. Welcome / Header or Native Android Update Card */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#131D33] via-[#101526] to-[#1D1330] border border-cyan-400/25 p-5 sm:p-6 shadow-2xl">
        {/* Subtle Background Artwork */}
        <picture className="absolute inset-0 w-full h-full pointer-events-none opacity-35">
          <source srcSet="./images/home-hero.webp" type="image/webp" />
          <img
            src="./images/home-hero.jpg"
            alt=""
            aria-hidden="true"
            className="w-full h-full object-cover object-center"
          />
        </picture>

        <div
          className={`absolute inset-0 pointer-events-none ${
            hasNativeUpdate
              ? 'bg-gradient-to-b from-[#080C18]/90 via-[#0A0F1E]/94 to-[#080A10]/98'
              : 'bg-gradient-to-b from-[#0E1526]/75 via-[#0B101D]/85 to-[#090D18]/95'
          }`}
        />

        <div className="relative z-10 space-y-5">
          {hasNativeUpdate && nativeUpdateInfo ? (
            /* NATIVE ANDROID UPDATE CARD */
            <div className="space-y-4">
              <div className="space-y-2 text-center sm:text-left">
                <span className="inline-flex items-center px-3 py-1 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-xs font-bold tracking-wide">
                  UPDATE AVAILABLE · {nativeUpdateInfo.versionName}
                </span>

                <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                  A new version is <span className="text-gradient-cyan-purple">ready</span>
                </h2>

                <p className="text-xs sm:text-sm text-slate-300 max-w-xl">
                  Update JTEC MUSIC directly without losing your saved songs, playlists, or sound settings.
                </p>
              </div>

              <div className="rounded-2xl bg-[#090D16]/85 border border-white/10 p-4 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                  <span className="uppercase tracking-wider text-[11px] text-slate-400">What&apos;s new</span>
                  {nativeUpdateInfo.formattedSize && (
                    <span className="text-cyan-400 font-mono text-xs">{nativeUpdateInfo.formattedSize}</span>
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

              {isDownloadingUpdate && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-cyan-300">Downloading package...</span>
                    <span className="text-white font-mono">{updateDownloadProgress}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden border border-cyan-500/20">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500 rounded-full transition-all duration-200"
                      style={{ width: `${updateDownloadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {updateDownloadError && (
                <div className="space-y-1.5 pt-0.5 text-center sm:text-left">
                  <p className="text-xs text-rose-300 font-medium leading-relaxed">
                    {updateDownloadError}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      if (onOpenBrowserDownload) {
                        onOpenBrowserDownload();
                      } else {
                        NativeUpdateService.openBrowserDownload();
                      }
                    }}
                    className="text-[11px] text-cyan-400 hover:text-cyan-300 underline font-semibold cursor-pointer"
                  >
                    Download from browser instead
                  </button>
                </div>
              )}

              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={onTriggerUpdate}
                  disabled={isDownloadingUpdate}
                  className={`w-full sm:w-auto min-h-[46px] px-7 py-3 rounded-2xl font-bold text-sm shadow-xl active:scale-95 transition flex items-center justify-center gap-2.5 cursor-pointer ${
                    isDownloadingUpdate
                      ? 'bg-slate-800 text-slate-400 cursor-wait'
                      : isUpdateDownloaded && !updateDownloadError
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-emerald-500/25'
                      : 'bg-gradient-to-r from-cyan-500 via-purple-600 to-pink-500 text-white shadow-cyan-500/25'
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

                <p className="text-[11px] text-slate-400 text-center sm:text-left">
                  Tap to download and install. Android may ask you to allow installs from JTEC MUSIC.
                </p>
              </div>

              <div className="pt-3 border-t border-white/10 flex flex-wrap items-center gap-2.5">
                {onOpenCloud && (
                  <button
                    type="button"
                    onClick={onOpenCloud}
                    className="min-h-[42px] px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.11] border border-cyan-500/30 text-cyan-300 font-semibold text-xs transition flex items-center gap-2 cursor-pointer"
                  >
                    <Cloud className="w-4 h-4" />
                    <span>JTEC Cloud</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={onOpenImport}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.11] border border-white/10 text-slate-200 font-semibold text-xs transition flex items-center gap-2 cursor-pointer"
                >
                  <Upload className="w-4 h-4 text-cyan-400" />
                  <span>Import Music</span>
                </button>
              </div>
            </div>
          ) : (
            /* WELCOME HEADER */
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
              <div className="space-y-1.5">
                <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-300">
                  <Headphones className="w-3.5 h-3.5" />
                  <span>JTEC MUSIC</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                  Your Sound, <span className="text-gradient-cyan-purple">Offline &amp; Live</span>
                </h2>
                <p className="text-xs sm:text-sm text-slate-300 max-w-md leading-relaxed">
                  High-fidelity local playback, Slow + Reverb audio DSP, curated cloud catalogs, and synchronized listening.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={onOpenImport}
                  className="min-h-[46px] px-5 py-3 rounded-2xl bg-gradient-to-r from-cyan-500 via-purple-600 to-pink-500 hover:brightness-110 text-white font-bold text-sm shadow-lg shadow-cyan-500/20 active:scale-95 transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  <span>Import Music</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 2. Featured or Currently Playing Music */}
      {featuredSong && (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Music2 className="w-4 h-4 text-cyan-400" />
              <span>{isFeaturedCurrentlyActive ? 'Currently Playing' : 'Featured Track'}</span>
            </h3>
            {isFeaturedCurrentlyActive && onOpenFullPlayer && (
              <button
                type="button"
                onClick={onOpenFullPlayer}
                className="text-xs font-semibold text-cyan-300 hover:text-cyan-200 transition cursor-pointer"
              >
                Open Player →
              </button>
            )}
          </div>

          <div className="p-4 rounded-2xl bg-gradient-to-r from-[#142338] via-[#171B30] to-[#241636] border border-cyan-400/35 shadow-xl flex items-center gap-3.5 sm:gap-4">
            <button
              type="button"
              onClick={() => {
                if (isFeaturedCurrentlyActive && onOpenFullPlayer) {
                  onOpenFullPlayer();
                } else {
                  onPlaySong(featuredSong, songs);
                }
              }}
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden bg-[#090D16] border border-white/15 shrink-0 cursor-pointer relative group"
              aria-label={`Open ${featuredSong.title}`}
            >
              <img
                src={featuredSong.artworkUrl || './pwa-192x192.png'}
                alt={featuredSong.title}
                className="w-full h-full object-cover"
              />
            </button>

            <div
              onClick={() => {
                if (isFeaturedCurrentlyActive && onOpenFullPlayer) {
                  onOpenFullPlayer();
                } else {
                  onPlaySong(featuredSong, songs);
                }
              }}
              className="flex-1 min-w-0 cursor-pointer space-y-1"
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-300 block">
                {isFeaturedCurrentlyActive ? (isPlaying ? 'Playing Now' : 'Paused') : 'Ready to Play'}
              </span>
              <h4 className="text-sm sm:text-base font-extrabold text-white truncate">
                {featuredSong.title}
              </h4>
              <p className="text-xs text-slate-300 truncate">
                {featuredSong.artist || 'Unknown Artist'}
                {featuredSong.album ? ` · ${featuredSong.album}` : ''}
              </p>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (isFeaturedCurrentlyActive && onTogglePlay) {
                    onTogglePlay();
                  } else {
                    onPlaySong(featuredSong, songs);
                  }
                }}
                aria-label={isFeaturedCurrentlyActive && isPlaying ? 'Pause' : 'Play'}
                className="w-11 h-11 rounded-full bg-gradient-to-br from-cyan-400 to-purple-600 text-slate-950 flex items-center justify-center shadow-lg shadow-cyan-500/25 active:scale-95 transition cursor-pointer"
              >
                {isFeaturedCurrentlyActive && isPlaying ? (
                  <Pause className="w-5 h-5 fill-current" />
                ) : (
                  <Play className="w-5 h-5 fill-current ml-0.5" />
                )}
              </button>

              <button
                type="button"
                onClick={() => onOpenSongOptions(featuredSong)}
                aria-label="Track options"
                className="w-10 h-10 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-slate-300 hover:text-white flex items-center justify-center transition cursor-pointer"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>
      )}

      {/* 3. JTEC Cloud & JTEC Party Quick Access Cards */}
      {(onOpenCloud || onOpenParty) && (
        <section className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-3">
          {onOpenCloud && (
            <button
              type="button"
              onClick={onOpenCloud}
              className="group p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-[#151B2B] to-[#101420] border border-white/10 hover:border-cyan-400/45 text-left shadow-lg active:scale-[0.98] transition cursor-pointer min-h-[110px] flex flex-col justify-between gap-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="w-10 h-10 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 flex items-center justify-center">
                  <Cloud className="w-5 h-5" />
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-300 transition" />
              </div>
              <div className="space-y-0.5 min-w-0">
                <h3 className="text-sm sm:text-base font-extrabold text-white">JTEC Cloud</h3>
                <p className="text-[11px] text-slate-400 truncate">
                  Curated tracks, Nasheed &amp; Jamendo
                </p>
              </div>
            </button>
          )}

          {onOpenParty && (
            <button
              type="button"
              onClick={onOpenParty}
              className="group p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-[#19182B] to-[#111220] border border-white/10 hover:border-purple-400/45 text-left shadow-lg active:scale-[0.98] transition cursor-pointer min-h-[110px] flex flex-col justify-between gap-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="w-10 h-10 rounded-2xl bg-purple-500/15 border border-purple-500/30 text-purple-300 flex items-center justify-center">
                  <Radio className="w-5 h-5" />
                </div>
                {partyRoomCode ? (
                  <span className="font-mono text-[10px] font-bold text-cyan-300 bg-cyan-500/15 border border-cyan-500/30 px-2 py-0.5 rounded-lg">
                    {partyRoomCode} · {partyMemberCount}
                  </span>
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-purple-300 transition" />
                )}
              </div>
              <div className="space-y-0.5 min-w-0">
                <h3 className="text-sm sm:text-base font-extrabold text-white">JTEC Party</h3>
                <p className="text-[11px] text-slate-400 truncate">
                  {partyRoomCode ? 'Return to active listening room' : 'Listen together in sync'}
                </p>
              </div>
            </button>
          )}
        </section>
      )}

      {/* 4. Recently Played */}
      {recentlyPlayed.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Clock className="w-4 h-4 text-purple-400" />
              <span>Recently Played</span>
            </h3>
            <span className="text-xs text-slate-400 font-mono">{recentlyPlayed.length}</span>
          </div>

          <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
            {recentlyPlayed.slice(0, 8).map((song) => {
              const isThisPlaying = currentSong?.id === song.id && isPlaying;
              return (
                <div
                  key={song.id}
                  onClick={() => onPlaySong(song, recentlyPlayed)}
                  className="w-36 shrink-0 group cursor-pointer space-y-2 p-2.5 rounded-2xl bg-gradient-to-br from-[#151B2B] to-[#101420] border border-white/10 hover:border-cyan-400/40 transition"
                >
                  <div className="relative aspect-square rounded-xl overflow-hidden bg-[#090D16]">
                    <img
                      src={song.artworkUrl || './pwa-192x192.png'}
                      alt={song.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                      <div className="w-10 h-10 rounded-full bg-cyan-400 text-slate-950 flex items-center justify-center shadow-lg">
                        <Play className="w-4 h-4 fill-current ml-0.5" />
                      </div>
                    </div>
                    {isThisPlaying && (
                      <div className="absolute top-2 right-2 px-2 py-0.5 rounded-lg bg-cyan-400 text-slate-950 text-[9px] font-extrabold">
                        PLAYING
                      </div>
                    )}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white truncate">{song.title}</h4>
                    <p className="text-[11px] text-slate-400 truncate">{song.artist}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 5. Recently Added */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <Flame className="w-4 h-4 text-amber-400" />
            <span>Recently Added</span>
          </h3>
          <span className="text-xs text-slate-400 font-mono">{songs.length} tracks</span>
        </div>

        {recentlyAdded.length === 0 ? (
          <div className="p-7 rounded-2xl bg-gradient-to-br from-[#151B2B] to-[#101420] border border-white/10 text-center space-y-3">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 flex items-center justify-center">
              <Music2 className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-white">Your Library is Empty</h4>
              <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
                Import audio files from your device or download tracks from JTEC Cloud to listen offline.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={onOpenImport}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/35 font-bold text-xs hover:bg-cyan-500/30 transition inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Import Music</span>
              </button>
              {onOpenCloud && (
                <button
                  type="button"
                  onClick={onOpenCloud}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-white/[0.06] text-slate-200 border border-white/10 font-bold text-xs hover:bg-white/[0.11] transition inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Cloud className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Browse Cloud</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {recentlyAdded.map((song) => {
              const isThisPlaying = currentSong?.id === song.id && isPlaying;
              return (
                <div
                  key={song.id}
                  className={`flex items-center gap-3 p-2.5 rounded-2xl border transition group ${
                    isThisPlaying
                      ? 'bg-cyan-500/15 border-cyan-400/45'
                      : 'bg-gradient-to-br from-[#151B2B] to-[#101420] border-white/10 hover:border-white/20'
                  }`}
                >
                  <div
                    onClick={() => onPlaySong(song, recentlyAdded)}
                    className="relative w-12 h-12 rounded-xl overflow-hidden cursor-pointer shrink-0 bg-[#090D16]"
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
                    <h4 className="text-xs font-bold text-white truncate group-hover:text-cyan-300">
                      {song.title}
                    </h4>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">{song.artist}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => onToggleFavorite(song)}
                    aria-label="Toggle favorite"
                    className="min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-400 hover:text-pink-500 transition cursor-pointer"
                  >
                    <Heart className={`w-4 h-4 ${song.isFavorite ? 'fill-pink-500 text-pink-500' : ''}`} />
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenSongOptions(song)}
                    aria-label="Track options"
                    className="min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-400 hover:text-white transition cursor-pointer"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 6. Your Playlists */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <Disc className="w-4 h-4 text-cyan-400" />
            <span>Your Playlists</span>
          </h3>
          <button
            type="button"
            onClick={onOpenPlaylists}
            className="text-xs font-semibold text-cyan-300 hover:text-cyan-200 transition cursor-pointer"
          >
            See all ({playlists.length})
          </button>
        </div>

        <div className="grid grid-cols-1 min-[360px]:grid-cols-2 sm:grid-cols-4 gap-2.5">
          {playlists.slice(0, 4).map((pl) => (
            <button
              key={pl.id}
              type="button"
              onClick={() => onSelectPlaylist(pl)}
              className="group cursor-pointer p-3 rounded-2xl bg-gradient-to-br from-[#151B2B] to-[#101420] border border-white/10 hover:border-cyan-400/45 transition active:scale-[0.98] flex items-center gap-3 text-left min-h-[64px]"
            >
              <div
                className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${
                  pl.coverGradient || 'from-cyan-500 to-purple-600'
                } flex items-center justify-center text-white shadow-md shrink-0`}
              >
                <Disc className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-bold text-white truncate group-hover:text-cyan-300 transition">
                  {pl.name}
                </h4>
                <p className="text-[10px] text-slate-400 font-mono">{pl.songIds.length} tracks</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* 7. Favorites */}
      {favoriteSongs.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Heart className="w-4 h-4 text-pink-500 fill-pink-500" />
              <span>Favorites</span>
            </h3>
            <span className="text-xs text-slate-400 font-mono">{favoriteSongs.length}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {favoriteSongs.slice(0, 4).map((song) => {
              const isThisPlaying = currentSong?.id === song.id && isPlaying;
              return (
                <div
                  key={song.id}
                  className={`flex items-center gap-3 p-2.5 rounded-2xl border transition group ${
                    isThisPlaying
                      ? 'bg-cyan-500/15 border-cyan-400/45'
                      : 'bg-gradient-to-br from-[#151B2B] to-[#101420] border-white/10 hover:border-white/20'
                  }`}
                >
                  <div
                    onClick={() => onPlaySong(song, favoriteSongs)}
                    className="relative w-12 h-12 rounded-xl overflow-hidden cursor-pointer shrink-0 bg-[#090D16]"
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
                    type="button"
                    onClick={() => onToggleFavorite(song)}
                    aria-label="Remove from favorites"
                    className="min-w-[40px] min-h-[40px] flex items-center justify-center text-pink-500 hover:scale-110 transition cursor-pointer"
                  >
                    <Heart className="w-4 h-4 fill-pink-500" />
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenSongOptions(song)}
                    aria-label="Track options"
                    className="min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-400 hover:text-white cursor-pointer"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};
