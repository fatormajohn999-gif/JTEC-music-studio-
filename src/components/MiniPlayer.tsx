import React from 'react';
import { Play, Pause, SkipForward, Sliders, Waves } from 'lucide-react';
import { Song, AudioEffectsConfig } from '../types/music';

interface MiniPlayerProps {
  currentSong: Song | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  effects: AudioEffectsConfig;
  onTogglePlay: () => void;
  onNext: () => void;
  onOpenFullPlayer: () => void;
  onOpenEffects: () => void;
}

export const MiniPlayer: React.FC<MiniPlayerProps> = ({
  currentSong,
  isPlaying,
  currentTime,
  duration,
  effects,
  onTogglePlay,
  onNext,
  onOpenFullPlayer,
  onOpenEffects,
}) => {
  if (!currentSong) return null;

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const isEffectsActive = effects.presetName !== 'Normal' || effects.playbackRate !== 1.0 || effects.reverbWet > 0;

  return (
    <div className="fixed bottom-[68px] left-0 right-0 z-30 px-3 max-w-lg mx-auto pointer-events-none">
      <div 
        onClick={onOpenFullPlayer}
        className="pointer-events-auto relative overflow-hidden rounded-2xl glass-panel-elevated border border-cyan-500/30 p-2.5 flex items-center gap-3 cursor-pointer shadow-2xl active:scale-[0.99] transition duration-200 group"
      >
        {/* Top Progress bar indicator */}
        <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-white/10">
          <div
            className="h-full bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500 transition-all duration-150"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Circular Artwork Profile */}
        <div className="relative shrink-0">
          <img
            src={currentSong.artworkUrl || './pwa-192x192.png'}
            alt={currentSong.title}
            className={`w-11 h-11 rounded-full object-cover border transition-all duration-300 ${
              isPlaying ? 'border-cyan-400 shadow-md shadow-cyan-500/30' : 'border-white/15'
            }`}
          />
          {isPlaying && (
            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-cyan-400 border-2 border-slate-900 flex items-center justify-center">
              <span className="w-1.5 h-1.5 rounded-full bg-black animate-ping" />
            </div>
          )}
        </div>

        {/* Track Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-white truncate group-hover:text-cyan-300 transition">
              {currentSong.title}
            </span>
            {isEffectsActive && (
              <span className="shrink-0 text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-purple-500/25 border border-purple-500/40 text-purple-300 font-semibold">
                {effects.presetName === 'Custom' ? `${effects.playbackRate}x` : effects.presetName}
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 truncate mt-0.5">
            {currentSong.artist}
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {/* Quick Audio Effects */}
          <button
            onClick={onOpenEffects}
            title="Audio Effects"
            className={`p-2 rounded-xl transition ${
              isEffectsActive
                ? 'text-cyan-300 bg-cyan-500/20'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Sliders className="w-4 h-4" />
          </button>

          {/* Play / Pause with subtle neon glow */}
          <button
            onClick={onTogglePlay}
            className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-purple-600 flex items-center justify-center text-white shadow-md shadow-cyan-500/30 active:scale-90 transition hover:brightness-110"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-white" />
            ) : (
              <Play className="w-4 h-4 fill-white ml-0.5" />
            )}
          </button>

          {/* Next */}
          <button
            onClick={onNext}
            title="Next Track"
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
