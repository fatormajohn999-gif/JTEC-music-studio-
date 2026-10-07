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
            detected = Math.random() > 0.5 ? 'fire_energy' : 'cyber_city';
          } else if (sBass > 0.45 && sHigh > 0.45) {
            detected = Math.random() > 0.5 ? 'anime_ninja' : 'music_tunnel';
          } else if (sMid > 0.45 && sHigh > 0.4) {
            detected = Math.random() > 0.5 ? 'galaxy' : 'samurai';
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
