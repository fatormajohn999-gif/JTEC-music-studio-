import React from 'react';
import { X, RotateCcw, Sparkles, Sliders, Waves, Zap, Moon, Music2, Wind, Disc } from 'lucide-react';
import { AudioEffectsConfig } from '../types/music';

interface AudioEffectsModalProps {
  isOpen: boolean;
  onClose: () => void;
  effects: AudioEffectsConfig;
  onChange: (effects: AudioEffectsConfig) => void;
}

const PRESETS: Record<AudioEffectsConfig['presetName'], Partial<AudioEffectsConfig>> = {
  'Normal': {
    playbackRate: 1.0,
    reverbWet: 0.0,
    echoWet: 0.0,
    bassGain: 0,
    trebleGain: 0,
  },
  'Slow': {
    playbackRate: 0.85,
    reverbWet: 0.0,
    echoWet: 0.0,
    bassGain: 5,
    trebleGain: 0,
  },
  'Slow + Reverb': {
    playbackRate: 0.85,
    reverbWet: 0.65,
    echoWet: 0.15,
    bassGain: 15,
    trebleGain: -8,
  },
  'Dreamy': {
    playbackRate: 0.88,
    reverbWet: 0.75,
    echoWet: 0.25,
    bassGain: 8,
    trebleGain: 12,
  },
  'Night': {
    playbackRate: 0.78,
    reverbWet: 0.70,
    echoWet: 0.20,
    bassGain: 18,
    trebleGain: -12,
  },
  'Bass': {
    playbackRate: 1.0,
    reverbWet: 0.0,
    echoWet: 0.0,
    bassGain: 28,
    trebleGain: 0,
  },
  'Cinematic': {
    playbackRate: 0.90,
    reverbWet: 0.70,
    echoWet: 0.25,
    bassGain: 20,
    trebleGain: 10,
  },
  'Custom': {},
};

