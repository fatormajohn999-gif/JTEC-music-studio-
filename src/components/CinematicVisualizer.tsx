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
  currentTime?: number;
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
  isPeriwinkle: boolean;
}

interface JTNightBubble {
  x: number;
  y: number;
  radius: number;
  strokeWidth: number;
  speed: number;
  swayPhase: number;
  swaySpeed: number;
  swayAmp: number;
  alpha: number;
  baseAlpha: number;
}

interface JTNightSpawnRing {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  growthSpeed: number;
}

interface JTNightBuilding {
  x: number;
  w: number;
  h: number;
  windows: { col: number; row: number; color: string; twinkleOffset: number }[];
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
  const bubblesRef = useRef<BubbleParticle[]>([]);
  const bokehRef = useRef<BokehOrb[]>([]);
  const ripplesRef = useRef<{ x: number; y: number; radius: number; maxRadius: number; alpha: number }[]>([]);

  const currentTimeRef = useRef<number>(currentTime ?? 0);
  currentTimeRef.current = currentTime ?? 0;

  // JT Night dedicated persistent state
  const jtNightRef = useRef<{
    stars: JTNightStar[];
    bubbles: JTNightBubble[];
    spawnRings: JTNightSpawnRing[];
    buildings: JTNightBuilding[];
    beatMeteor: JTNightMeteor | null;
    lastBeatMeteorTime: number;
    ringRotation: number;
    spikes: number[];
  }>({
    stars: [],
    bubbles: [],
    spawnRings: [],
    buildings: [],
    beatMeteor: null,
    lastBeatMeteorTime: 0,
    ringRotation: 0,
    spikes: new Array(96).fill(0),
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

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Responsive scaling with full screen, rotation and devicePixelRatio support
    const updateDimensions = () => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dpr = performanceMode === 'battery' ? 1 : Math.min(window.devicePixelRatio || 1, 2);
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

    // Initialize JT Night particles (scaled by Engine & Battery profile: Battery 40%, Balanced 70%, High 100%)
    const jtStarCount = performanceMode === 'battery' ? 100 : performanceMode === 'balanced' ? 175 : 250;
    const jtStars: JTNightStar[] = Array.from({ length: jtStarCount }, () => ({
      x: Math.random(),
      y: Math.random() * 0.85,
      radius: Math.random() * 1.1 + 0.5, // 0.5 to 1.6 px
      twinklePhase: Math.random() * Math.PI * 2,
      twinkleSpeed: Math.random() * 2.5 + 1.2,
      baseAlpha: Math.random() * 0.5 + 0.45,
      isPeriwinkle: Math.random() > 0.4,
    }));

    const jtBubbleCount = performanceMode === 'battery' ? 32 : performanceMode === 'balanced' ? 56 : 80;
    const jtBubbles: JTNightBubble[] = Array.from({ length: jtBubbleCount }, () => ({
      x: Math.random() * 800,
      y: Math.random() * 800,
      radius: Math.random() * 12 + 2, // 2 to 14 px
      strokeWidth: Math.random() > 0.5 ? 2 : 1, // 1 to 2 px stroke
      speed: Math.random() * 0.9 + 0.4,
      swayPhase: Math.random() * Math.PI * 2,
      swaySpeed: Math.random() * 1.2 + 0.6,
      swayAmp: Math.random() * 1.6 + 0.6,
      alpha: Math.random() * 0.45 + 0.35,
      baseAlpha: Math.random() * 0.45 + 0.35,
    }));

    // Generate city skyline silhouette buildings along bottom
    const buildingCount = 14;
    let curBx = 0;
    const jtBuildings: JTNightBuilding[] = [];
    for (let b = 0; b < buildingCount; b++) {
      const bWidth = Math.random() * 0.05 + 0.05;
      const bHeight = Math.random() * 0.13 + 0.07;
      const windows: { col: number; row: number; color: string; twinkleOffset: number }[] = [];
      const windowCols = Math.floor(Math.random() * 3 + 2);
      const windowRows = Math.floor(Math.random() * 6 + 3);
      for (let r = 0; r < windowRows; r++) {
        for (let c = 0; c < windowCols; c++) {
          if (Math.random() > 0.38) {
            const winColors = ['#fef08a', '#93c5fd', '#c7d2fe', '#ffffff'];
            windows.push({
              col: c / windowCols,
              row: r / windowRows,
              color: winColors[Math.floor(Math.random() * winColors.length)],
              twinkleOffset: Math.random() * Math.PI * 2,
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
      bubbles: jtBubbles,
      spawnRings: [],
      buildings: jtBuildings,
      beatMeteor: null,
      lastBeatMeteorTime: 0,
      ringRotation: 0,
      spikes: new Array(96).fill(0),
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
        const blurMult = currentPerf === 'battery' ? 0 : currentPerf === 'balanced' ? 0.6 : 1.0;

        // Apply slow zoom in/out with the bass (1.00x to 1.03x)
        const sceneZoom = 1.0 + 0.03 * sBass;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(sceneZoom, sceneZoom);
        ctx.translate(-cx, -cy);

        // 1. SKY: Deep indigo to midnight vertical gradient (#04021a -> #0b0a3d -> #2a2fc9 horizon glow)
        const skyGrad = ctx.createLinearGradient(0, 0, 0, height);
        skyGrad.addColorStop(0, '#04021a');
        skyGrad.addColorStop(0.48, '#0b0a3d');
        skyGrad.addColorStop(0.82, '#141452');
        skyGrad.addColorStop(1, colors.secondaryRgba(0.55 + sBass * 0.45));
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, width, height);

        // Horizon glow pulsing with the bass
        const horizonGlowY = height * 0.88;
        const hGlow = ctx.createRadialGradient(cx, horizonGlowY, 15, cx, horizonGlowY, width * 0.75);
        hGlow.addColorStop(0, colors.secondaryRgba(0.4 + sBass * 0.5));
        hGlow.addColorStop(0.65, colors.mainRgba(0.18 + sBass * 0.25));
        hGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = hGlow;
        ctx.fillRect(0, horizonGlowY - 140, width, 200);

        // 2. STARS: ~250 tiny stars (radius 0.5 to 1.6 px, white to soft periwinkle)
        // Treble makes stars sparkle brighter
        const jtStars = jtNight.stars;
        for (let i = 0; i < jtStars.length; i++) {
          const s = jtStars[i];
          const sx = s.x * width;
          const sy = s.y * height;
          const twinkle = 0.4 + 0.6 * Math.sin(s.twinklePhase + t * s.twinkleSpeed);
          const sAlpha = Math.min(1.0, s.baseAlpha * twinkle * (1.0 + sHigh * 1.5));

          ctx.fillStyle = s.isPeriwinkle ? colors.accentRgba(sAlpha) : `rgba(255, 255, 255, ${sAlpha.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(sx, sy, s.radius, 0, Math.PI * 2);
          ctx.fill();
        }

        // 3. CLOUDS: Soft wispy cloud bands across the lower third (blurred low-opacity ellipses with blue glow)
        for (let cl = 0; cl < 4; cl++) {
          const clCenter = ((cl * 0.26 * width + Math.sin(t * 0.2 + cl * 1.8) * 45) % (width + 260)) - 130;
          const clY = height * (0.64 + cl * 0.045);
          const clW = width * 0.46;
          const clH = 22;

          const cGrad = ctx.createRadialGradient(clCenter + clW / 2, clY, 8, clCenter + clW / 2, clY, clW / 2);
          cGrad.addColorStop(0, colors.secondaryRgba(0.15 + sBass * 0.1));
          cGrad.addColorStop(0.7, colors.secondaryRgba(0.04));
          cGrad.addColorStop(1, 'transparent');

          ctx.fillStyle = cGrad;
          ctx.beginPath();
          ctx.ellipse(clCenter + clW / 2, clY, clW / 2, clH, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        // 4. SHOOTING STAR: Ambient streak in upper-left sky (fades and brightens slowly)
        const ambCycle = (t * 0.22) % 1;
        if (ambCycle > 0.06 && ambCycle < 0.48) {
          const ambProg = (ambCycle - 0.06) / 0.42;
          const ambAlpha = Math.sin(ambProg * Math.PI) * 0.9;
          const msX1 = width * 0.05 + ambProg * (width * 0.26);
          const msY1 = height * 0.07 + ambProg * (height * 0.15);
          const streakLen = 46;
          const msX2 = msX1 - streakLen * 0.86;
          const msY2 = msY1 - streakLen * 0.51;

          const msGrad = ctx.createLinearGradient(msX2, msY2, msX1, msY1);
          msGrad.addColorStop(0, 'transparent');
          msGrad.addColorStop(0.65, colors.accentRgba(ambAlpha * 0.45));
          msGrad.addColorStop(1, `rgba(255, 255, 255, ${ambAlpha.toFixed(3)})`);

          ctx.strokeStyle = msGrad;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(msX2, msY2);
          ctx.lineTo(msX1, msY1);
          ctx.stroke();

          // Glowing head
          ctx.fillStyle = '#ffffff';
          if (blurMult > 0) {
            ctx.shadowColor = colors.accent;
            ctx.shadowBlur = 8 * blurMult;
          }
          ctx.beginPath();
          ctx.arc(msX1, msY1, 1.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }

        // Beat Meteor: On strong beats, trigger short extra meteor crossing quickly (at most one every 4s)
        const nowMs = performance.now();
        if (isBeat && sBass > 0.58 && nowMs - jtNight.lastBeatMeteorTime > 4000) {
          jtNight.lastBeatMeteorTime = nowMs;
          const startX = width * (0.05 + Math.random() * 0.35);
          const startY = height * (0.04 + Math.random() * 0.16);
          const angle = 0.56;
          const travel = width * 0.46;
          jtNight.beatMeteor = {
            active: true,
            startX,
            startY,
            curX: startX,
            curY: startY,
            endX: startX + Math.cos(angle) * travel,
            endY: startY + Math.sin(angle) * travel,
            len: 80,
            speed: 1200,
            progress: 0,
            alpha: 1.0,
          };
        }

        if (jtNight.beatMeteor && jtNight.beatMeteor.active) {
          const bm = jtNight.beatMeteor;
          bm.progress += 0.042;
          if (bm.progress >= 1.0) {
            bm.active = false;
          } else {
            const headX = bm.startX + (bm.endX - bm.startX) * bm.progress;
            const headY = bm.startY + (bm.endY - bm.startY) * bm.progress;
            const tailX = headX - Math.cos(0.56) * bm.len;
            const tailY = headY - Math.sin(0.56) * bm.len;
            const bAlpha = (1 - bm.progress) * 0.95;

            const bGrad = ctx.createLinearGradient(tailX, tailY, headX, headY);
            bGrad.addColorStop(0, 'transparent');
            bGrad.addColorStop(0.65, colors.mainRgba(bAlpha * 0.5));
            bGrad.addColorStop(1, '#ffffff');

            ctx.strokeStyle = bGrad;
            ctx.lineWidth = 2.2;
            ctx.beginPath();
            ctx.moveTo(tailX, tailY);
            ctx.lineTo(headX, headY);
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            if (blurMult > 0) {
              ctx.shadowColor = colors.main;
              ctx.shadowBlur = 14 * blurMult;
            }
            ctx.beginPath();
            ctx.arc(headX, headY, 2.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
          }
        }

        // 5. CITY SKYLINE SILHOUETTE: at bottom with tiny windows twinkling in blue and warm white
        const bList = jtNight.buildings;
        ctx.fillStyle = '#04030d';
        for (let b = 0; b < bList.length; b++) {
          const bd = bList[b];
          const bx = bd.x * width;
          const bw = bd.w * width + 2;
          const bh = bd.h * height;
          const by = height - bh;
          ctx.fillRect(bx, by, bw, bh);

          for (let w = 0; w < bd.windows.length; w++) {
            const win = bd.windows[w];
            const wx = bx + win.col * bw;
            const wy = by + win.row * bh;
            const winTwinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 2.2 + win.twinkleOffset));
            ctx.fillStyle = win.color;
            ctx.globalAlpha = winTwinkle;
            ctx.fillRect(wx, wy, 2, 3);
          }
          ctx.fillStyle = '#04030d';
          ctx.globalAlpha = 1.0;
        }

        // Power pole and wires on left side
        const poleX = width * 0.08;
        const poleTopY = height * 0.68;
        const poleBottomY = height;
        ctx.strokeStyle = '#060512';
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

        ctx.strokeStyle = 'rgba(12, 10, 30, 0.75)';
        ctx.lineWidth = 1;
        const wireSag = Math.sin(t * 1.5) * 1.2;
        ctx.beginPath();
        ctx.moveTo(0, poleTopY + 4);
        ctx.quadraticCurveTo(poleX * 0.5, poleTopY + 12 + wireSag, poleX - 16, poleTopY + 10);
        ctx.quadraticCurveTo(width * 0.22, poleTopY + 36 + wireSag, width * 0.42, poleTopY + 72);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, poleTopY + 14);
        ctx.quadraticCurveTo(poleX * 0.5, poleTopY + 22 + wireSag, poleX + 16, poleTopY + 10);
        ctx.quadraticCurveTo(width * 0.26, poleTopY + 42 + wireSag, width * 0.48, poleTopY + 80);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, poleTopY + 30);
        ctx.quadraticCurveTo(poleX * 0.5, poleTopY + 38 + wireSag, poleX + 12, poleTopY + 28);
        ctx.quadraticCurveTo(width * 0.28, poleTopY + 54 + wireSag, width * 0.52, poleTopY + 92);
        ctx.stroke();

        // 6. BUBBLES: 70-90 hollow glowing rings drifting upward with gentle sideways sway
        // Treble makes them brighter and drift slightly faster
        const jtBubbles = jtNight.bubbles;
        for (let i = 0; i < jtBubbles.length; i++) {
          const b = jtBubbles[i];
          b.y -= b.speed * (1 + sHigh * 1.5);
          if (b.y < -20) {
            b.y = height + 20;
            b.x = Math.random() * width;
          }
          const sway = Math.sin(t * b.swaySpeed + b.swayPhase) * b.swayAmp;
          const bx = b.x + sway;
          const bAlpha = Math.min(1.0, b.baseAlpha * (0.75 + sHigh * 0.6));

          ctx.strokeStyle = colors.accentRgba(bAlpha);
          ctx.lineWidth = b.strokeWidth;
          if (blurMult > 0 && b.radius > 6) {
            ctx.shadowColor = colors.main;
            ctx.shadowBlur = 6 * blurMult;
          }
          ctx.beginPath();
          ctx.arc(bx, b.y, b.radius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }

        // On the beat, spawn 3 to 6 new rings near the center badge that grow outward and fade
        if (isBeat) {
          const spawnNum = Math.floor(Math.random() * 4 + 3);
          for (let sr = 0; sr < spawnNum; sr++) {
            jtNight.spawnRings.push({
              x: cx,
              y: height * 0.40,
              radius: width * 0.19 * (0.8 + Math.random() * 0.3),
              maxRadius: width * 0.19 * (1.4 + Math.random() * 0.8),
              alpha: 0.85,
              growthSpeed: 1.4 + Math.random() * 1.6,
            });
          }
        }

        for (let sr = jtNight.spawnRings.length - 1; sr >= 0; sr--) {
          const ring = jtNight.spawnRings[sr];
          ring.radius += ring.growthSpeed;
          const prog = ring.radius / ring.maxRadius;
          ring.alpha = Math.max(0, (1 - prog) * 0.85);
          if (ring.radius >= ring.maxRadius || ring.alpha <= 0.01) {
            jtNight.spawnRings.splice(sr, 1);
            continue;
          }
          ctx.strokeStyle = colors.accentRgba(ring.alpha);
          ctx.lineWidth = 1.4;
          if (blurMult > 0) {
            ctx.shadowColor = colors.main;
            ctx.shadowBlur = 8 * blurMult;
          }
          ctx.beginPath();
          ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }

        // 7. BADGE & REACTIVE RING:
        // Centered horizontally at roughly 40% height, diameter ~38% width
        const badgeY = height * 0.40;
        const badgeRadius = Math.max(50, Math.min(width * 0.19, height * 0.22));
        const badgeScale = 1.0 + 0.06 * sBass;

        // Reactive Ring: 96 points soundwave outline
        if (isBeat) {
          const spikeCount = Math.floor(Math.random() * 14 + 10);
          for (let k = 0; k < spikeCount; k++) {
            const idx = Math.floor(Math.random() * 96);
            jtNight.spikes[idx] = Math.random() * 26 + 14;
          }
        }
        for (let k = 0; k < 96; k++) {
          jtNight.spikes[k] *= 0.85;
        }
        jtNight.ringRotation += 0.003 + sMid * 0.005;

        ctx.save();
        ctx.translate(cx, badgeY);
        ctx.scale(badgeScale, badgeScale);

        // Thin smooth inner circle stays steady inside reactive ring
        ctx.strokeStyle = 'rgba(199, 210, 254, 0.45)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(0, 0, badgeRadius + 3, 0, Math.PI * 2);
        ctx.stroke();

        // Reactive soundwave ring (96 points driven by frequency bins)
        ctx.beginPath();
        const ringBright = Math.min(1.0, 0.65 + sBass * 0.45);
        ctx.strokeStyle = colors.accentRgba(ringBright);
        ctx.lineWidth = 1.8;
        if (blurMult > 0) {
          ctx.shadowColor = colors.main;
          ctx.shadowBlur = (10 + sBass * 8) * blurMult;
        }
        for (let p = 0; p < 96; p++) {
          const angle = (p / 96) * Math.PI * 2 + jtNight.ringRotation;
          const binIdx = Math.min(freq ? freq.length - 1 : 0, Math.floor(Math.pow(p / 96, 1.3) * (freq?.length || 128)));
          const freqVal = freq && freq[binIdx] ? freq[binIdx] / 255 : 0;
          const waveDist = badgeRadius + 8 + freqVal * 18 * reactionMult + jtNight.spikes[p];
          const px = Math.cos(angle) * waveDist;
          const py = Math.sin(angle) * waveDist;
          if (p === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Black circular badge fill
        ctx.fillStyle = '#05030e';
        ctx.beginPath();
        ctx.arc(0, 0, badgeRadius, 0, Math.PI * 2);
        ctx.fill();

        // Glowing white-periwinkle ring around badge edge
        ctx.strokeStyle = '#e0e7ff';
        ctx.lineWidth = 2.5;
        if (blurMult > 0) {
          ctx.shadowColor = colors.main;
          ctx.shadowBlur = 14 * blurMult;
        }
        ctx.beginPath();
        ctx.arc(0, 0, badgeRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Small crown at the top of the ring
        const crownW = badgeRadius * 0.42;
        const crownH = badgeRadius * 0.22;
        const crownTopY = -badgeRadius - crownH * 0.85;
        const crownBaseY = -badgeRadius - 1;

        ctx.save();
        const crownGrad = ctx.createLinearGradient(0, crownTopY, 0, crownBaseY);
        crownGrad.addColorStop(0, '#ffffff');
        crownGrad.addColorStop(0.5, '#e0e7ff');
        crownGrad.addColorStop(1, colors.main);
        ctx.fillStyle = crownGrad;
        if (blurMult > 0) {
          ctx.shadowColor = colors.accent;
          ctx.shadowBlur = 8 * blurMult;
        }
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

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-crownW / 2, crownTopY + crownH * 0.35, 1.6, 0, Math.PI * 2);
        ctx.arc(0, crownTopY, 2.0, 0, Math.PI * 2);
        ctx.arc(crownW / 2, crownTopY + crownH * 0.35, 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // In the center, letters "JT" in a bold, italic, modern display font with metallic gradient and glow
        const shimmerCycle = (t * 0.3) % 1;
        const shimmerBandX = -badgeRadius * 1.8 + shimmerCycle * (badgeRadius * 3.6);

        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, badgeRadius - 2, 0, Math.PI * 2);
        ctx.clip();

        const jtFontSize = Math.round(badgeRadius * 0.76);
        ctx.font = `italic 900 ${jtFontSize}px "Montserrat", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const jtGrad = ctx.createLinearGradient(0, -badgeRadius * 0.38, 0, badgeRadius * 0.2);
        jtGrad.addColorStop(0, '#ffffff');
        jtGrad.addColorStop(0.55, '#e0e7ff');
        jtGrad.addColorStop(1, colors.accent);

        if (blurMult > 0) {
          ctx.shadowColor = colors.main;
          ctx.shadowBlur = 10 * blurMult;
        }
        ctx.fillStyle = jtGrad;
        ctx.fillText('JT', 0, -badgeRadius * 0.06);
        ctx.shadowBlur = 0;

        // Underneath "JT", a small "JTEC" label
        const jtecFontSize = Math.round(badgeRadius * 0.17);
        ctx.font = `800 ${jtecFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.fillStyle = colors.accentRgba(0.85);
        ctx.fillText('JTEC', 0, badgeRadius * 0.42);

        // Light shimmer sweeps diagonally across letters every few seconds
        ctx.save();
        ctx.translate(shimmerBandX, 0);
        ctx.rotate(-0.4);
        const shimGrad = ctx.createLinearGradient(-25, 0, 25, 0);
        shimGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
        shimGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.42)');
        shimGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = shimGrad;
        ctx.fillRect(-25, -badgeRadius * 1.5, 50, badgeRadius * 3);
        ctx.restore();

        ctx.restore(); // end clip

        // 8. TIMER: Under the badge, elapsed time of the song (m:ss) in small italic serif font, white with soft glow
        const curSeconds = currentTimeRef.current || 0;
        const timerM = Math.floor(curSeconds / 60);
        const timerS = Math.floor(curSeconds % 60);
        const timerText = `${timerM}:${timerS.toString().padStart(2, '0')}`;

        const timerFontSize = Math.max(13, Math.round(width * 0.038));
        ctx.font = `italic 500 ${timerFontSize}px "Georgia", "Times New Roman", serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        if (blurMult > 0) {
          ctx.shadowColor = colors.accent;
          ctx.shadowBlur = 8 * blurMult;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillText(timerText, 0, badgeRadius + 26);
        ctx.shadowBlur = 0;

        ctx.restore(); // end badge transform
        ctx.restore(); // end scene zoom
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
      window.removeEventListener('resize', updateDimensions);
      window.removeEventListener('orientationchange', updateDimensions);
      resizeObserver.disconnect();
    };
  }, [scene, performanceMode, isActive]);

  return (
    <div className={`relative overflow-hidden pointer-events-none ${className}`}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />
    </div>
  );
};
