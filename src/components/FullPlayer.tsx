import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  ChevronDown,
  Heart,
  Shuffle,
  Repeat,
  Repeat1,
  SkipBack,
  SkipForward,
  Play,
  Pause,
  Sliders,
  ListMusic,
  MoreVertical,
  Plus,
  AlarmClock,
  ImagePlus,
  Music,
  Radio,
  X,
} from 'lucide-react';
import {
  Song,
  AudioEffectsConfig,
  CinematicScene,
  RepeatMode,
  PerformanceMode,
  ArtworkPalette,
  ReactionStrength,
  SleepTimerState,
} from '../types/music';
import { SleepTimerSection } from './SleepTimerSection';

interface FullPlayerProps {
  isOpen: boolean;
  onClose: () => void;
  currentSong: Song | null;
  isPlaying: boolean;
  currentTime?: number;
  duration?: number;
  effects: AudioEffectsConfig;
  visualizerMode?: CinematicScene;
  performanceMode?: PerformanceMode;
  reactionStrength?: ReactionStrength;
  neonGlow?: boolean;
  repeatMode: RepeatMode;
  isShuffle: boolean;
  palette: ArtworkPalette;
  sleepTimer?: SleepTimerState;
  onTogglePlay: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeek?: (seconds: number) => void;
  onToggleFavorite: (song: Song) => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  onSelectScene?: (scene: CinematicScene) => void;
  onOpenEffects: () => void;
  onOpenQueue: () => void;
  onOpenSongOptions: (song: Song) => void;
  onAddToPlaylist?: (song: Song) => void;
  onStartSleepTimer?: (minutes: number) => void;
  onCancelSleepTimer?: () => void;
  onExtendSleepTimer?: (minutes?: number) => void;
  autoplayNext?: boolean;
  onToggleAutoplayNext?: () => void;
  isPartyGuest?: boolean;
}

const DEFAULT_FALLBACK_ARTWORK = './pwa-192x192.png';

function formatPlayerTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function formatCompactTimer(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function buildStaticAmbientBackground(palette: ArtworkPalette, useCoverGlow: boolean): string {
  if (!useCoverGlow) {
    return 'linear-gradient(180deg, #0b1020 0%, #070a14 55%, #05070e 100%)';
  }

  const primary = palette.hasCover ? palette.primary || palette.main || '#00f0ff' : '#00f0ff';
  const secondary = palette.hasCover ? palette.secondary || '#a855f7' : '#a855f7';
  const accent = palette.hasCover ? palette.accent || primary : '#38bdf8';

  // Softly diffused multi-stop radial gradients (static, zero canvas/WebGL/animation loop)
  return [
    `radial-gradient(ellipse 95% 65% at 50% 48%, ${primary}40 0%, ${secondary}24 46%, transparent 78%)`,
    `radial-gradient(ellipse 80% 50% at 20% 25%, ${secondary}38 0%, transparent 70%)`,
    `radial-gradient(ellipse 75% 45% at 82% 72%, ${accent}2b 0%, transparent 72%)`,
    `linear-gradient(180deg, ${palette.darkBg || '#080c18'} 0%, #060912 65%, #04060c 100%)`,
  ].join(', ');
}

export const FullPlayer: React.FC<FullPlayerProps> = ({
  isOpen,
  onClose,
  currentSong,
  isPlaying,
  currentTime = 0,
  duration = 0,
  effects,
  neonGlow = true,
  repeatMode,
  isShuffle,
  palette,
  sleepTimer,
  onTogglePlay,
  onPrevious,
  onNext,
  onSeek,
  onToggleFavorite,
  onToggleShuffle,
  onCycleRepeat,
  onOpenEffects,
  onOpenQueue,
  onOpenSongOptions,
  onAddToPlaylist,
  onStartSleepTimer,
  onCancelSleepTimer,
  onExtendSleepTimer,
  isPartyGuest = false,
}) => {
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekTime, setSeekTime] = useState<number | null>(null);
  const [failedArtUrl, setFailedArtUrl] = useState<string | null>(null);
  const [fallbackLogoFailed, setFallbackLogoFailed] = useState(false);
  const [showSleepTimerSheet, setShowSleepTimerSheet] = useState(false);

  // Lightweight two-layer crossfade state when artwork/palette changes
  const nextBg = buildStaticAmbientBackground(palette, neonGlow);
  const [bgLayers, setBgLayers] = useState<{ current: string; prev: string | null; fadeIn: boolean }>({
    current: nextBg,
    prev: null,
    fadeIn: true,
  });

  useEffect(() => {
    setBgLayers((state) => {
      if (state.current === nextBg) return state;
      return {
        prev: state.current,
        current: nextBg,
        fadeIn: false,
      };
    });
    const raf = requestAnimationFrame(() => {
      setBgLayers((state) => (state.fadeIn ? state : { ...state, fadeIn: true }));
    });
    return () => cancelAnimationFrame(raf);
  }, [nextBg]);

  useEffect(() => {
    setFailedArtUrl(null);
  }, [currentSong?.id, currentSong?.artworkUrl]);

  const progressBarRef = useRef<HTMLDivElement | null>(null);

  const totalDuration = duration > 0 ? duration : currentSong?.duration || 0;
  const effectiveCurrentTime = isSeeking && seekTime !== null ? seekTime : currentTime;
  const progressPercent = totalDuration > 0 ? (effectiveCurrentTime / totalDuration) * 100 : 0;
  const clampedPercent = Math.min(100, Math.max(0, progressPercent));

  const progressColor = palette.hasCover ? palette.primary || palette.main || '#f97316' : '#22d3ee';

  const calculateSeekTime = useCallback(
    (clientX: number) => {
      if (isPartyGuest || !progressBarRef.current || totalDuration <= 0) return 0;
      const rect = progressBarRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return ratio * totalDuration;
    },
    [totalDuration, isPartyGuest]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isPartyGuest) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsSeeking(true);
    setSeekTime(calculateSeekTime(e.clientX));
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isPartyGuest || !isSeeking) return;
    setSeekTime(calculateSeekTime(e.clientX));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isSeeking) return;
    const newTime = calculateSeekTime(e.clientX);
    setIsSeeking(false);
    setSeekTime(null);
    if (onSeek) {
      onSeek(newTime);
    }
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  if (!isOpen || !currentSong) return null;

  const isEffectsActive = Boolean(
    effects.isEnabled ??
      (effects.presetName !== 'Normal' ||
        effects.playbackRate !== 1.0 ||
        effects.reverbWet > 0 ||
        effects.echoWet > 0 ||
        effects.bassGain !== 0 ||
        effects.trebleGain !== 0)
  );

  const hasCustomArtwork = Boolean(
    currentSong.artworkUrl &&
      currentSong.artworkUrl !== DEFAULT_FALLBACK_ARTWORK &&
      failedArtUrl !== currentSong.artworkUrl
  );

  const handleSleepTimerAction = () => {
    if (onStartSleepTimer && onCancelSleepTimer && onExtendSleepTimer && sleepTimer) {
      setShowSleepTimerSheet(true);
    } else {
      onOpenEffects();
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-[#050811] flex flex-col justify-between overflow-hidden select-none animate-in fade-in duration-200">
      {/* 1. STATIC SOFTLY DIFFUSED ARTWORK COLOR BACKDROP (ZERO ANIMATION LOOPS) */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        {bgLayers.prev && (
          <div
            className="absolute inset-0"
            style={{ background: bgLayers.prev }}
          />
        )}
        <div
          className="absolute inset-0 transition-opacity duration-500 ease-out"
          style={{
            background: bgLayers.current,
            opacity: bgLayers.fadeIn ? 1 : 0,
          }}
        />
        {/* Contrast scrim ensuring controls remain crisp on bright covers */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(4,6,13,0.68) 0%, rgba(4,6,13,0.16) 40%, rgba(4,6,13,0.46) 74%, rgba(4,6,13,0.88) 100%)',
          }}
        />
      </div>

      {/* 2. TOP HEADER BAR */}
      <div className="relative z-20 flex items-center justify-between px-4 sm:px-6 pt-safe pb-1 shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-white/85 hover:text-white hover:bg-white/10 active:scale-95 transition cursor-pointer"
          title="Minimize player"
          aria-label="Minimize player"
        >
          <ChevronDown className="w-6 h-6" />
        </button>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleShuffle}
            className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full transition active:scale-95 cursor-pointer ${
              isShuffle
                ? 'text-cyan-300 bg-cyan-500/15'
                : 'text-white/75 hover:text-white hover:bg-white/10'
            }`}
            title={`Shuffle: ${isShuffle ? 'On' : 'Off'}`}
            aria-label={`Shuffle ${isShuffle ? 'On' : 'Off'}`}
          >
            <Shuffle className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => onOpenSongOptions(currentSong)}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-white/85 hover:text-white hover:bg-white/10 active:scale-95 transition cursor-pointer"
            title="Song options"
            aria-label="Song options"
          >
            <MoreVertical className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 3. TRACK TITLE & ARTIST (CENTERED) */}
      <div className="relative z-20 px-6 text-center shrink-0 max-w-md mx-auto w-full">
        <h2 dir="auto" className="text-base sm:text-lg font-semibold text-white truncate leading-snug">
          {currentSong.title}
        </h2>
        <p dir="auto" className="text-xs sm:text-sm text-white/60 truncate mt-0.5">
          {currentSong.artist || '<unknown>'}
        </p>

        {isPartyGuest && (
          <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/15 border border-cyan-400/30 text-cyan-300 text-[11px] font-medium">
            <Radio className="w-3.5 h-3.5 text-cyan-400" />
            <span>In JTEC Party · Controlled by host</span>
          </div>
        )}
      </div>

      {/* 4. PROMINENT CENTER ARTWORK WITH STATIC VINYL SILHOUETTE */}
      <div className="relative z-10 flex-1 min-h-0 flex items-center justify-center px-6 py-4">
        <div className="relative w-[68vw] max-w-[280px] sm:max-w-[330px] aspect-square flex items-center justify-center">
          {/* Static vinyl disc edge peeking above album artwork (zero animation loop) */}
          <div
            aria-hidden="true"
            className="absolute -top-7 left-1/2 -translate-x-1/2 w-[78%] aspect-square rounded-full pointer-events-none shadow-lg"
            style={{
              background:
                'radial-gradient(circle, #181a20 0%, #181a20 26%, #0c0d11 27%, #171920 34%, #0b0c10 42%, #15171e 50%, #090a0e 60%, #14161c 70%, #07080b 84%, #1f222b 100%)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          />

          {/* Foreground Artwork Card */}
          <div className="relative z-10 w-full h-full rounded-2xl overflow-hidden bg-[#0c1224] border border-white/10 shadow-[0_22px_50px_rgba(0,0,0,0.65)] flex items-center justify-center">
            {hasCustomArtwork ? (
              <img
                src={currentSong.artworkUrl}
                alt={currentSong.title}
                decoding="async"
                loading="eager"
                onError={() => setFailedArtUrl(currentSong.artworkUrl || null)}
                className="w-full h-full object-cover transition-opacity duration-300"
              />
            ) : !fallbackLogoFailed ? (
              <img
                src={DEFAULT_FALLBACK_ARTWORK}
                alt={currentSong.title}
                decoding="async"
                loading="eager"
                onError={() => setFallbackLogoFailed(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-[#131d3b] via-[#0b1024] to-[#1a1033] flex flex-col items-center justify-center gap-2 text-cyan-300">
                <Music className="w-16 h-16 opacity-80" />
                <span className="text-xs font-semibold tracking-wider text-white/60">JTEC MUSIC</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 5. BOTTOM CONTROLS STACK (ACTION ROW + PROGRESS + PLAYBACK) */}
      <div className="relative z-20 px-6 pb-safe pb-6 pt-1 max-w-md mx-auto w-full space-y-5 shrink-0">
        {/* 5-Icon Action Row Directly Beneath Artwork */}
        <div className="flex items-center justify-between px-1">
          {/* 1. Favourite */}
          <button
            type="button"
            onClick={() => onToggleFavorite(currentSong)}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-white/10 active:scale-90 transition cursor-pointer"
            title={currentSong.isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
            aria-label={currentSong.isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
          >
            <Heart
              className={`w-6 h-6 transition ${
                currentSong.isFavorite
                  ? 'fill-pink-500 text-pink-500'
                  : 'text-white/85 hover:text-white'
              }`}
            />
          </button>

          {/* 2. Add to Playlist */}
          <button
            type="button"
            onClick={() =>
              onAddToPlaylist ? onAddToPlaylist(currentSong) : onOpenSongOptions(currentSong)
            }
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-white/85 hover:text-white hover:bg-white/10 active:scale-90 transition cursor-pointer"
            title="Add to Playlist"
            aria-label="Add to Playlist"
          >
            <Plus className="w-6 h-6" />
          </button>

          {/* 3. Sleep Timer */}
          <button
            type="button"
            onClick={handleSleepTimerAction}
            className={`relative min-w-[44px] min-h-[44px] flex flex-col items-center justify-center rounded-full hover:bg-white/10 active:scale-90 transition cursor-pointer ${
              sleepTimer?.isActive ? 'text-cyan-300' : 'text-white/85 hover:text-white'
            }`}
            title={
              sleepTimer?.isActive
                ? `Sleep Timer: ${formatCompactTimer(sleepTimer.remainingSeconds)}`
                : 'Sleep Timer'
            }
            aria-label="Sleep Timer"
          >
            <AlarmClock className="w-6 h-6" />
            {sleepTimer?.isActive && (
              <span className="text-[9px] font-mono tabular-nums text-cyan-300 leading-none mt-0.5">
                {formatCompactTimer(sleepTimer.remainingSeconds)}
              </span>
            )}
          </button>

          {/* 4. Slow + Reverb / Audio Effects */}
          <button
            type="button"
            onClick={onOpenEffects}
            className={`relative min-w-[44px] min-h-[44px] flex flex-col items-center justify-center rounded-full hover:bg-white/10 active:scale-90 transition cursor-pointer ${
              isEffectsActive ? 'text-cyan-300' : 'text-white/85 hover:text-white'
            }`}
            title={`Slow + Reverb (${effects.presetName || 'Normal'})`}
            aria-label="Slow + Reverb & Audio Effects"
          >
            <Sliders className="w-6 h-6" />
            {isEffectsActive && (
              <span className="text-[9px] font-medium text-cyan-300 leading-none mt-0.5 max-w-[54px] truncate">
                {effects.presetName === 'Custom' ? `${effects.playbackRate.toFixed(2)}x` : effects.presetName}
              </span>
            )}
          </button>

          {/* 5. Artwork / Song Options */}
          <button
            type="button"
            onClick={() => onOpenSongOptions(currentSong)}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-white/85 hover:text-white hover:bg-white/10 active:scale-90 transition cursor-pointer"
            title="Artwork & Song Options"
            aria-label="Artwork & Song Options"
          >
            <ImagePlus className="w-6 h-6" />
          </button>
        </div>

        {/* Progress Bar & Timestamps */}
        <div className="w-full space-y-1.5">
          <div className="flex items-center justify-between text-xs font-medium text-white/65 tabular-nums px-0.5">
            <span>{formatPlayerTime(effectiveCurrentTime)}</span>
            <span>{formatPlayerTime(totalDuration)}</span>
          </div>

          <div
            ref={progressBarRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className={`group relative h-7 flex items-center touch-none ${
              isPartyGuest ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
            }`}
          >
            <div className="relative w-full h-[3px] rounded-full bg-white/20 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${clampedPercent}%`,
                  backgroundColor: progressColor,
                }}
              />
            </div>

            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full pointer-events-none transition-transform group-hover:scale-125"
              style={{
                left: `${clampedPercent}%`,
                backgroundColor: progressColor,
                boxShadow: '0 1px 4px rgba(0,0,0,0.55)',
              }}
            />
          </div>
        </div>

        {/* Primary Playback Controls Row (Repeat, Previous, Play/Pause, Next, Queue) */}
        <div className="flex items-center justify-between pt-1">
          {/* Repeat */}
          <button
            type="button"
            onClick={onCycleRepeat}
            title={`Repeat: ${repeatMode}`}
            aria-label={`Repeat: ${repeatMode}`}
            className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full transition active:scale-90 cursor-pointer ${
              repeatMode !== 'off'
                ? 'text-cyan-300 bg-white/10'
                : 'text-white/80 hover:text-white hover:bg-white/10'
            }`}
          >
            {repeatMode === 'one' ? (
              <Repeat1 className="w-6 h-6" />
            ) : (
              <Repeat className="w-6 h-6" />
            )}
          </button>

          {/* Previous */}
          <button
            type="button"
            onClick={onPrevious}
            title={isPartyGuest ? 'Controlled by the host' : 'Previous Track'}
            aria-label="Previous Track"
            className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-white/90 hover:text-white active:scale-90 transition cursor-pointer ${
              isPartyGuest ? 'opacity-40 cursor-not-allowed' : ''
            }`}
          >
            <SkipBack className="w-7 h-7 fill-current" />
          </button>

          {/* Center Play / Pause (Clean circular ring matching screenshot) */}
          <button
            type="button"
            onClick={onTogglePlay}
            title={isPartyGuest ? 'Controlled by the host' : isPlaying ? 'Pause' : 'Play'}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className={`w-16 h-16 rounded-full border-2 border-white/90 bg-white/10 hover:bg-white/15 flex items-center justify-center text-white transition-transform duration-150 active:scale-95 cursor-pointer ${
              isPartyGuest ? 'opacity-60 cursor-not-allowed' : ''
            }`}
          >
            {isPlaying ? (
              <Pause className="w-7 h-7 fill-current" />
            ) : (
              <Play className="w-7 h-7 fill-current ml-0.5" />
            )}
          </button>

          {/* Next */}
          <button
            type="button"
            onClick={onNext}
            title={isPartyGuest ? 'Controlled by the host' : 'Next Track'}
            aria-label="Next Track"
            className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-white/90 hover:text-white active:scale-90 transition cursor-pointer ${
              isPartyGuest ? 'opacity-40 cursor-not-allowed' : ''
            }`}
          >
            <SkipForward className="w-7 h-7 fill-current" />
          </button>

          {/* Queue */}
          <button
            type="button"
            onClick={onOpenQueue}
            title="Playing Queue"
            aria-label="Playing Queue"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/10 active:scale-90 transition cursor-pointer"
          >
            <ListMusic className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* 6. LIGHTWEIGHT SLEEP TIMER SHEET (Opened from Sleep Timer Icon) */}
      {showSleepTimerSheet &&
        sleepTimer &&
        onStartSleepTimer &&
        onCancelSleepTimer &&
        onExtendSleepTimer && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-150"
            onClick={() => setShowSleepTimerSheet(false)}
          >
            <div
              className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-[#090d1f] border border-white/10 p-5 pb-safe shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">Sleep Timer</h3>
                <button
                  type="button"
                  onClick={() => setShowSleepTimerSheet(false)}
                  className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                  aria-label="Close Sleep Timer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <SleepTimerSection
                timerState={sleepTimer}
                onStart={onStartSleepTimer}
                onCancel={onCancelSleepTimer}
                onExtend={onExtendSleepTimer}
                compact={true}
              />
            </div>
          </div>
        )}
    </div>
  );
};