export const AudioEffectsModal: React.FC<AudioEffectsModalProps> = ({
  isOpen,
  onClose,
  effects,
  onChange,
}) => {
  if (!isOpen) return null;

  const handlePresetSelect = (preset: AudioEffectsConfig['presetName']) => {
    if (preset === 'Custom') {
      onChange({ ...effects, presetName: 'Custom' });
      return;
    }
    const presetValues = PRESETS[preset];
    onChange({
      ...effects,
      ...presetValues,
      presetName: preset,
    });
  };

  const handleParamChange = (key: keyof AudioEffectsConfig, value: number) => {
    onChange({
      ...effects,
      [key]: value,
      presetName: 'Custom',
    });
  };

  const handleReset = () => {
    handlePresetSelect('Normal');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-200 p-0 sm:p-4">
      <div 
        className="w-full sm:max-w-md max-h-[92vh] sm:max-h-[85vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[#090d1f] border border-cyan-500/25 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 to-purple-600 flex items-center justify-center text-white shadow-md shadow-cyan-500/20">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">Audio Effects Lab</h2>
              <p className="text-xs text-cyan-300 font-medium">Real-Time DSP Engine</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              title="Reset all effects to Normal"
              className="p-2 rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-white/5 transition text-xs flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reset</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto px-6 py-5 space-y-6 no-scrollbar">
          {/* Presets Grid */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                Vibe Presets
              </span>
              <span className="text-xs text-purple-400 font-medium">
                {effects.presetName}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { name: 'Normal', icon: Disc, label: 'Normal' },
                { name: 'Slow', icon: Waves, label: 'Slow (0.85x)' },
                { name: 'Slow + Reverb', icon: Sparkles, label: 'Slow+Reverb' },
                { name: 'Dreamy', icon: Wind, label: 'Dreamy' },
                { name: 'Night', icon: Moon, label: 'Night Drive' },
                { name: 'Bass', icon: Zap, label: 'Bass Boost' },
                { name: 'Cinematic', icon: Sparkles, label: 'Cinematic' },
              ].map((p) => {
                const Icon = p.icon;
                const isSelected = effects.presetName === p.name;
                return (
                  <button
                    key={p.name}
                    onClick={() => handlePresetSelect(p.name as AudioEffectsConfig['presetName'])}
                    className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-medium transition active:scale-95 ${
                      isSelected
                        ? 'bg-gradient-to-b from-cyan-500/20 to-purple-500/20 border-cyan-400 text-white shadow-lg shadow-cyan-500/20'
                        : 'bg-slate-900/50 border-white/5 text-slate-300 hover:border-white/20 hover:text-white'
                    }`}
                  >
                    <Icon className={`w-4 h-4 mb-1.5 ${isSelected ? 'text-cyan-400' : 'text-slate-400'}`} />
                    <span>{p.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Speed (Slow) Control */}
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white">Playback Speed</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-mono">
                  {effects.playbackRate.toFixed(2)}x
                </span>
              </div>
            </div>

            <input
              type="range"
              min="0.5"
              max="1.5"
              step="0.01"
              value={effects.playbackRate}
              onChange={(e) => handleParamChange('playbackRate', parseFloat(e.target.value))}
              className="w-full"
            />

            {/* Quick Speed Buttons */}
            <div className="flex items-center justify-between gap-1 pt-1">
              {[
                { label: 'Normal (1.0x)', val: 1.0 },
                { label: 'Slow (0.85x)', val: 0.85 },
                { label: 'Very Slow (0.7x)', val: 0.70 },
                { label: 'Ultra (0.5x)', val: 0.50 },
              ].map((btn) => (
                <button
                  key={btn.label}
                  onClick={() => handleParamChange('playbackRate', btn.val)}
                  className={`px-2 py-1 text-[11px] rounded-lg transition ${
                    Math.abs(effects.playbackRate - btn.val) < 0.02
                      ? 'bg-cyan-500 text-black font-bold'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {btn.val.toFixed(2)}x
                </button>
              ))}
            </div>
          </div>

          {/* Reverb Slider */}
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-semibold text-white">Convolution Reverb</span>
                <p className="text-[11px] text-slate-400">Algorithmic studio hall spatial diffusion</p>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono">
                {Math.round(effects.reverbWet * 100)}%
              </span>
            </div>

            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={effects.reverbWet}
              onChange={(e) => handleParamChange('reverbWet', parseFloat(e.target.value))}
              className="w-full"
            />
          </div>

          {/* Echo Slider */}
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-semibold text-white">Echo / Delay</span>
                <p className="text-[11px] text-slate-400">Stereo feedback delay repeats</p>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/30 font-mono">
                {Math.round(effects.echoWet * 100)}%
              </span>
            </div>

            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={effects.echoWet}
              onChange={(e) => handleParamChange('echoWet', parseFloat(e.target.value))}
              className="w-full"
            />
          </div>

          {/* EQ: Bass and Treble */}
          <div className="grid grid-cols-2 gap-3">
            {/* Bass */}
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/10 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white">Bass</span>
                <span className="text-xs font-mono text-cyan-300">
                  {effects.bassGain > 0 ? `+${effects.bassGain}` : effects.bassGain}
                </span>
              </div>
              <input
                type="range"
                min="-50"
                max="50"
                step="1"
                value={effects.bassGain}
                onChange={(e) => handleParamChange('bassGain', parseInt(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>-50</span>
                <span>0</span>
                <span>+50</span>
              </div>
            </div>

            {/* Treble */}
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/10 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white">Treble</span>
                <span className="text-xs font-mono text-purple-300">
                  {effects.trebleGain > 0 ? `+${effects.trebleGain}` : effects.trebleGain}
                </span>
              </div>
              <input
                type="range"
                min="-50"
                max="50"
                step="1"
                value={effects.trebleGain}
                onChange={(e) => handleParamChange('trebleGain', parseInt(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>-50</span>
                <span>0</span>
                <span>+50</span>
              </div>
            </div>
          </div>

          {/* Master Volume */}
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-white">DSP Volume</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                {Math.round(effects.volume * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={effects.volume}
              onChange={(e) => handleParamChange('volume', parseFloat(e.target.value))}
              className="w-full"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-slate-900/80">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 via-purple-600 to-pink-500 text-white font-semibold text-sm shadow-lg shadow-cyan-500/20 active:scale-98 transition"
          >
            Apply & Close
          </button>
        </div>
      </div>
    </div>
  );
};
