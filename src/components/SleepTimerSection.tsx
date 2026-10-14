import React, { useState } from 'react';
import { Moon, Clock, Plus, X, VolumeX } from 'lucide-react';
import { SleepTimerState } from '../types/music';

interface SleepTimerSectionProps {
  timerState: SleepTimerState;
  onStart: (minutes: number) => void;
  onCancel: () => void;
  onExtend: (minutes?: number) => void;
  compact?: boolean;
}

const PRESET_DURATIONS = [15, 30, 45, 60];

export const SleepTimerSection: React.FC<SleepTimerSectionProps> = ({
  timerState,
  onStart,
  onCancel,
  onExtend,
  compact = false,
}) => {
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customMinutes, setCustomMinutes] = useState('20');

  const formatRemainingTime = (totalSeconds: number): string => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    if (mins >= 60) {
      const hours = Math.floor(mins / 60);
      const remMins = mins % 60;
      return `${hours}:${remMins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(customMinutes, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 360) {
      onStart(parsed);
      setShowCustomInput(false);
    }
  };

  const totalSeconds = (timerState.totalDurationMinutes || 1) * 60;
  const progressPercent = Math.max(0, Math.min(100, (1 - timerState.remainingSeconds / totalSeconds) * 100));

  return (
    <div className={`rounded-2xl border bg-slate-900/60 border-white/10 transition-all ${compact ? 'p-3.5 space-y-3' : 'p-4 sm:p-5 space-y-3.5'}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300">
            <Moon className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-wide">Sleep Timer</h3>
            <p className="text-[11px] text-slate-400">
              {timerState.isActive ? 'Music will gently pause when countdown finishes' : 'Select a duration to automatically pause music'}
            </p>
          </div>
        </div>

        {timerState.isActive && (
          <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-purple-500/15 text-purple-300 border border-purple-500/30 tabular-nums">
            {formatRemainingTime(timerState.remainingSeconds)}
          </span>
        )}
      </div>

      {timerState.isActive ? (
        /* ACTIVE TIMER STATE */
        <div className="space-y-3 pt-1">
          {/* Progress Bar */}
          <div className="w-full bg-slate-950/60 rounded-full h-1.5 overflow-hidden border border-white/5">
            <div
              className={`h-full transition-all duration-500 ${
                timerState.isFading
                  ? 'bg-gradient-to-r from-amber-400 to-rose-400'
                  : 'bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Fade-out notification badge */}
          {timerState.isFading && (
            <div className="flex items-center gap-2 p-2 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs animate-pulse">
              <VolumeX className="w-4 h-4 shrink-0" />
              <span>Fading out audio smoothly over final 30 seconds...</span>
            </div>
          )}

          {/* Active Timer Controls */}
          <div className="flex items-center gap-2 pt-0.5">
            <button
              type="button"
              onClick={() => onExtend(5)}
              className="flex-1 min-h-[44px] px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 border border-white/10 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
            >
              <Plus className="w-3.5 h-3.5 text-cyan-400" />
              <span>+5 Minutes</span>
            </button>

            <button
              type="button"
              onClick={onCancel}
              className="flex-1 min-h-[44px] px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 active:scale-95 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
            >
              <X className="w-3.5 h-3.5" />
              <span>Turn Off</span>
            </button>
          </div>
        </div>
      ) : (
        /* IDLE TIMER SELECTION */
        <div className="space-y-2.5 pt-0.5">
          {/* Presets Grid */}
          <div className="grid grid-cols-4 gap-2">
            {PRESET_DURATIONS.map((mins) => (
              <button
                key={mins}
                type="button"
                onClick={() => onStart(mins)}
                className="min-h-[44px] flex flex-col items-center justify-center py-2 px-1 rounded-xl bg-slate-950/40 hover:bg-purple-500/15 active:scale-95 border border-white/5 hover:border-purple-400/40 text-slate-300 hover:text-white transition group"
              >
                <span className="text-xs font-bold group-hover:text-purple-300 transition">{mins}m</span>
                <span className="text-[10px] text-slate-500">{mins} min</span>
              </button>
            ))}
          </div>

          {/* Custom Minute Input Trigger & Form */}
          {showCustomInput ? (
            <form onSubmit={handleCustomSubmit} className="flex items-center gap-2 pt-1 animate-in fade-in">
              <div className="relative flex-1">
                <input
                  type="number"
                  min="1"
                  max="360"
                  value={customMinutes}
                  onChange={(e) => setCustomMinutes(e.target.value)}
                  placeholder="Minutes (1-360)"
                  className="w-full min-h-[44px] bg-slate-950/70 border border-purple-500/40 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400"
                  autoFocus
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 pointer-events-none">
                  min
                </span>
              </div>
              <button
                type="submit"
                className="min-h-[44px] px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 active:scale-95 text-white font-semibold text-xs shadow-md shadow-purple-600/20 transition"
              >
                Set
              </button>
              <button
                type="button"
                onClick={() => setShowCustomInput(false)}
                className="min-h-[44px] px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 text-slate-400 hover:text-white text-xs transition"
              >
                Cancel
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setShowCustomInput(true)}
              className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-950/20 hover:bg-white/5 active:scale-98 border border-white/5 hover:border-white/10 text-slate-400 hover:text-slate-200 text-xs font-medium flex items-center justify-center gap-1.5 transition"
            >
              <Clock className="w-3.5 h-3.5 text-purple-400" />
              <span>Custom duration...</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
