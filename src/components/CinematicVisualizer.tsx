import React, { useEffect, useRef } from 'react';
import { CinematicScene, PerformanceMode, ArtworkPalette, ReactionStrength } from '../types/music';
import { audioEngine } from '../services/audioEngine';

interface CinematicVisualizerProps {
  scene: CinematicScene;
  performanceMode: PerformanceMode;
  palette: ArtworkPalette;
  isActive: boolean;
  className?: string;
  reactionStrength?: ReactionStrength;
  onAutoSceneDetermined?: (detectedScene: CinematicScene) => void;
}

// Particle structures for specialized environments
interface StarParticle {
  x: number;
  y: number;
  z: number;
  baseRadius: number;
  alpha: number;
  twinklePhase: number;
  hueOffset: number;
}

interface EmberParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
  hue: number;
}

interface RainParticle {
  x: number;
  y: number;
  length: number;
  speed: number;
  alpha: number;
  thickness: number;
}

interface SplashRipple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
}

interface PetalParticle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  rot: number;
  vRot: number;
  size: number;
  alpha: number;
}

interface BubbleParticle {
  x: number;
  y: number;
  radius: number;
  speed: number;
  wobblePhase: number;
  wobbleSpeed: number;
  alpha: number;
}

interface BokehOrb {
  x: number;
  y: number;
  radius: number;
  color: string;
  alpha: number;
  pulsePhase: number;
}

// 3 New Ninja Environments Structures
interface ShadowTrailItem {
  x: number;
  y: number;
  stride: number;
  alpha: number;
}

interface ShadowSpark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  size: number;
  color: string;
}

interface ShurikenItem {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  rotSpeed: number;
  size: number;
  stuck: boolean;
  stickTime: number;
  stickX: number;
  stickY: number;
  targetX: number;
  trail: { x: number; y: number; rot: number; alpha: number }[];
}

interface DojoSparkItem {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

interface SmokePuffItem {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  rot: number;
  rotSpeed: number;
  color: string;
}

interface ForestFireflyItem {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  phase: number;
  speed: number;
  size: number;
  color: string;
}

// 1. AURORA SKIES structures
interface AuroraStar {
  x: number;
  y: number;
  size: number;
  alpha: number;
  twinkleSpeed: number;
}

interface AuroraParticle {
  x: number;
  y: number;
  vy: number;
  vx: number;
  size: number;
  alpha: number;
}

// 2. THUNDER STORM structures
interface StormCloud {
  x: number;
  y: number;
  radius: number;
  speed: number;
  alpha: number;
}

interface StormRainDrop {
  x: number;
  y: number;
  speed: number;
  length: number;
  alpha: number;
}

interface LightningSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  branches: { x1: number; y1: number; x2: number; y2: number }[];
}

// 3. DRAGON SPIRIT structures
interface DragonBodyJoint {
  x: number;
  y: number;
  radius: number;
}

interface DragonEmber {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
  color: string;
}

interface DragonSmokeTrail {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  color: string;
}

// 4. HYPERSPACE WARP structures
interface WarpStar {
  x: number;
  y: number;
  z: number;
  prevZ: number;
  colorType: 'main' | 'sec' | 'white';
}

// 5. NIGHT WALK structures
interface NightWalkParticle {
  x: number;
  y: number;
  size: number;
  vx: number;
  vy: number;
  alpha: number;
  phase: number;
  type: 'dust' | 'mist';
}

interface RGB {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: string): RGB {
  if (!hex) return { r: 0, g: 240, b: 255 };
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    return {
      r: parseInt(clean[0] + clean[0], 16) || 0,
      g: parseInt(clean[1] + clean[1], 16) || 0,
      b: parseInt(clean[2] + clean[2], 16) || 0,
    };
  }
  const num = parseInt(clean, 16);
  if (isNaN(num)) return { r: 0, g: 240, b: 255 };
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpRGB(c1: RGB, c2: RGB, t: number): RGB {
  return {
    r: lerp(c1.r, c2.r, t),
    g: lerp(c1.g, c2.g, t),
    b: lerp(c1.b, c2.b, t),
  };
}

function rgbToHex(rgb: RGB): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return (
    '#' +
    [clamp(rgb.r), clamp(rgb.g), clamp(rgb.b)]
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('')
  );
}

// Authentic default colors for every scene when no cover is present
const THEME_ORIGINAL_COLORS: Record<string, { main: RGB; secondary: RGB; accent: RGB }> = {
  auto: { main: hexToRgb('#00f0ff'), secondary: hexToRgb('#a855f7'), accent: hexToRgb('#ec4899') },
  dark_spectrum: { main: hexToRgb('#00f0ff'), secondary: hexToRgb('#a855f7'), accent: hexToRgb('#ec4899') },
  cyber_city: { main: hexToRgb('#00f0ff'), secondary: hexToRgb('#ec4899'), accent: hexToRgb('#f59e0b') },
  galaxy: { main: hexToRgb('#a855f7'), secondary: hexToRgb('#3b82f6'), accent: hexToRgb('#06b6d4') },
  fire_energy: { main: hexToRgb('#ff6a00'), secondary: hexToRgb('#dc2626'), accent: hexToRgb('#fbbf24') },
  rainy_night: { main: hexToRgb('#38bdf8'), secondary: hexToRgb('#1e293b'), accent: hexToRgb('#e0f2fe') },
  anime_ninja: { main: hexToRgb('#00f0ff'), secondary: hexToRgb('#3b82f6'), accent: hexToRgb('#f43f5e') },
  samurai: { main: hexToRgb('#ef4444'), secondary: hexToRgb('#b91c1c'), accent: hexToRgb('#f472b6') },
  deep_ocean: { main: hexToRgb('#38bdf8'), secondary: hexToRgb('#0e7490'), accent: hexToRgb('#34d399') },
  music_tunnel: { main: hexToRgb('#6366f1'), secondary: hexToRgb('#a855f7'), accent: hexToRgb('#ec4899') },
  minimal_pro: { main: hexToRgb('#38bdf8'), secondary: hexToRgb('#64748b'), accent: hexToRgb('#ffffff') },
  shadow_strike: { main: hexToRgb('#38bdf8'), secondary: hexToRgb('#1e293b'), accent: hexToRgb('#f59e0b') },
  shuriken_storm: { main: hexToRgb('#94a3b8'), secondary: hexToRgb('#ea580c'), accent: hexToRgb('#fde047') },
  smoke_vanish: { main: hexToRgb('#10b981'), secondary: hexToRgb('#064e3b'), accent: hexToRgb('#a3e635') },
  // 4 New Atmospheric Visualizer Effects
  aurora_skies: { main: hexToRgb('#10b981'), secondary: hexToRgb('#14b8a6'), accent: hexToRgb('#a855f7') },      // green, teal, purple
  thunder_storm: { main: hexToRgb('#475569'), secondary: hexToRgb('#f8fafc'), accent: hexToRgb('#c084fc') },     // steel blue, white, purple
  dragon_spirit: { main: hexToRgb('#eab308'), secondary: hexToRgb('#dc2626'), accent: hexToRgb('#ea580c') },     // gold, deep red, orange
  hyperspace_warp: { main: hexToRgb('#00f0ff'), secondary: hexToRgb('#ffffff'), accent: hexToRgb('#d946ef') },   // electric blue, white, magenta
  night_walk: { main: hexToRgb('#38bdf8'), secondary: hexToRgb('#818cf8'), accent: hexToRgb('#c084fc') },        // sky blue, indigo, purple
  // Backwards compatibility legacy aliases
  aurora: { main: hexToRgb('#00f0ff'), secondary: hexToRgb('#a855f7'), accent: hexToRgb('#ec4899') },
  neon_city: { main: hexToRgb('#00f0ff'), secondary: hexToRgb('#ec4899'), accent: hexToRgb('#f59e0b') },
  dream: { main: hexToRgb('#38bdf8'), secondary: hexToRgb('#1e293b'), accent: hexToRgb('#e0f2fe') },
  energy: { main: hexToRgb('#00f0ff'), secondary: hexToRgb('#3b82f6'), accent: hexToRgb('#f43f5e') },
  inferno: { main: hexToRgb('#ff6a00'), secondary: hexToRgb('#dc2626'), accent: hexToRgb('#fbbf24') },
  ocean: { main: hexToRgb('#38bdf8'), secondary: hexToRgb('#0e7490'), accent: hexToRgb('#34d399') },
  deep_space: { main: hexToRgb('#a855f7'), secondary: hexToRgb('#3b82f6'), accent: hexToRgb('#06b6d4') },
  crystal: { main: hexToRgb('#38bdf8'), secondary: hexToRgb('#64748b'), accent: hexToRgb('#ffffff') },
  vortex: { main: hexToRgb('#6366f1'), secondary: hexToRgb('#a855f7'), accent: hexToRgb('#ec4899') },
  prism: { main: hexToRgb('#00f0ff'), secondary: hexToRgb('#a855f7'), accent: hexToRgb('#ec4899') },
  meteor_shower: { main: hexToRgb('#00f0ff'), secondary: hexToRgb('#ec4899'), accent: hexToRgb('#f59e0b') },
  nature: { main: hexToRgb('#ef4444'), secondary: hexToRgb('#b91c1c'), accent: hexToRgb('#f472b6') },
  neural_network: { main: hexToRgb('#00f0ff'), secondary: hexToRgb('#3b82f6'), accent: hexToRgb('#f43f5e') },
  black_hole: { main: hexToRgb('#a855f7'), secondary: hexToRgb('#3b82f6'), accent: hexToRgb('#06b6d4') },
  off: { main: hexToRgb('#00f0ff'), secondary: hexToRgb('#a855f7'), accent: hexToRgb('#ec4899') },
};

