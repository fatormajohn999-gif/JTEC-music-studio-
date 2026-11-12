import React, { useEffect, useRef } from 'react';
import { CinematicScene, PerformanceMode, ArtworkPalette, ReactionStrength } from '../types/music';
import { audioEngine } from '../services/audioEngine';
import { VisualizerDiagnostics } from '../services/visualizerDiagnostics';

interface CinematicVisualizerProps {
  scene: CinematicScene;
  performanceMode: PerformanceMode;
  palette: ArtworkPalette;
  isActive: boolean;
  className?: string;
  reactionStrength?: ReactionStrength;
  onAutoSceneDetermined?: (detectedScene: CinematicScene) => void;
  currentTime?: number;
  isUiOverlayOpen?: boolean;
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

// JT Night structures
interface JTNightStar {
  x: number; // 0..1
  y: number; // 0..1
  radius: number; // 0.5 to 1.6
  twinklePhase: number;
  twinkleSpeed: number;
  baseAlpha: number;
}

interface JTNightStaticStar {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  isPeriwinkle: boolean;
}

interface JTNightBubble {
  x: number;
  y: number;
  radius: number;
  speed: number;
  swayPhase: number;
  swaySpeed: number;
  swayAmp: number;
  alpha: number;
  baseAlpha: number;
}

interface JTNightBuilding {
  x: number;
  w: number;
  h: number;
  windows: { col: number; row: number; color: string }[];
}

interface JTNightShard {
  angle: number;
  lengthRatio: number;
  progress: number;
}

interface JTNightMeteor {
  active: boolean;
  startX: number;
  startY: number;
  curX: number;
  curY: number;
  endX: number;
  endY: number;
  len: number;
  speed: number;
  progress: number;
  alpha: number;
}

interface JTNightOffscreenCache {
  width: number;
  height: number;
  colorKey: string;
  qualityStep: 'low' | 'balanced' | 'high';
  bgCanvas: HTMLCanvasElement;
  bubbleSprite: HTMLCanvasElement;
  dotSprite: HTMLCanvasElement;
  streakSprite: HTMLCanvasElement;
}

function createBubbleSprite(colorHex: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const grad = ctx.createRadialGradient(16, 16, 8, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0)');
  grad.addColorStop(0.65, colorHex);
  grad.addColorStop(0.85, 'rgba(255, 255, 255, 0.9)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(16, 16, 15, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

function createDotSprite(centerColor: string, glowColor: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const grad = ctx.createRadialGradient(8, 8, 1, 8, 8, 8);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.35, centerColor);
  grad.addColorStop(0.75, glowColor);
  grad.addColorStop(1, 'transparent');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(8, 8, 8, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

function createStreakSprite(headColor: string, tailColor: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const grad = ctx.createLinearGradient(0, 8, 64, 8);
  grad.addColorStop(0, 'transparent');
  grad.addColorStop(0.65, tailColor);
  grad.addColorStop(0.95, headColor);
  grad.addColorStop(1, '#ffffff');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, 8);
  ctx.lineTo(64, 5);
  ctx.lineTo(64, 11);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(62, 8, 2, 0, Math.PI * 2);
  ctx.fill();

  return canvas;
}

function renderJTNightBackground(
  width: number,
  height: number,
  colors: { main: string; secondary: string; accent: string; mainRgba: (a: number) => string; secondaryRgba: (a: number) => string; accentRgba: (a: number) => string },
  staticStars: JTNightStaticStar[],
  buildings: JTNightBuilding[],
  qualityStep: 'low' | 'balanced' | 'high'
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(width));
  canvas.height = Math.max(1, Math.floor(height));
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // 1. Sky vertical gradient
  const skyGrad = ctx.createLinearGradient(0, 0, 0, height);
  skyGrad.addColorStop(0, '#04021a');
  skyGrad.addColorStop(0.48, '#0b0a3d');
  skyGrad.addColorStop(0.82, '#121244');
  skyGrad.addColorStop(1, '#05030e');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, width, height);

  // 2. Soft vertical horizon glow (smooth linear gradient without hard edges)
  const hGlowY = height * 0.70;
  const hGlowH = height * 0.24;
  const hGrad = ctx.createLinearGradient(0, hGlowY, 0, hGlowY + hGlowH);
  hGrad.addColorStop(0, 'transparent');
  hGrad.addColorStop(0.5, colors.secondaryRgba(0.24));
  hGrad.addColorStop(0.85, colors.mainRgba(0.14));
  hGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = hGrad;
  ctx.fillRect(0, hGlowY, width, hGlowH);

  // 3. Static faint star field baked in
  for (let i = 0; i < staticStars.length; i++) {
    const s = staticStars[i];
    ctx.fillStyle = s.isPeriwinkle ? colors.accentRgba(s.alpha * 0.55) : `rgba(255, 255, 255, ${(s.alpha * 0.55).toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(s.x * width, s.y * height, s.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // 4. Soft cloud bands (lower third) - omitted if quality is low
  if (qualityStep !== 'low') {
    for (let cl = 0; cl < 3; cl++) {
      const clY = height * (0.64 + cl * 0.05);
      const clW = width * 0.55;
      const clH = 26;
      const clX = (cl * 0.35 * width) % width;
      const cGrad = ctx.createRadialGradient(clX + clW / 2, clY, 8, clX + clW / 2, clY, clW / 2);
      cGrad.addColorStop(0, colors.secondaryRgba(0.12));
      cGrad.addColorStop(0.7, colors.secondaryRgba(0.03));
      cGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = cGrad;
      ctx.beginPath();
      ctx.ellipse(clX + clW / 2, clY, clW / 2, clH, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 5. City skyline silhouette along bottom (darker so playback controls stay readable)
  ctx.fillStyle = '#03020a';
  for (let b = 0; b < buildings.length; b++) {
    const bd = buildings[b];
    const bx = bd.x * width;
    const bw = bd.w * width + 2;
    const bh = bd.h * height;
    const by = height - bh;
    ctx.fillRect(bx, by, bw, bh);

    for (let w = 0; w < bd.windows.length; w++) {
      const win = bd.windows[w];
      ctx.fillStyle = win.color;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(bx + win.col * bw, by + win.row * bh, 2, 3);
    }
    ctx.fillStyle = '#03020a';
    ctx.globalAlpha = 1.0;
  }

  // 6. Power pole & sagging wires on left
  const poleX = width * 0.08;
  const poleTopY = height * 0.68;
  const poleBottomY = height;
  ctx.strokeStyle = '#05040e';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(poleX, poleBottomY);
  ctx.lineTo(poleX, poleTopY);
  ctx.stroke();

  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(poleX - 16, poleTopY + 10);
  ctx.lineTo(poleX + 16, poleTopY + 10);
  ctx.moveTo(poleX - 12, poleTopY + 28);
  ctx.lineTo(poleX + 12, poleTopY + 28);
  ctx.stroke();

  ctx.fillStyle = '#1e1b4b';
  ctx.fillRect(poleX - 17, poleTopY + 7, 3, 4);
  ctx.fillRect(poleX + 14, poleTopY + 7, 3, 4);
  ctx.fillRect(poleX - 13, poleTopY + 25, 3, 4);
  ctx.fillRect(poleX + 10, poleTopY + 25, 3, 4);

  // Wires
  ctx.strokeStyle = 'rgba(10, 8, 26, 0.85)';
  ctx.lineWidth = 1.0;
  ctx.beginPath();
  ctx.moveTo(0, poleTopY + 4);
  ctx.quadraticCurveTo(poleX * 0.5, poleTopY + 12, poleX - 16, poleTopY + 10);
  ctx.quadraticCurveTo(width * 0.22, poleTopY + 36, width * 0.42, poleTopY + 72);

  ctx.moveTo(0, poleTopY + 14);
  ctx.quadraticCurveTo(poleX * 0.5, poleTopY + 22, poleX + 16, poleTopY + 10);
  ctx.quadraticCurveTo(width * 0.26, poleTopY + 42, width * 0.48, poleTopY + 80);

  ctx.moveTo(0, poleTopY + 30);
  ctx.quadraticCurveTo(poleX * 0.5, poleTopY + 38, poleX + 12, poleTopY + 28);
  ctx.quadraticCurveTo(width * 0.28, poleTopY + 54, width * 0.52, poleTopY + 92);
  ctx.stroke();

  return canvas;
}

function getJTNightCache(
  cache: JTNightOffscreenCache | null,
  width: number,
  height: number,
  colorKey: string,
  qualityStep: 'low' | 'balanced' | 'high',
  colors: { main: string; secondary: string; accent: string; mainRgba: (a: number) => string; secondaryRgba: (a: number) => string; accentRgba: (a: number) => string },
  staticStars: JTNightStaticStar[],
  buildings: JTNightBuilding[]
): JTNightOffscreenCache {
  const floorW = Math.max(1, Math.floor(width));
  const floorH = Math.max(1, Math.floor(height));
  if (
    cache &&
    cache.width === floorW &&
    cache.height === floorH &&
    cache.colorKey === colorKey &&
    cache.qualityStep === qualityStep
  ) {
    return cache;
  }

  // Free previous canvas memory immediately
  if (cache) {
    cache.bgCanvas.width = 0;
    cache.bgCanvas.height = 0;
    cache.bubbleSprite.width = 0;
    cache.bubbleSprite.height = 0;
    cache.dotSprite.width = 0;
    cache.dotSprite.height = 0;
    cache.streakSprite.width = 0;
    cache.streakSprite.height = 0;
  }

  const bgCanvas = renderJTNightBackground(floorW, floorH, colors, staticStars, buildings, qualityStep);
  const bubbleSprite = createBubbleSprite(colors.accent);
  const dotSprite = createDotSprite('#ffffff', colors.accent);
  const streakSprite = createStreakSprite(colors.main, colors.accent);

  return {
    width: floorW,
    height: floorH,
    colorKey,
    qualityStep,
    bgCanvas,
    bubbleSprite,
    dotSprite,
    streakSprite,
  };
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

// Authentic default colors for kept themes when no cover is present
const THEME_ORIGINAL_COLORS: Record<string, { main: RGB; secondary: RGB; accent: RGB }> = {
  auto: { main: hexToRgb('#818cf8'), secondary: hexToRgb('#2a2fc9'), accent: hexToRgb('#c7d2fe') },
  jt_night: { main: hexToRgb('#818cf8'), secondary: hexToRgb('#2a2fc9'), accent: hexToRgb('#c7d2fe') },
  dark_spectrum: { main: hexToRgb('#00f0ff'), secondary: hexToRgb('#a855f7'), accent: hexToRgb('#ec4899') },
  cyber_city: { main: hexToRgb('#00f0ff'), secondary: hexToRgb('#ec4899'), accent: hexToRgb('#f59e0b') },
  fire_energy: { main: hexToRgb('#ff6a00'), secondary: hexToRgb('#dc2626'), accent: hexToRgb('#fbbf24') },
  rainy_night: { main: hexToRgb('#38bdf8'), secondary: hexToRgb('#1e293b'), accent: hexToRgb('#e0f2fe') },
  deep_ocean: { main: hexToRgb('#38bdf8'), secondary: hexToRgb('#0e7490'), accent: hexToRgb('#34d399') },
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
  currentTime = 0,
  isUiOverlayOpen = false,
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
  const isUiOverlayOpenRef = useRef(isUiOverlayOpen);
  isUiOverlayOpenRef.current = isUiOverlayOpen;

  // Auto-quality and frame-budget monitoring
  const autoQualityStepRef = useRef<'low' | 'balanced' | 'high'>(
    performanceMode === 'battery' ? 'low' : performanceMode === 'high' ? 'high' : 'balanced'
  );
  const frameTimesRef = useRef<number[]>([]);
  const under14DurationRef = useRef<number>(0);
  const lastDiagBroadcastRef = useRef<number>(0);
  const lastDrawDurationRef = useRef<number>(1.5);

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
  const bubblesRef = useRef<BubbleParticle[]>([]);
  const bokehRef = useRef<BokehOrb[]>([]);
  const ripplesRef = useRef<{ x: number; y: number; radius: number; maxRadius: number; alpha: number }[]>([]);

  const currentTimeRef = useRef<number>(currentTime ?? 0);
  currentTimeRef.current = currentTime ?? 0;

  // JT Night dedicated persistent state (with offscreen caching, smooth 96-pt ring, and capped shards)
  const jtNightRef = useRef<{
    stars: JTNightStar[];
    staticStars: JTNightStaticStar[];
    bubbles: JTNightBubble[];
    buildings: JTNightBuilding[];
    shards: JTNightShard[];
    beatMeteor: JTNightMeteor | null;
    lastBeatMeteorTime: number;
    ringRotation: number;
    ringPoints: Float32Array;
    badgeScale: number;
    cache: JTNightOffscreenCache | null;
  }>({
    stars: [],
    staticStars: [],
    bubbles: [],
    buildings: [],
    shards: [],
    beatMeteor: null,
    lastBeatMeteorTime: 0,
    ringRotation: 0,
    ringPoints: new Float32Array(96),
    badgeScale: 1.0,
    cache: null,
  });

  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || scene === 'off') {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      return;
    }

    const ctx = (canvas.getContext('2d', { alpha: false, desynchronized: true }) || canvas.getContext('2d')) as CanvasRenderingContext2D | null;
    if (!ctx) return;

    // Responsive scaling with full screen, rotation and devicePixelRatio support
    // Cap DPR to 1.5 on mobile devices (2.0 only in High Quality mode) to keep GPU fill-rate light
    const updateDimensions = () => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const isHighQuality = autoQualityStepRef.current === 'high' && performanceModeRef.current === 'high';
      const maxDpr = isHighQuality ? 2.0 : 1.5;
      const dpr = performanceModeRef.current === 'battery' || autoQualityStepRef.current === 'low'
        ? 1.0
        : Math.min(window.devicePixelRatio || 1, maxDpr);
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    updateDimensions();
    const resizeObserver = new ResizeObserver(() => updateDimensions());
    resizeObserver.observe(canvas);
    window.addEventListener('resize', updateDimensions);
    window.addEventListener('orientationchange', updateDimensions);

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

    // Initialize JT Night particles:
    // Balanced: 48 bubbles, 120 twinkling stars (140 static stars in background)
    // Battery/Low: 24 bubbles, 60 twinkling stars (80 static stars in background)
    // High: 70 bubbles, 160 twinkling stars (180 static stars in background)
    const isBattery = performanceMode === 'battery';
    const isHigh = performanceMode === 'high';
    const jtStaticStarCount = isBattery ? 80 : isHigh ? 180 : 140;
    const jtStaticStars: JTNightStaticStar[] = Array.from({ length: jtStaticStarCount }, () => ({
      x: Math.random(),
      y: Math.random() * 0.72,
      radius: Math.random() * 0.9 + 0.4,
      alpha: Math.random() * 0.6 + 0.2,
      isPeriwinkle: Math.random() > 0.45,
    }));

    const jtStarCount = isBattery ? 60 : isHigh ? 160 : 120;
    const jtStars: JTNightStar[] = Array.from({ length: jtStarCount }, () => ({
      x: Math.random(),
      y: Math.random() * 0.75,
      radius: Math.random() * 1.0 + 0.5,
      twinklePhase: Math.random() * Math.PI * 2,
      twinkleSpeed: Math.random() * 2.2 + 1.0,
      baseAlpha: Math.random() * 0.5 + 0.4,
    }));

    const jtBubbleCount = isBattery ? 24 : isHigh ? 70 : 48;
    const jtBubbles: JTNightBubble[] = Array.from({ length: jtBubbleCount }, () => ({
      x: Math.random() * 800,
      y: Math.random() * 800,
      radius: Math.random() * 10 + 3,
      speed: Math.random() * 0.8 + 0.35,
      swayPhase: Math.random() * Math.PI * 2,
      swaySpeed: Math.random() * 1.0 + 0.5,
      swayAmp: Math.random() * 1.4 + 0.5,
      alpha: Math.random() * 0.4 + 0.3,
      baseAlpha: Math.random() * 0.4 + 0.3,
    }));

    // City skyline buildings along bottom
    const buildingCount = 12;
    let curBx = 0;
    const jtBuildings: JTNightBuilding[] = [];
    for (let b = 0; b < buildingCount; b++) {
      const bWidth = Math.random() * 0.055 + 0.05;
      const bHeight = Math.random() * 0.12 + 0.06;
      const windows: { col: number; row: number; color: string }[] = [];
      const windowCols = Math.floor(Math.random() * 3 + 2);
      const windowRows = Math.floor(Math.random() * 5 + 3);
      for (let r = 0; r < windowRows; r++) {
        for (let c = 0; c < windowCols; c++) {
          if (Math.random() > 0.42) {
            const winColors = ['#fef08a', '#93c5fd', '#c7d2fe', '#ffffff'];
            windows.push({
              col: c / windowCols,
              row: r / windowRows,
              color: winColors[Math.floor(Math.random() * winColors.length)],
            });
          }
        }
      }
      jtBuildings.push({
        x: curBx,
        w: bWidth,
        h: bHeight,
        windows,
      });
      curBx += bWidth - 0.005;
    }

    jtNightRef.current = {
      stars: jtStars,
      staticStars: jtStaticStars,
      bubbles: jtBubbles,
      buildings: jtBuildings,
      shards: [],
      beatMeteor: null,
      lastBeatMeteorTime: 0,
      ringRotation: 0,
      ringPoints: new Float32Array(96),
      badgeScale: 1.0,
      cache: null,
    };

    let isDocumentVisible = true;
    const handleVisibilityChange = () => {
      isDocumentVisible = document.visibilityState === 'visible';
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // =========================================================================
    // MAIN ANIMATION LOOP (driven by dt, with UI throttling & Auto-Quality)
    // =========================================================================
    const render = (currentTime: number) => {
      animFrameRef.current = requestAnimationFrame(render);

      if (!isDocumentVisible) return;

      const now = currentTime;
      const rawDelta = lastFrameTimeRef.current > 0 ? now - lastFrameTimeRef.current : 16.6;

      // Throttle to 15fps (~66ms) when UI sheets/menus/dialogs are open so the UI runs silk-smooth
      if (isUiOverlayOpenRef.current && rawDelta < 66) {
        return;
      }

      const targetDelta = performanceModeRef.current === 'battery' ? 1000 / 30 : 1000 / 60;
      if (!isUiOverlayOpenRef.current && rawDelta < targetDelta - 2) return;
      lastFrameTimeRef.current = now;

      // Frame time delta in seconds and scaled 60fps steps
      const dt = Math.max(0.001, Math.min(0.08, rawDelta / 1000));
      const dtStep = dt / 0.016666;

      // Rolling 60-frame history for Auto-Quality step
      const frameTimes = frameTimesRef.current;
      frameTimes.push(rawDelta);
      if (frameTimes.length > 60) frameTimes.shift();

      let avgFrameTime = 16.6;
      if (frameTimes.length >= 10) {
        let sum = 0;
        for (let i = 0; i < frameTimes.length; i++) sum += frameTimes[i];
        avgFrameTime = sum / frameTimes.length;
      }

      // Auto-quality adjustment
      if (avgFrameTime > 22 && autoQualityStepRef.current !== 'low') {
        if (autoQualityStepRef.current === 'high') {
          autoQualityStepRef.current = 'balanced';
        } else {
          autoQualityStepRef.current = 'low';
        }
        under14DurationRef.current = 0;
      } else if (avgFrameTime < 14 && autoQualityStepRef.current !== 'high' && performanceModeRef.current !== 'battery') {
        under14DurationRef.current += dt;
        if (under14DurationRef.current >= 5.0) {
          if (autoQualityStepRef.current === 'low') {
            autoQualityStepRef.current = 'balanced';
          } else if (performanceModeRef.current === 'high') {
            autoQualityStepRef.current = 'high';
          }
          under14DurationRef.current = 0;
        }
      } else {
        under14DurationRef.current = 0;
      }

      const drawStartTime = performance.now();

      const currentPerf = performanceModeRef.current;
      const isHighQuality = autoQualityStepRef.current === 'high' && currentPerf === 'high';
      const maxDpr = isHighQuality ? 2.0 : 1.5;
      const dpr = currentPerf === 'battery' || autoQualityStepRef.current === 'low'
        ? 1.0
        : Math.min(window.devicePixelRatio || 1, maxDpr);

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

      // Physics smoothing scaled by dtStep
      smoothedBassRef.current += (rawBass - smoothedBassRef.current) * Math.min(1.0, 0.18 * dtStep);
      smoothedMidRef.current += (rawMid - smoothedMidRef.current) * Math.min(1.0, 0.15 * dtStep);
      smoothedHighRef.current += (rawHigh - smoothedHighRef.current) * Math.min(1.0, 0.22 * dtStep);
      smoothedVolRef.current += (rawVol - smoothedVolRef.current) * Math.min(1.0, 0.14 * dtStep);

      // Reaction strength multiplier (Low: 0.6x, Medium: 1.0x, High: 1.5x)
      const currentReaction = reactionStrengthRef.current || 'medium';
      const reactionMult = currentReaction === 'low' ? 0.6 : currentReaction === 'high' ? 1.5 : 1.0;

      const sBass = Math.min(1.0, smoothedBassRef.current * reactionMult);
      const sMid = Math.min(1.0, smoothedMidRef.current * reactionMult);
      const sHigh = Math.min(1.0, smoothedHighRef.current * reactionMult);
      const sVol = Math.min(1.0, smoothedVolRef.current * reactionMult);

      animTimeRef.current += dt;
      const t = animTimeRef.current;

      // Dynamic Beat Detection Transient
      const beatThreshold = currentReaction === 'high' ? 0.52 : currentReaction === 'low' ? 0.72 : 0.62;
      const beatCooldown = currentReaction === 'high' ? 220 : currentReaction === 'low' ? 320 : 260;
      const isBeat = rawBass > beatThreshold && currentTime - lastBeatTimeRef.current > beatCooldown;
      if (isBeat) {
        lastBeatTimeRef.current = currentTime;
      }

      // Map legacy or resolve active scene name
      const activeSceneProp = sceneRef.current;
      let resolvedScene: CinematicScene = activeSceneProp;
      if (activeSceneProp === 'auto') {
        autoCooldownRef.current += 1;
        if (autoCooldownRef.current > 400) {
          let detected: CinematicScene = internalSceneRef.current;
          if (sBass > 0.65) {
            const highBassPool: CinematicScene[] = ['fire_energy', 'cyber_city', 'jt_night'];
            detected = highBassPool[Math.floor(Math.random() * highBassPool.length)];
          } else if (sBass > 0.45 && sHigh > 0.45) {
            const energyPool: CinematicScene[] = ['jt_night', 'cyber_city', 'dark_spectrum'];
            detected = energyPool[Math.floor(Math.random() * energyPool.length)];
          } else if (sMid > 0.45 && sHigh > 0.4) {
            const midPool: CinematicScene[] = ['jt_night', 'dark_spectrum', 'deep_ocean'];
            detected = midPool[Math.floor(Math.random() * midPool.length)];
          } else if (sVol < 0.28 && sBass < 0.3) {
            detected = Math.random() > 0.5 ? 'deep_ocean' : 'rainy_night';
          } else {
            detected = Math.random() > 0.5 ? 'jt_night' : 'dark_spectrum';
          }

          if (detected !== internalSceneRef.current) {
            internalSceneRef.current = detected;
            autoCooldownRef.current = 0;
            if (onAutoSceneDetermined) onAutoSceneDetermined(detected);
          }
        }
        resolvedScene = internalSceneRef.current;
      }

      // If resolvedScene is any removed or unrecognized theme, switch to dark_spectrum
      const VALID_THEMES: CinematicScene[] = ['jt_night', 'dark_spectrum', 'cyber_city', 'fire_energy', 'rainy_night', 'deep_ocean'];
      if (!VALID_THEMES.includes(resolvedScene)) {
        resolvedScene = 'dark_spectrum';
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
      // 6. JT NIGHT 🌙 (Deep indigo-midnight sky, twinkling stars, city skyline,
      //    drifting bubbles, badge with JT / JTEC, reactive soundwave ring & song timer)
      // =======================================================================
      else if (resolvedScene === 'jt_night') {
        const jtNight = jtNightRef.current;
        const colorKey = `${colors.main}-${colors.secondary}-${colors.accent}`;
        const cache = getJTNightCache(
          jtNight.cache,
          width,
          height,
          colorKey,
          autoQualityStepRef.current,
          colors,
          jtNight.staticStars,
          jtNight.buildings
        );
        jtNight.cache = cache;

        // 1. Pre-rendered Background with subtle bass zoom (1.00x - 1.02x)
        const sceneZoom = 1.0 + 0.02 * sBass;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(sceneZoom, sceneZoom);
        ctx.translate(-cx, -cy);
        ctx.drawImage(cache.bgCanvas, 0, 0, width, height);

        // 2. Twinkling Stars (drawn via pre-rendered dotSprite, zero shadowBlur)
        for (let i = 0; i < jtNight.stars.length; i++) {
          const s = jtNight.stars[i];
          const twinkle = 0.4 + 0.6 * Math.sin(s.twinklePhase + t * s.twinkleSpeed);
          const sAlpha = Math.min(1.0, s.baseAlpha * twinkle * (1.0 + sHigh * 1.2));
          ctx.globalAlpha = sAlpha;
          const sSize = s.radius * 2;
          ctx.drawImage(cache.dotSprite, s.x * width - s.radius, s.y * height - s.radius, sSize, sSize);
        }
        ctx.globalAlpha = 1.0;

        // 3. Ambient Shooting Star (streakSprite)
        const ambCycle = (t * 0.16) % 1;
        if (ambCycle > 0.05 && ambCycle < 0.45) {
          const ambProg = (ambCycle - 0.05) / 0.40;
          const ambAlpha = Math.sin(ambProg * Math.PI) * 0.85;
          const msX = width * 0.06 + ambProg * (width * 0.28);
          const msY = height * 0.06 + ambProg * (height * 0.16);
          ctx.save();
          ctx.translate(msX, msY);
          ctx.rotate(0.54);
          ctx.globalAlpha = ambAlpha;
          ctx.drawImage(cache.streakSprite, -50, -6, 50, 12);
          ctx.restore();
        }

        // 4. Beat Meteor (triggered on heavy bass drop, at most once per 4s)
        const nowMs = performance.now();
        if (isBeat && sBass > 0.65 && nowMs - jtNight.lastBeatMeteorTime > 4000) {
          jtNight.lastBeatMeteorTime = nowMs;
          const startX = width * (0.05 + Math.random() * 0.35);
          const startY = height * (0.04 + Math.random() * 0.16);
          jtNight.beatMeteor = {
            active: true,
            startX,
            startY,
            curX: startX,
            curY: startY,
            endX: startX,
            endY: startY,
            len: 70,
            speed: 1,
            progress: 0,
            alpha: 1.0,
          };
        }
        if (jtNight.beatMeteor && jtNight.beatMeteor.active) {
          const bm = jtNight.beatMeteor;
          bm.progress += 0.045 * dtStep;
          if (bm.progress >= 1.0) {
            bm.active = false;
          } else {
            const travel = width * 0.42;
            const headX = bm.startX + Math.cos(0.56) * travel * bm.progress;
            const headY = bm.startY + Math.sin(0.56) * travel * bm.progress;
            ctx.save();
            ctx.translate(headX, headY);
            ctx.rotate(0.56);
            ctx.globalAlpha = (1 - bm.progress) * 0.9;
            ctx.drawImage(cache.streakSprite, -bm.len, -7, bm.len, 14);
            ctx.restore();
          }
        }

        // 5. Bubbles (drawn via pre-rendered bubbleSprite, zero shadowBlur)
        for (let i = 0; i < jtNight.bubbles.length; i++) {
          const b = jtNight.bubbles[i];
          b.y -= b.speed * (1 + sHigh * 1.2) * dtStep;
          if (b.y < -20) {
            b.y = height + 20;
            b.x = Math.random() * width;
          }
          const sway = Math.sin(t * b.swaySpeed + b.swayPhase) * b.swayAmp;
          const bx = b.x + sway;
          const bAlpha = Math.min(1.0, b.baseAlpha * (0.7 + sHigh * 0.5));
          ctx.globalAlpha = bAlpha;
          const bDiam = b.radius * 2;
          ctx.drawImage(cache.bubbleSprite, bx - b.radius, b.y - b.radius, bDiam, bDiam);
        }
        ctx.globalAlpha = 1.0;

        // 6. Center Badge & Smooth 96-Point Reactive Ring
        const badgeY = height * 0.40;
        const badgeRadius = Math.max(50, Math.min(width * 0.19, height * 0.22));

        // Badge scale pulse on bass: fast attack, slow release, scale 1.00 to 1.05
        const targetBadgeScale = 1.0 + 0.05 * sBass;
        if (targetBadgeScale > jtNight.badgeScale) {
          jtNight.badgeScale += (targetBadgeScale - jtNight.badgeScale) * Math.min(1.0, 0.45 * dtStep);
        } else {
          jtNight.badgeScale += (targetBadgeScale - jtNight.badgeScale) * Math.min(1.0, 0.09 * dtStep);
        }

        // 48 frequency bins, spatial smoothing [1, 2, 3, 2, 1], mirrored to 96 points
        const maxOffset = badgeRadius * 0.12;
        const raw48 = new Float32Array(48);
        const freqLen = freq ? freq.length : 0;
        for (let k = 0; k < 48; k++) {
          if (freq && freqLen > 0) {
            const binIdx = Math.min(freqLen - 1, Math.floor(Math.pow(k / 48, 1.25) * Math.min(freqLen, 128)));
            raw48[k] = (freq[binIdx] / 255) * reactionMult;
          } else {
            raw48[k] = 0;
          }
        }

        // Spatial kernel smoothing
        const smoothed48 = new Float32Array(48);
        for (let k = 0; k < 48; k++) {
          let wSum = 0;
          let valSum = 0;
          for (let offset = -2; offset <= 2; offset++) {
            const w = offset === 0 ? 3 : Math.abs(offset) === 1 ? 2 : 1;
            const idx = Math.max(0, Math.min(47, k + offset));
            valSum += raw48[idx] * w;
            wSum += w;
          }
          smoothed48[k] = valSum / wSum;
        }

        // Temporal smoothing per point (attack ~0.35, release ~0.08)
        const ringPoints = jtNight.ringPoints;
        for (let p = 0; p < 96; p++) {
          const bin = p < 48 ? p : 95 - p;
          const targetOffset = Math.min(maxOffset, smoothed48[bin] * maxOffset);
          const curOffset = ringPoints[p];
          if (targetOffset > curOffset) {
            ringPoints[p] += (targetOffset - curOffset) * Math.min(1.0, 0.35 * dtStep);
          } else {
            ringPoints[p] += (targetOffset - curOffset) * Math.min(1.0, 0.08 * dtStep);
          }
        }
        jtNight.ringRotation += (0.002 + sMid * 0.003) * dtStep;

        ctx.save();
        ctx.translate(cx, badgeY);
        ctx.scale(jtNight.badgeScale, jtNight.badgeScale);

        // Thin smooth inner circle stays steady
        ctx.strokeStyle = 'rgba(199, 210, 254, 0.40)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(0, 0, badgeRadius + 3, 0, Math.PI * 2);
        ctx.stroke();

        // 96-point smooth quadratic midpoint curve (continuous wave, no jagged segments)
        const points: { x: number; y: number }[] = [];
        const ringRot = jtNight.ringRotation;
        for (let p = 0; p < 96; p++) {
          const ang = (p / 96) * Math.PI * 2 + ringRot;
          const r = badgeRadius + 4 + ringPoints[p];
          points.push({ x: Math.cos(ang) * r, y: Math.sin(ang) * r });
        }

        ctx.strokeStyle = colors.accent;
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        const firstMidX = (points[0].x + points[95].x) / 2;
        const firstMidY = (points[0].y + points[95].y) / 2;
        ctx.moveTo(firstMidX, firstMidY);
        for (let p = 0; p < 96; p++) {
          const nextP = (p + 1) % 96;
          const midX = (points[p].x + points[nextP].x) / 2;
          const midY = (points[p].y + points[nextP].y) / 2;
          ctx.quadraticCurveTo(points[p].x, points[p].y, midX, midY);
        }
        ctx.closePath();
        ctx.stroke();

        // Subtle beat shards (at most 6 thin triangular shards on strong beats, ~250ms fade)
        if (isBeat && sBass > 0.65 && jtNight.shards.length === 0) {
          const shardCount = Math.min(6, Math.floor(Math.random() * 3 + 4));
          for (let s = 0; s < shardCount; s++) {
            jtNight.shards.push({
              angle: (s / shardCount) * Math.PI * 2 + Math.random() * 0.4,
              lengthRatio: 0.10,
              progress: 0,
            });
          }
        }
        for (let s = jtNight.shards.length - 1; s >= 0; s--) {
          const sh = jtNight.shards[s];
          sh.progress += 0.065 * dtStep;
          if (sh.progress >= 1.0) {
            jtNight.shards.splice(s, 1);
            continue;
          }
          const shAlpha = (1 - sh.progress) * 0.75;
          const shDist = badgeRadius + 4 + sh.progress * (badgeRadius * 0.12);
          const shLen = badgeRadius * sh.lengthRatio * (1 - sh.progress * 0.3);
          const cosA = Math.cos(sh.angle);
          const sinA = Math.sin(sh.angle);
          const tipX = cosA * (shDist + shLen);
          const tipY = sinA * (shDist + shLen);
          const baseLeftX = Math.cos(sh.angle - 0.04) * shDist;
          const baseLeftY = Math.sin(sh.angle - 0.04) * shDist;
          const baseRightX = Math.cos(sh.angle + 0.04) * shDist;
          const baseRightY = Math.sin(sh.angle + 0.04) * shDist;

          ctx.fillStyle = colors.accentRgba(shAlpha);
          ctx.beginPath();
          ctx.moveTo(tipX, tipY);
          ctx.lineTo(baseLeftX, baseLeftY);
          ctx.lineTo(baseRightX, baseRightY);
          ctx.closePath();
          ctx.fill();
        }

        // Black circular badge fill
        ctx.fillStyle = '#03020a';
        ctx.beginPath();
        ctx.arc(0, 0, badgeRadius, 0, Math.PI * 2);
        ctx.fill();

        // White-periwinkle rim
        ctx.strokeStyle = '#e0e7ff';
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.arc(0, 0, badgeRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Crown drawn INSIDE the badge, ABOVE "JT" letters (not on the ring)
        const crownW = badgeRadius * 0.36;
        const crownH = badgeRadius * 0.18;
        const crownBaseY = -badgeRadius * 0.50;
        const crownTopY = crownBaseY - crownH;

        ctx.save();
        ctx.fillStyle = '#e0e7ff';
        ctx.beginPath();
        ctx.moveTo(-crownW / 2, crownBaseY);
        ctx.lineTo(-crownW / 2, crownTopY + crownH * 0.35);
        ctx.lineTo(-crownW * 0.22, crownTopY + crownH * 0.7);
        ctx.lineTo(0, crownTopY);
        ctx.lineTo(crownW * 0.22, crownTopY + crownH * 0.7);
        ctx.lineTo(crownW / 2, crownTopY + crownH * 0.35);
        ctx.lineTo(crownW / 2, crownBaseY);
        ctx.closePath();
        ctx.fill();

        // Crown dots
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-crownW / 2, crownTopY + crownH * 0.35, 1.4, 0, Math.PI * 2);
        ctx.arc(0, crownTopY, 1.8, 0, Math.PI * 2);
        ctx.arc(crownW / 2, crownTopY + crownH * 0.35, 1.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Monogram "JT" and "JTEC" inside badge
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, badgeRadius - 2, 0, Math.PI * 2);
        ctx.clip();

        const jtFontSize = Math.round(badgeRadius * 0.72);
        ctx.font = `italic 900 ${jtFontSize}px "Montserrat", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#f8fafc';
        ctx.fillText('JT', 0, badgeRadius * 0.02);

        const jtecFontSize = Math.round(badgeRadius * 0.16);
        ctx.font = `800 ${jtecFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.fillStyle = colors.accentRgba(0.85);
        ctx.fillText('JTEC', 0, badgeRadius * 0.46);

        // Light shimmer diagonal sweep
        const shimmerCycle = (t * 0.25) % 1;
        const shimmerBandX = -badgeRadius * 1.6 + shimmerCycle * (badgeRadius * 3.2);
        ctx.save();
        ctx.translate(shimmerBandX, 0);
        ctx.rotate(-0.4);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.fillRect(-15, -badgeRadius * 1.5, 30, badgeRadius * 3);
        ctx.restore();

        ctx.restore(); // end clip

        // 7. Song Timer: Positioned BELOW the ring with at least 16px of clear space
        const curSeconds = currentTimeRef.current || 0;
        const timerM = Math.floor(curSeconds / 60);
        const timerS = Math.floor(curSeconds % 60);
        const timerText = `${timerM}:${timerS.toString().padStart(2, '0')}`;

        const timerFontSize = Math.max(13, Math.round(width * 0.038));
        ctx.font = `italic 500 ${timerFontSize}px "Georgia", "Times New Roman", serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#ffffff';
        // badgeRadius * 1.25 + 24 ensures at least 16px clear space beneath the 12% wave offset
        ctx.fillText(timerText, 0, badgeRadius * 1.25 + 24);

        ctx.restore(); // end badge transform
        ctx.restore(); // end scene zoom
      }

      ctx.restore();

      // Track draw time and broadcast telemetry once per second
      const lastDrawDuration = performance.now() - drawStartTime;
      lastDrawDurationRef.current = lastDrawDuration;

      if (now - lastDiagBroadcastRef.current >= 1000) {
        lastDiagBroadcastRef.current = now;
        const fps = Math.min(120, Math.round(1000 / Math.max(1, avgFrameTime)));
        const activeStars = resolvedScene === 'jt_night' ? jtNightRef.current.stars.length : 0;
        const activeBubbles = resolvedScene === 'jt_night' ? jtNightRef.current.bubbles.length : 0;
        VisualizerDiagnostics.updateStats({
          theme: resolvedScene,
          avgFrameTimeMs: parseFloat(avgFrameTime.toFixed(1)),
          drawTimeMs: parseFloat(lastDrawDuration.toFixed(1)),
          fps,
          qualityStep: autoQualityStepRef.current,
          bubblesCount: activeBubbles,
          starsCount: activeStars,
        });
      }
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('resize', updateDimensions);
      window.removeEventListener('orientationchange', updateDimensions);
      resizeObserver.disconnect();

      // Free GPU textures on unmount or scene change
      if (jtNightRef.current.cache) {
        jtNightRef.current.cache.bgCanvas.width = 0;
        jtNightRef.current.cache.bgCanvas.height = 0;
        jtNightRef.current.cache.bubbleSprite.width = 0;
        jtNightRef.current.cache.bubbleSprite.height = 0;
        jtNightRef.current.cache.dotSprite.width = 0;
        jtNightRef.current.cache.dotSprite.height = 0;
        jtNightRef.current.cache.streakSprite.width = 0;
        jtNightRef.current.cache.streakSprite.height = 0;
        jtNightRef.current.cache = null;
      }
    };
  }, [scene, performanceMode, isActive]);

  return (
    <div className={`relative overflow-hidden pointer-events-none ${className}`}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />
    </div>
  );
};
