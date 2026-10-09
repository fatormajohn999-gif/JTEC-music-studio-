import React, { useState } from 'react';
import { X, Check, Sparkles, Compass, Zap, Flame, Wind, Eye } from 'lucide-react';
import { CinematicScene } from '../types/music';

export interface VisualWorldOption {
  id: CinematicScene;
  name: string;
  category: 'ninja' | 'spectrum' | 'atmosphere';
  categoryLabel: string;
  icon: string;
  badge?: string;
  subtitle: string;
  accentColor: string;
  gradientBg: string;
  reactiveDescription: {
    bass: string;
    mids: string;
    treble: string;
  };
}

export const VISUAL_WORLDS: VisualWorldOption[] = [
  // 🥷 Ninja Worlds
  {
    id: 'anime_ninja',
    name: 'Shadow Shinobi',
    category: 'ninja',
    categoryLabel: 'Ninja World',
    icon: '🥷',
    subtitle: 'Moonlit rooftop warrior with cyan chakra aura & kunai',
    accentColor: '#00f0ff',
    gradientBg: 'from-cyan-950/60 via-slate-900/80 to-blue-950/70',
    reactiveDescription: {
      bass: 'Chakra shockwave explosions & radial aura blast',
      mids: 'Fluttering headband ribbon & flowing mist currents',
      treble: 'Crackling Chidori electric arcs & kunai gleams',
    },
  },
  {
    id: 'fire_shinobi',
    name: 'Flame Jutsu Shinobi',
    category: 'ninja',
    categoryLabel: 'Ninja World',
    icon: '🔥',
    subtitle: 'Volcanic temple shinobi wielding blazing crimson flame jutsu',
    accentColor: '#ff5722',
    gradientBg: 'from-orange-950/60 via-red-950/80 to-slate-950/70',
    reactiveDescription: {
      bass: 'Cataclysmic flame explosions & ground heatwaves',
      mids: 'Spiraling fire dragon vortex & billowing embers',
      treble: 'Blinding combustion flashes & golden spark bursts',
    },
  },
  {
    id: 'lightning_ninja',
    name: 'Storm Raikiri Shinobi',
    category: 'ninja',
    categoryLabel: 'Ninja World',
    icon: '⚡',
    subtitle: 'Thunderstorm tempest shinobi channeling violent electric plasma',
    accentColor: '#38bdf8',
    gradientBg: 'from-sky-950/60 via-indigo-950/80 to-slate-950/70',
    reactiveDescription: {
      bass: 'Sonic thunder impacts & concussive pressure rings',
      mids: 'Ionized atmospheric storm surges & electric haze',
      treble: 'Branching lightning strikes & high-voltage sparks',
    },
  },
  {
    id: 'wind_ninja',
    name: 'Gale Blade Shinobi',
    category: 'ninja',
    categoryLabel: 'Ninja World',
    icon: '🌪️',
    subtitle: 'Emerald mountain summit shinobi with swirling Rasen vortex',
    accentColor: '#10b981',
    gradientBg: 'from-emerald-950/60 via-teal-950/80 to-slate-950/70',
    reactiveDescription: {
      bass: 'Concussive gale-force bursts & blast rings',
      mids: 'Spinning Rasen chakra orb & swirling wind spirals',
      treble: 'Razor-sharp green vacuum blades & leaf torrents',
    },
  },
  {
    id: 'samurai',
    name: 'Blood Moon Ronin',
    category: 'ninja',
    categoryLabel: 'Ninja World',
    icon: '⚔️',
    subtitle: 'Eclipse twilight ronin with drawn katana in a sakura storm',
    accentColor: '#f43f5e',
    gradientBg: 'from-rose-950/60 via-red-950/80 to-slate-950/70',
    reactiveDescription: {
      bass: 'Blood-red katana slash impacts & screen thump',
      mids: 'Sakura blossom clouds tumbling across the twilight',
      treble: 'Razor edge reflections & steel glint sparks',
    },
  },

  // 📊 Audio Spectrum & Pro (Default Option)
  {
    id: 'dark_spectrum',
    name: 'Dark Spectrum',
    category: 'spectrum',
    categoryLabel: 'Audio Spectrum',
    icon: '📊',
    badge: 'Default Visualizer',
    subtitle: 'Studio-grade neon frequency bars with mirror glow & peak meters',
    accentColor: '#00f0ff',
    gradientBg: 'from-cyan-950/60 via-slate-900/80 to-purple-950/70',
    reactiveDescription: {
      bass: 'Massive sub-bass pillar expansions & bottom bounce',
      mids: 'Midrange vocal bar fluid wave movement',
      treble: 'Crisp high-frequency sparkle peaks & meter transients',
    },
  },
  {
    id: 'minimal_pro',
    name: 'Minimal Pro',
    category: 'spectrum',
    categoryLabel: 'Audio Spectrum',
    icon: '⚡',
    subtitle: 'High-refresh oscilloscope waveform & discrete frequency bars',
    accentColor: '#a855f7',
    gradientBg: 'from-purple-950/60 via-slate-900/80 to-slate-950/70',
    reactiveDescription: {
      bass: 'Dynamic baseline pulse & oscilloscope amplitude',
      mids: 'Smooth frequency curve modulation',
      treble: 'Needle-sharp transient spikes',
    },
  },
  {
    id: 'music_tunnel',
    name: 'Music Tunnel',
    category: 'spectrum',
    categoryLabel: 'Audio Spectrum',
    icon: '🌀',
    subtitle: 'Hypnotic 3D neon wireframe warp tunnel travelling at sonic speed',
    accentColor: '#ec4899',
    gradientBg: 'from-pink-950/60 via-purple-950/80 to-slate-950/70',
    reactiveDescription: {
      bass: 'Warp speed accelerations & ring expansions',
      mids: 'Tunnel rotation & geometry distortion waves',
      treble: 'Grid flare pulses & neon starlight streaks',
    },
  },

  // 🌌 Cinematic Atmospheres
  {
    id: 'auto',
    name: 'Auto Vibe',
    category: 'atmosphere',
    categoryLabel: 'Smart Adaptive',
    icon: '✨',
    badge: 'Smart Mode',
    subtitle: 'Dynamically adapts visual world & palette to song tempo and mood',
    accentColor: '#38bdf8',
    gradientBg: 'from-cyan-950/60 via-purple-950/80 to-slate-950/70',
    reactiveDescription: {
      bass: 'Auto-adapts impact force to track loudness',
      mids: 'Syncs harmonic color palette to artwork',
      treble: 'Automatic theme switching on drop transitions',
    },
  },
  {
    id: 'cyber_city',
    name: 'Cyber City',
    category: 'atmosphere',
    categoryLabel: 'Atmosphere',
    icon: '🏙️',
    subtitle: 'Rainy futuristic metropolis with neon holographic towers',
    accentColor: '#06b6d4',
    gradientBg: 'from-cyan-950/60 via-slate-900/80 to-slate-950/70',
    reactiveDescription: {
      bass: 'Skyline light pulses & bridge bassline glows',
      mids: 'Floating traffic streams & holographic flickers',
      treble: 'Neon sign strobes & wet puddle reflections',
    },
  },
  {
    id: 'galaxy',
    name: 'Cosmic Galaxy',
    category: 'atmosphere',
    categoryLabel: 'Atmosphere',
    icon: '🌌',
    subtitle: 'Deep stellar starfield with gravitational black hole vortex',
    accentColor: '#8b5cf6',
    gradientBg: 'from-indigo-950/60 via-purple-950/80 to-slate-950/70',
    reactiveDescription: {
      bass: 'Black hole event horizon expansion & gravitational thump',
      mids: 'Spiral nebula arms drifting in orbit',
      treble: 'Twinkling pulsar star bursts & stardust trails',
    },
  },
  {
    id: 'rainy_night',
    name: 'Rainy Night',
    category: 'atmosphere',
    categoryLabel: 'Atmosphere',
    icon: '🌧️',
    subtitle: 'Cinematic rainstorm with ripples and atmospheric bokeh halos',
    accentColor: '#64748b',
    gradientBg: 'from-slate-950 via-slate-900/80 to-blue-950/60',
    reactiveDescription: {
      bass: 'Heavy puddle splash ripples & thunder flash',
      mids: 'Wind-driven rain angle & bokeh drifting',
      treble: 'Droplet impact glints & lightning strikes',
    },
  },
  {
    id: 'fire_energy',
    name: 'Solar Inferno',
    category: 'atmosphere',
    categoryLabel: 'Atmosphere',
    icon: '🔥',
    subtitle: 'Swirling solar flare energy core with floating fiery embers',
    accentColor: '#ef4444',
    gradientBg: 'from-red-950/60 via-orange-950/80 to-slate-950/70',
    reactiveDescription: {
      bass: 'Solar flare shockwaves & core expansion',
      mids: 'Flame ribbon turbulence & heat waves',
      treble: 'Scintillating spark explosions',
    },
  },
  {
    id: 'deep_ocean',
    name: 'Deep Ocean Abyss',
    category: 'atmosphere',
    categoryLabel: 'Atmosphere',
    icon: '🌊',
    subtitle: 'Bioluminescent deep-sea abyss with rising harmonic bubbles',
    accentColor: '#0ea5e9',
    gradientBg: 'from-blue-950/60 via-teal-950/80 to-slate-950/70',
    reactiveDescription: {
      bass: 'Deep-sea pressure waves & oceanic floor pulses',
      mids: 'Floating bubble ascent streams & current sways',
      treble: 'Bioluminescent jellyfish particle glints',
    },
  },
];

