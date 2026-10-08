import React, { useState } from 'react';
import { 
  Settings as SettingsIcon, Zap, Battery, Sliders, Eye, HardDrive, 
  Trash2, ShieldCheck, Check, Sparkles, RefreshCw, Cloud, Settings2
} from 'lucide-react';
import { AppSettings, PerformanceMode, VisualizerMode } from '../types/music';

interface SettingsScreenProps {
  settings: AppSettings;
  storageStats: { songCount: number; estimatedBytes: number };
  onUpdateSettings: (newSettings: AppSettings) => void;
  onClearLibrary: () => void;
  onOpenCloudSettings?: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  settings,
  storageStats,
  onUpdateSettings,
  onClearLibrary,
  onOpenCloudSettings,
}) => {
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 MB';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  };

  const handlePerformanceChange = (mode: PerformanceMode) => {
    onUpdateSettings({ ...settings, performanceMode: mode });
  };

  const handleVisualizerChange = (mode: VisualizerMode) => {
    onUpdateSettings({ ...settings, visualizerMode: mode });
  };

  return (
    <div className="space-y-6 pb-36 px-4 pt-3 max-w-4xl mx-auto animate-in fade-in">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300">
          <SettingsIcon className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white tracking-wide">Player Settings</h2>
          <p className="text-xs text-slate-400">Audio DSP, Visualizer, Performance & Storage</p>
        </div>
      </div>

      {/* PERFORMANCE & BATTERY SAVER MODE */}
      <div className="p-5 rounded-3xl bg-slate-900/60 border border-white/10 space-y-3">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Engine & Battery Profile
          </h3>
        </div>
        <p className="text-xs text-slate-400">
          Optimize frame rates and canvas resolution for mobile battery longevity.
        </p>

        <div className="grid grid-cols-3 gap-2.5 pt-1">
          {[
            {
              id: 'battery' as PerformanceMode,
              label: 'Battery Saver',
              desc: '30 FPS, lowest CPU',
              icon: Battery,
            },
            {
              id: 'balanced' as PerformanceMode,
              label: 'Balanced',
              desc: '60 FPS, optimal',
              icon: Zap,
            },
            {
              id: 'high' as PerformanceMode,
              label: 'High Quality',
              desc: 'Full dpr, peak glow',
              icon: Sparkles,
            },
          ].map((profile) => {
            const Icon = profile.icon;
            const isSelected = settings.performanceMode === profile.id;
            return (
              <button
                key={profile.id}
                onClick={() => handlePerformanceChange(profile.id)}
                className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-center transition active:scale-95 ${
                  isSelected
                    ? 'bg-gradient-to-b from-cyan-500/20 to-purple-500/20 border-cyan-400 text-white shadow-lg shadow-cyan-500/20'
                    : 'bg-slate-950/40 border-white/5 text-slate-400 hover:border-white/20 hover:text-slate-200'
                }`}
              >
                <Icon className={`w-5 h-5 mb-1.5 ${isSelected ? 'text-cyan-400' : 'text-slate-500'}`} />
                <span className="text-xs font-bold">{profile.label}</span>
                <span className="text-[10px] text-slate-500 mt-0.5">{profile.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* VISUALIZER PREFERENCES */}
      <div className="p-5 rounded-3xl bg-slate-900/60 border border-white/10 space-y-3">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Audio Visualizer Mode
          </h3>
        </div>
        <p className="text-xs text-slate-400">
          Render real-time frequency data synced to Web Audio API analyser.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
          {[
            { id: 'auto' as VisualizerMode, label: '✨ Auto Vibe' },
            { id: 'dark_spectrum' as VisualizerMode, label: '📊 Dark Spectrum' },
            { id: 'cyber_city' as VisualizerMode, label: '🏙️ Cyber City' },
            { id: 'galaxy' as VisualizerMode, label: '🌌 Galaxy' },
            { id: 'fire_energy' as VisualizerMode, label: '🔥 Fire Energy' },
            { id: 'rainy_night' as VisualizerMode, label: '🌧️ Rainy Night' },
            { id: 'anime_ninja' as VisualizerMode, label: '🥷 Anime Ninja' },
            { id: 'samurai' as VisualizerMode, label: '⚔️ Samurai' },
            { id: 'deep_ocean' as VisualizerMode, label: '🌊 Deep Ocean' },
            { id: 'music_tunnel' as VisualizerMode, label: '🌀 Music Tunnel' },
            { id: 'minimal_pro' as VisualizerMode, label: '⚡ Minimal Pro' },
          ].map((v) => {
            const isSelected = settings.visualizerMode === v.id;
            return (
              <button
                key={v.id}
                onClick={() => handleVisualizerChange(v.id)}
                className={`p-3 rounded-xl border text-xs font-bold transition ${
                  isSelected
                    ? 'bg-purple-500/20 border-purple-400 text-purple-300'
                    : 'bg-slate-950/40 border-white/5 text-slate-400 hover:text-white'
                }`}
              >
                {v.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* PLAYBACK PREFERENCES */}
      <div className="p-5 rounded-3xl bg-slate-900/60 border border-white/10 space-y-3">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">
          Playback Controls
        </h3>

        <div className="space-y-2 text-sm text-slate-300">
          <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950/40 border border-white/5 cursor-pointer">
            <div>
              <div className="font-semibold text-white">Autoplay Next Track</div>
              <div className="text-xs text-slate-400">Continue playing when a track finishes</div>
            </div>
            <input
              type="checkbox"
              checked={settings.autoplayNext}
              onChange={(e) => onUpdateSettings({ ...settings, autoplayNext: e.target.checked })}
              className="w-5 h-5 accent-cyan-400 rounded cursor-pointer"
            />
          </label>

          <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950/40 border border-white/5 cursor-pointer">
            <div>
              <div className="font-semibold text-white">Remember Last Song</div>
              <div className="text-xs text-slate-400">Restore session state when reopening player</div>
            </div>
            <input
              type="checkbox"
              checked={settings.rememberLastSong}
              onChange={(e) => onUpdateSettings({ ...settings, rememberLastSong: e.target.checked })}
              className="w-5 h-5 accent-cyan-400 rounded cursor-pointer"
            />
          </label>

          <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950/40 border border-white/5 cursor-pointer">
            <div>
              <div className="font-semibold text-white">Neon Glow Aesthetics</div>
              <div className="text-xs text-slate-400">Enhanced atmospheric lighting in player</div>
            </div>
            <input
              type="checkbox"
              checked={settings.neonGlow}
              onChange={(e) => onUpdateSettings({ ...settings, neonGlow: e.target.checked })}
              className="w-5 h-5 accent-cyan-400 rounded cursor-pointer"
            />
          </label>
        </div>
      </div>

      {/* STORAGE & PRIVACY */}
      <div className="p-5 rounded-3xl bg-slate-900/60 border border-white/10 space-y-4">
        <div className="flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Local Device Storage
          </h3>
        </div>

        <div className="grid grid-cols-2 gap-3 text-center">
          <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5">
            <span className="text-xs text-slate-400">Library Songs</span>
            <div className="text-lg font-bold text-white font-mono">{storageStats.songCount}</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5">
            <span className="text-xs text-slate-400">Storage Used</span>
            <div className="text-lg font-bold text-cyan-300 font-mono">
              {formatBytes(storageStats.estimatedBytes)}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 p-3 rounded-xl bg-cyan-950/40 border border-cyan-500/20 text-xs text-cyan-300">
          <ShieldCheck className="w-4 h-4 shrink-0 text-cyan-400" />
          <span>Offline first: all downloaded tracks play 100% offline from your device IndexedDB. Persistent cloud backup is powered by Supabase.</span>
        </div>

        {/* Cloud Settings Link */}
        {onOpenCloudSettings && (
          <button
            onClick={onOpenCloudSettings}
            className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-gradient-to-r from-cyan-500/10 to-purple-600/10 border border-cyan-500/30 text-white hover:border-cyan-400 transition text-xs font-semibold"
          >
            <div className="flex items-center gap-2">
              <Cloud className="w-4 h-4 text-cyan-400" />
              <span>JTEC CLOUD & Supabase Storage Settings</span>
            </div>
            <span className="text-cyan-300 text-[11px]">Configure →</span>
          </button>
        )}

        {/* Clear Library Button */}
        {showClearConfirm ? (
          <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/30 space-y-3">
            <p className="text-xs text-rose-300 font-medium">
              Are you sure? This will remove all imported songs, playlists, and cached metadata from IndexedDB.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-2 rounded-lg bg-slate-800 text-xs text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onClearLibrary();
                  setShowClearConfirm(false);
                }}
                className="flex-1 py-2 rounded-lg bg-rose-600 text-xs font-bold text-white hover:bg-rose-500"
              >
                Yes, Clear All
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowClearConfirm(true)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-xs font-semibold transition"
          >
            <Trash2 className="w-4 h-4" />
            <span>Clear Offline Music Library</span>
          </button>
        )}
      </div>

      <div className="text-center text-xs text-slate-500 pb-6">
        JTEC MUSIC v1.0.0 • Your Music • Your Vibe • Offline
      </div>
    </div>
  );
};
