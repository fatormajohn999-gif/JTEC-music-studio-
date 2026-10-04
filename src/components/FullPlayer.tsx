import React, { useState } from 'react';
import { 
  ChevronDown, Heart, Shuffle, Repeat, Repeat1, SkipBack, SkipForward, 
  Play, Pause, Sliders, ListMusic, Eye, Volume2, Sparkles, Disc 
} from 'lucide-react';
import { Song, AudioEffectsConfig, VisualizerMode, RepeatMode, PerformanceMode } from '../types/music';
import { VisualizerCanvas } from './VisualizerCanvas';

interface FullPlayerProps {
  isOpen: boolean;
  onClose: () => void;
  currentSong: Song | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  effects: AudioEffectsConfig;
  visualizerMode: VisualizerMode;
  performanceMode: PerformanceMode;
  repeatMode: RepeatMode;
  isShuffle: boolean;
  onTogglePlay: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeek: (seconds: number) => void;
  onToggleFavorite: (song: Song) => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  onCycleVisualizer: () => void;
  onOpenEffects: () => void;
  onOpenQueue: () => void;
}

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
  onTogglePlay,
  onPrevious,
  onNext,
  onSeek,
  onToggleFavorite,
  onToggleShuffle,
  onCycleRepeat,
  onCycleVisualizer,
  onOpenEffects,
  onOpenQueue,
}) => {
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);

  if (!isOpen || !currentSong) return null;

  const activeTime = isSeeking ? seekValue : currentTime;
  const remainingTime = Math.max(0, duration - activeTime);

  const formatTime = (secs: number) => {
    if (!isFinite(secs) || isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSeekValue(parseFloat(e.target.value));
  };

  const handleSeekMouseDown = () => {
    setIsSeeking(true);
    setSeekValue(currentTime);
  };

  const handleSeekMouseUp = () => {
    setIsSeeking(false);
    onSeek(seekValue);
  };

  const handleTouchEnd = () => {
    setIsSeeking(false);
    onSeek(seekValue);
  };

  const isEffectsActive = effects.presetName !== 'Normal' || effects.playbackRate !== 1.0 || effects.reverbWet > 0;

  return (
    <div className="fixed inset-0 z-40 bg-[#060812] flex flex-col justify-between overflow-hidden animate-in slide-in-from-bottom duration-300">
      {/* Background Ambient Glow & Visualizer Layer */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Ambient colored blobs */}
        <div className="absolute top-1/4 -left-20 w-80 h-80 bg-cyan-600/15 rounded-full blur-[100px]" />
        <div className="absolute top-1/3 -right-20 w-80 h-80 bg-purple-600/15 rounded-full blur-[100px]" />
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-96 h-96 bg-pink-600/10 rounded-full blur-[120px]" />

        {/* Real-time Web Audio Visualizer */}
        {visualizerMode !== 'off' && (
          <VisualizerCanvas
            mode={visualizerMode}
            performanceMode={performanceMode}
            isActive={isPlaying}
            className="absolute inset-0 opacity-80"
          />
        )}
      </div>

      {/* Top Header Controls */}
      <div className="relative z-10 flex items-center justify-between px-6 pt-5 pb-2">
        <button
          onClick={onClose}
          className="p-2.5 rounded-full bg-slate-900/60 border border-white/10 text-slate-300 hover:text-white active:scale-95 transition"
          title="Minimize player"
        >
          <ChevronDown className="w-6 h-6" />
        </button>

        <div className="text-center">
          <span className="text-[11px] font-bold tracking-widest text-cyan-400 uppercase">
            JTEC MUSIC
          </span>
          <div className="flex items-center justify-center gap-1 mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            <span className="text-xs text-slate-400 font-medium">Offline Playback</span>
          </div>
        </div>

        <button
          onClick={onCycleVisualizer}
          title={`Visualizer: ${visualizerMode}`}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition ${
            visualizerMode !== 'off'
              ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-md shadow-cyan-500/20'
              : 'bg-slate-900/60 border-white/10 text-slate-400'
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          <span className="capitalize">{visualizerMode}</span>
        </button>
      </div>

      {/* Center Artwork / Visualizer Stage */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-8 py-2 min-h-0">
        <div className="relative w-full max-w-[320px] aspect-square flex items-center justify-center">
          {/* Animated Glow Halo */}
          <div
            className={`absolute inset-0 rounded-3xl transition-all duration-700 blur-2xl opacity-60 ${
              isPlaying ? 'bg-gradient-to-tr from-cyan-500 via-purple-600 to-pink-500 scale-105' : 'bg-transparent'
            }`}
          />

          {/* Album Artwork Card */}
          <div className="relative w-full h-full rounded-3xl overflow-hidden border border-white/15 shadow-2xl bg-slate-950 group">
            <img
              src={currentSong.artworkUrl || '/pwa-192x192.png'}
              alt={currentSong.title}
              className={`w-full h-full object-cover transition-transform duration-700 ${
                isPlaying ? 'scale-100' : 'scale-95 opacity-90'
              }`}
            />

            {/* Subtle Vinyl Grooves overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />

            {/* Quick preset badge */}
            {isEffectsActive && (
              <div className="absolute top-4 left-4 flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/80 backdrop-blur-md border border-purple-500/40 text-purple-300 text-xs font-semibold shadow-lg">
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                <span>{effects.presetName} ({effects.playbackRate}x)</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Control Section */}
      <div className="relative z-10 px-6 pb-8 pt-2 max-w-md mx-auto w-full space-y-4">
        {/* Song Info & Favorite */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-extrabold text-white truncate tracking-tight">
              {currentSong.title}
            </h1>
            <p className="text-sm sm:text-base text-cyan-300 font-medium truncate mt-0.5">
              {currentSong.artist}
            </p>
            <p className="text-xs text-slate-500 truncate mt-0.5">
              {currentSong.album}
            </p>
          </div>

          <button
            onClick={() => onToggleFavorite(currentSong)}
            className="p-3 rounded-full bg-slate-900/70 border border-white/10 hover:border-pink-500/40 text-slate-400 active:scale-90 transition shrink-0"
            title={currentSong.isFavorite ? 'Remove Favorite' : 'Add Favorite'}
          >
            <Heart
              className={`w-6 h-6 transition ${
                currentSong.isFavorite
                  ? 'fill-pink-500 text-pink-500 scale-110 drop-shadow-[0_0_8px_rgba(236,72,153,0.7)]'
                  : 'text-slate-400 hover:text-white'
              }`}
            />
          </button>
        </div>

        {/* Scrubber Progress Bar */}
        <div className="space-y-1.5">
          <div className="relative flex items-center">
            <input
              type="range"
              min="0"
              max={duration || 100}
              step="0.5"
              value={activeTime}
              onChange={handleSeekChange}
              onMouseDown={handleSeekMouseDown}
              onMouseUp={handleSeekMouseUp}
              onTouchStart={handleSeekMouseDown}
              onTouchEnd={handleTouchEnd}
              className="w-full"
            />
          </div>

          <div className="flex justify-between text-xs font-mono text-slate-400">
            <span>{formatTime(activeTime)}</span>
            <span>-{formatTime(remainingTime)}</span>
          </div>
        </div>

        {/* Main Controls */}
        <div className="flex items-center justify-between pt-1">
          {/* Shuffle */}
          <button
            onClick={onToggleShuffle}
            title={`Shuffle: ${isShuffle ? 'On' : 'Off'}`}
            className={`p-3 rounded-xl transition ${
              isShuffle
                ? 'text-cyan-400 bg-cyan-500/20'
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

          {/* Big Play / Pause with Neon Glow */}
          <button
            onClick={onTogglePlay}
            className="w-18 h-18 rounded-full bg-gradient-to-tr from-cyan-400 via-purple-500 to-pink-500 flex items-center justify-center text-white shadow-2xl shadow-cyan-500/40 hover:shadow-cyan-400/60 active:scale-95 transition-all duration-200"
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
            className={`p-3 rounded-xl transition ${
              repeatMode !== 'off'
                ? 'text-purple-400 bg-purple-500/20'
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

        {/* Bottom Utility Bar: Audio Effects & Queue Buttons */}
        <div className="flex items-center justify-between pt-2 border-t border-white/5">
          <button
            onClick={onOpenEffects}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition ${
              isEffectsActive
                ? 'bg-purple-500/20 border border-purple-500/40 text-purple-300'
                : 'bg-slate-900/60 border border-white/10 text-slate-300 hover:text-white'
            }`}
          >
            <Sliders className="w-4 h-4 text-cyan-400" />
            <span>Slow + Reverb</span>
          </button>

          <button
            onClick={onOpenQueue}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900/60 border border-white/10 text-xs font-semibold text-slate-300 hover:text-white hover:border-cyan-500/30 transition"
          >
            <ListMusic className="w-4 h-4 text-pink-400" />
            <span>Queue</span>
          </button>
        </div>
      </div>
    </div>
  );
};
