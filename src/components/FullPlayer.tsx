import React, { useState, useRef, useCallback } from 'react';
import { 
  ChevronDown, Heart, Shuffle, Repeat, Repeat1, SkipBack, SkipForward, 
  Play, Pause, Sliders, ListMusic, Compass, MoreVertical 
} from 'lucide-react';
import { 
  Song, AudioEffectsConfig, CinematicScene, RepeatMode, PerformanceMode, ArtworkPalette, ReactionStrength 
} from '../types/music';
import { CinematicVisualizer } from './CinematicVisualizer';

interface FullPlayerProps {
  isOpen: boolean;
  onClose: () => void;
  currentSong: Song | null;
  isPlaying: boolean;
  currentTime?: number;
  duration?: number;
  effects: AudioEffectsConfig;
  visualizerMode: CinematicScene;
  performanceMode: PerformanceMode;
  reactionStrength?: ReactionStrength;
  repeatMode: RepeatMode;
  isShuffle: boolean;
  palette: ArtworkPalette;
  onTogglePlay: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeek?: (seconds: number) => void;
  onToggleFavorite: (song: Song) => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  onSelectScene: (scene: CinematicScene) => void;
  onOpenEffects: () => void;
  onOpenQueue: () => void;
  onOpenSongOptions: (song: Song) => void;
  autoplayNext?: boolean;
  onToggleAutoplayNext?: () => void;
}

const SCENE_OPTIONS: { id: CinematicScene; label: string; icon: string }[] = [
  { id: 'auto', label: 'Auto Vibe', icon: '✨' },
  { id: 'dark_spectrum', label: 'Dark Spectrum', icon: '📊' },
  { id: 'cyber_city', label: 'Cyber City', icon: '🏙️' },
  { id: 'galaxy', label: 'Galaxy', icon: '🌌' },
  { id: 'fire_energy', label: 'Fire Energy', icon: '🔥' },
  { id: 'rainy_night', label: 'Rainy Night', icon: '🌧️' },
  { id: 'anime_ninja', label: 'Anime Ninja', icon: '🥷' },
  { id: 'samurai', label: 'Samurai', icon: '⚔️' },
  { id: 'deep_ocean', label: 'Deep Ocean', icon: '🌊' },
  { id: 'music_tunnel', label: 'Music Tunnel', icon: '🌀' },
  { id: 'minimal_pro', label: 'Minimal Pro', icon: '⚡' },
  { id: 'shadow_strike', label: 'Shadow Strike', icon: '🗡️' },
  { id: 'shuriken_storm', label: 'Shuriken Storm', icon: '⭐' },
  { id: 'smoke_vanish', label: 'Smoke Vanish', icon: '💨' },
  { id: 'aurora_skies', label: 'Aurora Skies', icon: '🌌' },
  { id: 'thunder_storm', label: 'Thunder Storm', icon: '⚡' },
  { id: 'dragon_spirit', label: 'Dragon Spirit', icon: '🐉' },
  { id: 'hyperspace_warp', label: 'Hyperspace Warp', icon: '🚀' },
  { id: 'night_walk', label: 'Night Walk', icon: '🚶' },
];

