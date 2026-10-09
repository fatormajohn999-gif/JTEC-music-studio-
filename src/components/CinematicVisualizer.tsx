import React, { useEffect, useRef } from 'react';
import { CinematicScene, PerformanceMode, ArtworkPalette } from '../types/music';
import { audioEngine } from '../services/audioEngine';

interface CinematicVisualizerProps {
  scene: CinematicScene;
  performanceMode: PerformanceMode;
  palette: ArtworkPalette;
  isActive: boolean;
  className?: string;
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

export const CinematicVisualizer: React.FC<CinematicVisualizerProps> = ({
  scene,
  performanceMode,
  palette,
  isActive,
  className = '',
  onAutoSceneDetermined,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const internalSceneRef = useRef<CinematicScene>('dark_spectrum');

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

  // Specialized state refs for 3 new ninja scenes
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isActive || scene === 'off') {
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
      vx: (Math.random() - 0.2) * 2 + 1,
      vy: Math.random() * 1.5 + 0.8,
      rot: Math.random() * Math.PI * 2,
      vRot: (Math.random() - 0.5) * 0.06,
      size: Math.random() * 6 + 5,
      alpha: Math.random() * 0.6 + 0.35,
    }));

    const bubbleCount = performanceMode === 'battery' ? 18 : performanceMode === 'balanced' ? 32 : 50;
    bubblesRef.current = Array.from({ length: bubbleCount }, () => ({
      x: Math.random() * 800,
      y: Math.random() * 800,
      radius: Math.random() * 7 + 3,
      speed: Math.random() * 1.2 + 0.6,
      wobblePhase: Math.random() * Math.PI * 2,
      wobbleSpeed: Math.random() * 0.05 + 0.02,
      alpha: Math.random() * 0.5 + 0.3,
    }));

    // City / Rainy night bokeh orbs
    const bokehColors = ['#f59e0b', '#06b6d4', '#ec4899', '#3b82f6', '#ef4444', '#10b981'];
    bokehRef.current = Array.from({ length: 14 }, () => ({
      x: Math.random() * 800,
      y: Math.random() * 350 + 80,
      radius: Math.random() * 38 + 20,
      color: bokehColors[Math.floor(Math.random() * bokehColors.length)],
      alpha: Math.random() * 0.25 + 0.1,
      pulsePhase: Math.random() * Math.PI * 2,
    }));

    const targetFps = performanceMode === 'battery' ? 30 : 60;
    const frameInterval = 1000 / targetFps;

    let isDocumentVisible = !document.hidden;
    const handleVisibilityChange = () => {
      isDocumentVisible = !document.hidden;
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // =========================================================================
    // RENDER LOOP
    // =========================================================================
    const render = (currentTime: number) => {
      animFrameRef.current = requestAnimationFrame(render);
      if (!isDocumentVisible) return;

      const elapsed = currentTime - lastFrameTimeRef.current;
      if (elapsed < frameInterval - 1) return;
      lastFrameTimeRef.current = currentTime - (elapsed % frameInterval);

      const dpr = performanceMode === 'battery' ? 1 : Math.min(window.devicePixelRatio || 1, 2);
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

      const sBass = smoothedBassRef.current;
      const sMid = smoothedMidRef.current;
      const sHigh = smoothedHighRef.current;
      const sVol = smoothedVolRef.current;

      animTimeRef.current += 0.016;
      const t = animTimeRef.current;

      // Dynamic Beat Detection Transient
      const isBeat = rawBass > 0.65 && currentTime - lastBeatTimeRef.current > 300;
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
      let resolvedScene: CinematicScene = scene;
      if (scene === 'auto') {
        autoCooldownRef.current += 1;
        if (autoCooldownRef.current > 400) {
          let detected: CinematicScene = internalSceneRef.current;
          if (sBass > 0.65) {
            const highBassPool: CinematicScene[] = ['fire_energy', 'cyber_city', 'shadow_strike'];
            detected = highBassPool[Math.floor(Math.random() * highBassPool.length)];
          } else if (sBass > 0.45 && sHigh > 0.45) {
            const energyPool: CinematicScene[] = ['anime_ninja', 'music_tunnel', 'shuriken_storm'];
            detected = energyPool[Math.floor(Math.random() * energyPool.length)];
          } else if (sMid > 0.45 && sHigh > 0.4) {
            const midPool: CinematicScene[] = ['galaxy', 'samurai', 'smoke_vanish'];
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
        if (scene === 'aurora' || scene === 'prism') resolvedScene = 'dark_spectrum';
        else if (scene === 'neon_city' || scene === 'meteor_shower') resolvedScene = 'cyber_city';
        else if (scene === 'deep_space' || scene === 'black_hole') resolvedScene = 'galaxy';
        else if (scene === 'inferno') resolvedScene = 'fire_energy';
        else if (scene === 'dream') resolvedScene = 'rainy_night';
        else if (scene === 'energy' || scene === 'neural_network') resolvedScene = 'anime_ninja';
        else if (scene === 'nature') resolvedScene = 'samurai';
        else if (scene === 'ocean') resolvedScene = 'deep_ocean';
        else if (scene === 'vortex') resolvedScene = 'music_tunnel';
        else if (scene === 'crystal') resolvedScene = 'minimal_pro';
      }

      ctx.save();
      ctx.clearRect(0, 0, width, height);

      // =======================================================================
      // 1. DARK SPECTRUM 📊 (Dark realistic spectrum + waveform, no center circle)
      // =======================================================================
      if (resolvedScene === 'dark_spectrum') {
        // Dark matte studio gradient
        const bg = ctx.createLinearGradient(0, 0, 0, height);
        bg.addColorStop(0, '#04060b');
        bg.addColorStop(0.6, '#060a14');
        bg.addColorStop(1, '#020306');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, width, height);

        const barCount = performanceMode === 'battery' ? 36 : 56;
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
          floorGlow.addColorStop(0, `${palette.primary}33`);
          floorGlow.addColorStop(1, 'transparent');
          ctx.fillStyle = floorGlow;
          ctx.fillRect(0, baselineY - 40, width, 100);
        }

        // Draw spectrum bars + peak caps
        for (let i = 0; i < barCount; i++) {
          // Logarithmic bin distribution
          const binIndex = Math.min(
            freq ? freq.length - 1 : 0,
            Math.floor(Math.pow(i / barCount, 1.45) * ((freq?.length || 128) * 0.85)) + 1
          );
          const rawVal = freq && freq[binIndex] ? freq[binIndex] / 255 : 0;
          const boost = i < barCount * 0.3 ? 1.0 + sBass * 0.4 : 1.0 + sHigh * 0.35;
          const targetH = Math.max(4, rawVal * maxBarH * boost);

          // Update floating peak cap
          const currentPeak = peakCapsRef.current[i] || 0;
          if (targetH > currentPeak) {
            peakCapsRef.current[i] = targetH;
          } else {
            peakCapsRef.current[i] = Math.max(0, currentPeak - (performanceMode === 'battery' ? 3.5 : 2.2));
          }

          const bx = marginX + i * barSpacing + (barSpacing - barWidth) / 2;
          const by = baselineY - targetH;

          // Main vertical bar gradient
          const barGrad = ctx.createLinearGradient(bx, by, bx, baselineY);
          barGrad.addColorStop(0, i < barCount * 0.4 ? palette.primary : palette.secondary);
          barGrad.addColorStop(0.7, palette.accent);
          barGrad.addColorStop(1, 'rgba(15, 23, 42, 0.4)');

          ctx.fillStyle = barGrad;
          ctx.beginPath();
          ctx.roundRect(bx, by, barWidth, targetH, [barWidth / 2, barWidth / 2, 0, 0]);
          ctx.fill();

          // Glossy floor reflection
          const refH = targetH * 0.38;
          const refGrad = ctx.createLinearGradient(bx, baselineY, bx, baselineY + refH);
          refGrad.addColorStop(0, `${palette.primary}44`);
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
          const step = Math.max(1, Math.floor(timeDomain.length / (width * 0.8)));
          const waveStartX = width * 0.1;
          const waveW = width * 0.8;

          for (let x = 0; x < waveW; x += 4) {
            const idx = Math.floor((x / waveW) * timeDomain.length);
            const norm = (timeDomain[idx] - 128) / 128;
            const py = waveY + norm * waveAmp;
            if (x === 0) ctx.moveTo(waveStartX + x, py);
            else ctx.lineTo(waveStartX + x, py);
          }

          ctx.strokeStyle = palette.primary;
          ctx.lineWidth = 1.8;
          ctx.shadowColor = palette.primary;
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
        skyGrad.addColorStop(0.5, '#120524');
        skyGrad.addColorStop(1, '#1e0836');
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, width, height * 0.65);

        // Cyber synthwave distant sun/moon on the horizon
        const moonY = height * 0.42;
        const moonR = Math.min(cx, cy) * 0.35;
        const moonGrad = ctx.createRadialGradient(cx, moonY, 10, cx, moonY, moonR);
        moonGrad.addColorStop(0, '#f43f5e');
        moonGrad.addColorStop(0.7, '#ec4899');
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
              ctx.fillStyle = '#ef4444';
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
                ctx.fillStyle = (b + r) % 2 === 0 ? '#00f0ff' : '#f59e0b';
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
        ctx.strokeStyle = '#00f0ff';
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
        refGrad.addColorStop(0, 'rgba(236, 72, 153, 0.35)');
        refGrad.addColorStop(0.5, 'rgba(0, 240, 255, 0.2)');
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
        nebGrad1.addColorStop(0, 'rgba(168, 85, 247, 0.45)');
        nebGrad1.addColorStop(0.5, 'rgba(6, 182, 212, 0.25)');
        nebGrad1.addColorStop(1, 'transparent');
        ctx.fillStyle = nebGrad1;
        ctx.fillRect(0, 0, width, height);

        const nebGrad2 = ctx.createRadialGradient(cx - 30, cy + 20, 10, cx, cy, nebulaRad * 0.7);
        nebGrad2.addColorStop(0, 'rgba(244, 63, 94, 0.35)');
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
            ctx.fillStyle = s.hueOffset > 0 ? '#a5f3fc' : '#fbcfe8';
            ctx.globalAlpha = Math.min(1, (1 - s.z / 900) * (s.alpha * twinkle + sHigh * 0.5));
            ctx.beginPath();
            ctx.arc(px, py, rad, 0, Math.PI * 2);
            ctx.fill();

            // Star flare cross on high frequencies
            if (sHigh > 0.45 && rad > 2.0) {
              ctx.strokeStyle = '#ffffff';
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
        const pointsPerArm = performanceMode === 'battery' ? 35 : 60;
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
            const py = Math.sin(angle) * (dist * 0.42); // Elliptical projection

            const pSize = Math.max(1, (1 - p / pointsPerArm) * 3.5 + sBass * 1.5);
            ctx.fillStyle = a === 0 ? palette.primary : palette.secondary;
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
        fireBg.addColorStop(0.6, '#130302');
        fireBg.addColorStop(1, '#2a0602');
        ctx.fillStyle = fireBg;
        ctx.fillRect(0, 0, width, height);

        // Bottom roaring fire flame tongues
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
            fGrad.addColorStop(0, '#fff275');
            fGrad.addColorStop(0.3, '#ff7011');
            fGrad.addColorStop(1, '#990000');
          } else if (fl === 1) {
            fGrad.addColorStop(0, '#ff9900');
            fGrad.addColorStop(0.6, '#cc1100');
            fGrad.addColorStop(1, 'transparent');
          } else {
            fGrad.addColorStop(0, '#ff3300');
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

          ctx.fillStyle = `hsl(${e.hue}, 100%, ${65 + sHigh * 25}%)`;
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
        // Noir atmospheric foggy night
        const rainBg = ctx.createLinearGradient(0, 0, 0, height);
        rainBg.addColorStop(0, '#03050c');
        rainBg.addColorStop(0.7, '#070f1e');
        rainBg.addColorStop(1, '#020509');
        ctx.fillStyle = rainBg;
        ctx.fillRect(0, 0, width, height);

        // Ambient lightning flash on heavy sub-bass hits
        if (isBeat && sBass > 0.72) {
          ctx.fillStyle = 'rgba(219, 234, 254, 0.15)';
          ctx.fillRect(0, 0, width, height);
        }

        // Distant blurred city bokeh lights
        const bokehs = bokehRef.current;
        for (let i = 0; i < bokehs.length; i++) {
          const b = bokehs[i];
          const pulse = 1 + Math.sin(t * 2 + b.pulsePhase) * 0.15 + sBass * 0.2;
          const bRad = b.radius * pulse;

          const bGrad = ctx.createRadialGradient(b.x, b.y, 2, b.x, b.y, bRad);
          bGrad.addColorStop(0, b.color);
          bGrad.addColorStop(1, 'transparent');

          ctx.fillStyle = bGrad;
          ctx.globalAlpha = b.alpha * (0.8 + sVol * 0.5);
          ctx.beginPath();
          ctx.arc(b.x, b.y, bRad, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1.0;

        // Angled torrential rain streaks
        const rain = rainRef.current;
        ctx.strokeStyle = '#93c5fd';
        for (let i = 0; i < rain.length; i++) {
          const r = rain[i];
          r.y += r.speed * (1 + sMid * 0.8);
          r.x += (r.speed * 0.25); // Wind angle

          // Hit ground -> spawn ripple
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
        ctx.strokeStyle = '#60a5fa';
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

        // Foreground glass condensation & glistening droplets
        if (sHigh > 0.3) {
          ctx.fillStyle = '#ffffff';
          ctx.globalAlpha = sHigh * 0.6;
          for (let d = 0; d < 6; d++) {
            const dx = (width * 0.15) * d + 40;
            const dy = (height * 0.12) * ((d * 3) % 7) + 50;
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
        // Moonlight anime night sky
        const ninjaBg = ctx.createLinearGradient(0, 0, 0, height);
        ninjaBg.addColorStop(0, '#02040b');
        ninjaBg.addColorStop(0.5, '#081226');
        ninjaBg.addColorStop(1, '#02050c');
        ctx.fillStyle = ninjaBg;
        ctx.fillRect(0, 0, width, height);

        // Huge glowing full moon behind the warrior
        const moonX = cx;
        const moonY = cy * 0.65;
        const moonRadius = Math.min(cx, cy) * 0.45;

        const moonHalo = ctx.createRadialGradient(moonX, moonY, moonRadius * 0.4, moonX, moonY, moonRadius * 1.8);
        moonHalo.addColorStop(0, 'rgba(0, 240, 255, 0.4)');
        moonHalo.addColorStop(0.6, 'rgba(59, 130, 246, 0.15)');
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
        auraGrad.addColorStop(0, '#00f0ff');
        auraGrad.addColorStop(0.5, 'rgba(6, 182, 212, 0.45)');
        auraGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = auraGrad;
        ctx.globalAlpha = 0.65 + sBass * 0.35;
        ctx.beginPath();
        ctx.arc(ninjaX, ninjaY - 30, auraR, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;

        // Chakra electric lightning arcs crackling on high transients
        if (sHigh > 0.35) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.shadowColor = '#00f0ff';
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

        // Original Ninja Warrior Silhouette (crouched battle stance)
        ctx.save();
        ctx.translate(ninjaX, ninjaY);

        ctx.fillStyle = '#030509';
        ctx.strokeStyle = '#00f0ff';
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
        ctx.fillStyle = '#00f0ff';
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
        // Left bent knee
        ctx.moveTo(-12, -20);
        ctx.lineTo(-38, -8);
        ctx.lineTo(-44, 18);
        ctx.lineTo(-24, 18);
        ctx.lineTo(-20, -6);
        // Right thrust leg
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
        ctx.strokeStyle = '#00f0ff';
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
        // Dramatic blood-moon sunset twilight
        const samBg = ctx.createLinearGradient(0, 0, 0, height);
        samBg.addColorStop(0, '#0c0205');
        samBg.addColorStop(0.5, '#24080e');
        samBg.addColorStop(1, '#080104');
        ctx.fillStyle = samBg;
        ctx.fillRect(0, 0, width, height);

        // Giant crimson/gold eclipse moon
        const moonX = cx;
        const moonY = cy * 0.58;
        const moonR = Math.min(cx, cy) * 0.42;

        const redHalo = ctx.createRadialGradient(moonX, moonY, moonR * 0.5, moonX, moonY, moonR * 1.6);
        redHalo.addColorStop(0, 'rgba(239, 68, 68, 0.5)');
        redHalo.addColorStop(0.7, 'rgba(185, 28, 28, 0.15)');
        redHalo.addColorStop(1, 'transparent');
        ctx.fillStyle = redHalo;
        ctx.beginPath();
        ctx.arc(moonX, moonY, moonR * 1.6, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fee2e2';
        ctx.beginPath();
        ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
        ctx.fill();

        // Drifting Sakura cherry blossom petals tumbling in the wind
        const petals = petalsRef.current;
        for (let i = 0; i < petals.length; i++) {
          const p = petals[i];
          p.x += (p.vx + sMid * 2.5);
          p.y += p.vy + Math.sin(t * 2 + p.x * 0.01) * 0.8;
          p.rot += p.vRot;

          if (p.x > width + 30) p.x = -20;
          if (p.y > height + 20) p.y = -20;

          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = '#f472b6';
          ctx.globalAlpha = p.alpha;
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
        fogGrad.addColorStop(0, 'rgba(244, 114, 182, 0.25)');
        fogGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = fogGrad;
        ctx.fillRect(0, groundY - 30, width, 80);

        // Samurai Silhouette (standing with Katana & flowing cloak)
        ctx.save();
        ctx.translate(cx, groundY);

        ctx.fillStyle = '#040102';

        // Traditional Ronin Woven Hat (Kasa)
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
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = '#ffffff';
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.arc(-58, 2, 3 + sHigh * 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }

        ctx.restore();

        // Razor-sharp sword slash animation triggered on beats
        if (slashAnimRef.current.active) {
          const slash = slashAnimRef.current;
          slash.progress += 0.08;
          if (slash.progress >= 1.0) {
            slash.active = false;
          } else {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3.5;
            ctx.shadowColor = '#f43f5e';
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
        // Abyssal underwater depth gradient
        const oceanBg = ctx.createLinearGradient(0, 0, 0, height);
        oceanBg.addColorStop(0, '#041426');
        oceanBg.addColorStop(0.5, '#020c18');
        oceanBg.addColorStop(1, '#01050a');
        ctx.fillStyle = oceanBg;
        ctx.fillRect(0, 0, width, height);

        // Sunlight caustics / God rays beaming down through the surface
        const rayCount = 5;
        for (let r = 0; r < rayCount; r++) {
          const rayX = (width / rayCount) * r + Math.sin(t * 0.8 + r) * 35;
          const rayW = width * 0.22;

          const rayGrad = ctx.createLinearGradient(rayX, 0, rayX + 60, height);
          rayGrad.addColorStop(0, 'rgba(56, 189, 248, 0.25)');
          rayGrad.addColorStop(0.7, 'rgba(14, 165, 233, 0.05)');
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

          // Outer bubble rim
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1.2;
          ctx.globalAlpha = b.alpha;
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
          ctx.stroke();

          // Specular highlight gleam
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(b.x - b.radius * 0.35, b.y - b.radius * 0.35, b.radius * 0.25, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1.0;

        // Seabed floor with swaying kelp fronds
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
          ctx.fillStyle = '#34d399';
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

        const ringCount = performanceMode === 'battery' ? 12 : 20;
        const sides = 8; // Octagonal tunnel
        const speed = (t * (1.2 + sBass * 2.8 + sVol * 1.5)) % 1;

        // Draw concentric polygonal tunnel frames rushing toward viewer
        for (let r = 0; r < ringCount; r++) {
          const ringProgress = (r / ringCount + speed) % 1;
          // Exponential depth scale
          const scale = Math.pow(ringProgress, 2.8) * Math.min(cx, cy) * 1.5;
          if (scale < 5) continue;

          // Frequency harmonic vertex distortion
          const ringDistort = sBass * 22;

          ctx.beginPath();
          for (let s = 0; s < sides; s++) {
            const angle = (s * Math.PI * 2) / sides + t * 0.3;
            const freqVal = freq ? freq[(s * 12) % (freq.length || 1)] / 255 : 0;
            const rad = scale + freqVal * ringDistort;

            const px = cx + Math.cos(angle) * rad;
            const py = cy + Math.sin(angle) * (rad * 0.82); // Widescreen tunnel
            if (s === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();

          ctx.strokeStyle = r % 2 === 0 ? palette.primary : palette.accent;
          ctx.lineWidth = Math.max(1, ringProgress * 3.5);
          ctx.globalAlpha = Math.min(1, ringProgress * (0.4 + sVol * 0.6));
          ctx.stroke();
        }

        // Infinite perspective speed rails connecting vertices
        ctx.strokeStyle = palette.secondary;
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
        // Pure pitch black background
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

        // Audio measurement crosshairs at harmonics (Sub, Low, Mid, High)
        const markers = [0.2, 0.4, 0.6, 0.8];
        const labels = ['SUB', 'LOW', 'MID', 'HIGH'];
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
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
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Primary precise vector oscilloscope waveform
        if (timeDomain && timeDomain.length > 0) {
          ctx.beginPath();
          const waveStartX = width * 0.05;
          const waveW = width * 0.9;
          const step = Math.max(1, Math.floor(timeDomain.length / waveW));

          for (let x = 0; x < waveW; x += 3) {
            const idx = Math.min(timeDomain.length - 1, Math.floor((x / waveW) * timeDomain.length));
            const norm = (timeDomain[idx] - 128) / 128;
            const py = centerY + norm * amp;
            if (x === 0) ctx.moveTo(waveStartX + x, py);
            else ctx.lineTo(waveStartX + x, py);
          }

          ctx.strokeStyle = palette.primary;
          ctx.lineWidth = 2.0;
          ctx.shadowColor = palette.primary;
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

        // 1. Dark moody moonlit night sky
        const nightGrad = ctx.createLinearGradient(0, 0, 0, height);
        nightGrad.addColorStop(0, '#02040a');
        nightGrad.addColorStop(0.5, '#071022');
        nightGrad.addColorStop(0.85, '#0b162c');
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
          ctx.fillStyle = `rgba(224, 242, 254, ${starAlpha})`;
          ctx.fillRect(sx, sy, s.baseRadius, s.baseRadius);
        }

        // 2. Colossal Moon with soft ethereal bloom
        const moonX = width * 0.75;
        const moonY = height * 0.28;
        const moonR = Math.min(width, height) * 0.26;

        const moonHalo = ctx.createRadialGradient(moonX, moonY, moonR * 0.2, moonX, moonY, moonR * 2.2);
        moonHalo.addColorStop(0, 'rgba(56, 189, 248, 0.28)');
        moonHalo.addColorStop(0.5, 'rgba(30, 58, 138, 0.12)');
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

        // Subtle lunar craters for cinematic depth
        ctx.fillStyle = 'rgba(71, 85, 105, 0.18)';
        ctx.beginPath();
        ctx.arc(moonX - moonR * 0.3, moonY - moonR * 0.1, moonR * 0.25, 0, Math.PI * 2);
        ctx.arc(moonX + moonR * 0.2, moonY + moonR * 0.25, moonR * 0.22, 0, Math.PI * 2);
        ctx.arc(moonX - moonR * 0.1, moonY + moonR * 0.35, moonR * 0.18, 0, Math.PI * 2);
        ctx.fill();

        // 3. Volumetric Fog layers drifting across the rooftops (deep parallax)
        for (let f = 0; f < 3; f++) {
          const fogSpeed = (0.2 + f * 0.15);
          const fogOffset = (t * 40 * fogSpeed) % (width + 200);
          const fogY = height * (0.60 + f * 0.12);
          const fogGrad = ctx.createLinearGradient(0, fogY - 40, 0, fogY + 60);
          fogGrad.addColorStop(0, 'transparent');
          fogGrad.addColorStop(0.5, `rgba(148, 163, 184, ${0.08 + f * 0.04 + sBass * 0.05})`);
          fogGrad.addColorStop(1, 'transparent');
          ctx.fillStyle = fogGrad;

          ctx.beginPath();
          ctx.moveTo(-100, fogY);
          for (let x = -100; x <= width + 100; x += 40) {
            const wave = Math.sin((x + fogOffset) * 0.008 + f * 2) * 22;
            ctx.lineTo(x, fogY + wave);
          }
          ctx.lineTo(width + 100, height);
          ctx.lineTo(-100, height);
          ctx.closePath();
          ctx.fill();
        }

        // 4. Distant background rooftops (kawara ridges silhouette)
        ctx.fillStyle = '#060a16';
        ctx.beginPath();
        ctx.moveTo(0, height * 0.68);
        const bgRoofWidth = 140;
        for (let rx = 0; rx < width + bgRoofWidth; rx += bgRoofWidth) {
          ctx.lineTo(rx + 20, height * 0.62);
          ctx.lineTo(rx + bgRoofWidth * 0.5, height * 0.58);
          ctx.quadraticCurveTo(rx + bgRoofWidth * 0.8, height * 0.64, rx + bgRoofWidth, height * 0.68);
        }
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();
        ctx.fill();

        // 5. Main Midground Rooftops where the Ninja dashes
        const roofYBase = height * 0.76;
        ctx.fillStyle = '#04070f';
        ctx.beginPath();
        ctx.moveTo(0, roofYBase + 30);

        const getRoofY = (xPos: number) => {
          const cycle = ((xPos % 320) + 320) % 320;
          if (cycle < 60) {
            return roofYBase - Math.sin((cycle / 60) * Math.PI * 0.5) * 28;
          } else if (cycle < 220) {
            const norm = (cycle - 60) / 160;
            return roofYBase - 28 + norm * 35;
          } else {
            return roofYBase + 40;
          }
        };

        for (let x = 0; x <= width; x += 20) {
          ctx.lineTo(x, getRoofY(x));
        }
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();
        ctx.fill();

        // Moonlight highlights glistening on curved roof tiles
        ctx.strokeStyle = `rgba(186, 230, 253, ${0.28 + sHigh * 0.35})`;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        for (let x = 0; x <= width; x += 20) {
          const ry = getRoofY(x);
          if (x === 0) ctx.moveTo(x, ry);
          else ctx.lineTo(x, ry);
        }
        ctx.stroke();

        // Treble glints on roof tile dew
        if (sHigh > 0.35) {
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = '#38bdf8';
          ctx.shadowBlur = 6;
          for (let g = 0; g < 5; g++) {
            const gx = (width * 0.22) * g + ((t * 80) % 80);
            const gy = getRoofY(gx);
            ctx.beginPath();
            ctx.arc(gx, gy, 1.5, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.shadowBlur = 0;
        }

        // 6. Ninja Physics & Dash Motion
        const runSpeed = 4.2 + sBass * 4.8;
        state.ninjaX += runSpeed;
        if (state.ninjaX > width + 80) {
          state.ninjaX = -60;
          state.trail = [];
        }
        state.stride += 0.28 + sBass * 0.2;

        const baseRoofY = getRoofY(state.ninjaX);
        const isLeaping = (state.ninjaX % 320) > 200;
        const jumpHeight = isLeaping ? Math.sin(((state.ninjaX % 320 - 200) / 120) * Math.PI) * 55 : 0;
        state.ninjaY = baseRoofY - 28 - jumpHeight;

        // Record historical afterimages
        state.trail.unshift({
          x: state.ninjaX,
          y: state.ninjaY,
          stride: state.stride,
          alpha: 0.55,
        });
        if (state.trail.length > 7) state.trail.pop();

        // Helper to draw realistic ninja silhouette
        const drawNinjaSilhouette = (nx: number, ny: number, strideVal: number, alpha: number, isGhost: boolean) => {
          ctx.save();
          ctx.translate(nx, ny);
          ctx.globalAlpha = alpha;

          if (isGhost) {
            ctx.fillStyle = 'rgba(14, 165, 233, 0.25)';
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
            ctx.lineWidth = 1.2;
          } else {
            ctx.fillStyle = '#03050a';
            ctx.strokeStyle = 'rgba(224, 242, 254, 0.6)';
            ctx.lineWidth = 1;
          }

          // Flowing headband scarf
          const scarfFlutter = Math.sin(t * 14 + strideVal) * (14 + sBass * 18);
          ctx.beginPath();
          ctx.moveTo(-10, -56);
          ctx.quadraticCurveTo(-28 + scarfFlutter * 0.5, -58 + scarfFlutter * 0.4, -46 + scarfFlutter, -48 + scarfFlutter * 0.8);
          ctx.lineTo(-44 + scarfFlutter, -42 + scarfFlutter * 0.8);
          ctx.quadraticCurveTo(-26 + scarfFlutter * 0.5, -52 + scarfFlutter * 0.4, -10, -52);
          ctx.closePath();
          ctx.fillStyle = isGhost ? 'rgba(56, 189, 248, 0.4)' : '#38bdf8';
          ctx.fill();

          // Ninja Head & Cowl
          ctx.fillStyle = isGhost ? 'rgba(14, 165, 233, 0.3)' : '#03050a';
          ctx.beginPath();
          ctx.arc(0, -56, 11, 0, Math.PI * 2);
          ctx.fill();

          // Mask slit
          if (!isGhost) {
            ctx.fillStyle = '#e0f2fe';
            ctx.fillRect(4, -58, 6, 2.5);
          }

          // Torso
          ctx.beginPath();
          ctx.moveTo(-12, -45);
          ctx.lineTo(14, -45);
          ctx.lineTo(8, -14);
          ctx.lineTo(-10, -14);
          ctx.closePath();
          ctx.fill();

          // Ninjato scabbard on back
          ctx.strokeStyle = isGhost ? 'rgba(56, 189, 248, 0.3)' : '#475569';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(-20, -60);
          ctx.lineTo(12, -18);
          ctx.stroke();

          // Shinobi Legs in running stride
          const legPhase = Math.sin(strideVal);
          const backLegPhase = -legPhase;

          ctx.beginPath();
          ctx.moveTo(2, -14);
          ctx.lineTo(14 + legPhase * 16, -2);
          ctx.lineTo(24 + legPhase * 24, 16);
          ctx.lineWidth = 4.5;
          ctx.strokeStyle = isGhost ? 'rgba(14, 165, 233, 0.3)' : '#03050a';
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(-6, -14);
          ctx.lineTo(-16 + backLegPhase * 16, -2);
          ctx.lineTo(-24 + backLegPhase * 24, 14);
          ctx.lineWidth = 4.5;
          ctx.stroke();

          // Reaching arm
          ctx.beginPath();
          ctx.moveTo(10, -42);
          ctx.lineTo(26, -32);
          ctx.lineTo(36, -26);
          ctx.lineWidth = 3.5;
          ctx.stroke();

          ctx.restore();
        };

        // Render afterimages
        for (let i = state.trail.length - 1; i >= 1; i--) {
          const ghost = state.trail[i];
          const fadeAlpha = (1 - i / state.trail.length) * 0.42;
          drawNinjaSilhouette(ghost.x, ghost.y, ghost.stride, fadeAlpha, true);
        }

        // Render main ninja
        drawNinjaSilhouette(state.ninjaX, state.ninjaY, state.stride, 1.0, false);

        // 7. Bass Hit: Fast Slash with Bright Blade Streak
        if (isBeat || (rawBass > 0.65 && !state.slashActive)) {
          state.slashActive = true;
          state.slashProgress = 0;
          state.slashX1 = state.ninjaX + 20;
          state.slashY1 = state.ninjaY - 45;
          state.slashX2 = state.ninjaX + 130 + sBass * 60;
          state.slashY2 = state.ninjaY + 20;

          for (let sp = 0; sp < 16; sp++) {
            const angle = (Math.random() - 0.5) * Math.PI * 0.8 + 0.2;
            const spSpeed = Math.random() * 8 + 6;
            state.sparks.push({
              x: state.slashX1 + (state.slashX2 - state.slashX1) * Math.random(),
              y: state.slashY1 + (state.slashY2 - state.slashY1) * Math.random(),
              vx: Math.cos(angle) * spSpeed,
              vy: Math.sin(angle) * spSpeed,
              alpha: 1.0,
              size: Math.random() * 2.5 + 1.2,
              color: Math.random() > 0.3 ? '#38bdf8' : '#ffffff',
            });
          }
        }

        // Render active blade streak
        if (state.slashActive) {
          state.slashProgress += 0.08;
          if (state.slashProgress >= 1.0) {
            state.slashActive = false;
          } else {
            const streakAlpha = Math.sin(state.slashProgress * Math.PI);
            ctx.save();
            ctx.globalAlpha = streakAlpha;

            const midX = (state.slashX1 + state.slashX2) * 0.5 + 25;
            const midY = (state.slashY1 + state.slashY2) * 0.5 - 35;

            // Outer cyan glow
            ctx.strokeStyle = '#00f0ff';
            ctx.lineWidth = 14 * streakAlpha;
            ctx.shadowColor = '#38bdf8';
            ctx.shadowBlur = 24;
            ctx.beginPath();
            ctx.moveTo(state.slashX1, state.slashY1);
            ctx.quadraticCurveTo(midX, midY, state.slashX2, state.slashY2);
            ctx.stroke();

            // Inner razor white core
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 4 * streakAlpha;
            ctx.shadowBlur = 10;
            ctx.stroke();

            ctx.restore();
          }
        }

        // Update & render blade sparks
        for (let i = state.sparks.length - 1; i >= 0; i--) {
          const spk = state.sparks[i];
          spk.x += spk.vx;
          spk.y += spk.vy;
          spk.vy += 0.25;
          spk.alpha -= 0.035;

          if (spk.alpha <= 0) {
            state.sparks.splice(i, 1);
            continue;
          }

          ctx.fillStyle = spk.color;
          ctx.globalAlpha = spk.alpha;
          ctx.beginPath();
          ctx.arc(spk.x, spk.y, spk.size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1.0;
      }

      // =======================================================================
      // 12. SHURIKEN STORM ⭐ (Realistic metallic shuriken, dojo lantern glow & beam impact sparks)
      // =======================================================================
      else if (resolvedScene === 'shuriken_storm') {
        const storm = shurikenStormRef.current;

        // 1. Dark Dojo Interior Background
        const dojoBg = ctx.createLinearGradient(0, 0, 0, height);
        dojoBg.addColorStop(0, '#0a0502');
        dojoBg.addColorStop(0.5, '#160a04');
        dojoBg.addColorStop(1, '#080302');
        ctx.fillStyle = dojoBg;
        ctx.fillRect(0, 0, width, height);

        // Shoji paper lattice screens in the shadow backdrop
        ctx.strokeStyle = 'rgba(68, 36, 18, 0.4)';
        ctx.lineWidth = 1.5;
        const shojiW = 55;
        const shojiH = 75;
        for (let sx = 0; sx < width * 0.75; sx += shojiW) {
          ctx.beginPath();
          ctx.moveTo(sx, 0);
          ctx.lineTo(sx, height * 0.85);
          ctx.stroke();
        }
        for (let sy = 30; sy < height * 0.85; sy += shojiH) {
          ctx.beginPath();
          ctx.moveTo(0, sy);
          ctx.lineTo(width * 0.75, sy);
          ctx.stroke();
        }

        // Heavy ceiling timber beams
        ctx.fillStyle = '#0f0703';
        ctx.fillRect(0, 0, width, 32);
        ctx.fillStyle = '#1c0c05';
        ctx.fillRect(0, 28, width, 5);

        // Tatami floor base line
        const floorY = height * 0.86;
        ctx.fillStyle = '#0d0703';
        ctx.fillRect(0, floorY, width, height - floorY);
        ctx.strokeStyle = 'rgba(180, 83, 9, 0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, floorY);
        ctx.lineTo(width, floorY);
        ctx.stroke();

        // 2. Hanging Paper Lantern with warm golden glow
        const lanternX = width * 0.16;
        const lanternRopeL = 40;
        const lanternSway = Math.sin(t * 1.8) * 0.08;
        const lanternCenterY = 32 + lanternRopeL + 35;

        ctx.strokeStyle = '#29180c';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(lanternX, 32);
        ctx.lineTo(lanternX + Math.sin(lanternSway) * 5, 32 + lanternRopeL);
        ctx.stroke();

        const lanternPulse = 1.0 + sBass * 0.4;
        const lanternGlow = ctx.createRadialGradient(
          lanternX, lanternCenterY, 15,
          lanternX, lanternCenterY, 260 * lanternPulse
        );
        lanternGlow.addColorStop(0, 'rgba(245, 158, 11, 0.45)');
        lanternGlow.addColorStop(0.4, 'rgba(217, 119, 6, 0.18)');
        lanternGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = lanternGlow;
        ctx.beginPath();
        ctx.arc(lanternX, lanternCenterY, 260 * lanternPulse, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.translate(lanternX, lanternCenterY);
        ctx.rotate(lanternSway);

        const lGrad = ctx.createLinearGradient(-22, 0, 22, 0);
        lGrad.addColorStop(0, '#d97706');
        lGrad.addColorStop(0.5, '#fef3c7');
        lGrad.addColorStop(1, '#b45309');
        ctx.fillStyle = lGrad;
        ctx.beginPath();
        ctx.roundRect(-20, -32, 40, 64, 10);
        ctx.fill();

        ctx.fillStyle = '#1c0c05';
        ctx.fillRect(-22, -36, 44, 7);
        ctx.fillRect(-22, 29, 44, 7);

        ctx.fillStyle = 'rgba(69, 26, 3, 0.6)';
        ctx.font = 'bold 16px serif';
        ctx.fillText('忍', -8, 6);

        ctx.restore();

        // 3. Heavy Timber Post / Wooden Beam on Right
        const beamX = width * 0.82;
        const beamW = width * 0.12;
        const beamGrad = ctx.createLinearGradient(beamX, 0, beamX + beamW, 0);
        beamGrad.addColorStop(0, '#120803');
        beamGrad.addColorStop(0.2, '#2e1408');
        beamGrad.addColorStop(0.8, '#1e0c05');
        beamGrad.addColorStop(1, '#0a0402');
        ctx.fillStyle = beamGrad;
        ctx.fillRect(beamX, 0, beamW, height);

        ctx.strokeStyle = 'rgba(251, 191, 36, 0.12)';
        ctx.lineWidth = 1;
        for (let gx = beamX + 6; gx < beamX + beamW; gx += 8) {
          ctx.beginPath();
          ctx.moveTo(gx, 0);
          ctx.lineTo(gx, height);
          ctx.stroke();
        }

        const postShadow = ctx.createLinearGradient(beamX - 40, 0, beamX, 0);
        postShadow.addColorStop(0, 'transparent');
        postShadow.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
        ctx.fillStyle = postShadow;
        ctx.fillRect(beamX - 40, 0, 40, height);

        // 4. Shuriken Throw Simulation (bass increases speed and spark count)
        const now = currentTime;
        const throwInterval = isBeat || rawBass > 0.6 ? 120 : 420;
        if (now - storm.lastThrowTime > throwInterval) {
          storm.lastThrowTime = now;
          const throwY = Math.random() * (floorY - 120) + 70;
          const throwSpeed = 16 + sBass * 22;
          const shurikenSize = Math.random() * 8 + 22;

          storm.shurikens.push({
            x: -40,
            y: throwY,
            vx: throwSpeed,
            vy: (Math.random() - 0.5) * 2.5,
            rot: Math.random() * Math.PI * 2,
            rotSpeed: 0.55 + sBass * 0.55,
            size: shurikenSize,
            stuck: false,
            stickTime: 0,
            stickX: beamX + Math.random() * 12 + 4,
            stickY: throwY,
            targetX: beamX + Math.random() * 8 + 4,
            trail: [],
          });
        }

        // Helper to draw metallic 4-point shuriken
        const drawMetallicShuriken = (sx: number, sy: number, size: number, rotAngle: number, alpha: number) => {
          ctx.save();
          ctx.translate(sx, sy);
          ctx.rotate(rotAngle);
          ctx.globalAlpha = alpha;

          ctx.beginPath();
          for (let p = 0; p < 4; p++) {
            const angle = (p * Math.PI) / 2;
            const tipX = Math.cos(angle) * size;
            const tipY = Math.sin(angle) * size;
            const indentAngle = angle + Math.PI / 4;
            const indentR = size * 0.32;
            const inX = Math.cos(indentAngle) * indentR;
            const inY = Math.sin(indentAngle) * indentR;

            if (p === 0) ctx.moveTo(tipX, tipY);
            else ctx.lineTo(tipX, tipY);
            ctx.quadraticCurveTo(
              Math.cos(angle + 0.3) * size * 0.45,
              Math.sin(angle + 0.3) * size * 0.45,
              inX, inY
            );
          }
          ctx.closePath();

          const metalGrad = ctx.createLinearGradient(-size, -size, size, size);
          metalGrad.addColorStop(0, '#f8fafc');
          metalGrad.addColorStop(0.35, '#94a3b8');
          metalGrad.addColorStop(0.7, '#334155');
          metalGrad.addColorStop(1, '#0f172a');
          ctx.fillStyle = metalGrad;
          ctx.fill();

          ctx.fillStyle = '#0a0502';
          ctx.beginPath();
          ctx.arc(0, 0, size * 0.22, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
          ctx.lineWidth = 1;
          for (let p = 0; p < 4; p++) {
            const angle = (p * Math.PI) / 2;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(angle) * size, Math.sin(angle) * size);
            ctx.stroke();
          }

          // Treble light glints on blade tips
          if (sHigh > 0.3) {
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = '#ffffff';
            ctx.shadowBlur = 8;
            for (let p = 0; p < 4; p++) {
              const angle = (p * Math.PI) / 2;
              const bx = Math.cos(angle) * size;
              const by = Math.sin(angle) * size;
              ctx.beginPath();
              ctx.arc(bx, by, 1.8 * (1 + sHigh * 0.8), 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.shadowBlur = 0;
          }

          ctx.restore();
        };

        // Render shuriken
        for (let i = storm.shurikens.length - 1; i >= 0; i--) {
          const shk = storm.shurikens[i];

          if (!shk.stuck) {
            shk.x += shk.vx;
            shk.y += shk.vy;
            shk.rot += shk.rotSpeed;

            shk.trail.unshift({ x: shk.x, y: shk.y, rot: shk.rot, alpha: 0.35 });
            if (shk.trail.length > 3) shk.trail.pop();

            for (let tIdx = 0; tIdx < shk.trail.length; tIdx++) {
              const tr = shk.trail[tIdx];
              drawMetallicShuriken(tr.x, tr.y, shk.size, tr.rot, tr.alpha * 0.4);
            }

            drawMetallicShuriken(shk.x, shk.y, shk.size, shk.rot, 1.0);

            if (shk.x >= shk.targetX) {
              shk.stuck = true;
              shk.stickX = shk.targetX;
              shk.stickY = shk.y;
              shk.stickTime = 0;

              const sparkCount = Math.floor(14 + sBass * 28);
              for (let sp = 0; sp < sparkCount; sp++) {
                const spAngle = Math.PI + (Math.random() - 0.5) * 1.6;
                const spSpeed = Math.random() * 7 + 4;
                storm.sparks.push({
                  x: shk.stickX,
                  y: shk.stickY,
                  vx: Math.cos(spAngle) * spSpeed,
                  vy: Math.sin(spAngle) * spSpeed - 1.5,
                  life: 0,
                  maxLife: Math.random() * 24 + 18,
                  size: Math.random() * 2.2 + 1.2,
                  color: Math.random() > 0.4 ? '#f59e0b' : '#fef08a',
                });
              }
            }
          } else {
            shk.stickTime += 0.04;
            const wobble = Math.sin(shk.stickTime * 35) * Math.exp(-shk.stickTime * 3) * 0.15;
            drawMetallicShuriken(shk.stickX, shk.stickY, shk.size, shk.rot + wobble, Math.max(0, 1 - shk.stickTime * 0.08));

            if (shk.stickTime > 12) {
              storm.shurikens.splice(i, 1);
            }
          }
        }

        // Render sparks
        for (let sIdx = storm.sparks.length - 1; sIdx >= 0; sIdx--) {
          const spk = storm.sparks[sIdx];
          spk.life++;
          spk.x += spk.vx;
          spk.y += spk.vy;
          spk.vy += 0.28;
          spk.vx *= 0.96;

          const sparkAlpha = Math.max(0, 1 - spk.life / spk.maxLife);
          if (sparkAlpha <= 0) {
            storm.sparks.splice(sIdx, 1);
            continue;
          }

          ctx.fillStyle = spk.color;
          ctx.globalAlpha = sparkAlpha;
          ctx.beginPath();
          ctx.arc(spk.x, spk.y, spk.size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1.0;
      }

      // =======================================================================
      // 13. SMOKE VANISH 💨 (Dark bamboo forest, fireflies, smoke bomb burst & ninja vanish)
      // =======================================================================
      else if (resolvedScene === 'smoke_vanish') {
        const forest = smokeVanishRef.current;

        if (forest.ninjaX === 0) {
          forest.ninjaX = width * 0.45;
          forest.ninjaY = height * 0.68;
        }

        if (forest.fireflies.length === 0) {
          const flyCount = performanceMode === 'battery' ? 16 : 30;
          forest.fireflies = Array.from({ length: flyCount }, () => ({
            x: Math.random() * width,
            y: Math.random() * height * 0.85,
            baseX: Math.random() * width,
            baseY: Math.random() * height * 0.85,
            phase: Math.random() * Math.PI * 2,
            speed: Math.random() * 0.8 + 0.5,
            size: Math.random() * 2.2 + 1.4,
            color: Math.random() > 0.35 ? '#a3e635' : '#facc15',
          }));
        }

        // 1. Dark Misty Bamboo Forest Atmosphere
        const forestBg = ctx.createLinearGradient(0, 0, 0, height);
        forestBg.addColorStop(0, '#010503');
        forestBg.addColorStop(0.5, '#04130a');
        forestBg.addColorStop(0.85, '#071f11');
        forestBg.addColorStop(1, '#020904');
        ctx.fillStyle = forestBg;
        ctx.fillRect(0, 0, width, height);

        // Distant background bamboo stalks
        ctx.fillStyle = 'rgba(6, 44, 23, 0.45)';
        for (let bx = 15; bx < width; bx += 48) {
          const bW = 6;
          ctx.fillRect(bx, 0, bW, height);
          for (let by = 30; by < height; by += 85) {
            ctx.fillRect(bx - 1.5, by, bW + 3, 2.5);
          }
        }

        // Midground bamboo stalks
        ctx.fillStyle = '#062816';
        ctx.strokeStyle = 'rgba(34, 197, 94, 0.18)';
        ctx.lineWidth = 1;
        const midStalks = [width * 0.12, width * 0.28, width * 0.58, width * 0.76, width * 0.92];
        for (let ms = 0; ms < midStalks.length; ms++) {
          const mx = midStalks[ms];
          const mW = 16;
          ctx.fillRect(mx, 0, mW, height);
          ctx.strokeRect(mx, 0, mW, height);

          ctx.fillStyle = '#0f4627';
          for (let my = 50; my < height; my += 110) {
            ctx.fillRect(mx - 2, my, mW + 4, 4);
          }
          ctx.fillStyle = '#062816';
        }

        // 2. Bioluminescent Fireflies (flare with treble)
        for (let i = 0; i < forest.fireflies.length; i++) {
          const ff = forest.fireflies[i];
          ff.x = ff.baseX + Math.sin(t * ff.speed + ff.phase) * 35;
          ff.y = ff.baseY + Math.cos(t * ff.speed * 0.8 + ff.phase) * 25;

          const flyGlowR = ff.size * (3.5 + sHigh * 5.0);
          const flyAlpha = (Math.sin(t * 3 + ff.phase) * 0.35 + 0.65) * (0.6 + sHigh * 0.4);

          const glowGrad = ctx.createRadialGradient(ff.x, ff.y, 0, ff.x, ff.y, flyGlowR * 2.5);
          glowGrad.addColorStop(0, ff.color);
          glowGrad.addColorStop(0.5, 'rgba(163, 230, 53, 0.25)');
          glowGrad.addColorStop(1, 'transparent');
          ctx.fillStyle = glowGrad;
          ctx.globalAlpha = flyAlpha;
          ctx.beginPath();
          ctx.arc(ff.x, ff.y, flyGlowR * 2.5, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(ff.x, ff.y, ff.size * 0.8, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1.0;

        // 3. Smoke Bomb Detonation & Vanish on Bass Hit
        const now = currentTime;
        const bombCooldown = 1800;
        if ((isBeat || rawBass > 0.64) && now - forest.lastTeleportTime > bombCooldown) {
          forest.lastTeleportTime = now;
          forest.ninjaTargetAlpha = 0;

          const burstCount = 32;
          for (let p = 0; p < burstCount; p++) {
            const pAngle = Math.random() * Math.PI * 2;
            const pSpeed = Math.random() * 8.5 + 2.5;
            forest.puffs.push({
              x: forest.ninjaX + (Math.random() - 0.5) * 20,
              y: forest.ninjaY - 30 + (Math.random() - 0.5) * 30,
              vx: Math.cos(pAngle) * pSpeed,
              vy: Math.sin(pAngle) * pSpeed - 1.2,
              radius: Math.random() * 16 + 14,
              maxRadius: Math.random() * 55 + 45,
              alpha: 0.85,
              rot: Math.random() * Math.PI * 2,
              rotSpeed: (Math.random() - 0.5) * 0.06,
              color: Math.random() > 0.4 ? 'rgba(148, 163, 184,' : 'rgba(71, 85, 105,',
            });
          }

          setTimeout(() => {
            const poses: ('ground' | 'branch' | 'crouch')[] = ['ground', 'branch', 'crouch'];
            forest.currentPose = poses[Math.floor(Math.random() * poses.length)];
            const availableX = [width * 0.22, width * 0.38, width * 0.65, width * 0.78];
            forest.ninjaX = availableX[Math.floor(Math.random() * availableX.length)];
            forest.ninjaY = forest.currentPose === 'branch' ? height * 0.48 : height * 0.72;
            forest.ninjaTargetAlpha = 0.95;
          }, 350);
        }

        // Ambient gentle drifting smoke continuous puff generation
        if (Math.random() > 0.7) {
          forest.puffs.push({
            x: Math.random() * width,
            y: height * 0.78 + Math.random() * 40,
            vx: (Math.random() - 0.5) * 0.8,
            vy: -(Math.random() * 0.9 + 0.4),
            radius: Math.random() * 22 + 16,
            maxRadius: Math.random() * 70 + 50,
            alpha: 0.32,
            rot: Math.random() * Math.PI * 2,
            rotSpeed: (Math.random() - 0.5) * 0.02,
            color: 'rgba(100, 116, 139,',
          });
        }

        // Smooth ninja opacity transition
        forest.ninjaAlpha += (forest.ninjaTargetAlpha - forest.ninjaAlpha) * 0.08;

        // 4. Render Ninja Silhouette
        if (forest.ninjaAlpha > 0.02) {
          ctx.save();
          ctx.translate(forest.ninjaX, forest.ninjaY);
          ctx.globalAlpha = forest.ninjaAlpha;

          ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
          ctx.beginPath();
          ctx.ellipse(0, 8, 26, 7, 0, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#020503';
          ctx.strokeStyle = 'rgba(74, 222, 128, 0.4)';
          ctx.lineWidth = 1;

          if (forest.currentPose === 'crouch') {
            ctx.beginPath();
            ctx.arc(0, -38, 9, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillRect(-10, -28, 20, 18);
            ctx.beginPath();
            ctx.moveTo(-10, -12);
            ctx.lineTo(-24, 4);
            ctx.lineTo(-8, 6);
            ctx.lineTo(10, -12);
            ctx.lineTo(24, 4);
            ctx.lineTo(8, 6);
            ctx.closePath();
            ctx.fill();
          } else if (forest.currentPose === 'branch') {
            ctx.fillStyle = '#062816';
            ctx.fillRect(-35, 4, 70, 7);
            ctx.fillStyle = '#020503';

            ctx.beginPath();
            ctx.arc(0, -48, 9, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillRect(-8, -38, 16, 24);
            ctx.beginPath();
            ctx.moveTo(-8, -14);
            ctx.lineTo(-14, 4);
            ctx.lineTo(8, -14);
            ctx.lineTo(14, 4);
            ctx.closePath();
            ctx.fill();
          } else {
            ctx.beginPath();
            ctx.arc(0, -62, 10, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#bbf7d0';
            ctx.fillRect(2, -64, 5, 2);
            ctx.fillStyle = '#020503';

            const scarfWobble = Math.sin(t * 5) * 6;
            ctx.beginPath();
            ctx.moveTo(-8, -58);
            ctx.quadraticCurveTo(-18 + scarfWobble, -54, -28 + scarfWobble, -44);
            ctx.lineTo(-24 + scarfWobble, -40);
            ctx.quadraticCurveTo(-15 + scarfWobble, -52, -8, -54);
            ctx.closePath();
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(-11, -50);
            ctx.lineTo(11, -50);
            ctx.lineTo(9, -16);
            ctx.lineTo(-9, -16);
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
          smokeGrad.addColorStop(0, `${puff.color} ${puff.alpha})`);
          smokeGrad.addColorStop(0.5, `${puff.color} ${puff.alpha * 0.5})`);
          smokeGrad.addColorStop(1, `${puff.color} 0)`);

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
  }, [scene, performanceMode, palette, isActive]);

  return (
    <div className={`relative overflow-hidden pointer-events-none ${className}`}>
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
};