export const CinematicVisualizer: React.FC<CinematicVisualizerProps> = ({
  scene,
  performanceMode,
  palette,
  isActive,
  className = '',
  reactionStrength = 'medium',
  onAutoSceneDetermined,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const internalSceneRef = useRef<CinematicScene>('dark_spectrum');

  // Keep fresh prop refs so animation loop does not drop frames or re-init particles
  const paletteRef = useRef(palette);
  paletteRef.current = palette;
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const performanceModeRef = useRef(performanceMode);
  performanceModeRef.current = performanceMode;
  const reactionStrengthRef = useRef(reactionStrength);
  reactionStrengthRef.current = reactionStrength;

  // Smooth color transitions (1.5s fade without sudden jump)
  const currentColorsRef = useRef<{ main: RGB; secondary: RGB; accent: RGB }>({
    main: hexToRgb('#00f0ff'),
    secondary: hexToRgb('#a855f7'),
    accent: hexToRgb('#ec4899'),
  });
  const startColorsRef = useRef<{ main: RGB; secondary: RGB; accent: RGB }>({
    main: hexToRgb('#00f0ff'),
    secondary: hexToRgb('#a855f7'),
    accent: hexToRgb('#ec4899'),
  });
  const targetColorsRef = useRef<{ main: RGB; secondary: RGB; accent: RGB }>({
    main: hexToRgb('#00f0ff'),
    secondary: hexToRgb('#a855f7'),
    accent: hexToRgb('#ec4899'),
  });
  const transitionStartTimeRef = useRef<number>(performance.now());
  const lastTargetKeyRef = useRef<string>('');

  // Physics & smoothing refs
  const smoothedBassRef = useRef(0);
  const smoothedMidRef = useRef(0);
  const smoothedHighRef = useRef(0);
  const smoothedVolRef = useRef(0);
  const lastBeatTimeRef = useRef(0);
  const autoCooldownRef = useRef(0);
  const animTimeRef = useRef(0);

  // Peak tracking for spectrum bars
  const peakCapsRef = useRef<number[]>([]);

  // Persistent particles per environment
  const starsRef = useRef<StarParticle[]>([]);
  const embersRef = useRef<EmberParticle[]>([]);
  const rainRef = useRef<RainParticle[]>([]);
  const ripplesRef = useRef<SplashRipple[]>([]);
  const petalsRef = useRef<PetalParticle[]>([]);
  const bubblesRef = useRef<BubbleParticle[]>([]);
  const bokehRef = useRef<BokehOrb[]>([]);

  // Slash animation state for Samurai mode
  const slashAnimRef = useRef<{ active: boolean; progress: number; x1: number; y1: number; x2: number; y2: number }>({
    active: false,
    progress: 0,
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 0,
  });

  // Specialized state refs for 3 ninja scenes
  const shadowStrikeRef = useRef<{
    ninjaX: number;
    ninjaY: number;
    stride: number;
    trail: ShadowTrailItem[];
    slashActive: boolean;
    slashProgress: number;
    slashX1: number;
    slashY1: number;
    slashX2: number;
    slashY2: number;
    sparks: ShadowSpark[];
  }>({
    ninjaX: 100,
    ninjaY: 300,
    stride: 0,
    trail: [],
    slashActive: false,
    slashProgress: 0,
    slashX1: 0,
    slashY1: 0,
    slashX2: 0,
    slashY2: 0,
    sparks: [],
  });

  const shurikenStormRef = useRef<{
    shurikens: ShurikenItem[];
    sparks: DojoSparkItem[];
    lastThrowTime: number;
  }>({
    shurikens: [],
    sparks: [],
    lastThrowTime: 0,
  });

  const smokeVanishRef = useRef<{
    puffs: SmokePuffItem[];
    fireflies: ForestFireflyItem[];
    ninjaX: number;
    ninjaY: number;
    ninjaAlpha: number;
    ninjaTargetAlpha: number;
    currentPose: 'ground' | 'branch' | 'crouch';
    lastTeleportTime: number;
  }>({
    puffs: [],
    fireflies: [],
    ninjaX: 0,
    ninjaY: 0,
    ninjaAlpha: 0.85,
    ninjaTargetAlpha: 0.85,
    currentPose: 'ground',
    lastTeleportTime: 0,
  });

  // 1. Aurora Skies persistent state
  const auroraSkiesRef = useRef<{
    stars: AuroraStar[];
    shimmer: AuroraParticle[];
    waveOffset1: number;
    waveOffset2: number;
    waveOffset3: number;
    waveOffset4: number;
    beatFlare: number;
  }>({
    stars: [],
    shimmer: [],
    waveOffset1: 0,
    waveOffset2: 1.5,
    waveOffset3: 3.2,
    waveOffset4: 4.8,
    beatFlare: 0,
  });

  // 2. Thunder Storm persistent state
  const thunderStormRef = useRef<{
    clouds: StormCloud[];
    rain: StormRainDrop[];
    lightning: LightningSegment[];
    flashAlpha: number;
    internalCloudGlow: number;
    lastStrikeTime: number;
  }>({
    clouds: [],
    rain: [],
    lightning: [],
    flashAlpha: 0,
    internalCloudGlow: 0,
    lastStrikeTime: 0,
  });

  // 3. Dragon Spirit persistent state
  const dragonSpiritRef = useRef<{
    headX: number;
    headY: number;
    vx: number;
    vy: number;
    joints: DragonBodyJoint[];
    embers: DragonEmber[];
    smoke: DragonSmokeTrail[];
    targetAngle: number;
    currentAngle: number;
    pathT: number;
    phase1: number;
    phase2: number;
    beatSurge: number;
  }>({
    headX: 400,
    headY: 300,
    vx: 1.5,
    vy: 0.5,
    joints: [],
    embers: [],
    smoke: [],
    targetAngle: 0,
    currentAngle: 0,
    pathT: 0,
    phase1: 0,
    phase2: 1.2,
    beatSurge: 0,
  });

  // 4. Hyperspace Warp persistent state
  const hyperspaceWarpRef = useRef<{
    stars: WarpStar[];
    speedBoost: number;
    rotationAngle: number;
    beatPulse: number;
    flashAlpha: number;
  }>({
    stars: [],
    speedBoost: 0,
    rotationAngle: 0,
    beatPulse: 0,
    flashAlpha: 0,
  });

  // 5. Night Walk persistent state & DOM element refs
  const nightWalkRef = useRef<{
    beatPulse: number;
    particles: NightWalkParticle[];
  }>({
    beatPulse: 0,
    particles: [],
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const nightWalkContainerRef = useRef<HTMLDivElement | null>(null);
  const nightWalkGlowRef = useRef<HTMLDivElement | null>(null);
  const nightWalkTintRef = useRef<HTMLDivElement | null>(null);
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;

  // Sync video play/pause with song playback and active scene
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.muted = true;
    vid.volume = 0;
    if (isActive && (scene === 'night_walk' || internalSceneRef.current === 'night_walk')) {
      vid.play().catch(() => {});
    } else {
      vid.pause();
    }
  }, [isActive, scene]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || scene === 'off') {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Responsive scaling
    const updateDimensions = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = performanceMode === 'battery' ? 1 : Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.scale(dpr, dpr);
    };

    updateDimensions();
    const resizeObserver = new ResizeObserver(() => updateDimensions());
    resizeObserver.observe(canvas);

    // Initial population of particles
    const starCount = performanceMode === 'battery' ? 45 : performanceMode === 'balanced' ? 85 : 140;
    starsRef.current = Array.from({ length: starCount }, () => ({
      x: (Math.random() - 0.5) * 1200,
      y: (Math.random() - 0.5) * 1200,
      z: Math.random() * 900 + 40,
      baseRadius: Math.random() * 1.8 + 0.6,
      alpha: Math.random() * 0.7 + 0.3,
      twinklePhase: Math.random() * Math.PI * 2,
      hueOffset: Math.random() * 60 - 30,
    }));

    const emberCount = performanceMode === 'battery' ? 25 : performanceMode === 'balanced' ? 50 : 80;
    embersRef.current = Array.from({ length: emberCount }, () => ({
      x: Math.random() * 800,
      y: Math.random() * 600,
      vx: (Math.random() - 0.5) * 1.5,
      vy: -(Math.random() * 2.5 + 1.2),
      size: Math.random() * 3 + 1.5,
      alpha: Math.random() * 0.8 + 0.2,
      life: Math.random() * 120,
      maxLife: Math.random() * 100 + 80,
      hue: Math.random() * 35 + 15,
    }));

    const rainCount = performanceMode === 'battery' ? 40 : performanceMode === 'balanced' ? 80 : 130;
    rainRef.current = Array.from({ length: rainCount }, () => ({
      x: Math.random() * 1000,
      y: Math.random() * 800,
      length: Math.random() * 22 + 12,
      speed: Math.random() * 10 + 14,
      alpha: Math.random() * 0.5 + 0.3,
      thickness: Math.random() * 1.2 + 0.8,
    }));

    const petalCount = performanceMode === 'battery' ? 20 : performanceMode === 'balanced' ? 40 : 65;
    petalsRef.current = Array.from({ length: petalCount }, () => ({
      x: Math.random() * 900,
      y: Math.random() * 800,
      z: Math.random() * 500 + 50,
      vx: Math.random() * 1.5 + 0.8,
      vy: Math.random() * 1.2 + 0.6,
      rot: Math.random() * Math.PI * 2,
      vRot: (Math.random() - 0.5) * 0.05,
      size: Math.random() * 6 + 4,
      alpha: Math.random() * 0.6 + 0.3,
    }));

    const bubbleCount = performanceMode === 'battery' ? 18 : performanceMode === 'balanced' ? 35 : 55;
    bubblesRef.current = Array.from({ length: bubbleCount }, () => ({
      x: Math.random() * 800,
      y: Math.random() * 800,
      radius: Math.random() * 5 + 2,
      speed: Math.random() * 1.8 + 0.8,
      wobblePhase: Math.random() * Math.PI * 2,
      wobbleSpeed: Math.random() * 0.04 + 0.02,
      alpha: Math.random() * 0.5 + 0.2,
    }));

    const bokehCount = performanceMode === 'battery' ? 10 : 20;
    const bokehColors = ['#38bdf8', '#818cf8', '#c084fc', '#f472b6'];
    bokehRef.current = Array.from({ length: bokehCount }, () => ({
      x: Math.random() * 800,
      y: Math.random() * 600,
      radius: Math.random() * 35 + 15,
      color: bokehColors[Math.floor(Math.random() * bokehColors.length)],
      alpha: Math.random() * 0.25 + 0.1,
      pulsePhase: Math.random() * Math.PI * 2,
    }));

    // Initialize 3 Ninja environments persistent data
    shadowStrikeRef.current = {
      ninjaX: 60,
      ninjaY: 280,
      stride: 0,
      trail: [],
      slashActive: false,
      slashProgress: 0,
      slashX1: 0,
      slashY1: 0,
      slashX2: 0,
      slashY2: 0,
      sparks: [],
    };

    shurikenStormRef.current = {
      shurikens: [],
      sparks: [],
      lastThrowTime: 0,
    };

    smokeVanishRef.current = {
      puffs: [],
      fireflies: Array.from({ length: 25 }, () => ({
        x: Math.random() * 800,
        y: Math.random() * 600,
        baseX: Math.random() * 800,
        baseY: Math.random() * 600,
        phase: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.03 + 0.015,
        size: Math.random() * 2.5 + 1.2,
        color: '#a3e635',
      })),
      ninjaX: 0,
      ninjaY: 0,
      ninjaAlpha: 0.85,
      ninjaTargetAlpha: 0.85,
      currentPose: 'ground',
      lastTeleportTime: 0,
    };

    // 1. Initialize Aurora Skies persistent particles
    const auroraStarCount = performanceMode === 'battery' ? 35 : performanceMode === 'balanced' ? 60 : 90;
    const auroraShimmerCount = performanceMode === 'battery' ? 20 : performanceMode === 'balanced' ? 40 : 65;
    auroraSkiesRef.current = {
      stars: Array.from({ length: auroraStarCount }, () => ({
        x: Math.random() * 1000,
        y: Math.random() * 500,
        size: Math.random() * 1.8 + 0.8,
        alpha: Math.random() * 0.7 + 0.3,
        twinkleSpeed: Math.random() * 0.04 + 0.01,
      })),
      shimmer: Array.from({ length: auroraShimmerCount }, () => ({
        x: Math.random() * 1000,
        y: Math.random() * 400 + 50,
        vy: -(Math.random() * 0.8 + 0.3),
        vx: (Math.random() - 0.5) * 0.6,
        size: Math.random() * 2 + 1,
        alpha: Math.random() * 0.8 + 0.2,
      })),
      waveOffset1: 0,
      waveOffset2: 1.5,
      waveOffset3: 3.2,
      waveOffset4: 4.8,
      beatFlare: 0,
    };

    // 2. Initialize Thunder Storm persistent particles (lighter rain than Rainy Night)
    const stormCloudCount = performanceMode === 'battery' ? 12 : 22;
    const stormRainCount = performanceMode === 'battery' ? 30 : performanceMode === 'balanced' ? 55 : 85;
    thunderStormRef.current = {
      clouds: Array.from({ length: stormCloudCount }, () => ({
        x: Math.random() * 1200 - 100,
        y: Math.random() * 180 + 30,
        radius: Math.random() * 90 + 70,
        speed: Math.random() * 0.35 + 0.15,
        alpha: Math.random() * 0.35 + 0.25,
      })),
      rain: Array.from({ length: stormRainCount }, () => ({
        x: Math.random() * 1100,
        y: Math.random() * 900,
        speed: Math.random() * 9 + 11,
        length: Math.random() * 16 + 10,
        alpha: Math.random() * 0.35 + 0.2,
      })),
      lightning: [],
      flashAlpha: 0,
      internalCloudGlow: 0,
      lastStrikeTime: 0,
    };

    // 3. Initialize Dragon Spirit persistent joint, ember, and smoke arrays (40-60 segments)
    const dragonJointCount = 52;
    dragonSpiritRef.current = {
      headX: 400,
      headY: 300,
      vx: 1.2,
      vy: 0.6,
      pathT: 0,
      phase1: 0,
      phase2: 1.2,
      beatSurge: 0,
      joints: Array.from({ length: dragonJointCount }, (_, i) => {
        // Body thickest near the head, tapering smoothly to the tail
        const progress = i / dragonJointCount;
        const r = 26 * (1 - progress * 0.86);
        return {
          x: 400 - i * 13,
          y: 300,
          radius: Math.max(3.2, r),
        };
      }),
      embers: [],
      smoke: [],
      targetAngle: 0,
      currentAngle: 0,
    };

    // 4. Initialize Hyperspace Warp persistent 3D starfield
    const warpStarCount = performanceMode === 'battery' ? 90 : performanceMode === 'balanced' ? 170 : 250;
    hyperspaceWarpRef.current = {
      stars: Array.from({ length: warpStarCount }, () => {
        const cType: 'main' | 'sec' | 'white' = Math.random() > 0.6 ? 'main' : Math.random() > 0.3 ? 'sec' : 'white';
        const z = Math.random() * 1000 + 10;
        return {
          x: (Math.random() - 0.5) * 1600,
          y: (Math.random() - 0.5) * 1200,
          z,
          prevZ: z,
          colorType: cType,
        };
      }),
      speedBoost: 0,
      rotationAngle: 0,
      beatPulse: 0,
      flashAlpha: 0,
    };

    let isDocumentVisible = true;
    const handleVisibilityChange = () => {
      isDocumentVisible = document.visibilityState === 'visible';
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // =========================================================================
    // MAIN 60FPS ANIMATION LOOP
    // =========================================================================
    const render = (currentTime: number) => {
      animFrameRef.current = requestAnimationFrame(render);

      if (!isDocumentVisible) return;

      const delta = currentTime - lastFrameTimeRef.current;
      const targetDelta = performanceModeRef.current === 'battery' ? 1000 / 30 : 1000 / 60;
      if (delta < targetDelta - 2) return;
      lastFrameTimeRef.current = currentTime;

      const currentPerf = performanceModeRef.current;
      const dpr = currentPerf === 'battery' ? 1 : Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;
      const cx = width / 2;
      const cy = height / 2;

      // Real audio bands from Web Audio API analyser
      const bands = audioEngine.getAudioBands();
      const rawBass = bands?.bass || 0;
      const rawMid = bands?.mid || 0;
      const rawHigh = bands?.high || 0;
      const rawVol = bands?.volume || 0;
      const freq = bands?.rawFrequency;
      const timeDomain = bands?.rawTimeDomain;

      // Physics smoothing
      smoothedBassRef.current += (rawBass - smoothedBassRef.current) * 0.18;
      smoothedMidRef.current += (rawMid - smoothedMidRef.current) * 0.15;
      smoothedHighRef.current += (rawHigh - smoothedHighRef.current) * 0.22;
      smoothedVolRef.current += (rawVol - smoothedVolRef.current) * 0.14;

      // Reaction strength multiplier (Low: 0.6x, Medium: 1.0x, High: 1.5x)
      const currentReaction = reactionStrengthRef.current || 'medium';
      const reactionMult = currentReaction === 'low' ? 0.6 : currentReaction === 'high' ? 1.5 : 1.0;

      const sBass = Math.min(1.0, smoothedBassRef.current * reactionMult);
      const sMid = Math.min(1.0, smoothedMidRef.current * reactionMult);
      const sHigh = Math.min(1.0, smoothedHighRef.current * reactionMult);
      const sVol = Math.min(1.0, smoothedVolRef.current * reactionMult);

      animTimeRef.current += 0.016;
      const t = animTimeRef.current;

      // Dynamic Beat Detection Transient
      const beatThreshold = currentReaction === 'high' ? 0.52 : currentReaction === 'low' ? 0.72 : 0.62;
      const beatCooldown = currentReaction === 'high' ? 220 : currentReaction === 'low' ? 320 : 260;
      const isBeat = rawBass > beatThreshold && currentTime - lastBeatTimeRef.current > beatCooldown;
      if (isBeat) {
        lastBeatTimeRef.current = currentTime;
        // Trigger samurai slash attack on heavy beat
        if (Math.random() > 0.35) {
          slashAnimRef.current = {
            active: true,
            progress: 0,
            x1: Math.random() * (width * 0.4) + width * 0.1,
            y1: Math.random() * (height * 0.4) + height * 0.1,
            x2: Math.random() * (width * 0.4) + width * 0.5,
            y2: Math.random() * (height * 0.4) + height * 0.4,
          };
        }
      }

      // Map legacy or resolve active scene name
      const activeSceneProp = sceneRef.current;
      let resolvedScene: CinematicScene = activeSceneProp;
      if (activeSceneProp === 'auto') {
        autoCooldownRef.current += 1;
        if (autoCooldownRef.current > 400) {
          let detected: CinematicScene = internalSceneRef.current;
          if (sBass > 0.65) {
            const highBassPool: CinematicScene[] = ['fire_energy', 'cyber_city', 'shadow_strike', 'thunder_storm', 'dragon_spirit'];
            detected = highBassPool[Math.floor(Math.random() * highBassPool.length)];
          } else if (sBass > 0.45 && sHigh > 0.45) {
            const energyPool: CinematicScene[] = ['anime_ninja', 'music_tunnel', 'shuriken_storm', 'hyperspace_warp'];
            detected = energyPool[Math.floor(Math.random() * energyPool.length)];
          } else if (sMid > 0.45 && sHigh > 0.4) {
            const midPool: CinematicScene[] = ['galaxy', 'samurai', 'smoke_vanish', 'aurora_skies'];
            detected = midPool[Math.floor(Math.random() * midPool.length)];
          } else if (sVol < 0.28 && sBass < 0.3) {
            detected = Math.random() > 0.5 ? 'minimal_pro' : 'deep_ocean';
          } else {
            detected = Math.random() > 0.5 ? 'dark_spectrum' : 'rainy_night';
          }

          if (detected !== internalSceneRef.current) {
            internalSceneRef.current = detected;
            autoCooldownRef.current = 0;
            if (onAutoSceneDetermined) onAutoSceneDetermined(detected);
          }
        }
        resolvedScene = internalSceneRef.current;
      } else {
        // Backwards compatibility mappings for older scene names
        const sceneStr = activeSceneProp as string;
        if (sceneStr === 'aurora' || sceneStr === 'prism') resolvedScene = 'dark_spectrum';
        else if (sceneStr === 'neon_city' || sceneStr === 'meteor_shower') resolvedScene = 'cyber_city';
        else if (sceneStr === 'deep_space' || sceneStr === 'black_hole') resolvedScene = 'galaxy';
        else if (sceneStr === 'inferno') resolvedScene = 'fire_energy';
        else if (sceneStr === 'dream') resolvedScene = 'rainy_night';
        else if (sceneStr === 'energy' || sceneStr === 'neural_network') resolvedScene = 'anime_ninja';
        else if (sceneStr === 'nature') resolvedScene = 'samurai';
        else if (sceneStr === 'ocean') resolvedScene = 'deep_ocean';
        else if (sceneStr === 'vortex') resolvedScene = 'music_tunnel';
        else if (sceneStr === 'crystal') resolvedScene = 'minimal_pro';
      }

      // Sync Night Walk video container visibility & playback
      if (nightWalkContainerRef.current) {
        if (resolvedScene === 'night_walk') {
          nightWalkContainerRef.current.style.display = 'flex';
          if (videoRef.current) {
            if (isActiveRef.current) {
              if (videoRef.current.paused) videoRef.current.play().catch(() => {});
            } else {
              if (!videoRef.current.paused) videoRef.current.pause();
            }
          }
        } else {
          nightWalkContainerRef.current.style.display = 'none';
          if (videoRef.current && !videoRef.current.paused) {
            videoRef.current.pause();
          }
        }
      }

      // =======================================================================
      // SMOOTH COLOR INTERPOLATION (1.5 seconds fade between song covers)
      // If a song has no cover, every theme smoothly uses its own original colors!
      // =======================================================================
      const currentPalette = paletteRef.current;
      let targetRGB: { main: RGB; secondary: RGB; accent: RGB };

      if (currentPalette?.hasCover) {
        // Use extracted cover colors
        targetRGB = {
          main: hexToRgb(currentPalette.main || currentPalette.primary),
          secondary: hexToRgb(currentPalette.secondary),
          accent: hexToRgb(currentPalette.accent),
        };
      } else {
        // No cover: use each theme's authentic original colors
        const orig = THEME_ORIGINAL_COLORS[resolvedScene] || THEME_ORIGINAL_COLORS['dark_spectrum'];
        targetRGB = {
          main: orig.main,
          secondary: orig.secondary,
          accent: orig.accent,
        };
      }

      const targetKey = `${targetRGB.main.r},${targetRGB.main.g},${targetRGB.main.b}_${targetRGB.secondary.r},${targetRGB.secondary.g},${targetRGB.secondary.b}_${targetRGB.accent.r},${targetRGB.accent.g},${targetRGB.accent.b}`;
      if (targetKey !== lastTargetKeyRef.current) {
        startColorsRef.current = { ...currentColorsRef.current };
        targetColorsRef.current = targetRGB;
        transitionStartTimeRef.current = performance.now();
        lastTargetKeyRef.current = targetKey;
      }

      // Smoothstep 1.5-second easing curve
      const elapsedMs = performance.now() - transitionStartTimeRef.current;
      const progress = Math.min(1, Math.max(0, elapsedMs / 1500));
      const easeT = progress * progress * (3 - 2 * progress);

      const activeMain = lerpRGB(startColorsRef.current.main, targetColorsRef.current.main, easeT);
      const activeSecondary = lerpRGB(startColorsRef.current.secondary, targetColorsRef.current.secondary, easeT);
      const activeAccent = lerpRGB(startColorsRef.current.accent, targetColorsRef.current.accent, easeT);
      currentColorsRef.current = { main: activeMain, secondary: activeSecondary, accent: activeAccent };

      // Helpers for drawing
      const mr = Math.round(activeMain.r);
      const mg = Math.round(activeMain.g);
      const mb = Math.round(activeMain.b);
      const sr = Math.round(activeSecondary.r);
      const sg = Math.round(activeSecondary.g);
      const sb = Math.round(activeSecondary.b);
      const ar = Math.round(activeAccent.r);
      const ag = Math.round(activeAccent.g);
      const ab = Math.round(activeAccent.b);

      const colors = {
        main: rgbToHex(activeMain),
        secondary: rgbToHex(activeSecondary),
        accent: rgbToHex(activeAccent),
        mainRgba: (a: number) => `rgba(${mr}, ${mg}, ${mb}, ${a})`,
        secondaryRgba: (a: number) => `rgba(${sr}, ${sg}, ${sb}, ${a})`,
        accentRgba: (a: number) => `rgba(${ar}, ${ag}, ${ab}, ${a})`,
        darkBg: `rgb(${Math.max(2, Math.round(sr * 0.05))}, ${Math.max(3, Math.round(sg * 0.05))}, ${Math.max(6, Math.round(sb * 0.09))})`,
      };

      ctx.save();
      ctx.clearRect(0, 0, width, height);

      // =======================================================================
      // 1. DARK SPECTRUM 📊 (Dark realistic spectrum + waveform)
      // =======================================================================
      if (resolvedScene === 'dark_spectrum') {
        // Dark matte studio gradient
        const bg = ctx.createLinearGradient(0, 0, 0, height);
        bg.addColorStop(0, colors.darkBg);
        bg.addColorStop(0.6, '#060a14');
        bg.addColorStop(1, '#020306');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, width, height);

        const barCount = currentPerf === 'battery' ? 36 : 56;
        if (peakCapsRef.current.length !== barCount) {
          peakCapsRef.current = new Array(barCount).fill(0);
        }

        const marginX = width * 0.08;
        const availableW = width - marginX * 2;
        const barWidth = Math.max(3, (availableW / barCount) * 0.72);
        const barSpacing = availableW / barCount;
        const baselineY = height * 0.72;
        const maxBarH = height * 0.42;

        // Faint horizontal studio dB scale lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.lineWidth = 1;
        for (let db = 1; db <= 4; db++) {
          const gridY = baselineY - (maxBarH / 4) * db;
          ctx.beginPath();
          ctx.moveTo(marginX, gridY);
          ctx.lineTo(width - marginX, gridY);
          ctx.stroke();
        }

        // Bass ambient floor glow
        if (sBass > 0.1) {
          const floorGlow = ctx.createRadialGradient(cx, baselineY, 10, cx, baselineY, width * 0.45);
          floorGlow.addColorStop(0, colors.mainRgba(0.25));
          floorGlow.addColorStop(1, 'transparent');
          ctx.fillStyle = floorGlow;
          ctx.fillRect(0, baselineY - 40, width, 100);
        }

        // Draw spectrum bars + peak caps
        for (let i = 0; i < barCount; i++) {
          const binIndex = Math.min(
            freq ? freq.length - 1 : 0,
            Math.floor(Math.pow(i / barCount, 1.45) * ((freq?.length || 128) * 0.85)) + 1
          );
          const rawVal = freq && freq[binIndex] ? freq[binIndex] / 255 : 0;
          const boost = i < barCount * 0.3 ? 1.0 + sBass * 0.4 : 1.0 + sHigh * 0.35;
          const targetH = Math.max(4, rawVal * maxBarH * boost);

          const currentPeak = peakCapsRef.current[i] || 0;
          if (targetH > currentPeak) {
            peakCapsRef.current[i] = targetH;
          } else {
            peakCapsRef.current[i] = Math.max(0, currentPeak - (currentPerf === 'battery' ? 3.5 : 2.2));
          }

          const bx = marginX + i * barSpacing + (barSpacing - barWidth) / 2;
          const by = baselineY - targetH;

          // Main vertical bar gradient
          const barGrad = ctx.createLinearGradient(bx, by, bx, baselineY);
          barGrad.addColorStop(0, i < barCount * 0.4 ? colors.main : colors.secondary);
          barGrad.addColorStop(0.7, colors.accent);
          barGrad.addColorStop(1, 'rgba(15, 23, 42, 0.4)');

          ctx.fillStyle = barGrad;
          ctx.beginPath();
          ctx.roundRect(bx, by, barWidth, targetH, [barWidth / 2, barWidth / 2, 0, 0]);
          ctx.fill();

          // Glossy floor reflection
          const refH = targetH * 0.38;
          const refGrad = ctx.createLinearGradient(bx, baselineY, bx, baselineY + refH);
          refGrad.addColorStop(0, colors.mainRgba(0.28));
          refGrad.addColorStop(1, 'transparent');
          ctx.fillStyle = refGrad;
          ctx.fillRect(bx, baselineY + 2, barWidth, refH);

          // Floating peak cap
          const peakH = peakCapsRef.current[i];
          if (peakH > targetH + 3) {
            ctx.fillStyle = '#ffffff';
            ctx.globalAlpha = Math.min(1, 0.5 + sHigh * 0.5);
            ctx.fillRect(bx, baselineY - peakH - 2, barWidth, 2);
            ctx.globalAlpha = 1.0;
          }
        }

        // Horizontal precision oscilloscope waveform overlay at 38% height
        if (timeDomain && timeDomain.length > 0) {
          const waveY = height * 0.36;
          const waveAmp = 35 + sBass * 40;
          ctx.beginPath();
          const waveStartX = width * 0.1;
          const waveW = width * 0.8;

          for (let x = 0; x < waveW; x += 4) {
            const idx = Math.floor((x / waveW) * timeDomain.length);
            const norm = (timeDomain[idx] - 128) / 128;
            const py = waveY + norm * waveAmp;
            if (x === 0) ctx.moveTo(waveStartX + x, py);
            else ctx.lineTo(waveStartX + x, py);
          }

          ctx.strokeStyle = colors.main;
          ctx.lineWidth = 1.8;
          ctx.shadowColor = colors.main;
          ctx.shadowBlur = 8 + sVol * 10;
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
      }

      // =======================================================================
      // 2. CYBER CITY 🏙️ (Futuristic night city with reactive lights & reflections)
      // =======================================================================
      else if (resolvedScene === 'cyber_city') {
        // Twilight cyberpunk sky
        const skyGrad = ctx.createLinearGradient(0, 0, 0, height * 0.65);
        skyGrad.addColorStop(0, '#04020c');
        skyGrad.addColorStop(0.5, colors.secondaryRgba(0.18));
        skyGrad.addColorStop(1, colors.secondaryRgba(0.28));
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, width, height * 0.65);

        // Cyber synthwave distant sun/moon on the horizon
        const moonY = height * 0.42;
        const moonR = Math.min(cx, cy) * 0.35;
        const moonGrad = ctx.createRadialGradient(cx, moonY, 10, cx, moonY, moonR);
        moonGrad.addColorStop(0, colors.main);
        moonGrad.addColorStop(0.7, colors.secondary);
        moonGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = moonGrad;
        ctx.globalAlpha = 0.55 + sBass * 0.35;
        ctx.beginPath();
        ctx.arc(cx, moonY, moonR, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;

        const horizonY = height * 0.62;

        // Distant skyscraper silhouettes with frequency-lit window matrices
        const bldgCount = 14;
        const bldgWidth = width / bldgCount;
        for (let b = 0; b < bldgCount; b++) {
          const bSeed = (b * 1337) % 100;
          const bHeight = 70 + (bSeed / 100) * (height * 0.28) + (b === 6 || b === 7 ? 60 : 0);
          const bx = b * bldgWidth;
          const by = horizonY - bHeight;

          // Building silhouette
          ctx.fillStyle = '#060613';
          ctx.fillRect(bx, by, bldgWidth - 2, bHeight);

          // Rooftop antenna spire
          if (b % 3 === 0) {
            ctx.strokeStyle = '#334155';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(bx + bldgWidth / 2, by);
            ctx.lineTo(bx + bldgWidth / 2, by - 25);
            ctx.stroke();

            // Blinking antenna beacon on high frequencies
            if (sHigh > 0.25 || Math.sin(t * 5 + b) > 0.5) {
              ctx.fillStyle = colors.accent;
              ctx.beginPath();
              ctx.arc(bx + bldgWidth / 2, by - 25, 2 + sHigh * 2, 0, Math.PI * 2);
              ctx.fill();
            }
          }

          // Matrix of lit windows reacting to frequency bins
          const freqSample = freq ? freq[(b * 8) % (freq.length || 1)] / 255 : 0;
          const rows = Math.floor(bHeight / 12);
          const cols = Math.max(2, Math.floor(bldgWidth / 8));

          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              const lit = (r + c + b) % 3 === 0 || r < rows * freqSample;
              if (lit) {
                const wx = bx + 3 + c * 7;
                const wy = by + 6 + r * 11;
                ctx.fillStyle = (b + r) % 2 === 0 ? colors.main : colors.accent;
                ctx.globalAlpha = 0.35 + freqSample * 0.55;
                ctx.fillRect(wx, wy, 4, 6);
              }
            }
          }
          ctx.globalAlpha = 1.0;
        }

        // Wet asphalt ground / Highway perspective grid
        const groundGrad = ctx.createLinearGradient(0, horizonY, 0, height);
        groundGrad.addColorStop(0, '#070b19');
        groundGrad.addColorStop(1, '#020308');
        ctx.fillStyle = groundGrad;
        ctx.fillRect(0, horizonY, width, height - horizonY);

        // Perspective highway lane markers moving forward
        const speed = (t * 70 * (1 + sBass * 2.2)) % 40;
        ctx.strokeStyle = colors.main;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.25 + sBass * 0.3;

        for (let x = -width * 0.4; x <= width * 1.4; x += width * 0.2) {
          ctx.beginPath();
          ctx.moveTo(cx, horizonY);
          ctx.lineTo(x, height);
          ctx.stroke();
        }

        for (let y = horizonY; y < height; y += 18) {
          const dy = y + speed;
          if (dy < height) {
            ctx.beginPath();
            ctx.moveTo(0, dy);
            ctx.lineTo(width, dy);
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1.0;

        // Wet ground neon reflections
        const refGrad = ctx.createLinearGradient(0, horizonY, 0, height);
        refGrad.addColorStop(0, colors.secondaryRgba(0.35));
        refGrad.addColorStop(0.5, colors.mainRgba(0.2));
        refGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = refGrad;
        ctx.fillRect(0, horizonY, width, height - horizonY);
      }

      // =======================================================================
      // 3. GALAXY 🌌 (Realistic stars, nebula, spiral cosmic dust)
      // =======================================================================
      else if (resolvedScene === 'galaxy') {
        // Deep cosmic void
        ctx.fillStyle = '#010207';
        ctx.fillRect(0, 0, width, height);

        // Swirling multi-layered cosmic nebula gas
        const nebulaRad = Math.min(cx, cy) * (0.85 + sBass * 0.25);
        const nebGrad1 = ctx.createRadialGradient(cx + Math.sin(t * 0.4) * 40, cy + Math.cos(t * 0.3) * 30, 20, cx, cy, nebulaRad);
        nebGrad1.addColorStop(0, colors.mainRgba(0.45));
        nebGrad1.addColorStop(0.5, colors.secondaryRgba(0.25));
        nebGrad1.addColorStop(1, 'transparent');
        ctx.fillStyle = nebGrad1;
        ctx.fillRect(0, 0, width, height);

        const nebGrad2 = ctx.createRadialGradient(cx - 30, cy + 20, 10, cx, cy, nebulaRad * 0.7);
        nebGrad2.addColorStop(0, colors.accentRgba(0.35));
        nebGrad2.addColorStop(1, 'transparent');
        ctx.fillStyle = nebGrad2;
        ctx.fillRect(0, 0, width, height);

        // 3D Parallax Starfield with high-frequency twinkle flares
        const stars = starsRef.current;
        for (let i = 0; i < stars.length; i++) {
          const s = stars[i];
          s.z -= 0.6 + sBass * 2.2;
          if (s.z <= 10) {
            s.z = 900;
            s.x = (Math.random() - 0.5) * 1200;
            s.y = (Math.random() - 0.5) * 1200;
          }

          const fov = 350;
          const px = cx + (s.x / s.z) * fov;
          const py = cy + (s.y / s.z) * fov;
          const rad = Math.max(0.6, (s.baseRadius * fov) / s.z + (sHigh > 0.4 ? 0.8 : 0));

          if (px >= 0 && px <= width && py >= 0 && py <= height) {
            const twinkle = 0.5 + Math.sin(t * 3 + s.twinklePhase) * 0.4;
            ctx.fillStyle = s.hueOffset > 0 ? colors.accent : colors.main;
            ctx.globalAlpha = Math.min(1, (1 - s.z / 900) * (s.alpha * twinkle + sHigh * 0.5));
            ctx.beginPath();
            ctx.arc(px, py, rad, 0, Math.PI * 2);
            ctx.fill();

            // Star flare cross on high frequencies
            if (sHigh > 0.45 && rad > 2.0) {
              ctx.strokeStyle = colors.accent;
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(px - rad * 2.5, py);
              ctx.lineTo(px + rad * 2.5, py);
              ctx.moveTo(px, py - rad * 2.5);
              ctx.lineTo(px, py + rad * 2.5);
              ctx.stroke();
            }
          }
        }
        ctx.globalAlpha = 1.0;

        // Tilted spiral galactic arms
        const armCount = 2;
        const pointsPerArm = currentPerf === 'battery' ? 35 : 60;
        const rot = t * (0.15 + sBass * 0.2);

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(0.35); // Celestial tilt

        for (let a = 0; a < armCount; a++) {
          const armOffset = a * Math.PI;
          for (let p = 1; p < pointsPerArm; p++) {
            const dist = p * (Math.min(cx, cy) / pointsPerArm) * 0.85;
            const angle = armOffset + (p * 0.12) + rot;
            const px = Math.cos(angle) * dist;
            const py = Math.sin(angle) * (dist * 0.42);

            const pSize = Math.max(1, (1 - p / pointsPerArm) * 3.5 + sBass * 1.5);
            ctx.fillStyle = a === 0 ? colors.main : colors.secondary;
            ctx.globalAlpha = Math.min(1, 0.4 + sVol * 0.5);
            ctx.beginPath();
            ctx.arc(px, py, pSize, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
        ctx.globalAlpha = 1.0;
      }

      // =======================================================================
      // 4. FIRE ENERGY 🔥 (Realistic fire, sparks & energy surging upward)
      // =======================================================================
      else if (resolvedScene === 'fire_energy') {
        // Scorched inferno background
        const fireBg = ctx.createLinearGradient(0, 0, 0, height);
        fireBg.addColorStop(0, '#030101');
        fireBg.addColorStop(0.6, colors.darkBg);
        fireBg.addColorStop(1, colors.secondaryRgba(0.25));
        ctx.fillStyle = fireBg;
        ctx.fillRect(0, 0, width, height);

        // Bottom roaring fire flame tongues (takes cover tint: blue flames for blue cover, etc.)
        const flameLayers = 3;
        for (let fl = 0; fl < flameLayers; fl++) {
          ctx.beginPath();
          ctx.moveTo(0, height);

          const step = 20;
          const maxFlameH = (height * 0.42 + sBass * (height * 0.35)) * (1 - fl * 0.2);
          for (let x = 0; x <= width; x += step) {
            const freqSample = freq ? freq[Math.floor((x / width) * 30)] / 255 : 0;
            const wave1 = Math.sin(x * 0.015 + t * 4 + fl) * 30;
            const wave2 = Math.cos(x * 0.03 - t * 6) * 20;
            const fy = height - (maxFlameH * (0.6 + freqSample * 0.6) + wave1 + wave2);
            ctx.lineTo(x, fy);
          }

          ctx.lineTo(width, height);
          ctx.closePath();

          const fGrad = ctx.createLinearGradient(0, height - maxFlameH, 0, height);
          if (fl === 0) {
            fGrad.addColorStop(0, colors.accent);
            fGrad.addColorStop(0.35, colors.main);
            fGrad.addColorStop(1, colors.secondary);
          } else if (fl === 1) {
            fGrad.addColorStop(0, colors.main);
            fGrad.addColorStop(0.6, colors.secondary);
            fGrad.addColorStop(1, 'transparent');
          } else {
            fGrad.addColorStop(0, colors.secondary);
            fGrad.addColorStop(1, 'transparent');
          }

          ctx.fillStyle = fGrad;
          ctx.globalAlpha = 0.55 + sBass * 0.35;
          ctx.fill();
        }
        ctx.globalAlpha = 1.0;

        // Rising embers and sparks physics
        const embers = embersRef.current;
        for (let i = 0; i < embers.length; i++) {
          const e = embers[i];
          e.y += e.vy * (1 + sBass * 2.0);
          e.x += e.vx + Math.sin(t * 3 + e.y * 0.02) * 1.5;
          e.life += 1;

          // Recycle ember
          if (e.y < -10 || e.life >= e.maxLife) {
            e.x = Math.random() * width;
            e.y = height + Math.random() * 20;
            e.vy = -(Math.random() * 3.5 + 2.0 + sBass * 3.0);
            e.vx = (Math.random() - 0.5) * 2;
            e.life = 0;
            e.maxLife = Math.random() * 80 + 60;
          }

          const progress = e.life / e.maxLife;
          const currentAlpha = (1 - progress) * e.alpha;
          const currentSize = Math.max(0.8, e.size * (1 - progress * 0.6) + sBass * 1.5);

          ctx.fillStyle = i % 2 === 0 ? colors.accent : colors.main;
          ctx.globalAlpha = currentAlpha;
          ctx.beginPath();
          ctx.arc(e.x, e.y, currentSize, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1.0;
      }

      // =======================================================================
      // 5. RAINY NIGHT 🌧️ (Rain, fog, bokeh & reflections reacting to music)
      // =======================================================================
      else if (resolvedScene === 'rainy_night') {
        // Atmospheric foggy night
        const rainBg = ctx.createLinearGradient(0, 0, 0, height);
        rainBg.addColorStop(0, '#03050c');
        rainBg.addColorStop(0.7, colors.darkBg);
        rainBg.addColorStop(1, '#020509');
        ctx.fillStyle = rainBg;
        ctx.fillRect(0, 0, width, height);

        // Ambient lightning flash on heavy sub-bass hits
        if (isBeat && sBass > 0.72) {
          ctx.fillStyle = colors.accentRgba(0.25);
          ctx.fillRect(0, 0, width, height);
        }

        // Distant blurred city bokeh lights
        const bokehs = bokehRef.current;
        for (let i = 0; i < bokehs.length; i++) {
          const b = bokehs[i];
          const pulse = 1 + Math.sin(t * 2 + b.pulsePhase) * 0.15 + sBass * 0.2;
          const bRad = b.radius * pulse;

          const bGrad = ctx.createRadialGradient(b.x, b.y, 2, b.x, b.y, bRad);
          bGrad.addColorStop(0, i % 2 === 0 ? colors.main : colors.secondary);
          bGrad.addColorStop(1, 'transparent');

          ctx.fillStyle = bGrad;
          ctx.globalAlpha = b.alpha * (0.8 + sVol * 0.5);
          ctx.beginPath();
          ctx.arc(b.x, b.y, bRad, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1.0;

        // Angled torrential rain streaks with cover tint
        const rain = rainRef.current;
        ctx.strokeStyle = colors.mainRgba(0.65);
        for (let i = 0; i < rain.length; i++) {
          const r = rain[i];
          r.y += r.speed * (1 + sMid * 0.8);
          r.x += r.speed * 0.25;

          if (r.y > height * 0.78) {
            if (ripplesRef.current.length < 25 && Math.random() > 0.6) {
              ripplesRef.current.push({
                x: r.x,
                y: r.y,
                radius: 1,
                maxRadius: 16 + sBass * 18,
                alpha: 0.6,
              });
            }
            r.y = -r.length;
            r.x = Math.random() * width;
          }

          ctx.lineWidth = r.thickness;
          ctx.globalAlpha = r.alpha * (0.5 + sHigh * 0.5);
          ctx.beginPath();
          ctx.moveTo(r.x, r.y);
          ctx.lineTo(r.x + r.length * 0.25, r.y + r.length);
          ctx.stroke();
        }

        // Expanding ground water ripples
        const ripples = ripplesRef.current;
        ctx.strokeStyle = colors.accent;
        ctx.lineWidth = 1.2;
        for (let i = ripples.length - 1; i >= 0; i--) {
          const rip = ripples[i];
          rip.radius += 0.8 + sBass * 0.8;
          rip.alpha -= 0.025;

          if (rip.alpha <= 0 || rip.radius >= rip.maxRadius) {
            ripples.splice(i, 1);
            continue;
          }

          ctx.globalAlpha = rip.alpha;
          ctx.beginPath();
          ctx.ellipse(rip.x, rip.y, rip.radius, rip.radius * 0.35, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1.0;

        // Foreground glistening droplets on high frequencies
        if (sHigh > 0.3) {
          ctx.fillStyle = colors.accent;
          ctx.globalAlpha = sHigh * 0.6;
          for (let d = 0; d < 6; d++) {
            const dx = width * 0.15 * d + 40;
            const dy = height * 0.12 * ((d * 3) % 7) + 50;
            ctx.beginPath();
            ctx.arc(dx, dy, 2, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1.0;
        }
      }

      // =======================================================================
      // 6. ANIME NINJA 🥷 (Original ninja warrior silhouette + reactive chakra aura)
      // =======================================================================
      else if (resolvedScene === 'anime_ninja') {
        const ninjaBg = ctx.createLinearGradient(0, 0, 0, height);
        ninjaBg.addColorStop(0, '#02040b');
        ninjaBg.addColorStop(0.5, colors.darkBg);
        ninjaBg.addColorStop(1, '#02050c');
        ctx.fillStyle = ninjaBg;
        ctx.fillRect(0, 0, width, height);

        // Huge glowing full moon behind the warrior
        const moonX = cx;
        const moonY = cy * 0.65;
        const moonRadius = Math.min(cx, cy) * 0.45;

        const moonHalo = ctx.createRadialGradient(moonX, moonY, moonRadius * 0.4, moonX, moonY, moonRadius * 1.8);
        moonHalo.addColorStop(0, colors.secondaryRgba(0.35));
        moonHalo.addColorStop(0.6, colors.secondaryRgba(0.1));
        moonHalo.addColorStop(1, 'transparent');
        ctx.fillStyle = moonHalo;
        ctx.beginPath();
        ctx.arc(moonX, moonY, moonRadius * 1.8, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#f0fdf4';
        ctx.beginPath();
        ctx.arc(moonX, moonY, moonRadius, 0, Math.PI * 2);
        ctx.fill();

        // Jagged mountain silhouette beneath the moon
        ctx.fillStyle = '#060b17';
        ctx.beginPath();
        ctx.moveTo(0, height * 0.75);
        ctx.lineTo(width * 0.25, height * 0.65);
        ctx.lineTo(width * 0.5, height * 0.72);
        ctx.lineTo(width * 0.78, height * 0.62);
        ctx.lineTo(width, height * 0.75);
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();
        ctx.fill();

        // Reactive Chakra / Spirit Energy Aura surrounding the warrior
        const ninjaX = cx;
        const ninjaY = height * 0.65;
        const auraR = 85 + sBass * 75;

        const auraGrad = ctx.createRadialGradient(ninjaX, ninjaY - 30, 10, ninjaX, ninjaY - 30, auraR);
        auraGrad.addColorStop(0, colors.main);
        auraGrad.addColorStop(0.5, colors.secondaryRgba(0.45));
        auraGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = auraGrad;
        ctx.globalAlpha = 0.65 + sBass * 0.35;
        ctx.beginPath();
        ctx.arc(ninjaX, ninjaY - 30, auraR, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;

        // Chakra electric lightning arcs crackling on high transients
        if (sHigh > 0.35) {
          ctx.strokeStyle = colors.accent;
          ctx.lineWidth = 2;
          ctx.shadowColor = colors.main;
          ctx.shadowBlur = 10;
          for (let arc = 0; arc < 4; arc++) {
            ctx.beginPath();
            let ax = ninjaX + (Math.random() - 0.5) * 50;
            let ay = ninjaY - 80;
            ctx.moveTo(ax, ay);
            for (let seg = 0; seg < 5; seg++) {
              ax += (Math.random() - 0.5) * 35;
              ay += 18;
              ctx.lineTo(ax, ay);
            }
            ctx.stroke();
          }
          ctx.shadowBlur = 0;
        }

        // Ninja Warrior Silhouette
        ctx.save();
        ctx.translate(ninjaX, ninjaY);

        ctx.fillStyle = '#030509';
        ctx.strokeStyle = colors.main;
        ctx.lineWidth = 1;

        // Head / Cowl
        ctx.beginPath();
        ctx.arc(0, -75, 14, 0, Math.PI * 2);
        ctx.fill();

        // Headband tails fluttering in wind
        const ribbonWobble = Math.sin(t * 8) * (15 + sBass * 20);
        ctx.beginPath();
        ctx.moveTo(10, -75);
        ctx.quadraticCurveTo(35 + ribbonWobble, -80, 55 + ribbonWobble * 1.5, -65);
        ctx.lineTo(50 + ribbonWobble * 1.5, -60);
        ctx.quadraticCurveTo(30 + ribbonWobble, -72, 10, -72);
        ctx.closePath();
        ctx.fillStyle = colors.main;
        ctx.fill();

        // Torso / Ninja vest
        ctx.fillStyle = '#030509';
        ctx.beginPath();
        ctx.moveTo(-16, -60);
        ctx.lineTo(16, -60);
        ctx.lineTo(12, -20);
        ctx.lineTo(-12, -20);
        ctx.closePath();
        ctx.fill();

        // Crouched Legs
        ctx.beginPath();
        ctx.moveTo(-12, -20);
        ctx.lineTo(-38, -8);
        ctx.lineTo(-44, 18);
        ctx.lineTo(-24, 18);
        ctx.lineTo(-20, -6);
        ctx.lineTo(12, -20);
        ctx.lineTo(34, -4);
        ctx.lineTo(46, 18);
        ctx.lineTo(28, 18);
        ctx.closePath();
        ctx.fill();

        // Forearm with Kunai Blade
        ctx.beginPath();
        ctx.moveTo(-14, -50);
        ctx.lineTo(-38, -40);
        ctx.lineTo(-30, -32);
        ctx.closePath();
        ctx.fill();

        // Kunai blade outline
        ctx.strokeStyle = colors.accent;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-38, -40);
        ctx.lineTo(-58, -45);
        ctx.lineTo(-52, -38);
        ctx.closePath();
        ctx.stroke();

        ctx.restore();
      }

      // =======================================================================
      // 7. SAMURAI ⚔️ (Cinematic samurai silhouette, wind, fog & sakura petals)
      // =======================================================================
      else if (resolvedScene === 'samurai') {
        const samBg = ctx.createLinearGradient(0, 0, 0, height);
        samBg.addColorStop(0, '#0c0205');
        samBg.addColorStop(0.5, colors.darkBg);
        samBg.addColorStop(1, '#080104');
        ctx.fillStyle = samBg;
        ctx.fillRect(0, 0, width, height);

        // Giant eclipse moon
        const moonX = cx;
        const moonY = cy * 0.58;
        const moonR = Math.min(cx, cy) * 0.42;

        const redHalo = ctx.createRadialGradient(moonX, moonY, moonR * 0.5, moonX, moonY, moonR * 1.6);
        redHalo.addColorStop(0, colors.mainRgba(0.5));
        redHalo.addColorStop(0.7, colors.secondaryRgba(0.15));
        redHalo.addColorStop(1, 'transparent');
        ctx.fillStyle = redHalo;
        ctx.beginPath();
        ctx.arc(moonX, moonY, moonR * 1.6, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fee2e2';
        ctx.beginPath();
        ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
        ctx.fill();

        // Drifting Sakura petals tumbling in the wind
        const petals = petalsRef.current;
        for (let i = 0; i < petals.length; i++) {
          const p = petals[i];
          p.x += p.vx + sMid * 2.5;
          p.y += p.vy + Math.sin(t * 2 + p.x * 0.01) * 0.8;
          p.rot += p.vRot;

          if (p.x > width + 30) p.x = -20;
          if (p.y > height + 20) p.y = -20;

          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = colors.accentRgba(p.alpha);
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size, p.size * 0.45, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        ctx.globalAlpha = 1.0;

        // Ground hill silhouette
        const groundY = height * 0.72;
        ctx.fillStyle = '#060103';
        ctx.beginPath();
        ctx.ellipse(cx, groundY + 120, width * 0.7, 140, 0, 0, Math.PI * 2);
        ctx.fill();

        // Rolling ground fog
        const fogGrad = ctx.createLinearGradient(0, groundY - 30, 0, groundY + 50);
        fogGrad.addColorStop(0, colors.secondaryRgba(0.25));
        fogGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = fogGrad;
        ctx.fillRect(0, groundY - 30, width, 80);

        // Samurai Silhouette (standing with Katana & flowing cloak)
        ctx.save();
        ctx.translate(cx, groundY);

        ctx.fillStyle = '#040102';

        // Traditional Hat (Kasa)
        ctx.beginPath();
        ctx.ellipse(0, -95, 28, 9, 0, 0, Math.PI * 2);
        ctx.fill();

        // Flowing haori cloak billowed by the wind
        const cloakFlutter = Math.sin(t * 5) * (8 + sBass * 18);
        ctx.beginPath();
        ctx.moveTo(0, -85);
        ctx.lineTo(-24, -20);
        ctx.lineTo(-38 + cloakFlutter, 10);
        ctx.lineTo(24, 10);
        ctx.lineTo(18, -20);
        ctx.closePath();
        ctx.fill();

        // Katana Sheath at Hip
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-16, -22);
        ctx.lineTo(-58, 2);
        ctx.stroke();

        // Katana edge gleam on high frequencies
        if (sHigh > 0.3) {
          ctx.fillStyle = colors.accent;
          ctx.shadowColor = colors.accent;
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.arc(-58, 2, 3 + sHigh * 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }

        ctx.restore();

        // Sword slash animation triggered on beats
        if (slashAnimRef.current.active) {
          const slash = slashAnimRef.current;
          slash.progress += 0.08;
          if (slash.progress >= 1.0) {
            slash.active = false;
          } else {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3.5;
            ctx.shadowColor = colors.main;
            ctx.shadowBlur = 16;
            ctx.beginPath();
            ctx.moveTo(slash.x1, slash.y1);
            ctx.lineTo(slash.x1 + (slash.x2 - slash.x1) * slash.progress, slash.y1 + (slash.y2 - slash.y1) * slash.progress);
            ctx.stroke();
            ctx.shadowBlur = 0;
          }
        }
      }

      // =======================================================================
      // 8. DEEP OCEAN 🌊 (Underwater abyss, caustics, bubbles & marine life)
      // =======================================================================
      else if (resolvedScene === 'deep_ocean') {
        const oceanBg = ctx.createLinearGradient(0, 0, 0, height);
        oceanBg.addColorStop(0, '#041426');
        oceanBg.addColorStop(0.5, colors.darkBg);
        oceanBg.addColorStop(1, '#01050a');
        ctx.fillStyle = oceanBg;
        ctx.fillRect(0, 0, width, height);

        // Sunlight caustics / God rays beaming down
        const rayCount = 5;
        for (let r = 0; r < rayCount; r++) {
          const rayX = (width / rayCount) * r + Math.sin(t * 0.8 + r) * 35;
          const rayW = width * 0.22;

          const rayGrad = ctx.createLinearGradient(rayX, 0, rayX + 60, height);
          rayGrad.addColorStop(0, colors.mainRgba(0.25));
          rayGrad.addColorStop(0.7, colors.secondaryRgba(0.06));
          rayGrad.addColorStop(1, 'transparent');

          ctx.fillStyle = rayGrad;
          ctx.beginPath();
          ctx.moveTo(rayX, 0);
          ctx.lineTo(rayX + rayW, 0);
          ctx.lineTo(rayX + rayW * 1.5 + 40, height);
          ctx.lineTo(rayX - 30, height);
          ctx.closePath();
          ctx.fill();
        }

        // Rising underwater bubbles
        const bubbles = bubblesRef.current;
        for (let i = 0; i < bubbles.length; i++) {
          const b = bubbles[i];
          b.y -= b.speed * (1 + sMid * 1.2);
          b.x += Math.sin(t * b.wobbleSpeed * 60 + b.wobblePhase) * 1.2;

          if (b.y < -b.radius * 2) {
            b.y = height + 10;
            b.x = Math.random() * width;
          }

          ctx.strokeStyle = colors.main;
          ctx.lineWidth = 1.2;
          ctx.globalAlpha = b.alpha;
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = colors.accent;
          ctx.beginPath();
          ctx.arc(b.x - b.radius * 0.35, b.y - b.radius * 0.35, b.radius * 0.25, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1.0;

        // Seabed floor
        const seabedY = height * 0.82;
        ctx.fillStyle = '#020912';
        ctx.beginPath();
        ctx.moveTo(0, height);
        ctx.lineTo(0, seabedY);
        for (let x = 0; x <= width; x += 40) {
          ctx.lineTo(x, seabedY + Math.sin(x * 0.01) * 15);
        }
        ctx.lineTo(width, height);
        ctx.closePath();
        ctx.fill();

        // Swaying kelp silhouettes
        const kelpCount = 8;
        for (let k = 0; k < kelpCount; k++) {
          const kx = (width / kelpCount) * k + 20;
          ctx.strokeStyle = '#032030';
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.moveTo(kx, height);
          const sway = Math.sin(t * 1.5 + k) * (20 + sBass * 25);
          ctx.quadraticCurveTo(kx + sway * 0.5, seabedY - 30, kx + sway, seabedY - 80);
          ctx.stroke();
        }

        // Bioluminescent marine snow sparkles on high frequencies
        if (sHigh > 0.25) {
          ctx.fillStyle = colors.accent;
          ctx.globalAlpha = sHigh * 0.7;
          for (let s = 0; s < 12; s++) {
            const sx = (s * 71) % width;
            const sy = (s * 89 + t * 20) % (height * 0.8);
            ctx.beginPath();
            ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1.0;
        }
      }

      // =======================================================================
      // 9. MUSIC TUNNEL 🌀 (Cinematic polygonal tunnel with frequency distortion)
      // =======================================================================
      else if (resolvedScene === 'music_tunnel') {
        ctx.fillStyle = '#020205';
        ctx.fillRect(0, 0, width, height);

        const ringCount = currentPerf === 'battery' ? 12 : 20;
        const sides = 8;
        const speed = (t * (1.2 + sBass * 2.8 + sVol * 1.5)) % 1;

        // Concentric polygonal tunnel frames
        for (let r = 0; r < ringCount; r++) {
          const ringProgress = (r / ringCount + speed) % 1;
          const scale = Math.pow(ringProgress, 2.8) * Math.min(cx, cy) * 1.5;
          if (scale < 5) continue;

          const ringDistort = sBass * 22;

          ctx.beginPath();
          for (let s = 0; s < sides; s++) {
            const angle = (s * Math.PI * 2) / sides + t * 0.3;
            const freqVal = freq ? freq[(s * 12) % (freq.length || 1)] / 255 : 0;
            const rad = scale + freqVal * ringDistort;

            const px = cx + Math.cos(angle) * rad;
            const py = cy + Math.sin(angle) * (rad * 0.82);
            if (s === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();

          ctx.strokeStyle = r % 2 === 0 ? colors.main : colors.accent;
          ctx.lineWidth = Math.max(1, ringProgress * 3.5);
          ctx.globalAlpha = Math.min(1, ringProgress * (0.4 + sVol * 0.6));
          ctx.stroke();
        }

        // Perspective speed rails
        ctx.strokeStyle = colors.secondary;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.25 + sBass * 0.35;
        for (let s = 0; s < sides; s++) {
          const angle = (s * Math.PI * 2) / sides + t * 0.3;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(angle) * width, cy + Math.sin(angle) * height);
          ctx.stroke();
        }
        ctx.globalAlpha = 1.0;
      }

      // =======================================================================
      // 10. MINIMAL PRO ⚡ (Clean pure black background with an elegant reactive waveform)
      // =======================================================================
      else if (resolvedScene === 'minimal_pro') {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);

        const centerY = cy;
        const amp = 45 + sBass * 65;

        // Faint horizontal reference line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(width * 0.05, centerY);
        ctx.lineTo(width * 0.95, centerY);
        ctx.stroke();

        // Audio measurement crosshairs
        const markers = [0.2, 0.4, 0.6, 0.8];
        const labels = ['SUB', 'LOW', 'MID', 'HIGH'];
        ctx.fillStyle = colors.secondaryRgba(0.5);
        ctx.font = '9px monospace';
        for (let m = 0; m < markers.length; m++) {
          const mx = width * markers[m];
          ctx.beginPath();
          ctx.moveTo(mx, centerY - 6);
          ctx.lineTo(mx, centerY + 6);
          ctx.stroke();
          ctx.fillText(labels[m], mx - 10, centerY + 20);
        }

        // Mirrored ghost harmonic curves
        if (freq && freq.length > 0) {
          ctx.beginPath();
          for (let x = 0; x <= width; x += 10) {
            const idx = Math.floor((x / width) * 60);
            const val = freq[idx] ? freq[idx] / 255 : 0;
            const gy = centerY - val * (amp * 0.6);
            if (x === 0) ctx.moveTo(x, gy);
            else ctx.lineTo(x, gy);
          }
          ctx.strokeStyle = colors.secondaryRgba(0.2);
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Primary precise vector oscilloscope waveform
        if (timeDomain && timeDomain.length > 0) {
          ctx.beginPath();
          const waveStartX = width * 0.05;
          const waveW = width * 0.9;

          for (let x = 0; x < waveW; x += 3) {
            const idx = Math.min(timeDomain.length - 1, Math.floor((x / waveW) * timeDomain.length));
            const norm = (timeDomain[idx] - 128) / 128;
            const py = centerY + norm * amp;
            if (x === 0) ctx.moveTo(waveStartX + x, py);
            else ctx.lineTo(waveStartX + x, py);
          }

          ctx.strokeStyle = colors.main;
          ctx.lineWidth = 2.0;
          ctx.shadowColor = colors.main;
          ctx.shadowBlur = 10 + sBass * 14;
          ctx.stroke();
          ctx.shadowBlur = 0;
        }

        // Live RMS Energy text indicator in corner
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.font = '10px monospace';
        ctx.fillText(`LVL: ${(sVol * 100).toFixed(0)}% | SUB: ${(sBass * 100).toFixed(0)}%`, width * 0.05, height * 0.88);
      }

      // =======================================================================
      // 11. SHADOW STRIKE 🗡️ (Moonlit rooftops, ninja dashing with afterimages & bass blade slash)
      // =======================================================================
      else if (resolvedScene === 'shadow_strike') {
        const state = shadowStrikeRef.current;

        // Dark moody moonlit night sky
        const nightGrad = ctx.createLinearGradient(0, 0, 0, height);
        nightGrad.addColorStop(0, '#02040a');
        nightGrad.addColorStop(0.5, colors.darkBg);
        nightGrad.addColorStop(0.85, colors.secondaryRgba(0.25));
        nightGrad.addColorStop(1, '#03060f');
        ctx.fillStyle = nightGrad;
        ctx.fillRect(0, 0, width, height);

        // Stars twinkling in sky with treble glints
        const starPool = starsRef.current;
        for (let i = 0; i < Math.min(starPool.length, 60); i++) {
          const s = starPool[i];
          const sx = (s.x + 600) % width;
          const sy = (s.y + 600) % (height * 0.55);
          const starAlpha = (Math.sin(t * 3 + s.twinklePhase) * 0.3 + 0.7) * (0.4 + sHigh * 0.6);
          ctx.fillStyle = s.hueOffset > 0 ? colors.accentRgba(starAlpha) : `rgba(224, 242, 254, ${starAlpha})`;
          ctx.fillRect(sx, sy, s.baseRadius, s.baseRadius);
        }

        // Colossal Moon with soft bloom in cover tint
        const moonX = width * 0.75;
        const moonY = height * 0.28;
        const moonR = Math.min(width, height) * 0.26;

        const moonHalo = ctx.createRadialGradient(moonX, moonY, moonR * 0.2, moonX, moonY, moonR * 2.2);
        moonHalo.addColorStop(0, colors.mainRgba(0.28));
        moonHalo.addColorStop(0.5, colors.secondaryRgba(0.12));
        moonHalo.addColorStop(1, 'transparent');
        ctx.fillStyle = moonHalo;
        ctx.beginPath();
        ctx.arc(moonX, moonY, moonR * 2.2, 0, Math.PI * 2);
        ctx.fill();

        // Moon disc with soft shading
        const moonDisc = ctx.createRadialGradient(moonX - moonR * 0.25, moonY - moonR * 0.25, moonR * 0.1, moonX, moonY, moonR);
        moonDisc.addColorStop(0, '#f8fafc');
        moonDisc.addColorStop(0.6, '#e2e8f0');
        moonDisc.addColorStop(1, '#94a3b8');
        ctx.fillStyle = moonDisc;
        ctx.beginPath();
        ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
        ctx.fill();

        // Subtle lunar craters
        ctx.fillStyle = 'rgba(71, 85, 105, 0.18)';
        ctx.beginPath();
        ctx.arc(moonX - moonR * 0.3, moonY - moonR * 0.1, moonR * 0.25, 0, Math.PI * 2);
        ctx.arc(moonX + moonR * 0.2, moonY + moonR * 0.25, moonR * 0.22, 0, Math.PI * 2);
        ctx.arc(moonX - moonR * 0.1, moonY + moonR * 0.35, moonR * 0.18, 0, Math.PI * 2);
        ctx.fill();

        // Drifting background fog layers
        const fogOffset1 = (t * 22) % width;
        const fogGrad1 = ctx.createLinearGradient(0, height * 0.42, 0, height * 0.72);
        fogGrad1.addColorStop(0, 'transparent');
        fogGrad1.addColorStop(0.5, colors.secondaryRgba(0.22));
        fogGrad1.addColorStop(1, 'transparent');
        ctx.fillStyle = fogGrad1;
        ctx.fillRect(0, height * 0.42, width, height * 0.3);

        const fogOffset2 = (t * 35 + 200) % width;
        ctx.fillStyle = colors.secondaryRgba(0.14);
        ctx.fillRect(-fogOffset2, height * 0.52, width * 2, height * 0.18);

        // Multi-layered Japanese Pagoda Rooftops
        // Layer A: Distant roofs
        ctx.fillStyle = '#060a14';
        ctx.beginPath();
        ctx.moveTo(0, height * 0.68);
        ctx.quadraticCurveTo(width * 0.2, height * 0.62, width * 0.38, height * 0.7);
        ctx.lineTo(width * 0.38, height);
        ctx.lineTo(0, height);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(width * 0.32, height * 0.72);
        ctx.quadraticCurveTo(width * 0.6, height * 0.64, width * 0.85, height * 0.73);
        ctx.lineTo(width * 0.85, height);
        ctx.lineTo(width * 0.32, height);
        ctx.closePath();
        ctx.fill();

        // Layer B: Main foreground roofline where ninja dashes
        const roofBaseY = height * 0.68;
        const roofPeakY = height * 0.61;

        ctx.fillStyle = '#020509';
        ctx.beginPath();
        ctx.moveTo(0, roofBaseY);
        ctx.quadraticCurveTo(width * 0.22, roofPeakY, width * 0.5, roofBaseY - 10);
        ctx.quadraticCurveTo(width * 0.78, roofPeakY - 15, width, roofBaseY + 15);
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();
        ctx.fill();

        // Moonlight rim highlight along curved roof ridge
        ctx.strokeStyle = colors.mainRgba(0.35);
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.moveTo(0, roofBaseY);
        ctx.quadraticCurveTo(width * 0.22, roofPeakY, width * 0.5, roofBaseY - 10);
        ctx.quadraticCurveTo(width * 0.78, roofPeakY - 15, width, roofBaseY + 15);
        ctx.stroke();

        // Vertical roof tiles
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.lineWidth = 1;
        for (let rx = 10; rx < width; rx += 24) {
          ctx.beginPath();
          ctx.moveTo(rx, roofPeakY + 15);
          ctx.lineTo(rx + 8, height);
          ctx.stroke();
        }

        // Ninja physics & movement
        const dashSpeed = 4.2 + sBass * 11.0;
        state.ninjaX += dashSpeed;
        state.stride += 0.28 + sBass * 0.45;

        // Wrap around screen
        if (state.ninjaX > width + 80) {
          state.ninjaX = -60;
          state.trail = [];
        }

        // Roof curvature Y matching
        const normX = Math.max(0, Math.min(1, state.ninjaX / width));
        const curveOffset = Math.sin(normX * Math.PI) * 28;
        state.ninjaY = roofBaseY - curveOffset - 18;

        // Bass hit: Trigger dash afterimage & fast blade slash
        if (isBeat && sBass > 0.58) {
          state.slashActive = true;
          state.slashProgress = 0;
          state.slashX1 = state.ninjaX - 40;
          state.slashY1 = state.ninjaY - 20;
          state.slashX2 = state.ninjaX + 90 + sBass * 50;
          state.slashY2 = state.ninjaY - 35 + (Math.random() - 0.5) * 30;

          // Spawn katana sparks
          const sparkCount = Math.floor(10 + sBass * 18);
          for (let sp = 0; sp < sparkCount; sp++) {
            state.sparks.push({
              x: state.ninjaX + 30,
              y: state.ninjaY - 20,
              vx: (Math.random() * 5 + 2) * (Math.random() > 0.3 ? 1 : -1),
              vy: -(Math.random() * 4 + 2),
              alpha: 1.0,
              size: Math.random() * 2.5 + 1.2,
              color: Math.random() > 0.3 ? colors.accent : colors.main,
            });
          }
        }

        // Afterimage trail sampling
        if (Math.random() > 0.25 || sBass > 0.4) {
          state.trail.push({
            x: state.ninjaX,
            y: state.ninjaY,
            stride: state.stride,
            alpha: 0.55,
          });
        }
        if (state.trail.length > 14) {
          state.trail.shift();
        }

        // Draw Ninja Silhouette Helper
        const drawNinjaFigure = (nx: number, ny: number, nStride: number, nAlpha: number, isGhost: boolean) => {
          ctx.save();
          ctx.translate(nx, ny);
          ctx.globalAlpha = Math.max(0, Math.min(1, nAlpha));

          if (isGhost) {
            ctx.fillStyle = colors.mainRgba(nAlpha * 0.4);
            ctx.shadowColor = colors.main;
            ctx.shadowBlur = 8;
          } else {
            ctx.fillStyle = '#010307';
          }

          // Crouched Torso
          ctx.beginPath();
          ctx.ellipse(0, -18, 11, 16, -0.4, 0, Math.PI * 2);
          ctx.fill();

          // Head with Ninja Mask
          ctx.beginPath();
          ctx.arc(12, -34, 7.5, 0, Math.PI * 2);
          ctx.fill();

          // Ninja Headband fluttering behind
          const flutter = Math.sin(t * 12 + nStride) * 6;
          ctx.beginPath();
          ctx.moveTo(6, -34);
          ctx.quadraticCurveTo(-12, -38 + flutter, -28, -32 + flutter * 1.5);
          ctx.lineTo(-24, -28 + flutter * 1.5);
          ctx.quadraticCurveTo(-10, -32 + flutter, 6, -30);
          ctx.closePath();
          ctx.fillStyle = isGhost ? colors.main : colors.main;
          ctx.fill();

          // Scabbard on back
          ctx.strokeStyle = '#1e293b';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(-10, -38);
          ctx.lineTo(8, -4);
          ctx.stroke();

          // Katana hilt glint
          if (sHigh > 0.3) {
            ctx.fillStyle = colors.accent;
            ctx.fillRect(-12, -40, 3, 3);
          }

          // Dashing forward legs
          const legPhase = Math.sin(nStride);
          ctx.strokeStyle = isGhost ? colors.main : '#010307';
          ctx.lineWidth = 5;
          ctx.lineCap = 'round';

          // Leading Leg
          ctx.beginPath();
          ctx.moveTo(4, -8);
          ctx.lineTo(16 + legPhase * 8, 4);
          ctx.lineTo(26 + legPhase * 6, 14);
          ctx.stroke();

          // Trailing Leg
          ctx.beginPath();
          ctx.moveTo(-6, -8);
          ctx.lineTo(-18 - legPhase * 8, 2);
          ctx.lineTo(-24 - legPhase * 6, 12);
          ctx.stroke();

          // Leading Outstretched Arm holding blade
          ctx.beginPath();
          ctx.moveTo(4, -22);
          ctx.lineTo(24, -16);
          ctx.stroke();

          // Katana blade extending forward
          ctx.strokeStyle = isGhost ? colors.main : '#e2e8f0';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(24, -16);
          ctx.lineTo(44, -12);
          ctx.stroke();

          ctx.restore();
        };

        // Render fading afterimage trails
        for (let tr = 0; tr < state.trail.length; tr++) {
          const item = state.trail[tr];
          item.alpha -= 0.038;
          if (item.alpha > 0) {
            drawNinjaFigure(item.x, item.y, item.stride, item.alpha, true);
          }
        }
        state.trail = state.trail.filter((it) => it.alpha > 0);

        // Render real ninja silhouette
        drawNinjaFigure(state.ninjaX, state.ninjaY, state.stride, 1.0, false);

        // Fast blade slash streak on bass hits
        if (state.slashActive) {
          state.slashProgress += 0.12;
          if (state.slashProgress >= 1.0) {
            state.slashActive = false;
          } else {
            const curSlashX = state.slashX1 + (state.slashX2 - state.slashX1) * state.slashProgress;
            const curSlashY = state.slashY1 + (state.slashY2 - state.slashY1) * state.slashProgress;

            // Broad outer neon streak
            ctx.strokeStyle = colors.mainRgba(0.85);
            ctx.lineWidth = 7.0;
            ctx.shadowColor = colors.main;
            ctx.shadowBlur = 18;
            ctx.beginPath();
            ctx.moveTo(state.slashX1, state.slashY1);
            ctx.lineTo(curSlashX, curSlashY);
            ctx.stroke();

            // Intense white razor core
            ctx.strokeStyle = colors.accent;
            ctx.lineWidth = 2.0;
            ctx.beginPath();
            ctx.moveTo(state.slashX1, state.slashY1);
            ctx.lineTo(curSlashX, curSlashY);
            ctx.stroke();
            ctx.shadowBlur = 0;
          }
        }

        // Showering katana sparks physics
        for (let sp = state.sparks.length - 1; sp >= 0; sp--) {
          const spark = state.sparks[sp];
          spark.x += spark.vx;
          spark.y += spark.vy;
          spark.vy += 0.22; // Gravity
          spark.alpha -= 0.024;

          if (spark.alpha <= 0) {
            state.sparks.splice(sp, 1);
            continue;
          }

          ctx.fillStyle = spark.color;
          ctx.globalAlpha = spark.alpha;
          ctx.beginPath();
          ctx.arc(spark.x, spark.y, spark.size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1.0;
      }

      // =======================================================================
      // 12. SHURIKEN STORM ⭐ (Realistic metallic shuriken spinning with motion blur into wooden beams)
      // =======================================================================
      else if (resolvedScene === 'shuriken_storm') {
        const dojo = shurikenStormRef.current;

        // Dark moody wooden dojo background
        const dojoGrad = ctx.createLinearGradient(0, 0, 0, height);
        dojoGrad.addColorStop(0, '#040203');
        dojoGrad.addColorStop(0.5, colors.darkBg);
        dojoGrad.addColorStop(1, '#050203');
        ctx.fillStyle = dojoGrad;
        ctx.fillRect(0, 0, width, height);

        // Warm paper lantern glow in upper corner with bass breathing
        const lanternX = width * 0.82;
        const lanternY = height * 0.22;
        const lanternPulse = 70 + Math.sin(t * 3) * 8 + sBass * 45;

        const lanternGrad = ctx.createRadialGradient(lanternX, lanternY, 5, lanternX, lanternY, lanternPulse * 2.2);
        lanternGrad.addColorStop(0, colors.secondaryRgba(0.5));
        lanternGrad.addColorStop(0.4, colors.secondaryRgba(0.18));
        lanternGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = lanternGrad;
        ctx.beginPath();
        ctx.arc(lanternX, lanternY, lanternPulse * 2.2, 0, Math.PI * 2);
        ctx.fill();

        // Traditional Hanging Paper Lantern fixture
        ctx.strokeStyle = '#451a03';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(lanternX, 0);
        ctx.lineTo(lanternX, lanternY - 24);
        ctx.stroke();

        ctx.fillStyle = colors.secondary;
        ctx.beginPath();
        ctx.roundRect(lanternX - 14, lanternY - 24, 28, 42, [6, 6, 6, 6]);
        ctx.fill();

        // Heavy ancient wooden pillar beams (target surfaces)
        const pillar1X = width * 0.16;
        const pillar2X = width * 0.72;
        const pillarW = 42;

        const drawPillar = (px: number) => {
          ctx.fillStyle = '#0f0805';
          ctx.fillRect(px, 0, pillarW, height);

          // Wood grain grooves
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
          ctx.lineWidth = 1.2;
          for (let g = 6; g < pillarW; g += 10) {
            ctx.beginPath();
            ctx.moveTo(px + g, 0);
            ctx.lineTo(px + g + (g % 4), height);
            ctx.stroke();
          }

          // Warm lantern edge highlight on wood
          ctx.strokeStyle = colors.secondaryRgba(0.3);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(px + pillarW, 0);
          ctx.lineTo(px + pillarW, height);
          ctx.stroke();
        };

        drawPillar(pillar1X);
        drawPillar(pillar2X);

        // Tatami floor perspective at bottom
        const floorY = height * 0.82;
        ctx.fillStyle = '#0a0805';
        ctx.fillRect(0, floorY, width, height - floorY);
        ctx.strokeStyle = 'rgba(120, 80, 40, 0.12)';
        ctx.lineWidth = 1.5;
        for (let ty = floorY; ty < height; ty += 14) {
          ctx.beginPath();
          ctx.moveTo(0, ty);
          ctx.lineTo(width, ty);
          ctx.stroke();
        }

        // Shuriken throwing spawner
        const throwInterval = Math.max(120, 380 - sBass * 280);
        if (currentTime - dojo.lastThrowTime > throwInterval) {
          dojo.lastThrowTime = currentTime;
          const targetIsRight = Math.random() > 0.4;
          const targetPillarX = targetIsRight ? pillar2X : pillar1X;
          const throwY = Math.random() * (height * 0.5) + height * 0.2;

          dojo.shurikens.push({
            x: -40,
            y: throwY + (Math.random() - 0.5) * 60,
            vx: 18 + sBass * 22,
            vy: (Math.random() - 0.5) * 2.5,
            rot: 0,
            rotSpeed: 0.45 + sBass * 0.4,
            size: 16 + Math.random() * 4,
            stuck: false,
            stickTime: 0,
            stickX: targetPillarX + 6,
            stickY: throwY,
            targetX: targetPillarX,
            trail: [],
          });
        }

        // Helper to draw 4-pointed metallic ninja star (Shuriken)
        const drawShurikenStar = (sx: number, sy: number, sRot: number, sSize: number, isMotionBlur = false) => {
          ctx.save();
          ctx.translate(sx, sy);
          ctx.rotate(sRot);

          if (isMotionBlur) {
            ctx.fillStyle = colors.mainRgba(0.22);
            ctx.beginPath();
            ctx.arc(0, 0, sSize * 0.9, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            return;
          }

          // Realistic 4-pointed Ninja Hira-Shuriken
          ctx.fillStyle = colors.main;
          ctx.beginPath();
          for (let pt = 0; pt < 4; pt++) {
            const angle = (pt * Math.PI) / 2;
            const tipX = Math.cos(angle) * sSize;
            const tipY = Math.sin(angle) * sSize;
            const indentAngle = angle + Math.PI / 4;
            const indentX = Math.cos(indentAngle) * (sSize * 0.32);
            const indentY = Math.sin(indentAngle) * (sSize * 0.32);

            if (pt === 0) ctx.moveTo(tipX, tipY);
            else ctx.lineTo(tipX, tipY);
            ctx.lineTo(indentX, indentY);
          }
          ctx.closePath();
          ctx.fill();

          // Razor beveled blade facets
          ctx.strokeStyle = colors.accent;
          ctx.lineWidth = 1.0;
          for (let pt = 0; pt < 4; pt++) {
            const angle = (pt * Math.PI) / 2;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(angle) * sSize, Math.sin(angle) * sSize);
            ctx.stroke();
          }

          // Center circular weight hole
          ctx.fillStyle = '#0f0805';
          ctx.beginPath();
          ctx.arc(0, 0, sSize * 0.22, 0, Math.PI * 2);
          ctx.fill();

          // Treble gleam on outer blade tip
          if (sHigh > 0.35) {
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = colors.accent;
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(sSize * 0.9, 0, 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
          }

          ctx.restore();
        };

        // Update and draw flying and stuck shurikens
        for (let i = dojo.shurikens.length - 1; i >= 0; i--) {
          const s = dojo.shurikens[i];

          if (s.stuck) {
            s.stickTime += 1;
            // Draw stuck shuriken lodged deep into wood
            drawShurikenStar(s.stickX, s.stickY, s.rot, s.size, false);

            // Fade out old stuck shurikens
            if (s.stickTime > 140) {
              dojo.shurikens.splice(i, 1);
            }
            continue;
          }

          // In-flight physics
          s.x += s.vx;
          s.y += s.vy;
          s.rot += s.rotSpeed;

          // Motion blur trail capture
          s.trail.push({ x: s.x, y: s.y, rot: s.rot, alpha: 0.4 });
          if (s.trail.length > 5) s.trail.shift();

          // Check collision with wooden beam
          if (s.x >= s.targetX) {
            s.stuck = true;
            s.stickX = s.targetX + 4;
            s.stickY = s.y;

            // Spawn dynamic sparks upon impact
            const sparkCount = Math.floor(8 + sBass * 20);
            for (let sp = 0; sp < sparkCount; sp++) {
              dojo.sparks.push({
                x: s.stickX,
                y: s.stickY,
                vx: -(Math.random() * 6 + 1.5),
                vy: (Math.random() - 0.5) * 5,
                life: 0,
                maxLife: Math.random() * 24 + 16,
                size: Math.random() * 2.2 + 1.0,
                color: Math.random() > 0.3 ? colors.accent : colors.main,
              });
            }
            continue;
          }

          // Draw motion blur trail arcs
          for (let tr = 0; tr < s.trail.length; tr++) {
            const item = s.trail[tr];
            drawShurikenStar(item.x, item.y, item.rot, s.size, true);
          }

          // Draw crisp spinning shuriken
          drawShurikenStar(s.x, s.y, s.rot, s.size, false);
        }

        // Render beam impact sparks
        for (let sp = dojo.sparks.length - 1; sp >= 0; sp--) {
          const spark = dojo.sparks[sp];
          spark.x += spark.vx;
          spark.y += spark.vy;
          spark.vy += 0.25; // Gravity
          spark.life += 1;

          if (spark.life >= spark.maxLife) {
            dojo.sparks.splice(sp, 1);
            continue;
          }

          const sparkAlpha = 1 - spark.life / spark.maxLife;
          ctx.fillStyle = spark.color;
          ctx.globalAlpha = sparkAlpha;
          ctx.beginPath();
          ctx.arc(spark.x, spark.y, spark.size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1.0;
      }

      // =======================================================================
      // 13. SMOKE VANISH 💨 (Ninja in dark bamboo forest, realistic smoke & fireflies)
      // =======================================================================
      else if (resolvedScene === 'smoke_vanish') {
        const forest = smokeVanishRef.current;

        // Dark moody nocturnal bamboo forest gradient
        const forestBg = ctx.createLinearGradient(0, 0, 0, height);
        forestBg.addColorStop(0, '#020904');
        forestBg.addColorStop(0.5, colors.darkBg);
        forestBg.addColorStop(1, '#010603');
        ctx.fillStyle = forestBg;
        ctx.fillRect(0, 0, width, height);

        // 1. Distant Parallax Bamboo Stalks
        ctx.fillStyle = '#061a0e';
        const bgStalkCount = 10;
        for (let b = 0; b < bgStalkCount; b++) {
          const bx = (width / bgStalkCount) * b + Math.sin(b * 3) * 12;
          ctx.fillRect(bx, 0, 10, height);

          // Bamboo horizontal node ridges
          ctx.strokeStyle = '#030d07';
          ctx.lineWidth = 2;
          for (let nd = 40; nd < height; nd += 65) {
            ctx.beginPath();
            ctx.moveTo(bx - 2, nd);
            ctx.lineTo(bx + 12, nd);
            ctx.stroke();
          }
        }

        // Drifting forest mist layer
        const mistGrad = ctx.createLinearGradient(0, height * 0.45, 0, height * 0.85);
        mistGrad.addColorStop(0, 'transparent');
        mistGrad.addColorStop(0.5, colors.secondaryRgba(0.2));
        mistGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = mistGrad;
        ctx.fillRect(0, height * 0.45, width, height * 0.4);

        // 2. Midground Prominent Bamboo Stalks
        const midStalks = [width * 0.18, width * 0.45, width * 0.76, width * 0.92];
        for (let m = 0; m < midStalks.length; m++) {
          const mx = midStalks[m];
          const stalkGrad = ctx.createLinearGradient(mx, 0, mx + 22, 0);
          stalkGrad.addColorStop(0, '#0a2615');
          stalkGrad.addColorStop(0.5, '#124024');
          stalkGrad.addColorStop(1, '#061a0e');
          ctx.fillStyle = stalkGrad;
          ctx.fillRect(mx, 0, 22, height);

          // Ring ridges
          ctx.fillStyle = '#041009';
          for (let r = 50; r < height; r += 75) {
            ctx.beginPath();
            ctx.ellipse(mx + 11, r, 13, 3, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // 3. Bioluminescent Fireflies floating around with treble glow
        for (let f = 0; f < forest.fireflies.length; f++) {
          const fly = forest.fireflies[f];
          fly.phase += fly.speed;
          fly.x = fly.baseX + Math.sin(fly.phase) * 35;
          fly.y = fly.baseY + Math.cos(fly.phase * 0.8) * 25;

          // Wrap fireflies on resize
          if (fly.x < 0) fly.baseX = width;
          if (fly.x > width) fly.baseX = 0;
          if (fly.y < 0) fly.baseY = height;
          if (fly.y > height) fly.baseY = 0;

          const glowPulse = Math.sin(t * 3 + fly.phase) * 0.35 + 0.65 + sHigh * 0.5;
          const flyR = fly.size * glowPulse;

          const flyGrad = ctx.createRadialGradient(fly.x, fly.y, 1, fly.x, fly.y, flyR * 4);
          flyGrad.addColorStop(0, colors.accent);
          flyGrad.addColorStop(0.4, colors.accentRgba(0.3));
          flyGrad.addColorStop(1, 'transparent');
          ctx.fillStyle = flyGrad;
          ctx.beginPath();
          ctx.arc(fly.x, fly.y, flyR * 4, 0, Math.PI * 2);
          ctx.fill();
        }

        // Initialize ninja position if zero
        if (forest.ninjaX === 0) {
          forest.ninjaX = width * 0.35;
          forest.ninjaY = height * 0.72;
        }

        // Bass Hit: Smoke bomb burst -> Ninja vanishes & reappears in a new spot!
        const canTeleport = currentTime - forest.lastTeleportTime > 650;
        if (isBeat && sBass > 0.62 && canTeleport) {
          forest.lastTeleportTime = currentTime;

          // Explode smoke bomb at old position
          const smokePuffCount = Math.floor(18 + sBass * 25);
          for (let p = 0; p < smokePuffCount; p++) {
            const angle = Math.random() * Math.PI * 2;
            const spd = Math.random() * 5 + 2 + sBass * 6;
            forest.puffs.push({
              x: forest.ninjaX + (Math.random() - 0.5) * 20,
              y: forest.ninjaY - 25 + (Math.random() - 0.5) * 30,
              vx: Math.cos(angle) * spd,
              vy: Math.sin(angle) * spd * 0.6 - 1.2,
              radius: Math.random() * 22 + 16,
              maxRadius: Math.random() * 55 + 40,
              alpha: 0.85,
              rot: Math.random() * Math.PI * 2,
              rotSpeed: (Math.random() - 0.5) * 0.04,
              color: Math.random() > 0.4 ? colors.secondary : colors.main,
            });
          }

          // Pick new spot in the bamboo forest
          const poses: ('ground' | 'branch' | 'crouch')[] = ['ground', 'branch', 'crouch'];
          forest.currentPose = poses[Math.floor(Math.random() * poses.length)];
          const newX = Math.random() * (width * 0.65) + width * 0.15;
          const newY = forest.currentPose === 'branch' ? height * 0.48 : height * 0.72;
          forest.ninjaX = newX;
          forest.ninjaY = newY;

          // Explode secondary smoke burst at new appearance location
          for (let p = 0; p < 12; p++) {
            const angle = Math.random() * Math.PI * 2;
            const spd = Math.random() * 3.5 + 1.5;
            forest.puffs.push({
              x: newX,
              y: newY - 20,
              vx: Math.cos(angle) * spd,
              vy: Math.sin(angle) * spd * 0.6 - 1.0,
              radius: Math.random() * 18 + 12,
              maxRadius: Math.random() * 45 + 30,
              alpha: 0.75,
              rot: Math.random() * Math.PI * 2,
              rotSpeed: (Math.random() - 0.5) * 0.03,
              color: colors.secondary,
            });
          }
        }

        // Ninja breathing alpha animation
        forest.ninjaAlpha += (forest.ninjaTargetAlpha - forest.ninjaAlpha) * 0.1;

        // 4. Draw Ninja Silhouette at current spot
        if (forest.ninjaAlpha > 0.05) {
          ctx.save();
          ctx.translate(forest.ninjaX, forest.ninjaY);
          ctx.globalAlpha = forest.ninjaAlpha;

          // Silhouette edge glow in cover main color
          ctx.fillStyle = '#010502';
          ctx.shadowColor = colors.main;
          ctx.shadowBlur = 10;

          if (forest.currentPose === 'branch') {
            // Perched perched crouch pose atop bamboo node
            ctx.beginPath();
            ctx.arc(0, -42, 8, 0, Math.PI * 2);
            ctx.fill();

            ctx.beginPath();
            ctx.ellipse(0, -25, 12, 14, 0, 0, Math.PI * 2);
            ctx.fill();

            // Crouched tucked legs
            ctx.beginPath();
            ctx.moveTo(-10, -18);
            ctx.lineTo(-18, -4);
            ctx.lineTo(-6, 2);
            ctx.lineTo(6, 2);
            ctx.lineTo(18, -4);
            ctx.lineTo(10, -18);
            ctx.closePath();
            ctx.fill();

            // Scabbard on back
            ctx.strokeStyle = '#334155';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(-14, -48);
            ctx.lineTo(12, -10);
            ctx.stroke();
          } else if (forest.currentPose === 'crouch') {
            // Low stealth stalker stance
            ctx.beginPath();
            ctx.arc(10, -32, 8, 0, Math.PI * 2);
            ctx.fill();

            ctx.beginPath();
            ctx.ellipse(0, -18, 14, 11, -0.3, 0, Math.PI * 2);
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(-12, -14);
            ctx.lineTo(-26, -2);
            ctx.lineTo(-32, 8);
            ctx.lineTo(4, 8);
            ctx.lineTo(24, 6);
            ctx.closePath();
            ctx.fill();

            // Kunai blade ready in hand
            ctx.strokeStyle = colors.accent;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(18, -16);
            ctx.lineTo(34, -12);
            ctx.stroke();
          } else {
            // Standing shadow guardian stance
            ctx.beginPath();
            ctx.arc(0, -56, 8.5, 0, Math.PI * 2);
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(-14, -46);
            ctx.lineTo(14, -46);
            ctx.lineTo(10, -16);
            ctx.lineTo(-10, -16);
            ctx.closePath();
            ctx.fill();

            ctx.fillRect(-9, -16, 7, 24);
            ctx.fillRect(2, -16, 7, 24);

            ctx.strokeStyle = '#334155';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(-16, -68);
            ctx.lineTo(12, -22);
            ctx.stroke();
          }

          ctx.shadowBlur = 0;
          ctx.restore();
        }

        // 5. Volumetric Smoke Clouds Rendering & Billowing Simulation
        for (let i = forest.puffs.length - 1; i >= 0; i--) {
          const puff = forest.puffs[i];
          puff.x += puff.vx;
          puff.y += puff.vy;
          puff.radius += 0.8;
          puff.rot += puff.rotSpeed;
          puff.alpha -= 0.012;

          if (puff.alpha <= 0 || puff.radius >= puff.maxRadius) {
            forest.puffs.splice(i, 1);
            continue;
          }

          const smokeGrad = ctx.createRadialGradient(
            puff.x, puff.y, puff.radius * 0.1,
            puff.x, puff.y, puff.radius
          );
          smokeGrad.addColorStop(0, puff.color === colors.main ? colors.mainRgba(puff.alpha) : colors.secondaryRgba(puff.alpha));
          smokeGrad.addColorStop(0.5, puff.color === colors.main ? colors.mainRgba(puff.alpha * 0.5) : colors.secondaryRgba(puff.alpha * 0.5));
          smokeGrad.addColorStop(1, 'transparent');

          ctx.fillStyle = smokeGrad;
          ctx.beginPath();
          ctx.arc(puff.x, puff.y, puff.radius, 0, Math.PI * 2);
          ctx.fill();
        }

        // 6. Foreground framing bamboo stalks and bamboo leaves
        ctx.fillStyle = '#031209';
        ctx.fillRect(-10, 0, 28, height);
        ctx.fillRect(width - 18, 0, 28, height);

        ctx.fillStyle = '#082f18';
        const leafClusters = [
          { x: 30, y: 50, angle: 0.4 },
          { x: 45, y: 80, angle: 0.6 },
          { x: width - 35, y: 60, angle: -0.5 },
          { x: width - 50, y: 95, angle: -0.7 },
        ];
        for (let lc = 0; lc < leafClusters.length; lc++) {
          const lf = leafClusters[lc];
          const sway = Math.sin(t * 2 + lc) * 0.08;
          ctx.save();
          ctx.translate(lf.x, lf.y);
          ctx.rotate(lf.angle + sway);
          ctx.beginPath();
          ctx.ellipse(0, 0, 24, 6, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      // =======================================================================
      // 15. AURORA SKIES 🌌
      // Dark night sky, faint stars, mountain silhouette at bottom, 3-4 layered
      // aurora ribbons waving across the upper 60% with blurred glowing edges.
      // Semi-transparent, sky visible behind, no solid wash of color.
      // Mids = wave flow speed & movement. Bass = flare brightness & ribbon height.
      // Treble = twinkling stars & shimmering particles.
      // Fallback: green, teal, purple.
      // =======================================================================
      if (resolvedScene === 'aurora_skies') {
        // A. Deep dark night sky as the base
        const skyGrad = ctx.createLinearGradient(0, 0, 0, height);
        skyGrad.addColorStop(0, '#01040a');
        skyGrad.addColorStop(0.4, '#030a16');
        skyGrad.addColorStop(0.7, '#040d1a');
        skyGrad.addColorStop(1, '#010306');
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, width, height);

        const auroraData = auroraSkiesRef.current;

        // Beat Detection: Flare brightness +60%, height +40%, ease back within 300ms
        if (isBeat) {
          auroraData.beatFlare = 1.0;
        } else {
          auroraData.beatFlare = Math.max(0, auroraData.beatFlare - (0.016 / 0.30));
        }

        // B. Faint twinkling stars across sky (visible through and behind aurora; boosted by Treble)
        const twinkleBoost = 1.0 + sHigh * 2.8;
        for (let i = 0; i < auroraData.stars.length; i++) {
          const star = auroraData.stars[i];
          const tw = Math.sin(t * 3 * star.twinkleSpeed * 50 + i) * 0.4 + 0.6;
          const starAlpha = Math.min(1, star.alpha * tw * twinkleBoost);
          ctx.fillStyle = `rgba(255, 255, 255, ${starAlpha})`;
          ctx.beginPath();
          ctx.arc(star.x % width, (star.y % (height * 0.65)), star.size * (1 + sHigh * 0.35), 0, Math.PI * 2);
          ctx.fill();
        }

        // C. 3 to 4 Layered, Thinner, Semi-transparent Aurora Ribbons
        // Strictly limited to upper 60% of screen (y <= height * 0.60)
        // Mids controls wave speed
        const flowSpeed = 0.5 + sMid * 1.8;
        auroraData.waveOffset1 += 0.0035 * flowSpeed;
        auroraData.waveOffset2 += 0.0028 * flowSpeed;
        auroraData.waveOffset3 += 0.0042 * flowSpeed;
        auroraData.waveOffset4 += 0.0032 * flowSpeed;

        // On every beat: brightness up ~60%, height up ~40%, ease back in 300ms
        const beatHeightMult = 1.0 + 0.40 * auroraData.beatFlare;
        const beatBrightnessMult = 1.0 + 0.60 * auroraData.beatFlare;

        // Bass drives ribbon brightness directly
        const maxCurtainH = height * 0.28;
        const flareHeight = Math.min(maxCurtainH, ((height * 0.10) + sBass * (height * 0.09)) * beatHeightMult);
        const bassBrightness = 0.08 + sBass * 0.26;
        const flareAlpha = Math.min(1.0, bassBrightness * beatBrightnessMult);

        const ribbonConfigs = [
          {
            colorRgb: activeMain, // green
            offset: auroraData.waveOffset1,
            baseY: height * 0.42,
            amplitude: 15 + sMid * 12,
            freq: 0.0025,
            curtainHeight: flareHeight * 1.0,
            alpha: flareAlpha * 0.85,
          },
          {
            colorRgb: activeSecondary, // teal
            offset: auroraData.waveOffset2,
            baseY: height * 0.48,
            amplitude: 18 + sMid * 14,
            freq: 0.0020,
            curtainHeight: flareHeight * 1.1,
            alpha: flareAlpha * 0.75,
          },
          {
            colorRgb: activeAccent, // purple
            offset: auroraData.waveOffset3,
            baseY: height * 0.36,
            amplitude: 14 + sMid * 10,
            freq: 0.0030,
            curtainHeight: flareHeight * 0.9,
            alpha: flareAlpha * 0.70,
          },
          {
            colorRgb: activeMain, // green/emerald
            offset: auroraData.waveOffset4,
            baseY: height * 0.52,
            amplitude: 20 + sMid * 15,
            freq: 0.0016,
            curtainHeight: flareHeight * 1.15,
            alpha: flareAlpha * 0.60,
          },
        ];

        // Draw layered curtain ribbons with additive blending (lighter)
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        for (let r = 0; r < ribbonConfigs.length; r++) {
          const cfg = ribbonConfigs[r];
          const ribH = cfg.curtainHeight;
          const stepX = currentPerf === 'battery' ? 14 : 8;

          ctx.save();
          ctx.beginPath();

          // Bottom wavy baseline strictly capped below upper 60% (height * 0.58)
          const baseYPoints: { x: number; y: number }[] = [];
          for (let x = 0; x <= width + stepX; x += stepX) {
            const waveY = Math.min(
              height * 0.58,
              cfg.baseY +
                Math.sin(x * cfg.freq + cfg.offset) * cfg.amplitude +
                Math.sin(x * cfg.freq * 2.2 - cfg.offset * 1.1) * (cfg.amplitude * 0.3)
            );
            baseYPoints.push({ x, y: waveY });
          }

          // Move along bottom wavy baseline
          ctx.moveTo(baseYPoints[0].x, baseYPoints[0].y);
          for (let i = 1; i < baseYPoints.length; i++) {
            ctx.lineTo(baseYPoints[i].x, baseYPoints[i].y);
          }

          // Top boundary fading upward
          for (let i = baseYPoints.length - 1; i >= 0; i--) {
            const foldOffset = Math.sin(baseYPoints[i].x * 0.012 + cfg.offset * 1.6) * 6;
            ctx.lineTo(baseYPoints[i].x, Math.max(15, baseYPoints[i].y - ribH + foldOffset));
          }
          ctx.closePath();

          // Vertical curtain gradient fading softly both upward and toward the bottom
          const cr = Math.round(cfg.colorRgb.r);
          const cg = Math.round(cfg.colorRgb.g);
          const cb = Math.round(cfg.colorRgb.b);

          const rGrad = ctx.createLinearGradient(0, cfg.baseY, 0, cfg.baseY - ribH);
          // Soft bottom fade out
          rGrad.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, 0)`);
          rGrad.addColorStop(0.2, `rgba(${cr}, ${cg}, ${cb}, ${cfg.alpha * 0.65})`);
          // Radiant mid-band
          rGrad.addColorStop(0.5, `rgba(${cr}, ${cg}, ${cb}, ${cfg.alpha * 0.85})`);
          // Soft top feather
          rGrad.addColorStop(0.85, `rgba(${cr}, ${cg}, ${cb}, ${cfg.alpha * 0.25})`);
          rGrad.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);

          ctx.fillStyle = rGrad;
          ctx.shadowColor = `rgba(${cr}, ${cg}, ${cb}, 0.35)`;
          ctx.shadowBlur = currentPerf === 'battery' ? 10 : 18;
          ctx.fill();

          // Soft subtle vertical curtain folds
          if (currentPerf !== 'battery') {
            ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${cfg.alpha * 0.18})`;
            ctx.lineWidth = 1.0;
            ctx.beginPath();
            for (let i = 0; i < baseYPoints.length; i += 5) {
              const pt = baseYPoints[i];
              ctx.moveTo(pt.x, pt.y - 2);
              ctx.lineTo(pt.x + (Math.sin(pt.x * 0.007 + cfg.offset) * 8), Math.max(15, pt.y - ribH * 0.85));
            }
            ctx.stroke();
          }

          ctx.restore();
        }

        ctx.restore(); // restore globalCompositeOperation

        // D. Shimmering tiny particles & shooting sparkles (excited by Treble)
        const shimmerSpeed = 1.0 + sHigh * 3.5;
        for (let i = 0; i < auroraData.shimmer.length; i++) {
          const p = auroraData.shimmer[i];
          p.y += p.vy * shimmerSpeed;
          p.x += p.vx * (1.0 + sHigh * 1.5);
          if (p.y < 30) {
            p.y = height * 0.55 + Math.random() * 50;
            p.x = Math.random() * width;
          }
          const pAlpha = Math.min(1.0, p.alpha * (0.35 + sHigh * 0.85));
          ctx.fillStyle = i % 2 === 0 ? colors.mainRgba(pAlpha) : colors.accentRgba(pAlpha);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();

          // Treble makes sparkles shoot & glint across sky
          if (sHigh > 0.28 && i % 3 === 0) {
            const spkR = 2.0 + sHigh * 3.5;
            ctx.fillStyle = `rgba(255, 255, 255, ${pAlpha * 0.95})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, spkR, 0, Math.PI * 2);
            ctx.fill();
            // Star cross glint
            ctx.strokeStyle = `rgba(255, 255, 255, ${pAlpha * 0.75})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(p.x - spkR * 2, p.y);
            ctx.lineTo(p.x + spkR * 2, p.y);
            ctx.moveTo(p.x, p.y - spkR * 2);
            ctx.lineTo(p.x, p.y + spkR * 2);
            ctx.stroke();
          }
        }

        // D. Atmospheric soft mountain silhouette at the bottom
        ctx.fillStyle = '#010307';
        ctx.beginPath();
        ctx.moveTo(0, height);
        ctx.lineTo(0, height * 0.82);

        // Mountain peaks
        const mPoints = [
          { x: 0, y: height * 0.82 },
          { x: width * 0.15, y: height * 0.74 },
          { x: width * 0.28, y: height * 0.79 },
          { x: width * 0.45, y: height * 0.68 },
          { x: width * 0.62, y: height * 0.77 },
          { x: width * 0.78, y: height * 0.71 },
          { x: width * 0.92, y: height * 0.78 },
          { x: width, y: height * 0.80 },
        ];
        for (let pt = 1; pt < mPoints.length; pt++) {
          ctx.lineTo(mPoints[pt].x, mPoints[pt].y);
        }
        ctx.lineTo(width, height);
        ctx.closePath();
        ctx.fill();

        // Mountain ridge highlight
        ctx.strokeStyle = colors.mainRgba(0.12 + sBass * 0.2);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let pt = 0; pt < mPoints.length; pt++) {
          if (pt === 0) ctx.moveTo(mPoints[pt].x, mPoints[pt].y);
          else ctx.lineTo(mPoints[pt].x, mPoints[pt].y);
        }
        ctx.stroke();

        // Mist above mountain base
        const mistGrad = ctx.createLinearGradient(0, height * 0.68, 0, height);
        mistGrad.addColorStop(0, 'transparent');
        mistGrad.addColorStop(0.7, colors.secondaryRgba(0.08 + sBass * 0.1));
        mistGrad.addColorStop(1, '#010307');
        ctx.fillStyle = mistGrad;
        ctx.fillRect(0, height * 0.68, width, height * 0.32);
      }

      // =======================================================================
      // 16. THUNDER STORM ⚡
      // Heavy dark clouds moving slowly, light rain (lighter than Rainy Night).
      // Strong beat = realistic branching lightning bolt from clouds + bright flash
      // that lights clouds & whole screen then fades. Weak beats = faint internal glow.
      // Bass = lightning strength. Mids = cloud movement. Treble = rain intensity.
      // Fallback: steel blue, white, purple.
      // =======================================================================
      if (resolvedScene === 'thunder_storm') {
        const storm = thunderStormRef.current;

        // A. Flash effect lighting entire sky & clouds
        storm.flashAlpha = Math.max(0, storm.flashAlpha - 0.055);
        storm.internalCloudGlow = Math.max(0, storm.internalCloudGlow - 0.04);

        // Dark overcast sky background
        const stormSky = ctx.createLinearGradient(0, 0, 0, height);
        const flashVal = storm.flashAlpha * 0.65;
        const skyR = Math.min(255, Math.round(10 + flashVal * activeSecondary.r));
        const skyG = Math.min(255, Math.round(14 + flashVal * activeSecondary.g));
        const skyB = Math.min(255, Math.round(24 + flashVal * activeSecondary.b));

        stormSky.addColorStop(0, `rgb(${skyR}, ${skyG}, ${skyB})`);
        stormSky.addColorStop(1, '#030508');
        ctx.fillStyle = stormSky;
        ctx.fillRect(0, 0, width, height);

        // Beat Trigger: Spawn Branching Lightning on strong beat
        const nowMs = performance.now();
        const isStrongBeat = isBeat && sBass > 0.62 && nowMs - storm.lastStrikeTime > 450;
        const isWeakBeat = isBeat && sBass <= 0.62;

        if (isStrongBeat) {
          storm.lastStrikeTime = nowMs;
          storm.flashAlpha = Math.min(1, 0.45 + sBass * 0.55);

          // Generate branching lightning bolt
          const startX = width * 0.2 + Math.random() * (width * 0.6);
          const startY = height * 0.12;
          const targetGroundY = height * (0.75 + Math.random() * 0.2);

          const segments: LightningSegment[] = [];
          let curX = startX;
          let curY = startY;
          const boltSteps = 16;
          const stepY = (targetGroundY - startY) / boltSteps;

          for (let step = 0; step < boltSteps; step++) {
            const nextX = curX + (Math.random() - 0.5) * 44;
            const nextY = curY + stepY;

            const branches: { x1: number; y1: number; x2: number; y2: number }[] = [];
            // Chance to sprout secondary branch
            if (Math.random() < 0.42 && step > 2) {
              const bAngle = (Math.random() - 0.5) * 1.2 + (nextX > curX ? 0.4 : -0.4);
              const bLen = Math.random() * 45 + 25;
              branches.push({
                x1: curX,
                y1: curY,
                x2: curX + Math.sin(bAngle) * bLen,
                y2: curY + Math.cos(bAngle) * bLen,
              });
            }

            segments.push({
              x1: curX,
              y1: curY,
              x2: nextX,
              y2: nextY,
              branches,
            });

            curX = nextX;
            curY = nextY;
          }
          storm.lightning = segments;
        } else if (isWeakBeat) {
          storm.internalCloudGlow = Math.min(1, 0.35 + sBass * 0.4);
        }

        // Fade lightning segments over time
        if (storm.flashAlpha <= 0.05) {
          storm.lightning = [];
        }

        // B. Heavy Dark Storm Clouds (Mids control speed)
        const cloudSpeed = (0.25 + sMid * 0.8);
        for (let i = 0; i < storm.clouds.length; i++) {
          const c = storm.clouds[i];
          c.x += c.speed * cloudSpeed;
          if (c.x - c.radius > width) c.x = -c.radius;

          const cloudGrad = ctx.createRadialGradient(c.x, c.y, c.radius * 0.1, c.x, c.y, c.radius);
          const internalIllum = storm.internalCloudGlow * 0.35 + storm.flashAlpha * 0.45;
          const cr = Math.min(255, Math.round(25 + internalIllum * activeMain.r));
          const cg = Math.min(255, Math.round(30 + internalIllum * activeMain.g));
          const cb = Math.min(255, Math.round(45 + internalIllum * activeMain.b));

          cloudGrad.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, ${c.alpha + internalIllum * 0.3})`);
          cloudGrad.addColorStop(0.65, `rgba(${Math.round(cr * 0.6)}, ${Math.round(cg * 0.6)}, ${Math.round(cb * 0.6)}, ${c.alpha * 0.8})`);
          cloudGrad.addColorStop(1, 'transparent');

          ctx.fillStyle = cloudGrad;
          ctx.beginPath();
          ctx.arc(c.x, c.y, c.radius, 0, Math.PI * 2);
          ctx.fill();
        }

        // C. Draw Branching Lightning Bolt
        if (storm.lightning.length > 0 && storm.flashAlpha > 0.02) {
          ctx.save();
          const boltAlpha = Math.min(1, storm.flashAlpha * 1.5);

          // Glow pass
          ctx.strokeStyle = colors.secondaryRgba(boltAlpha * 0.7);
          ctx.lineWidth = 6 + sBass * 4;
          ctx.shadowColor = colors.secondary;
          ctx.shadowBlur = 24;
          ctx.beginPath();
          for (let seg of storm.lightning) {
            ctx.moveTo(seg.x1, seg.y1);
            ctx.lineTo(seg.x2, seg.y2);
            for (let br of seg.branches) {
              ctx.moveTo(br.x1, br.y1);
              ctx.lineTo(br.x2, br.y2);
            }
          }
          ctx.stroke();

          // Core hot white pass
          ctx.strokeStyle = `rgba(255, 255, 255, ${boltAlpha})`;
          ctx.lineWidth = 2.2;
          ctx.shadowColor = '#ffffff';
          ctx.shadowBlur = 8;
          ctx.beginPath();
          for (let seg of storm.lightning) {
            ctx.moveTo(seg.x1, seg.y1);
            ctx.lineTo(seg.x2, seg.y2);
            for (let br of seg.branches) {
              ctx.moveTo(br.x1, br.y1);
              ctx.lineTo(br.x2, br.y2);
            }
          }
          ctx.stroke();
          ctx.restore();
        }

        // D. Light Rain falling (lighter than Rainy Night, Treble controls intensity & slant)
        const rainSlant = (sMid - 0.5) * 2 - 1.2;
        const rainSpeedMult = 1.0 + sHigh * 0.8;
        ctx.strokeStyle = colors.secondaryRgba(0.22 + sHigh * 0.3);
        ctx.lineWidth = 1.0;
        ctx.beginPath();

        for (let i = 0; i < storm.rain.length; i++) {
          const drop = storm.rain[i];
          drop.y += drop.speed * rainSpeedMult;
          drop.x += rainSlant;

          if (drop.y > height + 20) {
            drop.y = -20;
            drop.x = Math.random() * width;
          }

          ctx.moveTo(drop.x, drop.y);
          ctx.lineTo(drop.x + rainSlant * 2, drop.y + drop.length);
        }
        ctx.stroke();

        // Dark horizon silhouette
        ctx.fillStyle = '#020306';
        ctx.fillRect(0, height * 0.94, width, height * 0.06);
      }

      // =======================================================================
      // 17. DRAGON SPIRIT 🐉
      // A glowing smoky dragon made of flowing particles & soft energy trails,
      // =======================================================================
      // 17. DRAGON SPIRIT 🐉
      // Glowing smoky dragon made of flowing particles and soft energy trails,
      // moving along a big curving S-shaped / looping path across the whole screen.
      // Bigger clear head with snout, two horns, glowing eyes, and open mouth breathing fire.
      // Body thickest near the head, tapering smoothly to tail with dorsal spikes and embers.
      // Mids = coiling / curve speed. Bass = surges forward & breathes fire embers.
      // Treble = sparkling scales & small glints along body.
      // Fallback: gold, deep red, orange.
      // =======================================================================
      if (resolvedScene === 'dragon_spirit') {
        const bgGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.max(width, height) * 0.7);
        bgGrad.addColorStop(0, '#0c0704');
        bgGrad.addColorStop(0.65, '#050201');
        bgGrad.addColorStop(1, '#000000');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, width, height);

        const dragon = dragonSpiritRef.current;

        // Beat Detection: surge speed ~2x, head scale +25%, glow brighter, ease back in 300ms
        if (isBeat) {
          dragon.beatSurge = 1.0;
        } else {
          dragon.beatSurge = Math.max(0, dragon.beatSurge - (0.016 / 0.30));
        }

        // On every beat: whole dragon surges, speed up about 2x for 300 ms
        const surgeSpeedMult = 1.0 + 1.0 * dragon.beatSurge;
        const coilSpeed = (0.007 + sMid * 0.012) * surgeSpeedMult;
        const surgeSpeed = (sBass * 0.008) * surgeSpeedMult;

        dragon.pathT += (coilSpeed + surgeSpeed);
        // Slowly shifting phase so dragon slowly changes direction and loops uniquely
        dragon.phase1 += (0.0016 + sMid * 0.0015) * surgeSpeedMult;
        dragon.phase2 += 0.0011 * surgeSpeedMult;

        const pT = dragon.pathT;
        const p1 = dragon.phase1;
        const p2 = dragon.phase2;

        // Big curving S-shaped or looping path across the WHOLE screen (up, down and sideways)
        // Path from multi-frequency sine waves with changing phase
        const normX = Math.sin(pT * 0.82 + p1) * 0.70 + Math.sin(pT * 1.68 + p2 * 1.4) * 0.26;
        const normY = Math.sin(pT * 1.24 + p2) * 0.68 + Math.cos(pT * 0.62 + p1 * 1.1) * 0.28;

        // "slowly changes direction and sometimes moves toward the center, so it feels alive"
        // centerCycle smoothly modulates amplitude: periodically swooping right into the center
        const centerCycle = 0.55 + 0.45 * Math.sin(pT * 0.36 + p1 * 0.7);
        const spanX = (width * 0.44) * (0.32 + centerCycle * 0.68);
        const spanY = (height * 0.42) * (0.32 + centerCycle * 0.68);

        const targetX = cx + normX * spanX;
        const targetY = cy + normY * spanY;

        const moveDx = targetX - dragon.headX;
        const moveDy = targetY - dragon.headY;
        const moveDist = Math.hypot(moveDx, moveDy);

        if (moveDist > 0.05) {
          const desiredAngle = Math.atan2(moveDy, moveDx);
          const angleDiff = Math.atan2(Math.sin(desiredAngle - dragon.currentAngle), Math.cos(desiredAngle - dragon.currentAngle));
          dragon.currentAngle += angleDiff * 0.16;
        }

        dragon.headX = targetX;
        dragon.headY = targetY;

        // Segments follow the head, so the body bends smoothly
        if (dragon.joints.length > 0) {
          dragon.joints[0].x = dragon.headX;
          dragon.joints[0].y = dragon.headY;

          for (let i = 1; i < dragon.joints.length; i++) {
            const prev = dragon.joints[i - 1];
            const curr = dragon.joints[i];
            const dx = curr.x - prev.x;
            const dy = curr.y - prev.y;
            const dist = Math.hypot(dx, dy) || 1;
            const segmentDist = 13.5;

            curr.x = prev.x + (dx / dist) * segmentDist;
            curr.y = prev.y + (dy / dist) * segmentDist;
          }
        }

        // Spawn soft smoke trails behind the dragon body
        if (Math.random() < 0.5 || isBeat) {
          const spawnIndex = Math.floor(Math.random() * (dragon.joints.length - 12)) + 8;
          const sj = dragon.joints[spawnIndex];
          if (sj) {
            dragon.smoke.push({
              x: sj.x + (Math.random() - 0.5) * 16,
              y: sj.y + (Math.random() - 0.5) * 16,
              vx: (Math.random() - 0.5) * 0.8,
              vy: (Math.random() - 0.5) * 0.8,
              radius: Math.random() * 14 + sj.radius * 0.85,
              alpha: 0.35 + sBass * 0.25,
              color: Math.random() > 0.5 ? colors.secondary : colors.main,
            });
          }
        }

        // Clear burst of fire & glowing embers from OPEN MOUTH on beat or strong bass
        const isFireBreathing = isBeat || sBass > 0.40 || dragon.beatSurge > 0.45;
        if (isFireBreathing) {
          const flameCount = isBeat ? 26 : 16;
          const mouthX = dragon.headX + Math.cos(dragon.currentAngle) * 52;
          const mouthY = dragon.headY + Math.sin(dragon.currentAngle) * 52;

          for (let e = 0; e < flameCount; e++) {
            const spread = (Math.random() - 0.5) * 0.75;
            const eAngle = dragon.currentAngle + spread;
            const eSpd = Math.random() * 8.5 + 5.0 + sBass * 6.5;
            dragon.embers.push({
              x: mouthX,
              y: mouthY,
              vx: Math.cos(eAngle) * eSpd,
              vy: Math.sin(eAngle) * eSpd,
              size: Math.random() * 5.8 + 2.5,
              alpha: 1.0,
              life: 0,
              maxLife: Math.random() * 45 + 30,
              color: Math.random() > 0.35 ? colors.accent : colors.main,
            });
          }
        }

        // Draw Layer 1: Soft smoke trails drifting behind
        for (let i = dragon.smoke.length - 1; i >= 0; i--) {
          const smk = dragon.smoke[i];
          smk.x += smk.vx;
          smk.y += smk.vy;
          smk.radius += 0.45;
          smk.alpha -= 0.008;

          if (smk.alpha <= 0 || smk.radius > 60) {
            dragon.smoke.splice(i, 1);
            continue;
          }

          const sGrad = ctx.createRadialGradient(smk.x, smk.y, 2, smk.x, smk.y, smk.radius);
          sGrad.addColorStop(0, smk.color === colors.main ? colors.mainRgba(smk.alpha) : colors.secondaryRgba(smk.alpha));
          sGrad.addColorStop(0.6, smk.color === colors.main ? colors.mainRgba(smk.alpha * 0.4) : colors.secondaryRgba(smk.alpha * 0.4));
          sGrad.addColorStop(1, 'transparent');

          ctx.fillStyle = sGrad;
          ctx.beginPath();
          ctx.arc(smk.x, smk.y, smk.radius, 0, Math.PI * 2);
          ctx.fill();
        }

        // Draw Layer 2: Deep Volumetric Glowing Body Aura (Bass controls glow; beat makes it much brighter)
        ctx.save();
        const bassGlowMult = 0.25 + sBass * 0.85; // Bass controls the body glow directly
        const glowBoost = bassGlowMult * (1.0 + 0.90 * dragon.beatSurge); // surges much brighter on beat
        for (let i = dragon.joints.length - 1; i >= 0; i--) {
          const joint = dragon.joints[i];
          const ratio = i / dragon.joints.length; // 0 = head, 1 = tail
          const glowR = joint.radius * (3.0 + sBass * 1.6 + dragon.beatSurge * 1.5);
          const bodyGlow = ctx.createRadialGradient(joint.x, joint.y, 2, joint.x, joint.y, glowR);
          bodyGlow.addColorStop(0, colors.secondaryRgba(Math.min(1.0, 0.60 * glowBoost * (1 - ratio * 0.35))));
          bodyGlow.addColorStop(0.5, colors.mainRgba(Math.min(1.0, 0.38 * glowBoost * (1 - ratio * 0.35))));
          bodyGlow.addColorStop(1, 'transparent');

          ctx.fillStyle = bodyGlow;
          ctx.beginPath();
          ctx.arc(joint.x, joint.y, glowR, 0, Math.PI * 2);
          ctx.fill();
        }

        // Draw Layer 3: Solid Fleshed Dragon Body (Thickest near head, tapering smoothly to tail)
        for (let i = dragon.joints.length - 1; i >= 0; i--) {
          const joint = dragon.joints[i];
          const segGrad = ctx.createRadialGradient(
            joint.x, joint.y - joint.radius * 0.2, 1,
            joint.x, joint.y, joint.radius
          );
          segGrad.addColorStop(0, colors.mainRgba(0.95));
          segGrad.addColorStop(0.7, colors.secondaryRgba(0.85));
          segGrad.addColorStop(1, colors.accentRgba(0.55));

          ctx.fillStyle = segGrad;
          ctx.shadowColor = colors.main;
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(joint.x, joint.y, joint.radius, 0, Math.PI * 2);
          ctx.fill();
        }

        // Draw Layer 4: Dorsal Spikes along the dragon's back (Treble makes spikes sparkle)
        const spikeSparkle = sHigh * 2.8;
        ctx.fillStyle = colors.accentRgba(0.95);
        ctx.shadowColor = colors.accent;
        ctx.shadowBlur = 12 + spikeSparkle * 12;

        for (let i = 2; i < dragon.joints.length - 6; i += 2) {
          const j = dragon.joints[i];
          const prev = dragon.joints[i - 1];
          const nx = -(j.y - prev.y);
          const ny = j.x - prev.x;
          const nLen = Math.hypot(nx, ny) || 1;
          const spikeLen = j.radius * (1.15 + Math.sin(i * 0.4 + t * 4) * 0.25);

          const spX = j.x + (nx / nLen) * (j.radius + spikeLen);
          const spY = j.y + (ny / nLen) * (j.radius + spikeLen);
          const b1X = j.x - (prev.x - j.x) * 0.4;
          const b1Y = j.y - (prev.y - j.y) * 0.4;
          const b2X = j.x + (prev.x - j.x) * 0.4;
          const b2Y = j.y + (prev.y - j.y) * 0.4;

          ctx.beginPath();
          ctx.moveTo(b1X, b1Y);
          ctx.lineTo(spX, spY);
          ctx.lineTo(b2X, b2Y);
          ctx.closePath();
          ctx.fill();

          // Treble makes spike tips sparkle
          if (sHigh > 0.25 && i % 4 === 0) {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(spX, spY, 1.5 + sHigh * 2.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = colors.accentRgba(0.95);
          }
        }

        // Draw Layer 5: Layered Inner Spine Core Line
        ctx.beginPath();
        for (let i = 0; i < dragon.joints.length; i++) {
          const j = dragon.joints[i];
          if (i === 0) ctx.moveTo(j.x, j.y);
          else ctx.lineTo(j.x, j.y);
        }
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.75 + sBass * 0.25})`;
        ctx.lineWidth = 3.5;
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 8;
        ctx.stroke();

        // Draw Layer 6: Treble Sparkling Scales along the body
        const glintBoost = sHigh * 4.2;
        ctx.fillStyle = colors.mainRgba(0.95);
        for (let i = 2; i < dragon.joints.length - 4; i += 3) {
          const j = dragon.joints[i];
          const prev = dragon.joints[i - 1];
          const nx = -(j.y - prev.y);
          const ny = j.x - prev.x;
          const nLen = Math.hypot(nx, ny) || 1;
          const scaleOff = j.radius * 0.55;

          const sx = j.x - (nx / nLen) * scaleOff;
          const sy = j.y - (ny / nLen) * scaleOff;
          const sz = 1.8 + Math.sin(t * 8 + i) * 1.2 + glintBoost;

          ctx.beginPath();
          ctx.arc(sx, sy, Math.max(1, sz), 0, Math.PI * 2);
          ctx.fill();

          // Sparkling glints on treble
          if (sHigh > 0.28 && i % 5 === 2) {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(sx, sy, Math.max(1, sz * 0.65), 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = colors.mainRgba(0.95);
          }
        }

        // Draw Layer 7: Wispy Tail Tuft at the tip
        if (dragon.joints.length > 0) {
          const tailJoint = dragon.joints[dragon.joints.length - 1];
          const prevTail = dragon.joints[dragon.joints.length - 2] || tailJoint;
          const tdx = tailJoint.x - prevTail.x;
          const tdy = tailJoint.y - prevTail.y;
          const tailAngle = Math.atan2(tdy, tdx);

          ctx.save();
          ctx.translate(tailJoint.x, tailJoint.y);
          ctx.rotate(tailAngle);

          ctx.fillStyle = colors.accentRgba(0.85);
          ctx.shadowColor = colors.accent;
          ctx.shadowBlur = 14;
          for (let f = -1; f <= 1; f += 2) {
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(16, f * 12 + Math.sin(t * 10) * 4, 30, f * 6);
            ctx.quadraticCurveTo(14, 0, 0, 0);
            ctx.fill();
          }
          ctx.restore();
        }

        // Draw Layer 8: Bigger, Clearer Dragon Head with Snout, 2 Horns, Glowing Eyes, and OPEN MOUTH
        // Head scales up about 25% on every beat
        const headScale = 1.0 + 0.25 * dragon.beatSurge;
        ctx.save();
        ctx.translate(dragon.headX, dragon.headY);
        ctx.rotate(dragon.currentAngle);
        ctx.scale(headScale, headScale);

        // Head Scale & Glow (Prominent, large sculpted skull)
        const headGrad = ctx.createRadialGradient(14, 0, 4, 14, 0, 40);
        headGrad.addColorStop(0, colors.main);
        headGrad.addColorStop(0.65, colors.secondary);
        headGrad.addColorStop(1, colors.accent);

        ctx.fillStyle = headGrad;
        ctx.shadowColor = colors.main;
        ctx.shadowBlur = 32;

        // Upper Jaw & Distinct Dragon Snout Contour
        ctx.beginPath();
        ctx.moveTo(-18, -24);
        ctx.quadraticCurveTo(16, -30, 46, -14); // Snout bridge
        ctx.quadraticCurveTo(62, -4, 48, 0);    // Snout tip / upper lip
        ctx.quadraticCurveTo(26, -3, 10, -8);   // Roof of open mouth
        ctx.lineTo(10, -16);
        ctx.quadraticCurveTo(-18, -18, -18, -24);
        ctx.closePath();
        ctx.fill();

        // Lower Jaw (Distinct, clear open mouth aperture)
        ctx.beginPath();
        ctx.moveTo(8, 8);
        ctx.quadraticCurveTo(24, 7, 46, 14);   // Lower lip tip
        ctx.quadraticCurveTo(22, 30, -16, 24);  // Chin & throat
        ctx.lineTo(-18, 0);
        ctx.quadraticCurveTo(0, 5, 8, 8);
        ctx.closePath();
        ctx.fill();

        // Open Mouth Internal Fire Glow cavity
        const mouthGlow = ctx.createRadialGradient(24, 3, 2, 24, 3, 24);
        mouthGlow.addColorStop(0, colors.accentRgba(0.95));
        mouthGlow.addColorStop(0.55, colors.mainRgba(0.75));
        mouthGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = mouthGlow;
        ctx.beginPath();
        const fireJawSpread = isFireBreathing ? 10 + sBass * 6 + dragon.beatSurge * 4 : 6;
        ctx.ellipse(24, 3, 18, fireJawSpread, 0, 0, Math.PI * 2);
        ctx.fill();

        // Blazing Fire Core inside mouth on bass hits or beat
        if (isFireBreathing) {
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = colors.accent;
          ctx.shadowBlur = 24;
          ctx.beginPath();
          ctx.arc(28, 3, 6 + sBass * 10 + dragon.beatSurge * 8, 0, Math.PI * 2);
          ctx.fill();
        }

        // Sharp fangs in the open mouth
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        // Upper fangs
        ctx.moveTo(26, -6);
        ctx.lineTo(30, 0);
        ctx.lineTo(32, -6);
        ctx.moveTo(38, -4);
        ctx.lineTo(41, 1);
        ctx.lineTo(43, -4);
        // Lower fangs
        ctx.moveTo(28, 8);
        ctx.lineTo(31, 2);
        ctx.lineTo(33, 8);
        ctx.moveTo(38, 9);
        ctx.lineTo(41, 3);
        ctx.lineTo(43, 9);
        ctx.fill();

        // Nostril glow on top of snout
        ctx.fillStyle = colors.accentRgba(0.95);
        ctx.beginPath();
        ctx.arc(40, -9, 3.2, 0, Math.PI * 2);
        ctx.fill();

        // Two Antler-like Magnificent Horns
        ctx.strokeStyle = colors.accent;
        ctx.lineWidth = 4.2;
        ctx.shadowColor = colors.accent;
        ctx.shadowBlur = 18;

        // Top Horn with fork prongs
        ctx.beginPath();
        ctx.moveTo(-10, -16);
        ctx.quadraticCurveTo(-30, -42, -58, -38);
        ctx.moveTo(-28, -30);
        ctx.lineTo(-42, -52);
        ctx.moveTo(-44, -36);
        ctx.lineTo(-54, -48);
        ctx.stroke();

        // Bottom Horn with fork prongs
        ctx.beginPath();
        ctx.moveTo(-10, 16);
        ctx.quadraticCurveTo(-30, 42, -58, 38);
        ctx.moveTo(-28, 30);
        ctx.lineTo(-42, 52);
        ctx.moveTo(-44, 36);
        ctx.lineTo(-54, 48);
        ctx.stroke();

        // Flowing Dragon Whiskers waving through air
        ctx.strokeStyle = colors.mainRgba(0.9);
        ctx.lineWidth = 2.4;
        const whiskerWave = Math.sin(t * 14) * 9;
        ctx.beginPath();
        ctx.moveTo(26, -10);
        ctx.quadraticCurveTo(52, -26 + whiskerWave, 78, -14 + whiskerWave * 1.5);
        ctx.moveTo(26, 10);
        ctx.quadraticCurveTo(52, 26 - whiskerWave, 78, 14 - whiskerWave * 1.5);
        ctx.stroke();

        // Two Piercing Glowing Eyes (Large, expressive)
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(16, -14, 5.0, 0, Math.PI * 2);
        ctx.arc(16, 14, 5.0, 0, Math.PI * 2);
        ctx.fill();

        // Slit pupils in gold/main color
        ctx.fillStyle = colors.main;
        ctx.beginPath();
        ctx.ellipse(16.5, -14, 1.8, 4.0, 0, 0, Math.PI * 2);
        ctx.ellipse(16.5, 14, 1.8, 4.0, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        // Draw Layer 9: Embers & Fire Breath Particles
        for (let i = dragon.embers.length - 1; i >= 0; i--) {
          const emb = dragon.embers[i];
          emb.x += emb.vx;
          emb.y += emb.vy;
          emb.life += 1;
          emb.alpha -= 0.018;

          if (emb.alpha <= 0 || emb.life >= emb.maxLife) {
            dragon.embers.splice(i, 1);
            continue;
          }

          ctx.fillStyle = emb.color;
          ctx.shadowColor = emb.color;
          ctx.shadowBlur = 10;
          ctx.globalAlpha = Math.max(0, emb.alpha);
          ctx.beginPath();
          ctx.arc(emb.x, emb.y, emb.size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        ctx.restore();
      }

      // =======================================================================
      // 18. HYPERSPACE WARP 🚀
      // Stars in center stretch outward into long light streaks (flying at high
      // speed through space), soft glow tunnel in center.
      // Bass = speed & streak stretch. Beat = bright flash + fast speed boost that eases down.
      // Mids = slight swirl / rotation. Treble = bright sparkles.
      // Fallback: electric blue, white, magenta.
      // =======================================================================
      if (resolvedScene === 'hyperspace_warp') {
        // Deep space background
        ctx.fillStyle = '#010206';
        ctx.fillRect(0, 0, width, height);

        const warp = hyperspaceWarpRef.current;

        // Beat Detection: 2.5x streak stretch, center glow expansion, bright center flash
        if (isBeat) {
          warp.beatPulse = 1.0;
          warp.flashAlpha = 1.0;
        } else {
          // Settle back quickly (~260-280 ms)
          warp.beatPulse = Math.max(0, warp.beatPulse - (0.016 / 0.28));
          warp.flashAlpha = Math.max(0, warp.flashAlpha - (0.016 / 0.20));
        }

        // Bass controls the speed (+ beat surge)
        const baseSpeed = 8 + sBass * 28 + (warp.beatPulse * 16);
        // Mids add swirl rotation
        warp.rotationAngle += 0.003 + sMid * 0.012;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(warp.rotationAngle);

        // Center Glow Tunnel (expands on beat, settles back quickly)
        const glowExpand = 1.0 + 0.85 * warp.beatPulse;
        const tunnelRadius = (45 + sBass * 55) * glowExpand;
        const tunnelGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, tunnelRadius);
        tunnelGrad.addColorStop(0, colors.secondaryRgba(Math.min(1.0, (0.55 + sBass * 0.4) * (1.0 + 0.45 * warp.beatPulse))));
        tunnelGrad.addColorStop(0.4, colors.mainRgba(Math.min(1.0, (0.35 + sBass * 0.3) * (1.0 + 0.35 * warp.beatPulse))));
        tunnelGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = tunnelGrad;
        ctx.beginPath();
        ctx.arc(0, 0, tunnelRadius, 0, Math.PI * 2);
        ctx.fill();

        // Draw Stretched Star Streaks (stretches ~2.5x on beat)
        const beatStretchMult = 1.0 + 1.5 * warp.beatPulse;
        const baseStretch = 1.4 + sBass * 2.2;
        const streakStretch = baseStretch * beatStretchMult;

        for (let i = 0; i < warp.stars.length; i++) {
          const st = warp.stars[i];
          st.prevZ = st.z;
          st.z -= baseSpeed;

          // Recycle star when passed viewer
          if (st.z <= 0) {
            st.z = 1000;
            st.prevZ = 1000;
            st.x = (Math.random() - 0.5) * width * 2;
            st.y = (Math.random() - 0.5) * height * 2;
          }

          const k = 320 / st.z;
          const px = st.x * k;
          const py = st.y * k;

          const prevK = 320 / Math.min(1000, st.z + baseSpeed * streakStretch);
          const pPrevX = st.x * prevK;
          const pPrevY = st.y * prevK;

          // Out-of-bounds recycling
          if (Math.abs(px) > width * 1.2 || Math.abs(py) > height * 1.2) {
            st.z = 1000;
            st.prevZ = 1000;
            continue;
          }

          // Depth-based brightness
          const starAlpha = Math.min(1, Math.max(0.1, (1 - st.z / 1000) * 1.2));
          const starWidth = Math.max(1, (1 - st.z / 1000) * 3.5 * (1 + warp.beatPulse * 0.4));

          ctx.lineWidth = starWidth;
          if (st.colorType === 'main') {
            ctx.strokeStyle = colors.mainRgba(starAlpha);
          } else if (st.colorType === 'sec') {
            ctx.strokeStyle = colors.accentRgba(starAlpha);
          } else {
            ctx.strokeStyle = `rgba(255, 255, 255, ${starAlpha})`;
          }

          ctx.beginPath();
          ctx.moveTo(pPrevX, pPrevY);
          ctx.lineTo(px, py);
          ctx.stroke();

          // Treble adds brilliant sparkles at streak heads
          if (sHigh > 0.20 && (i % 2 === 0 || sHigh > 0.45)) {
            const sparkleR = (1 - st.z / 1000) * (3.0 + sHigh * 5.0);
            const sparkleAlpha = Math.min(1.0, starAlpha * (0.8 + sHigh * 0.5));
            ctx.fillStyle = `rgba(255, 255, 255, ${sparkleAlpha})`;
            ctx.beginPath();
            ctx.arc(px, py, sparkleR, 0, Math.PI * 2);
            ctx.fill();

            // Diamond twinkle spike on bright treble hits
            if (sHigh > 0.35 && i % 3 === 0) {
              ctx.strokeStyle = `rgba(255, 255, 255, ${sparkleAlpha * 0.75})`;
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(px - sparkleR * 2.2, py);
              ctx.lineTo(px + sparkleR * 2.2, py);
              ctx.moveTo(px, py - sparkleR * 2.2);
              ctx.lineTo(px, py + sparkleR * 2.2);
              ctx.stroke();
            }
          }
        }

        // Short bright radiant flash at the center on beat
        if (warp.flashAlpha > 0.02) {
          const flashRadius = (35 + sBass * 35) * (1.0 + 0.5 * warp.beatPulse);
          const flashGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, flashRadius);
          flashGrad.addColorStop(0, `rgba(255, 255, 255, ${warp.flashAlpha * 0.95})`);
          flashGrad.addColorStop(0.35, colors.mainRgba(warp.flashAlpha * 0.85));
          flashGrad.addColorStop(0.7, colors.accentRgba(warp.flashAlpha * 0.4));
          flashGrad.addColorStop(1, 'transparent');

          ctx.fillStyle = flashGrad;
          ctx.beginPath();
          ctx.arc(0, 0, flashRadius, 0, Math.PI * 2);
          ctx.fill();

          // Intense core white flash
          ctx.fillStyle = `rgba(255, 255, 255, ${warp.flashAlpha})`;
          ctx.beginPath();
          ctx.arc(0, 0, 14 + sBass * 10, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }

      // =======================================================================
      // 18. NIGHT WALK 🚶
      // Cinematic 16:9 wide band across middle of screen with soft edge fading,
      // dark surrounding background, reactive soft glow in cover color,
      // slow floating dust particles, light mist, beat pulse (brightness +25%,
      // scale +3%, glow flash), bass glow strength, treble sparkles,
      // idle animation when paused, cover tint overlay.
      // =======================================================================
      if (resolvedScene === 'night_walk') {
        const nw = nightWalkRef.current;
        const rxMult = reactionMult;

        // Dynamic beat detection for Night Walk
        if (isBeat) {
          nw.beatPulse = 1.0;
        } else {
          nw.beatPulse = Math.max(0, nw.beatPulse - 0.055); // ease back within ~300ms
        }

        // Apply music reaction to video DOM element
        const beatScale = 1.0 + (0.03 * nw.beatPulse * rxMult);
        const beatBrightness = 1.0 + (0.25 * nw.beatPulse * rxMult);
        
        if (videoRef.current) {
          videoRef.current.style.transform = `scale(${beatScale.toFixed(4)})`;
          videoRef.current.style.filter = `brightness(${beatBrightness.toFixed(3)}) contrast(1.06)`;
        }

        // Bass controls behind glow strength + beat flash behind video
        const bassGlow = sBass * 0.55 * rxMult;
        const beatGlow = nw.beatPulse * 0.40 * rxMult;
        const idleGlow = !isActiveRef.current ? (0.18 + Math.sin(t * 1.5) * 0.04) : 0.22;
        const totalGlow = Math.min(1.0, idleGlow + bassGlow + beatGlow);

        if (nightWalkGlowRef.current) {
          nightWalkGlowRef.current.style.background = `radial-gradient(ellipse 90% 70% at 50% 50%, rgba(${mr}, ${mg}, ${mb}, ${(totalGlow * 0.75).toFixed(3)}) 0%, rgba(${sr}, ${sg}, ${sb}, ${(totalGlow * 0.35).toFixed(3)}) 45%, transparent 75%)`;
        }

        if (nightWalkTintRef.current) {
          nightWalkTintRef.current.style.backgroundColor = `rgb(${mr}, ${mg}, ${mb})`;
        }

        // Canvas Elements: Dark background on top/bottom edges + Mist + Floating Dust Particles + Treble Sparkles
        const bgGrad = ctx.createRadialGradient(width / 2, height / 2, height * 0.25, width / 2, height / 2, Math.max(width, height) * 0.75);
        bgGrad.addColorStop(0, 'rgba(3, 5, 10, 0.0)');
        bgGrad.addColorStop(0.55, 'rgba(3, 5, 10, 0.65)');
        bgGrad.addColorStop(1, 'rgba(2, 4, 8, 0.95)');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, width, height);

        // Soft glow in cover color drawn on canvas around video
        const canvasGlow = ctx.createRadialGradient(width / 2, height / 2, 20, width / 2, height / 2, Math.min(width, height) * 0.65);
        canvasGlow.addColorStop(0, colors.mainRgba(totalGlow * 0.30));
        canvasGlow.addColorStop(0.5, colors.secondaryRgba(totalGlow * 0.12));
        canvasGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = canvasGlow;
        ctx.fillRect(0, 0, width, height);

        // 1. Slow floating dust particles & light mist initialization
        if (nw.particles.length === 0) {
          for (let i = 0; i < 48; i++) {
            nw.particles.push({
              x: Math.random() * width,
              y: Math.random() * height,
              size: Math.random() * 2.2 + 0.8,
              vx: (Math.random() - 0.5) * 0.25,
              vy: -Math.random() * 0.45 - 0.15,
              alpha: Math.random() * 0.45 + 0.2,
              phase: Math.random() * Math.PI * 2,
              type: 'dust',
            });
          }
          // Light mist puffs
          for (let i = 0; i < 10; i++) {
            nw.particles.push({
              x: Math.random() * width,
              y: height * 0.25 + Math.random() * (height * 0.5),
              size: Math.random() * 80 + 60,
              vx: Math.random() * 0.35 + 0.15,
              vy: (Math.random() - 0.5) * 0.1,
              alpha: Math.random() * 0.05 + 0.03,
              phase: Math.random() * Math.PI * 2,
              type: 'mist',
            });
          }
        }

        // Draw Light Mist
        for (let i = 0; i < nw.particles.length; i++) {
          const p = nw.particles[i];
          if (p.type === 'mist') {
            p.x += p.vx;
            p.y += p.vy + Math.sin(t * 0.8 + p.phase) * 0.15;
            if (p.x - p.size > width) p.x = -p.size;

            const mistGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
            mistGrad.addColorStop(0, colors.mainRgba(p.alpha * (1 + sMid * 0.5)));
            mistGrad.addColorStop(0.6, colors.secondaryRgba(p.alpha * 0.4));
            mistGrad.addColorStop(1, 'transparent');
            ctx.fillStyle = mistGrad;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Draw Floating Dust Particles
        for (let i = 0; i < nw.particles.length; i++) {
          const p = nw.particles[i];
          if (p.type === 'dust') {
            p.y += p.vy;
            p.x += p.vx + Math.sin(t * 1.4 + p.phase) * 0.2;
            if (p.y < -10) {
              p.y = height + 10;
              p.x = Math.random() * width;
            }
            if (p.x < 0) p.x = width;
            if (p.x > width) p.x = 0;

            const pulseA = p.alpha * (0.65 + 0.35 * Math.sin(t * 2 + p.phase));
            ctx.fillStyle = `rgba(235, 245, 255, ${pulseA.toFixed(3)})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // 2. Treble Sparkles (twinkling star/glint particles driven by sHigh)
        const sparkleCount = Math.floor(6 + sHigh * 18 * rxMult);
        for (let i = 0; i < sparkleCount; i++) {
          const sx = ((Math.sin(i * 127.1 + t * 0.5) * 43758.5453) % 1 + 1) % 1 * width;
          const sy = ((Math.sin(i * 311.7 + t * 0.4) * 23421.631) % 1 + 1) % 1 * height;
          const twinkle = Math.sin(t * 8 + i * 1.7) * 0.5 + 0.5;
          const sAlpha = Math.min(1.0, (0.25 + sHigh * 0.75) * twinkle);
          const sRadius = (2.0 + sHigh * 3.5) * (1.0 + 0.3 * Math.sin(t * 10 + i));

          if (sAlpha > 0.08) {
            ctx.save();
            ctx.translate(sx, sy);
            ctx.fillStyle = `rgba(255, 255, 255, ${sAlpha.toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(0, -sRadius * 1.8);
            ctx.lineTo(sRadius * 0.35, 0);
            ctx.lineTo(0, sRadius * 1.8);
            ctx.lineTo(-sRadius * 0.35, 0);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = colors.mainRgba(sAlpha * 0.8);
            ctx.beginPath();
            ctx.moveTo(-sRadius * 1.8, 0);
            ctx.lineTo(0, sRadius * 0.35);
            ctx.lineTo(sRadius * 1.8, 0);
            ctx.lineTo(0, -sRadius * 0.35);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          }
        }
      }

      ctx.restore();
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      resizeObserver.disconnect();
    };
  }, [scene, performanceMode, isActive]);

  return (
    <div className={`relative overflow-hidden pointer-events-none ${className}`}>
      {/* Night Walk Video Layer */}
      <div
        ref={nightWalkContainerRef}
        className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden"
        style={{
          display: scene === 'night_walk' ? 'flex' : 'none',
        }}
      >
        {/* Soft glow in cover color behind video */}
        <div
          ref={nightWalkGlowRef}
          className="absolute inset-0 pointer-events-none transition-opacity duration-300"
          style={{
            background: 'radial-gradient(ellipse 90% 70% at 50% 50%, rgba(56, 189, 248, 0.25) 0%, transparent 75%)',
          }}
        />

        {/* 16:9 Wide band across middle of screen, scaled to full screen width */}
        <div
          className="relative w-full aspect-video flex items-center justify-center overflow-hidden"
          style={{
            maskImage: 'linear-gradient(to bottom, transparent 0%, black 18%, black 82%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 18%, black 82%, transparent 100%)',
          }}
        >
          <video
            ref={videoRef}
            src="/walking_cinematic_wide.mp4"
            muted
            playsInline
            loop
            controls={false}
            disablePictureInPicture
            disableRemotePlayback
            aria-hidden="true"
            tabIndex={-1}
            className="w-full h-full object-cover pointer-events-none will-change-transform"
            style={{
              transformOrigin: 'center center',
            }}
            onError={(e) => {
              const target = e.currentTarget;
              if (!target.dataset.triedFallback) {
                target.dataset.triedFallback = 'true';
                target.src = '/walking_cinematic_portrait_tight.mp4';
              }
            }}
          />

          {/* Cover Color Tint Overlay */}
          <div
            ref={nightWalkTintRef}
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundColor: 'rgba(56, 189, 248, 0.25)',
              mixBlendMode: 'overlay',
              opacity: 0.75,
            }}
          />
        </div>
      </div>

      {/* Main Canvas Layer */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />
    </div>
  );
};