interface VisualWorldsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentScene: CinematicScene;
  onSelectScene: (scene: CinematicScene) => void;
}

export const VisualWorldsModal: React.FC<VisualWorldsModalProps> = ({
  isOpen,
  onClose,
  currentScene,
  onSelectScene,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'ninja' | 'spectrum' | 'atmosphere'>('all');

  if (!isOpen) return null;

  const filteredWorlds = VISUAL_WORLDS.filter(
    (w) => selectedCategory === 'all' || w.category === selectedCategory
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-xl animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-3xl bg-[#080d1e] border border-cyan-500/30 shadow-2xl shadow-cyan-950/50 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4.5 border-b border-white/10 bg-slate-900/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500 to-purple-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 text-white">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-white tracking-wide">
                  Visual Worlds
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-mono">
                  Audio-Reactive
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Bass triggers chakra explosions · Mids control energy · Treble creates lightning
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 active:scale-95 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Category Tabs */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-white/5 bg-slate-950/40 overflow-x-auto custom-scrollbar shrink-0">
          {[
            { id: 'all' as const, label: 'All Worlds', icon: '🌌' },
            { id: 'ninja' as const, label: 'Ninja Worlds', icon: '🥷' },
            { id: 'spectrum' as const, label: 'Spectrum (Default)', icon: '📊' },
            { id: 'atmosphere' as const, label: 'Atmospheres', icon: '✨' },
          ].map((cat) => {
            const isActive = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition shrink-0 ${
                  isActive
                    ? 'bg-gradient-to-r from-cyan-500/25 to-purple-500/25 text-cyan-300 border border-cyan-400/50 shadow-sm shadow-cyan-500/20'
                    : 'bg-slate-900/40 text-slate-400 hover:text-slate-200 border border-white/5'
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Worlds Grid */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {filteredWorlds.map((world) => {
              const isSelected = currentScene === world.id;
              return (
                <div
                  key={world.id}
                  onClick={() => {
                    onSelectScene(world.id);
                  }}
                  className={`group relative rounded-2xl p-4 border cursor-pointer transition-all duration-200 bg-gradient-to-br ${world.gradientBg} ${
                    isSelected
                      ? 'border-cyan-400 shadow-xl shadow-cyan-500/20 ring-1 ring-cyan-400'
                      : 'border-white/10 hover:border-cyan-500/40 hover:scale-[1.01]'
                  }`}
                >
                  {/* Top Header inside card */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className="text-2xl shrink-0 group-hover:scale-110 transition-transform">
                        {world.icon}
                      </span>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-bold text-white group-hover:text-cyan-300 transition">
                            {world.name}
                          </h3>
                          {world.badge && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cyan-400/20 text-cyan-300 border border-cyan-400/40">
                              {world.badge}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                          {world.categoryLabel}
                        </span>
                      </div>
                    </div>

                    {/* Active check pill */}
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center border transition shrink-0 ${
                        isSelected
                          ? 'bg-cyan-400 border-cyan-300 text-slate-950 shadow-md shadow-cyan-400/50'
                          : 'border-white/20 bg-black/40 group-hover:border-cyan-400/40'
                      }`}
                    >
                      {isSelected ? (
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-white/20 group-hover:bg-cyan-400/50" />
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-slate-300 mt-2.5 leading-relaxed">
                    {world.subtitle}
                  </p>

                  {/* Frequency Reactive Highlights */}
                  <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-3 gap-2 text-[10px] text-slate-400">
                    <div className="p-1.5 rounded-lg bg-black/30 border border-white/5 space-y-0.5">
                      <span className="font-bold text-cyan-300 flex items-center gap-1">
                        <Flame className="w-3 h-3 text-cyan-400" />
                        Bass
                      </span>
                      <p className="text-[9px] text-slate-300 line-clamp-2 leading-tight">
                        {world.reactiveDescription.bass}
                      </p>
                    </div>

                    <div className="p-1.5 rounded-lg bg-black/30 border border-white/5 space-y-0.5">
                      <span className="font-bold text-purple-300 flex items-center gap-1">
                        <Wind className="w-3 h-3 text-purple-400" />
                        Mids
                      </span>
                      <p className="text-[9px] text-slate-300 line-clamp-2 leading-tight">
                        {world.reactiveDescription.mids}
                      </p>
                    </div>

                    <div className="p-1.5 rounded-lg bg-black/30 border border-white/5 space-y-0.5">
                      <span className="font-bold text-yellow-300 flex items-center gap-1">
                        <Zap className="w-3 h-3 text-yellow-400" />
                        Treble
                      </span>
                      <p className="text-[9px] text-slate-300 line-clamp-2 leading-tight">
                        {world.reactiveDescription.treble}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-white/10 bg-slate-900/60 shrink-0">
          <p className="text-xs text-slate-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>Select any theme to apply immediately in the visualizer</span>
          </p>

          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-bold text-xs hover:brightness-110 active:scale-95 transition shadow-lg shadow-cyan-500/25"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
