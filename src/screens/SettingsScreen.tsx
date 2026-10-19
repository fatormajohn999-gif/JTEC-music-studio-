import React, { useState, useEffect } from 'react';
import { 
  Settings as SettingsIcon, Zap, Battery, Sliders, Eye, HardDrive, 
  Trash2, ShieldCheck, Check, Sparkles, RefreshCw, Cloud, Settings2, Compass,
  BellOff, Bell, X, Shield, BookOpen
} from 'lucide-react';
import { NotificationPermissionManager } from '../services/notificationPermission';
import { AppSettings, PerformanceMode, VisualizerMode, ReactionStrength, SleepTimerState } from '../types/music';
import { SleepTimerSection } from '../components/SleepTimerSection';
import { CheckForUpdatesButton } from '../components/CheckForUpdatesButton';
import { PrivacyPolicyView } from '../components/PrivacyPolicyView';
import { UserGuideView } from '../components/UserGuideView';
import { APP_VERSION, BUILD_DATE } from '../version';

interface SettingsScreenProps {
  settings: AppSettings;
  storageStats: { songCount: number; estimatedBytes: number };
  onUpdateSettings: (newSettings: AppSettings) => void;
  onClearLibrary: () => void;
  onOpenCloudSettings?: () => void;
  sleepTimer: SleepTimerState;
  onStartSleepTimer: (minutes: number) => void;
  onCancelSleepTimer: () => void;
  onExtendSleepTimer: (minutes?: number) => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  settings,
  storageStats,
  onUpdateSettings,
  onClearLibrary,
  onOpenCloudSettings,
  sleepTimer,
  onStartSleepTimer,
  onCancelSleepTimer,
  onExtendSleepTimer,
}) => {
  const [activeSubView, setActiveSubView] = useState<'main' | 'privacy' | 'guide'>('main');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [notificationDenied, setNotificationDenied] = useState(false);
  const [showHowToModal, setShowHowToModal] = useState(false);

  useEffect(() => {
    let mounted = true;
    const checkStatus = () => {
      NotificationPermissionManager.isPermissionDenied().then((denied) => {
        if (mounted) setNotificationDenied(denied);
      });
    };

    checkStatus();

    window.addEventListener('focus', checkStatus);
    document.addEventListener('visibilitychange', checkStatus);

    return () => {
      mounted = false;
      window.removeEventListener('focus', checkStatus);
      document.removeEventListener('visibilitychange', checkStatus);
    };
  }, []);

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

  if (activeSubView === 'privacy') {
    return <PrivacyPolicyView onBack={() => setActiveSubView('main')} />;
  }

  if (activeSubView === 'guide') {
    return <UserGuideView onBack={() => setActiveSubView('main')} />;
  }

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

      {/* NOTIFICATIONS DENIED MESSAGE (NATIVE ANDROID) */}
      {notificationDenied && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-200">
          <div className="flex items-center gap-2.5">
            <BellOff className="w-5 h-5 text-amber-400 shrink-0" />
            <p className="text-xs font-medium leading-relaxed">
              Notifications are off. Turn them on to see music controls.
            </p>
          </div>
          <button
            onClick={() => setShowHowToModal(true)}
            className="px-3.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-semibold whitespace-nowrap transition cursor-pointer self-start sm:self-auto"
          >
            How to enable
          </button>
        </div>
      )}

      {/* HOW TO ENABLE NOTIFICATIONS MODAL */}
      {showHowToModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl relative">
            <button
              onClick={() => {
                setShowHowToModal(false);
                NotificationPermissionManager.isPermissionDenied().then(setNotificationDenied);
              }}
              className="absolute top-5 right-5 p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-300">
                <Bell className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Enable Notifications</h3>
                <p className="text-xs text-slate-400">Lock screen & media controls</p>
              </div>
            </div>

            <div className="space-y-3 text-xs text-slate-300 bg-slate-950/60 p-4 rounded-2xl border border-white/5">
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center text-[11px] font-bold shrink-0">1</span>
                <span>Open your phone's <strong>Settings</strong> app.</span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center text-[11px] font-bold shrink-0">2</span>
                <span>Go to <strong>Apps</strong> (or <strong>App Management</strong>) &rarr; <strong>JTEC MUSIC</strong>.</span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center text-[11px] font-bold shrink-0">3</span>
                <span>Tap <strong>Notifications</strong> and turn them <strong>ON</strong>.</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              Enabling notifications allows JTEC MUSIC to show media playback controls, track details, and album artwork on your lock screen and notification bar.
            </p>

            <button
              onClick={() => {
                setShowHowToModal(false);
                NotificationPermissionManager.isPermissionDenied().then(setNotificationDenied);
              }}
              className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}

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
          <Eye className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Audio Visualizer Themes
          </h3>
        </div>
        <p className="text-xs text-slate-400">
          Render real-time frequency data synced to Web Audio API analyser. Choose your visual theme:
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
          {[
            { id: 'dark_spectrum' as VisualizerMode, label: '📊 Dark Spectrum' },
            { id: 'shadow_strike' as VisualizerMode, label: '🗡️ Shadow Strike' },
            { id: 'shuriken_storm' as VisualizerMode, label: '⭐ Shuriken Storm' },
            { id: 'smoke_vanish' as VisualizerMode, label: '💨 Smoke Vanish' },
            { id: 'anime_ninja' as VisualizerMode, label: '🥷 Anime Ninja' },
            { id: 'samurai' as VisualizerMode, label: '⚔️ Samurai' },
            { id: 'cyber_city' as VisualizerMode, label: '🏙️ Cyber City' },
            { id: 'galaxy' as VisualizerMode, label: '🌌 Galaxy' },
            { id: 'fire_energy' as VisualizerMode, label: '🔥 Fire Energy' },
            { id: 'rainy_night' as VisualizerMode, label: '🌧️ Rainy Night' },
            { id: 'deep_ocean' as VisualizerMode, label: '🌊 Deep Ocean' },
            { id: 'music_tunnel' as VisualizerMode, label: '🌀 Music Tunnel' },
            { id: 'minimal_pro' as VisualizerMode, label: '⚡ Minimal Pro' },
            { id: 'aurora_skies' as VisualizerMode, label: '🌌 Aurora Skies' },
            { id: 'thunder_storm' as VisualizerMode, label: '⚡ Thunder Storm' },
            { id: 'dragon_spirit' as VisualizerMode, label: '🐉 Dragon Spirit' },
            { id: 'hyperspace_warp' as VisualizerMode, label: '🚀 Hyperspace Warp' },
            { id: 'auto' as VisualizerMode, label: '✨ Auto Vibe' },
          ].map((v) => {
            const isSelected = settings.visualizerMode === v.id;
            return (
              <button
                key={v.id}
                onClick={() => handleVisualizerChange(v.id)}
                className={`p-3 rounded-xl border text-xs font-bold transition flex items-center justify-between gap-1.5 ${
                  isSelected
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-sm shadow-cyan-500/20'
                    : 'bg-slate-950/40 border-white/5 text-slate-400 hover:text-white'
                }`}
              >
                <span className="truncate">{v.label}</span>
                {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* REACTION STRENGTH SETTING */}
      <div className="p-5 rounded-3xl bg-slate-900/60 border border-white/10 space-y-3">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Reaction Strength
          </h3>
        </div>
        <p className="text-xs text-slate-400">
          Scale how dynamically visualizer effects react to audio frequencies, bass hits, and beats (0.6x, 1x, 1.5x).
        </p>

        <div className="grid grid-cols-3 gap-2.5 pt-1">
          {[
            {
              id: 'low' as ReactionStrength,
              label: 'Low',
              desc: '0.6x reaction',
            },
            {
              id: 'medium' as ReactionStrength,
              label: 'Medium',
              desc: '1.0x (default)',
            },
            {
              id: 'high' as ReactionStrength,
              label: 'High',
              desc: '1.5x intense',
            },
          ].map((item) => {
            const isSelected = (settings.reactionStrength || 'medium') === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onUpdateSettings({ ...settings, reactionStrength: item.id })}
                className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-center transition active:scale-95 ${
                  isSelected
                    ? 'bg-gradient-to-b from-cyan-500/20 to-purple-500/20 border-cyan-400 text-white shadow-lg shadow-cyan-500/20'
                    : 'bg-slate-950/40 border-white/5 text-slate-400 hover:border-white/20 hover:text-slate-200'
                }`}
              >
                <span className="text-xs font-bold">{item.label}</span>
                <span className="text-[10px] text-slate-500 mt-0.5">{item.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* SLEEP TIMER */}
      <SleepTimerSection
        timerState={sleepTimer}
        onStart={onStartSleepTimer}
        onCancel={onCancelSleepTimer}
        onExtend={onExtendSleepTimer}
      />

      {/* PLAYBACK PREFERENCES */}
      <div className="p-5 rounded-3xl bg-slate-900/60 border border-white/10 space-y-3">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">
          Playback Controls
        </h3>

        {/* Dedicated Automatic Next Track Card */}
        <div className="p-4 rounded-2xl bg-slate-950/60 border border-cyan-500/25 flex items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-white text-sm">Automatic Next Track</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                settings.autoplayNext 
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' 
                  : 'bg-slate-800 text-slate-400 border border-white/5'
              }`}>
                {settings.autoplayNext ? 'ACTIVE' : 'OFF'}
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              When a track finishes, automatically queue and play the next song from your queue, playlist, or library without interruption.
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={settings.autoplayNext}
              onChange={(e) => onUpdateSettings({ ...settings, autoplayNext: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-cyan-500 peer-checked:to-purple-600"></div>
          </label>
        </div>

        <div className="space-y-2 text-sm text-slate-300 pt-1">
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

      {/* INFORMATION, PRIVACY & USER GUIDE */}
      <div className="p-5 rounded-3xl bg-slate-900/60 border border-white/10 space-y-3">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Information & Support
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Privacy Policy Card */}
          <button
            type="button"
            onClick={() => setActiveSubView('privacy')}
            className="flex items-center justify-between p-4 rounded-2xl bg-slate-950/60 border border-white/5 hover:border-cyan-500/40 text-left transition active:scale-98 group cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                <ShieldCheck className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white group-hover:text-cyan-300 transition">Privacy Policy</h4>
                <p className="text-[10px] text-slate-400 mt-0.5">Local data, Supabase interaction & permissions</p>
              </div>
            </div>
            <span className="text-cyan-400 text-xs font-semibold pl-2">View →</span>
          </button>

          {/* How to Use JTEC MUSIC Card */}
          <button
            type="button"
            onClick={() => setActiveSubView('guide')}
            className="flex items-center justify-between p-4 rounded-2xl bg-slate-950/60 border border-white/5 hover:border-purple-500/40 text-left transition active:scale-98 group cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-300 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                <BookOpen className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white group-hover:text-purple-300 transition">How to Use JTEC MUSIC</h4>
                <p className="text-[10px] text-slate-400 mt-0.5">Importing, playback, visualizers & effects</p>
              </div>
            </div>
            <span className="text-purple-400 text-xs font-semibold pl-2">Guide →</span>
          </button>
        </div>
      </div>

      <div className="text-center text-xs text-slate-500 pb-10 space-y-3">
        <p className="font-semibold text-slate-300">JTEC MUSIC • Your Music • Your Vibe • Offline</p>
        <CheckForUpdatesButton />
      </div>

    </div>
  );
};