export const FullPlayer: React.FC<FullPlayerProps> = ({
  isOpen,
  onClose,
  currentSong,
  isPlaying,
  currentTime = 0,
  duration = 0,
  effects,
  visualizerMode,
  performanceMode,
  reactionStrength = 'medium',
  repeatMode,
  isShuffle,
  palette,
  onTogglePlay,
  onPrevious,
  onNext,
  onSeek,
  onToggleFavorite,
  onToggleShuffle,
  onCycleRepeat,
  onSelectScene,
  onOpenEffects,
  onOpenQueue,
  onOpenSongOptions,
}) => {
  const [detectedAutoScene, setDetectedAutoScene] = useState<CinematicScene>('dark_spectrum');
  const [showSceneSelector, setShowSceneSelector] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekTime, setSeekTime] = useState<number | null>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null);

  // Time format helper: "0:42", "2:52"
  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const totalDuration = duration > 0 ? duration : (currentSong?.duration || 0);
  const effectiveCurrentTime = isSeeking && seekTime !== null ? seekTime : currentTime;
  const timeRemaining = Math.max(0, totalDuration - effectiveCurrentTime);
  const progressPercent = totalDuration > 0 ? (effectiveCurrentTime / totalDuration) * 100 : 0;
  const clampedPercent = Math.min(100, Math.max(0, progressPercent));

  // Determine progress bar fill color (cover's main color or theme main color)
  const progressColor = palette.primary || palette.main || '#00f0ff';

  // Pointer/Touch seeking handlers for smooth tap or drag
  const calculateSeekTime = useCallback((clientX: number) => {
    if (!progressBarRef.current || totalDuration <= 0) return 0;
    const rect = progressBarRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * totalDuration;
  }, [totalDuration]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsSeeking(true);
    const newTime = calculateSeekTime(e.clientX);
    setSeekTime(newTime);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isSeeking) return;
    const newTime = calculateSeekTime(e.clientX);
    setSeekTime(newTime);
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

  const isEffectsActive = effects.presetName !== 'Normal' || effects.playbackRate !== 1.0 || effects.reverbWet > 0;

  return (
    <div className="fixed inset-0 z-40 bg-[#04060d] flex flex-col justify-between overflow-hidden animate-in slide-in-from-bottom duration-300">
      {/* 1. CINEMATIC AUDIO-REACTIVE ENVIRONMENT (Canvas Layer Behind) */}
      <div className="absolute inset-0 pointer-events-none">
        {visualizerMode !== 'off' && (
          <CinematicVisualizer
            scene={visualizerMode}
            performanceMode={performanceMode}
            reactionStrength={reactionStrength}
            palette={palette}
            isActive={isPlaying}
            className="w-full h-full"
            onAutoSceneDetermined={(scene) => setDetectedAutoScene(scene)}
          />
        )}
      </div>

      {/* 2. TOP CONTROLS & SCENE SELECTOR */}
      <div className="relative z-20 flex items-center justify-between px-6 pt-5 pb-2">
        <button
          onClick={onClose}
          className="p-2.5 rounded-full bg-slate-900/60 backdrop-blur-md border border-white/10 text-slate-300 hover:text-white active:scale-95 transition"
          title="Minimize player"
        >
          <ChevronDown className="w-5 h-5" />
        </button>

        {/* Scene Dropdown Selector */}
        <div className="relative">
          <button
            onClick={() => setShowSceneSelector(!showSceneSelector)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/80 backdrop-blur-md border border-cyan-500/30 text-xs font-semibold text-cyan-300 shadow-lg shadow-cyan-500/10 hover:border-cyan-400 transition"
          >
            <Compass className="w-3.5 h-3.5" />
            <span>
              {visualizerMode === 'auto' 
                ? `Auto: ${SCENE_OPTIONS.find(o => o.id === detectedAutoScene)?.label || detectedAutoScene}` 
                : (SCENE_OPTIONS.find(o => o.id === visualizerMode)?.label || visualizerMode)}
            </span>
          </button>

          {/* Dropdown for Cinematic Scenes */}
          {showSceneSelector && (
            <div className="absolute top-10 left-1/2 -translate-x-1/2 w-52 max-h-72 overflow-y-auto rounded-2xl bg-[#090d20]/95 backdrop-blur-xl border border-cyan-500/30 p-2 shadow-2xl z-30 space-y-1">
              {SCENE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => {
                    onSelectScene(opt.id);
                    setShowSceneSelector(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition ${
                    visualizerMode === opt.id
                      ? 'bg-gradient-to-r from-cyan-500/20 to-purple-500/20 text-cyan-300 border border-cyan-400/40'
                      : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span>{opt.icon}</span>
                    <span>{opt.label}</span>
                  </span>
                  {visualizerMode === opt.id && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onToggleFavorite(currentSong)}
            className="p-2.5 rounded-full bg-slate-900/60 backdrop-blur-md border border-white/10 hover:border-pink-500/40 text-slate-300 active:scale-95 transition"
            title={currentSong.isFavorite ? 'Remove Favorite' : 'Add Favorite'}
          >
            <Heart
              className={`w-5 h-5 transition ${
                currentSong.isFavorite
                  ? 'fill-pink-500 text-pink-500 drop-shadow-[0_0_8px_rgba(236,72,153,0.7)]'
                  : 'text-slate-300 hover:text-white'
              }`}
            />
          </button>

          <button
            onClick={() => onOpenSongOptions(currentSong)}
            className="p-2.5 rounded-full bg-slate-900/60 backdrop-blur-md border border-white/10 text-slate-300 hover:text-white"
          >
            <MoreVertical className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 3. CENTER: UNOBSTRUCTED CINEMATIC ANIMATION SPACE (Clean, purely visual effects) */}
      <div className="relative z-10 flex-1 min-h-0 pointer-events-none" />

      {/* 4. BOTTOM PLAYBACK CONTROLS */}
      <div className="relative z-20 px-6 pb-7 pt-2 max-w-md mx-auto w-full space-y-3">
        {/* ONE Simple Progress Bar */}
        <div className="w-full space-y-1.5 select-none">
          <div
            ref={progressBarRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="group relative h-5 flex items-center cursor-pointer touch-none"
          >
            {/* Background Track (faint white line) */}
            <div className="relative w-full h-1 rounded-full bg-white/15 overflow-hidden">
              {/* Filled Track (Cover's main color / theme main color) */}
              <div
                className="h-full rounded-full transition-[width] duration-75"
                style={{
                  width: `${clampedPercent}%`,
                  backgroundColor: progressColor,
                  boxShadow: `0 0 10px ${palette.glow || progressColor}`,
                }}
              />
            </div>

            {/* Small Round Indicator Dot showing current position */}
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-md pointer-events-none transition-transform group-hover:scale-125"
              style={{
                left: `${clampedPercent}%`,
                boxShadow: `0 0 8px ${progressColor}, 0 2px 4px rgba(0,0,0,0.5)`,
              }}
            />
          </div>

          {/* Time Displays: Elapsed on left ("0:42"), Remaining on right ("-2:52") */}
          <div className="flex items-center justify-between text-[11px] font-medium text-white/50 px-0.5 tracking-wider">
            <span>{formatTime(effectiveCurrentTime)}</span>
            <span>-{formatTime(timeRemaining)}</span>
          </div>
        </div>

        {/* Main Controls Bar */}
        <div className="flex items-center justify-between pt-0.5">
          {/* Shuffle */}
          <button
            onClick={onToggleShuffle}
            title={`Shuffle: ${isShuffle ? 'On' : 'Off'}`}
            className={`p-3 rounded-2xl transition active:scale-90 ${
              isShuffle
                ? 'text-cyan-300 bg-cyan-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Shuffle className="w-5 h-5" />
          </button>

          {/* Previous */}
          <button
            onClick={onPrevious}
            className="p-3 text-slate-300 hover:text-white active:scale-90 transition"
            title="Previous Track"
          >
            <SkipBack className="w-7 h-7 fill-current" />
          </button>

          {/* Center Play / Pause with Neon Glow */}
          <button
            onClick={onTogglePlay}
            className="w-18 h-18 rounded-full flex items-center justify-center text-white shadow-2xl transition-all duration-200 active:scale-95 hover:scale-105"
            style={{
              background: `linear-gradient(135deg, ${palette.primary} 0%, ${palette.secondary} 50%, ${palette.accent} 100%)`,
              boxShadow: `0 0 28px ${palette.glow}`,
            }}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="w-8 h-8 fill-white" />
            ) : (
              <Play className="w-8 h-8 fill-white ml-1" />
            )}
          </button>

          {/* Next */}
          <button
            onClick={onNext}
            className="p-3 text-slate-300 hover:text-white active:scale-90 transition"
            title="Next Track"
          >
            <SkipForward className="w-7 h-7 fill-current" />
          </button>

          {/* Repeat */}
          <button
            onClick={onCycleRepeat}
            title={`Repeat: ${repeatMode}`}
            className={`p-3 rounded-2xl transition active:scale-90 ${
              repeatMode !== 'off'
                ? 'text-purple-300 bg-purple-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {repeatMode === 'one' ? (
              <Repeat1 className="w-5 h-5" />
            ) : (
              <Repeat className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* Secondary Buttons: ONLY "Slow + Reverb" and "Queue" */}
        <div className="flex items-center justify-between pt-2 border-t border-white/5 gap-3">
          <button
            onClick={onOpenEffects}
            className={`flex items-center justify-center gap-2 flex-1 py-2.5 rounded-xl text-xs font-semibold backdrop-blur-md transition ${
              isEffectsActive
                ? 'bg-purple-500/25 border border-purple-500/50 text-purple-200'
                : 'bg-slate-900/60 border border-white/10 text-slate-300 hover:text-white'
            }`}
          >
            <Sliders className="w-4 h-4 text-cyan-400" />
            <span>Slow + Reverb</span>
          </button>

          <button
            onClick={onOpenQueue}
            className="flex items-center justify-center gap-2 flex-1 py-2.5 rounded-xl bg-slate-900/60 backdrop-blur-md border border-white/10 text-xs font-semibold text-slate-300 hover:text-white hover:border-cyan-500/30 transition"
          >
            <ListMusic className="w-4 h-4 text-pink-400" />
            <span>Queue</span>
          </button>
        </div>
      </div>
    </div>
  );
};
