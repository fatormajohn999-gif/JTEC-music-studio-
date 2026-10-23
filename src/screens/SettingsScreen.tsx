import React, { useState, useEffect, useRef } from 'react';
import { 
  Settings as SettingsIcon, Zap, Battery, Sliders, Eye, HardDrive, 
  Trash2, ShieldCheck, Check, Sparkles, RefreshCw, Cloud,
  BellOff, Bell, X, Shield, BookOpen, Wifi, CheckCircle2, AlertCircle, AlertTriangle,
  ChevronDown, Play, Info
} from 'lucide-react';
import { NotificationPermissionManager, NotificationStatus } from '../services/notificationPermission';
import { AppSettings, PerformanceMode, VisualizerMode, ReactionStrength, SleepTimerState } from '../types/music';
import { SleepTimerSection } from '../components/SleepTimerSection';
import { CheckForUpdatesButton } from '../components/CheckForUpdatesButton';
import { PrivacyPolicyView } from '../components/PrivacyPolicyView';
import { UserGuideView } from '../components/UserGuideView';
import { ConnectionTestModal } from '../components/ConnectionTestModal';
import { APP_VERSION, BUILD_DATE } from '../version';
import { SupabaseService } from '../services/supabase';
import { StorageService } from '../services/storage';

interface SettingsScreenProps {
  settings: AppSettings;
  storageStats: {
    songCount: number;
    estimatedBytes: number;
    downloadCount?: number;
    downloadBytes?: number;
    isPersisted?: boolean;
  };
  onUpdateSettings: (newSettings: AppSettings) => void;
  onClearLibrary: () => void;
  sleepTimer: SleepTimerState;
  onStartSleepTimer: (minutes: number) => void;
  onCancelSleepTimer: () => void;
  onExtendSleepTimer: (minutes?: number) => void;
}

