import React, { useState } from 'react';
import { 
  ChevronDown, Heart, Shuffle, Repeat, Repeat1, SkipBack, SkipForward, 
  Play, Pause, Sliders, ListMusic, Sparkles, Wand2, Eye, Compass, MoreVertical 
} from 'lucide-react';
import { 
  Song, AudioEffectsConfig, CinematicScene, RepeatMode, PerformanceMode, ArtworkPalette 
} from '../types/music';
import { CinematicVisualizer } from './CinematicVisualizer';

interface FullPlayerProps {
  isOpen: boolean;
  onClose: () => void;
  currentSong: Song | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  effects: AudioEffectsConfig;
  visualizerMode: CinematicScene;
  performanceMode: PerformanceMode;
  repeatMode: RepeatMode;
  isShuffle: boolean;
  palette: ArtworkPalette;
  onTogglePlay: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeek: (seconds: number) => void;
  onToggleFavorite: (song: Song) => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  onSelectScene: (scene: CinematicScene) => void;
  onOpenEffects: () => void;
  onOpenQueue: () => void;
  onOpenSongOptions: (song: Song) => void;
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
];

export const FullPlayer: React.FC<FullPlayerProps> = ({
  isOpen,
  onClose,
  currentSong,
  isPlaying,
  currentTime,
  duration,
  effects,
  visualizerMode,
  performanceMode,
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
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);
  const [detectedAutoScene, setDetectedAutoScene] = useState<CinematicScene>('dark_spectrum');
  const [showSceneSelector, setShowSceneSelector] = useState(false);

  if (!isOpen || !currentSong) return null;

  const activeTime = isSeeking ? seekValue : currentTime;
  const remainingTime = Math.max(0, duration - activeTime);

  const formatTime = (secs: number) => {
    if (!isFinite(secs) || isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const isEffectsActive = effects.presetName !== 'Normal' || effects.playbackRate !== 1.0 || effects.reverbWet > 0;

  return (
    <div className="fixed inset-0 z-40 bg-[#04060d] flex flex-col justify-between overflow-hidden animate-in slide-in-from-bottom duration-300">
      {/* 1. CINEMATIC AUDIO-REACTIVE ENVIRONMENT (Canvas Layer Behind) */}
      <div className="absolute inset-0 pointer-events-none">
        {visualizerMode !== 'off' && (
          <CinematicVisualizer
            scene={visualizerMode}
            performanceMode={performanceMode}
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

        {/* Scene Pill Selector */}
        <div className="relative">
          <button
            onClick={() => setShowSceneSelector(!showSceneSelector)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/80 backdrop-blur-md border border-cyan-500/30 text-xs font-semibold text-cyan-300 shadow-lg shadow-cyan-500/10 hover:border-cyan-400 transition"
          >
            <Compass className="w-3.5 h-3.5" />
            <span className="capitalize">
              {visualizerMode === 'auto' ? `Auto: ${detectedAutoScene}` : visualizerMode.replace('_', ' ')}
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

      {/* 3. CENTER: UNOBSTRUCTED CINEMATIC ANIMATION SPACE */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-8 py-2 min-h-0 pointer-events-none">
        {/* DSP Effects Badge Pill */}
        {isEffectsActive && (
          <div className="pointer-events-auto flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-slate-900/80 backdrop-blur-md border border-purple-500/40 text-purple-300 text-xs font-semibold shadow-lg animate-in fade-in">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span>{effects.presetName} ({effects.playbackRate.toFixed(2)}x)</span>
          </div>
        )}
      </div>

      {/* 4. BOTTOM PLAYBACK CONTROLS */}
      <div className="relative z-20 px-6 pb-7 pt-2 max-w-md mx-auto w-full space-y-4">
        {/* Scrubber Progress Bar */}
        <div className="space-y-1.5">
          <div className="relative flex items-center">
            <input
              type="range"
              min="0"
              max={duration || 100}
              step="0.5"
              value={activeTime}
              onChange={(e) => setSeekValue(parseFloat(e.target.value))}
              onMouseDown={() => {
                setIsSeeking(true);
                setSeekValue(currentTime);
              }}
              onMouseUp={() => {
                setIsSeeking(false);
                onSeek(seekValue);
              }}
              onTouchStart={() => {
                setIsSeeking(true);
                setSeekValue(currentTime);
              }}
              onTouchEnd={() => {
                setIsSeeking(false);
                onSeek(seekValue);
              }}
              className="w-full cursor-pointer"
            />
          </div>

          <div className="flex justify-between text-xs font-mono text-slate-400">
            <span>{formatTime(activeTime)}</span>
            <span>-{formatTime(remainingTime)}</span>
          </div>
        </div>

        {/* Main Controls Bar */}
        <div className="flex items-center justify-between pt-1">
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

        {/* Secondary Buttons: Effects & Queue */}
        <div className="flex items-center justify-between pt-2 border-t border-white/5">
          <button
            onClick={onOpenEffects}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold backdrop-blur-md transition ${
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
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900/60 backdrop-blur-md border border-white/10 text-xs font-semibold text-slate-300 hover:text-white hover:border-cyan-500/30 transition"
          >
            <ListMusic className="w-4 h-4 text-pink-400" />
            <span>Queue</span>
          </button>
        </div>
      </div>
    </div>
  );
};