type SettingsGroup = 'playback' | 'visualizer' | 'storage' | 'notifications' | 'about';

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  settings,
  storageStats,
  onUpdateSettings,
  onClearLibrary,
  sleepTimer,
  onStartSleepTimer,
  onCancelSleepTimer,
  onExtendSleepTimer,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastScrollTopRef = useRef<number>(0);

  const [activeSubView, setActiveSubView] = useState<'main' | 'privacy' | 'guide'>('main');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showHowToModal, setShowHowToModal] = useState(false);
  const [showConnectionTest, setShowConnectionTest] = useState(false);
  const versionTapCountRef = useRef<number>(0);
  const versionTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleVersionTap = () => {
    versionTapCountRef.current += 1;
    if (versionTapTimerRef.current) {
      clearTimeout(versionTapTimerRef.current);
    }
    if (versionTapCountRef.current >= 7) {
      versionTapCountRef.current = 0;
      setShowConnectionTest(true);
      return;
    }
    versionTapTimerRef.current = setTimeout(() => {
      versionTapCountRef.current = 0;
    }, 2500);
  };

  useEffect(() => {
    return () => {
      if (versionTapTimerRef.current) {
        clearTimeout(versionTapTimerRef.current);
      }
    };
  }, []);

  const [persistedStatus, setPersistedStatus] = useState<boolean>(storageStats.isPersisted ?? false);
  const [notificationStatus, setNotificationStatus] = useState<NotificationStatus>('prompt');
  
  // Wi-Fi only download setting
  const [wifiOnly, setWifiOnly] = useState<boolean>(() => {
    return SupabaseService.getCloudSettings().wifiOnly ?? false;
  });

  // Collapsible cards: first two (playback and visualizer) are open by default
  const [openGroups, setOpenGroups] = useState<Record<SettingsGroup, boolean>>({
    playback: true,
    visualizer: true,
    storage: false,
    notifications: false,
    about: false,
  });

  const toggleGroup = (group: SettingsGroup) => {
    setOpenGroups((prev) => ({
      ...prev,
      [group]: !prev[group],
    }));
  };

  // Reset scroll position to top on initial mount
  useEffect(() => {
    const scrollParent = containerRef.current?.closest('main');
    if (scrollParent) {
      scrollParent.scrollTop = 0;
    } else {
      window.scrollTo(0, 0);
    }
  }, []);

  // Sync persistent storage status
  useEffect(() => {
    StorageService.isStoragePersisted().then((p) => setPersistedStatus(p));
  }, [storageStats.isPersisted]);

  // Sync notification status on focus and visibility
  useEffect(() => {
    let mounted = true;
    const checkNotification = () => {
      NotificationPermissionManager.getPermissionStatus().then((status) => {
        if (mounted) setNotificationStatus(status);
      });
    };

    checkNotification();

    window.addEventListener('focus', checkNotification);
    document.addEventListener('visibilitychange', checkNotification);

    return () => {
      mounted = false;
      window.removeEventListener('focus', checkNotification);
      document.removeEventListener('visibilitychange', checkNotification);
    };
  }, []);

  const handleRequestPersist = async () => {
    const granted = await StorageService.requestPersistentStorage();
    setPersistedStatus(granted);
  };

  const handleToggleWifiOnly = () => {
    const nextVal = !wifiOnly;
    setWifiOnly(nextVal);
    SupabaseService.saveCloudSettings({ wifiOnly: nextVal });
  };

  const handleRequestNotificationPermission = async () => {
    const status = await NotificationPermissionManager.requestPermission();
    setNotificationStatus(status);
    if (status === 'denied') {
      setShowHowToModal(true);
    }
  };

  const handleOpenSubView = (view: 'privacy' | 'guide') => {
    const scrollParent = containerRef.current?.closest('main');
    lastScrollTopRef.current = scrollParent ? scrollParent.scrollTop : window.scrollY;
    setActiveSubView(view);
  };

  const handleBackToMain = () => {
    setActiveSubView('main');
    setTimeout(() => {
      const scrollParent = containerRef.current?.closest('main');
      const target = Math.min(lastScrollTopRef.current, 320);
      if (scrollParent) {
        scrollParent.scrollTop = target;
      } else {
        window.scrollTo(0, target);
      }
    }, 50);
  };

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
    return <PrivacyPolicyView onBack={handleBackToMain} />;
  }

  if (activeSubView === 'guide') {
    return <UserGuideView onBack={handleBackToMain} />;
  }

  return (
    <div ref={containerRef} className="space-y-4 pb-48 px-4 pt-3 max-w-3xl mx-auto animate-in fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 pb-1">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500/20 to-purple-600/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300 shadow-lg shadow-cyan-500/10">
          <SettingsIcon className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white tracking-wide">Player Settings</h2>
          <p className="text-xs text-slate-400">Audio DSP, Visualizer, Storage & Cloud Services</p>
        </div>
      </div>

      {/* HOW TO ENABLE NOTIFICATIONS MODAL */}
      {showHowToModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl relative">
            <button
              onClick={() => setShowHowToModal(false)}
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
                <p className="text-xs text-slate-400">Lock screen & media playback controls</p>
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
                NotificationPermissionManager.getPermissionStatus().then(setNotificationStatus);
              }}
              className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
          GROUP 1: PLAYBACK (Open by default)
          Automatic Next, Sleep Timer, Remember Last Song, Neon Glow Aesthetics
      ========================================================================= */}
      <div className="rounded-3xl bg-slate-900/60 border border-white/10 overflow-hidden transition-all shadow-lg shadow-black/20">
        <button
          type="button"
          onClick={() => toggleGroup('playback')}
          aria-expanded={openGroups.playback}
          className="w-full flex items-center justify-between p-4 sm:p-5 text-left cursor-pointer group select-none hover:bg-white/[0.02] transition"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 flex items-center justify-center shrink-0">
              <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-white uppercase tracking-wider truncate">
                Playback
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-400 truncate">
                Automatic Next, Sleep Timer & playback controls
              </p>
            </div>
          </div>
          <ChevronDown
            className={`w-5 h-5 text-slate-400 transition-transform duration-200 shrink-0 ml-2 group-hover:text-white ${
              openGroups.playback ? 'rotate-180' : 'rotate-0'
            }`}
          />
        </button>

        {openGroups.playback && (
          <div className="px-4 sm:px-5 pb-5 pt-1 space-y-4 border-t border-white/5 animate-in fade-in duration-150">
            {/* Automatic Next Track */}
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

            {/* Sleep Timer */}
            <SleepTimerSection
              timerState={sleepTimer}
              onStart={onStartSleepTimer}
              onCancel={onCancelSleepTimer}
              onExtend={onExtendSleepTimer}
            />

            {/* Additional Playback Preferences: Session state and Aesthetics */}
            <div className="space-y-2 text-sm text-slate-300 pt-1">
              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950/40 border border-white/5 cursor-pointer">
                <div>
                  <div className="font-semibold text-white text-xs sm:text-sm">Remember Last Song</div>
                  <div className="text-[11px] text-slate-400">Restore exact track and seek position when reopening player</div>
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
                  <div className="font-semibold text-white text-xs sm:text-sm">Neon Glow Aesthetics</div>
                  <div className="text-[11px] text-slate-400">Atmospheric cover-reactive lighting in full player and cards</div>
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
        )}
      </div>

      {/* =========================================================================
          GROUP 2: VISUALIZER (Open by default)
          Theme picker, Reaction Strength, Engine and Battery Profile
      ========================================================================= */}
      <div className="rounded-3xl bg-slate-900/60 border border-white/10 overflow-hidden transition-all shadow-lg shadow-black/20">
        <button
          type="button"
          onClick={() => toggleGroup('visualizer')}
          aria-expanded={openGroups.visualizer}
          className="w-full flex items-center justify-between p-4 sm:p-5 text-left cursor-pointer group select-none hover:bg-white/[0.02] transition"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-purple-500/15 border border-purple-500/30 text-purple-400 flex items-center justify-center shrink-0">
              <Eye className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-white uppercase tracking-wider truncate">
                Visualizer
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-400 truncate">
                Themes, reaction dynamics & engine battery profile
              </p>
            </div>
          </div>
          <ChevronDown
            className={`w-5 h-5 text-slate-400 transition-transform duration-200 shrink-0 ml-2 group-hover:text-white ${
              openGroups.visualizer ? 'rotate-180' : 'rotate-0'
            }`}
          />
        </button>

        {openGroups.visualizer && (
          <div className="px-4 sm:px-5 pb-5 pt-1 space-y-5 border-t border-white/5 animate-in fade-in duration-150">
            {/* Visualizer Theme Picker */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Audio Visualizer Themes
                </span>
                <span className="text-[10px] text-cyan-300 font-mono">18 Scenes</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Render real-time frequency data synced to Web Audio API analyser:
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
                      className={`p-3 rounded-xl border text-xs font-bold transition flex items-center justify-between gap-1.5 cursor-pointer ${
                        isSelected
                          ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-sm shadow-cyan-500/20'
                          : 'bg-slate-950/40 border-white/5 text-slate-400 hover:text-white hover:border-white/20'
                      }`}
                    >
                      <span className="truncate">{v.label}</span>
                      {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Reaction Strength */}
            <div className="space-y-2 pt-2 border-t border-white/5">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Reaction Strength
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Scale how dynamically visualizer effects react to audio frequencies, bass hits, and beats (0.6x, 1.0x, 1.5x):
              </p>

              <div className="grid grid-cols-3 gap-2.5 pt-1">
                {[
                  { id: 'low' as ReactionStrength, label: 'Low', desc: '0.6x reaction' },
                  { id: 'medium' as ReactionStrength, label: 'Medium', desc: '1.0x (default)' },
                  { id: 'high' as ReactionStrength, label: 'High', desc: '1.5x intense' },
                ].map((item) => {
                  const isSelected = (settings.reactionStrength || 'medium') === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => onUpdateSettings({ ...settings, reactionStrength: item.id })}
                      className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-center transition active:scale-95 cursor-pointer ${
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

            {/* Engine & Battery Profile */}
            <div className="space-y-2 pt-2 border-t border-white/5">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Engine & Battery Profile
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Optimize frame rates and canvas resolution for mobile battery longevity:
              </p>

              <div className="grid grid-cols-3 gap-2.5 pt-1">
                {[
                  { id: 'battery' as PerformanceMode, label: 'Battery Saver', desc: '30 FPS, lowest CPU', icon: Battery },
                  { id: 'balanced' as PerformanceMode, label: 'Balanced', desc: '60 FPS, optimal', icon: Zap },
                  { id: 'high' as PerformanceMode, label: 'High Quality', desc: 'Full dpr, peak glow', icon: Sparkles },
                ].map((profile) => {
                  const Icon = profile.icon;
                  const isSelected = settings.performanceMode === profile.id;
                  return (
                    <button
                      key={profile.id}
                      onClick={() => handlePerformanceChange(profile.id)}
                      className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-center transition active:scale-95 cursor-pointer ${
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
          </div>
        )}
      </div>

      {/* =========================================================================
          GROUP 3: DOWNLOADS AND STORAGE
          Storage used, uninstall notice, Wi-Fi only, and dangerous clear library
      ========================================================================= */}
      <div className="rounded-3xl bg-slate-900/60 border border-white/10 overflow-hidden transition-all shadow-lg shadow-black/20">
        <button
          type="button"
          onClick={() => toggleGroup('storage')}
          aria-expanded={openGroups.storage}
          className="w-full flex items-center justify-between p-4 sm:p-5 text-left cursor-pointer group select-none hover:bg-white/[0.02] transition"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-blue-500/15 border border-blue-500/30 text-blue-400 flex items-center justify-center shrink-0">
              <HardDrive className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-white uppercase tracking-wider truncate">
                Downloads and Storage
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-400 truncate">
                Local storage, offline files & download settings
              </p>
            </div>
          </div>
          <ChevronDown
            className={`w-5 h-5 text-slate-400 transition-transform duration-200 shrink-0 ml-2 group-hover:text-white ${
              openGroups.storage ? 'rotate-180' : 'rotate-0'
            }`}
          />
        </button>

        {openGroups.storage && (
          <div className="px-4 sm:px-5 pb-5 pt-1 space-y-4 border-t border-white/5 animate-in fade-in duration-150">
            {/* Storage Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-center">
              <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5">
                <span className="text-xs text-slate-400">Library Songs</span>
                <div className="text-lg font-bold text-white font-mono">{storageStats.songCount}</div>
                <span className="text-[10px] text-slate-500">Total catalog</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5">
                <span className="text-xs text-slate-400">Downloads Storage</span>
                <div className="text-lg font-bold text-cyan-300 font-mono">
                  {formatBytes(storageStats.downloadBytes ?? storageStats.estimatedBytes)}
                </div>
                <span className="text-[10px] text-slate-500">
                  {storageStats.downloadCount ?? storageStats.songCount} offline tracks
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 col-span-2 sm:col-span-1">
                <span className="text-xs text-slate-400">Persistent Storage</span>
                <div className={`text-xs font-bold font-mono mt-1 flex items-center justify-center gap-1 ${
                  persistedStatus ? 'text-emerald-400' : 'text-amber-400'
                }`}>
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>{persistedStatus ? 'Granted' : 'Standard'}</span>
                </div>
                {!persistedStatus ? (
                  <button
                    type="button"
                    onClick={handleRequestPersist}
                    className="text-[10px] text-cyan-400 hover:underline mt-0.5 cursor-pointer"
                  >
                    Request permanent
                  </button>
                ) : (
                  <span className="text-[10px] text-slate-500">Protected</span>
                )}
              </div>
            </div>

            {/* Note: Required offline storage notice */}
            <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-white/10 text-xs text-slate-300">
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 shrink-0 text-cyan-400 mt-0.5" />
                <p className="leading-relaxed">
                  Downloads are saved inside the app. Uninstalling the app or clearing its data deletes them.
                </p>
              </div>
            </div>

            {/* Wi-Fi Only Downloads Toggle */}
            <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-white/5 flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Wifi className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-bold text-white">Download on Wi-Fi Only</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Save mobile cellular data when downloading tracks for offline playback
                </p>
              </div>
              <button
                type="button"
                onClick={handleToggleWifiOnly}
                className={`w-11 h-6 rounded-full transition-colors p-0.5 shrink-0 cursor-pointer ${
                  wifiOnly ? 'bg-cyan-500' : 'bg-slate-800'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    wifiOnly ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Dangerous Actions: Clear Offline Music Library */}
            <div className="pt-2">
              <div className="p-4 rounded-2xl border border-rose-500/30 bg-rose-950/20 space-y-3">
                <div className="flex items-center gap-2 text-rose-400">
                  <Trash2 className="w-4 h-4 shrink-0" />
                  <h4 className="text-xs font-bold uppercase tracking-wider">Dangerous Action</h4>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Remove all downloaded songs, playlists, and cached audio files stored in your device's IndexedDB.
                </p>

                {showClearConfirm ? (
                  <div className="p-3.5 rounded-xl bg-rose-950/80 border border-rose-500/50 space-y-3 animate-in fade-in">
                    <p className="text-xs font-semibold text-rose-200">
                      Are you sure? This will remove all imported songs, playlists, and cached audio files permanently from this device.
                    </p>
                    <div className="flex gap-2.5">
                      <button
                        type="button"
                        onClick={() => setShowClearConfirm(false)}
                        className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onClearLibrary();
                          setShowClearConfirm(false);
                        }}
                        className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white transition active:scale-95 cursor-pointer shadow-lg shadow-rose-600/30"
                      >
                        Yes, Clear All
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowClearConfirm(true)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-bold transition active:scale-98 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Clear Offline Music Library</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* =========================================================================
          GROUP 4: NOTIFICATIONS
          Permission status and button to open phone's app settings if notifications off
      ========================================================================= */}
      <div className="rounded-3xl bg-slate-900/60 border border-white/10 overflow-hidden transition-all shadow-lg shadow-black/20">
        <button
          type="button"
          onClick={() => toggleGroup('notifications')}
          aria-expanded={openGroups.notifications}
          className="w-full flex items-center justify-between p-4 sm:p-5 text-left cursor-pointer group select-none hover:bg-white/[0.02] transition"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
              <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-white uppercase tracking-wider truncate">
                Notifications
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-400 truncate">
                Notification permission & lock screen media controls
              </p>
            </div>
          </div>
          <ChevronDown
            className={`w-5 h-5 text-slate-400 transition-transform duration-200 shrink-0 ml-2 group-hover:text-white ${
              openGroups.notifications ? 'rotate-180' : 'rotate-0'
            }`}
          />
        </button>

        {openGroups.notifications && (
          <div className="px-4 sm:px-5 pb-5 pt-1 space-y-4 border-t border-white/5 animate-in fade-in duration-150">
            <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {notificationStatus === 'granted' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : notificationStatus === 'denied' ? (
                    <BellOff className="w-4 h-4 text-amber-400 shrink-0" />
                  ) : (
                    <Bell className="w-4 h-4 text-cyan-400 shrink-0" />
                  )}
                  <span className="text-xs font-bold text-white">Permission Status</span>
                </div>

                <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                  notificationStatus === 'granted'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : notificationStatus === 'denied'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                }`}>
                  {notificationStatus === 'granted' ? 'ACTIVE / ALLOWED' : notificationStatus === 'denied' ? 'OFF / BLOCKED' : 'NOT CONFIGURED'}
                </span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                {notificationStatus === 'granted'
                  ? 'Notifications are allowed. JTEC MUSIC displays track information, album art, and audio playback controls on your notification shade and lock screen.'
                  : 'Notifications are currently off. Enabling notifications allows JTEC MUSIC to show media playback controls, track details, and album artwork on your lock screen.'}
              </p>

              {/* Action Button: Open Phone Settings or Request */}
              {notificationStatus === 'denied' ? (
                <button
                  type="button"
                  onClick={() => setShowHowToModal(true)}
                  className="w-full py-2.5 px-4 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                >
                  <BellOff className="w-4 h-4 text-amber-400" />
                  <span>Open Phone App Settings Guide</span>
                </button>
              ) : notificationStatus === 'prompt' ? (
                <button
                  type="button"
                  onClick={handleRequestNotificationPermission}
                  className="w-full py-2.5 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                >
                  <Bell className="w-4 h-4" />
                  <span>Enable Notifications</span>
                </button>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {/* =========================================================================
          GROUP 5: ABOUT AND SUPPORT (Always at the very bottom)
          Privacy Policy, How to Use JTEC MUSIC, Check for updates, version & build
      ========================================================================= */}
      <div className="rounded-3xl bg-slate-900/60 border border-white/10 overflow-hidden transition-all shadow-lg shadow-black/20">
        <button
          type="button"
          onClick={() => toggleGroup('about')}
          aria-expanded={openGroups.about}
          className="w-full flex items-center justify-between p-4 sm:p-5 text-left cursor-pointer group select-none hover:bg-white/[0.02] transition"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 flex items-center justify-center shrink-0">
              <Shield className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-white uppercase tracking-wider truncate">
                About and Support
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-400 truncate">
                Privacy policy, user guide & software updates
              </p>
            </div>
          </div>
          <ChevronDown
            className={`w-5 h-5 text-slate-400 transition-transform duration-200 shrink-0 ml-2 group-hover:text-white ${
              openGroups.about ? 'rotate-180' : 'rotate-0'
            }`}
          />
        </button>

        {openGroups.about && (
          <div className="px-4 sm:px-5 pb-5 pt-1 space-y-4 border-t border-white/5 animate-in fade-in duration-150">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Privacy Policy Card */}
              <button
                type="button"
                onClick={() => handleOpenSubView('privacy')}
                className="flex items-center justify-between p-4 rounded-2xl bg-slate-950/60 border border-white/5 hover:border-cyan-500/40 text-left transition active:scale-98 group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                    <ShieldCheck className="w-5 h-5 text-cyan-400" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white group-hover:text-cyan-300 transition">Privacy Policy</h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">Local data, cloud service & permissions</p>
                  </div>
                </div>
                <span className="text-cyan-400 text-xs font-semibold pl-2">View →</span>
              </button>

              {/* How to Use JTEC MUSIC Card */}
              <button
                type="button"
                onClick={() => handleOpenSubView('guide')}
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

            {/* Check for updates button */}
            <div className="pt-1 flex flex-col items-center justify-center space-y-2">
              <CheckForUpdatesButton />
              <div className="text-center text-[11px] text-slate-500 space-y-0.5 select-none">
                <p
                  onClick={handleVersionTap}
                  className="cursor-default active:opacity-75 transition-opacity"
                >
                  Version <strong className="text-slate-300">{APP_VERSION}</strong> • Build <strong className="text-slate-300">{BUILD_DATE}</strong>
                </p>
                <p className="font-medium text-slate-400">JTEC MUSIC • Your Music • Your Vibe • Offline</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Hidden Developer Connection Diagnostics modal (only opened via 7-tap Easter egg) */}
      {showConnectionTest && (
        <ConnectionTestModal
          isOpen={showConnectionTest}
          onClose={() => setShowConnectionTest(false)}
        />
      )}
    </div>
  );
};
