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

interface Particle3D {
  x: number;
  y: number;
  z: number;
  baseRadius: number;
  color: string;
  alpha: number;
  seed: number;
  vx?: number;
  vy?: number;
}

interface NeuralNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  pulse: number;
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
  const particlesRef = useRef<Particle3D[]>([]);
  const neuralNodesRef = useRef<NeuralNode[]>([]);
  const lastFrameTimeRef = useRef<number>(0);
  const internalSceneRef = useRef<CinematicScene>('aurora');

  // Camera drift state
  const cameraRef = useRef({
    x: 0,
    y: 0,
    zoom: 1,
    targetZoom: 1,
    time: 0,
  });

  // Track smoothed bass & volume for smooth physics
  const smoothedBassRef = useRef(0);
  const smoothedVolRef = useRef(0);
  const lastBeatTimeRef = useRef(0);
  const autoSceneChangeCooldownRef = useRef(0);

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

    // Handle Resolution and Resize
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

    // Initialize 3D particles
    const particleCount = performanceMode === 'battery' ? 24 : performanceMode === 'balanced' ? 50 : 85;
    const colors = [palette.primary, palette.secondary, palette.accent, '#ffffff'];
    particlesRef.current = Array.from({ length: particleCount }, () => ({
      x: (Math.random() - 0.5) * 900,
      y: (Math.random() - 0.5) * 900,
      z: Math.random() * 800 + 50,
      baseRadius: Math.random() * 2 + 1,
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: Math.random() * 0.7 + 0.3,
      seed: Math.random() * Math.PI * 2,
      vx: (Math.random() - 0.5) * 1.5,
      vy: (Math.random() - 0.5) * 1.5,
    }));

    // Initialize Neural Network nodes
    const nodeCount = performanceMode === 'battery' ? 18 : 32;
    neuralNodesRef.current = Array.from({ length: nodeCount }, () => ({
      x: Math.random() * 800,
      y: Math.random() * 800,
      vx: (Math.random() - 0.5) * 0.8,
      vy: (Math.random() - 0.5) * 0.8,
      radius: Math.random() * 2.5 + 2,
      pulse: Math.random(),
    }));

    const targetFps = performanceMode === 'battery' ? 30 : 60;
    const frameInterval = 1000 / targetFps;

    let isDocumentVisible = !document.hidden;
    const handleVisibilityChange = () => {
      isDocumentVisible = !document.hidden;
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

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

      // Extract real audio bands
      const bands = audioEngine.getAudioBands();
      const bass = bands?.bass || 0;
      const mid = bands?.mid || 0;
      const high = bands?.high || 0;
      const volume = bands?.volume || 0;
      const freq = bands?.rawFrequency;

      // Smooth physics
      smoothedBassRef.current += (bass - smoothedBassRef.current) * 0.18;
      smoothedVolRef.current += (volume - smoothedVolRef.current) * 0.15;
      const sBass = smoothedBassRef.current;
      const sVol = smoothedVolRef.current;

      // Beat detection transient
      const isBeat = bass > 0.62 && currentTime - lastBeatTimeRef.current > 320;
      if (isBeat) {
        lastBeatTimeRef.current = currentTime;
      }

      // Camera drift & Bass bounce
      cameraRef.current.time += 0.008;
      const cam = cameraRef.current;
      cam.x = Math.sin(cam.time * 0.6) * 10 + Math.sin(cam.time * 1.3) * 5;
      cam.y = Math.cos(cam.time * 0.4) * 7;
      cam.targetZoom = 1 + sBass * 0.07;
      cam.zoom += (cam.targetZoom - cam.zoom) * 0.1;

      // Auto Scene Decision logic (if scene === 'auto')
      autoSceneChangeCooldownRef.current += 1;
      if (scene === 'auto' && autoSceneChangeCooldownRef.current > 420) {
        let detected: CinematicScene = internalSceneRef.current;
        if (sBass > 0.68) {
          detected = Math.random() > 0.5 ? 'inferno' : 'black_hole';
        } else if (sBass > 0.48 && high > 0.4) {
          detected = Math.random() > 0.5 ? 'energy' : 'vortex';
        } else if (mid > 0.45 && high > 0.45) {
          detected = Math.random() > 0.5 ? 'crystal' : 'prism';
        } else if (high > 0.5) {
          detected = Math.random() > 0.5 ? 'deep_space' : 'meteor_shower';
        } else if (mid > 0.4) {
          detected = Math.random() > 0.5 ? 'neural_network' : 'neon_city';
        } else if (sBass < 0.25 && sVol < 0.35) {
          detected = Math.random() > 0.5 ? 'dream' : 'nature';
        } else {
          detected = Math.random() > 0.5 ? 'aurora' : 'ocean';
        }

        if (detected !== internalSceneRef.current) {
          internalSceneRef.current = detected;
          autoSceneChangeCooldownRef.current = 0;
          if (onAutoSceneDetermined) onAutoSceneDetermined(detected);
        }
      }

      const activeSceneName = scene === 'auto' ? internalSceneRef.current : scene;

      ctx.save();
      ctx.clearRect(0, 0, width, height);

      // Apply camera transform around center
      ctx.translate(cx + cam.x, cy + cam.y);
      ctx.scale(cam.zoom, cam.zoom);
      ctx.translate(-cx, -cy);

      // Deep atmospheric background tint
      const bgGrad = ctx.createRadialGradient(cx, cy, 20, cx, cy, Math.max(width, height) * 0.85);
      bgGrad.addColorStop(0, palette.darkBg || '#070b18');
      bgGrad.addColorStop(0.6, '#060812');
      bgGrad.addColorStop(1, '#020307');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(-cx * 0.5, -cy * 0.5, width * 2, height * 2);

      // ==========================================
      // SCENE 1: AURORA (Flowing atmospheric curtains)
      // ==========================================
      if (activeSceneName === 'aurora') {
        const waveCount = performanceMode === 'battery' ? 3 : 5;
        for (let w = 0; w < waveCount; w++) {
          const t = cam.time * (0.8 + w * 0.3) + w * 1.5;
          const spread = (w / waveCount) * height * 0.8;
          ctx.beginPath();
          ctx.moveTo(0, cy + spread - 150);

          for (let x = 0; x <= width; x += 30) {
            const freqSample = freq ? freq[Math.floor((x / width) * 40)] / 255 : 0;
            const y =
              cy +
              Math.sin(x * 0.005 + t) * (60 + sBass * 100) +
              Math.cos(x * 0.003 - t * 0.8) * 40 +
              freqSample * 50 -
              w * 35;
            ctx.lineTo(x, y);
          }
          ctx.lineTo(width, height);
          ctx.lineTo(0, height);
          ctx.closePath();

          const waveGrad = ctx.createLinearGradient(0, cy - 100, width, height);
          waveGrad.addColorStop(0, w % 2 === 0 ? palette.primary : palette.secondary);
          waveGrad.addColorStop(1, 'transparent');
          ctx.fillStyle = waveGrad;
          ctx.globalAlpha = 0.12 + sBass * 0.15;
          ctx.fill();
        }
        ctx.globalAlpha = 1.0;
      }

      // ==========================================
      // SCENE 2: GALAXY (Deep space & celestial rings)
      // ==========================================
      else if (activeSceneName === 'galaxy') {
        const nebulaGrad = ctx.createRadialGradient(cx, cy, 30, cx, cy, 320 + sBass * 80);
        nebulaGrad.addColorStop(0, palette.glow);
        nebulaGrad.addColorStop(0.4, palette.secondary);
        nebulaGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = nebulaGrad;
        ctx.globalAlpha = 0.3 + sVol * 0.3;
        ctx.beginPath();
        ctx.arc(cx, cy, 320 + sBass * 80, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;

        const ringCount = 3;
        for (let r = 0; r < ringCount; r++) {
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(cam.time * (0.2 + r * 0.1) * (r % 2 === 0 ? 1 : -1));
          ctx.beginPath();
          const rad = 140 + r * 60 + sBass * 40;
          ctx.ellipse(0, 0, rad, rad * 0.65, Math.PI / 4, 0, Math.PI * 2);
          ctx.strokeStyle = r % 2 === 0 ? palette.primary : palette.accent;
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = 0.25 + high * 0.4;
          ctx.stroke();
          ctx.restore();
        }
      }

      // ==========================================
      // SCENE 3: NEON CITY (Horizon cyber grid)
      // ==========================================
      else if (activeSceneName === 'neon_city') {
        const horizonY = cy + 40;
        const hGrad = ctx.createLinearGradient(0, horizonY - 80, 0, horizonY + 80);
        hGrad.addColorStop(0, 'transparent');
        hGrad.addColorStop(0.5, palette.primary);
        hGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = hGrad;
        ctx.globalAlpha = 0.2 + sBass * 0.35;
        ctx.fillRect(0, horizonY - 40, width, 80);
        ctx.globalAlpha = 1.0;

        const gridStep = 45;
        ctx.strokeStyle = palette.secondary;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.18 + sBass * 0.2;

        for (let x = -width * 0.5; x <= width * 1.5; x += gridStep) {
          ctx.beginPath();
          ctx.moveTo(cx, horizonY);
          ctx.lineTo(x, height);
          ctx.stroke();
        }

        const offset = (cam.time * 40 * (1 + sBass * 1.5)) % gridStep;
        for (let y = horizonY; y <= height; y += gridStep * 0.8) {
          const depthY = y + offset;
          if (depthY <= height) {
            ctx.beginPath();
            ctx.moveTo(0, depthY);
            ctx.lineTo(width, depthY);
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1.0;
      }

      // ==========================================
      // SCENE 4: DREAM (Bioluminescent floating orbs)
      // ==========================================
      else if (activeSceneName === 'dream') {
        const orbCount = performanceMode === 'battery' ? 4 : 7;
        for (let i = 0; i < orbCount; i++) {
          const ox = cx + Math.sin(cam.time * 0.5 + i * 1.2) * (cx * 0.6);
          const oy = cy + Math.cos(cam.time * 0.4 + i * 1.5) * (cy * 0.5);
          const orbRad = 90 + Math.sin(cam.time + i) * 30 + sBass * 40;

          const orbGrad = ctx.createRadialGradient(ox, oy, 10, ox, oy, orbRad);
          orbGrad.addColorStop(0, i % 2 === 0 ? palette.primary : palette.secondary);
          orbGrad.addColorStop(1, 'transparent');
          ctx.fillStyle = orbGrad;
          ctx.globalAlpha = 0.15 + sVol * 0.2;
          ctx.beginPath();
          ctx.arc(ox, oy, orbRad, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1.0;
      }

      // ==========================================
      // SCENE 5: ENERGY (Radiant spokes & shockwaves)
      // ==========================================
      else if (activeSceneName === 'energy') {
        const shockRadius = (cam.time * 240 * (1 + sBass * 2)) % (Math.max(width, height) * 0.7);
        ctx.beginPath();
        ctx.arc(cx, cy, shockRadius, 0, Math.PI * 2);
        ctx.strokeStyle = palette.accent;
        ctx.lineWidth = 2.5;
        ctx.globalAlpha = Math.max(0, 0.6 - shockRadius / (Math.max(width, height) * 0.7));
        ctx.stroke();
        ctx.globalAlpha = 1.0;

        const spokeCount = performanceMode === 'battery' ? 16 : 32;
        const angleStep = (Math.PI * 2) / spokeCount;
        for (let i = 0; i < spokeCount; i++) {
          const angle = i * angleStep + cam.time * 1.2;
          const len = 120 + (freq ? freq[i % 30] * 0.9 : 0) * (1 + sBass);
          const x1 = cx + Math.cos(angle) * 70;
          const y1 = cy + Math.sin(angle) * 70;
          const x2 = cx + Math.cos(angle) * (70 + len);
          const y2 = cy + Math.sin(angle) * (70 + len);

          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.strokeStyle = i % 2 === 0 ? palette.primary : palette.accent;
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = 0.35 + high * 0.45;
          ctx.stroke();
        }
        ctx.globalAlpha = 1.0;
      }

      // ==========================================
      // SCENE 7: INFERNO 🔥 (Rising embers & heat shimmer)
      // ==========================================
      else if (activeSceneName === 'inferno') {
        // Base thermal glow
        const fireBaseGrad = ctx.createRadialGradient(cx, height, 40, cx, cy, height * 0.8);
        fireBaseGrad.addColorStop(0, 'rgba(255, 68, 0, 0.4)');
        fireBaseGrad.addColorStop(0.5, 'rgba(255, 170, 0, 0.15)');
        fireBaseGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = fireBaseGrad;
        ctx.globalAlpha = 0.4 + sBass * 0.5;
        ctx.fillRect(0, 0, width, height);

        // Rising flame ribbons
        const ribbonCount = performanceMode === 'battery' ? 3 : 6;
        for (let r = 0; r < ribbonCount; r++) {
          ctx.beginPath();
          const rx = cx + (r - ribbonCount / 2) * (width / ribbonCount * 0.6);
          ctx.moveTo(rx, height);
          for (let y = height; y >= cy - 100; y -= 20) {
            const wave = Math.sin(y * 0.02 - cam.time * 6 + r) * (25 + sBass * 40);
            ctx.lineTo(rx + wave, y);
          }
          ctx.strokeStyle = r % 2 === 0 ? '#ff4500' : '#ffaa00';
          ctx.lineWidth = 3 + sBass * 4;
          ctx.globalAlpha = 0.3 + sBass * 0.35;
          ctx.stroke();
        }
        ctx.globalAlpha = 1.0;
      }

      // ==========================================
      // SCENE 8: OCEAN 🌊 (Layered waves & water ripples)
      // ==========================================
      else if (activeSceneName === 'ocean') {
        const layers = performanceMode === 'battery' ? 3 : 5;
        for (let l = 0; l < layers; l++) {
          const lY = cy + 30 + l * 35;
          ctx.beginPath();
          ctx.moveTo(0, height);
          ctx.lineTo(0, lY);
          for (let x = 0; x <= width; x += 25) {
            const y =
              lY +
              Math.sin(x * 0.008 + cam.time * (1.2 + l * 0.3) + l) * (20 + sBass * 45) +
              Math.cos(x * 0.004 - cam.time * 0.8) * 15;
            ctx.lineTo(x, y);
          }
          ctx.lineTo(width, height);
          ctx.closePath();

          const oceanGrad = ctx.createLinearGradient(0, lY - 20, 0, height);
          oceanGrad.addColorStop(0, l % 2 === 0 ? '#00e5ff' : '#0077ff');
          oceanGrad.addColorStop(1, '#020b22');
          ctx.fillStyle = oceanGrad;
          ctx.globalAlpha = 0.2 + (l / layers) * 0.25 + sBass * 0.15;
          ctx.fill();
        }

        // Circular expanding surface ripples from center
        const rippleCount = 3;
        for (let i = 0; i < rippleCount; i++) {
          const ripR = ((cam.time * 80 + i * 70) % 220) * (1 + sBass * 0.4);
          ctx.beginPath();
          ctx.ellipse(cx, cy + 80, ripR, ripR * 0.45, 0, 0, Math.PI * 2);
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = Math.max(0, 0.4 - ripR / 220);
          ctx.stroke();
        }
        ctx.globalAlpha = 1.0;
      }

      // ==========================================
      // SCENE 9: DEEP SPACE 🌌 (3D Parallax Starfield & Nebulae)
      // ==========================================
      else if (activeSceneName === 'deep_space') {
        // Deep cosmic gas clouds
        const nebGrad1 = ctx.createRadialGradient(cx - 100, cy - 80, 20, cx - 100, cy - 80, 280);
        nebGrad1.addColorStop(0, 'rgba(147, 51, 234, 0.25)');
        nebGrad1.addColorStop(1, 'transparent');
        ctx.fillStyle = nebGrad1;
        ctx.beginPath();
        ctx.arc(cx - 100, cy - 80, 280, 0, Math.PI * 2);
        ctx.fill();

        const nebGrad2 = ctx.createRadialGradient(cx + 120, cy + 90, 20, cx + 120, cy + 90, 300);
        nebGrad2.addColorStop(0, 'rgba(59, 130, 246, 0.25)');
        nebGrad2.addColorStop(1, 'transparent');
        ctx.fillStyle = nebGrad2;
        ctx.beginPath();
        ctx.arc(cx + 120, cy + 90, 300, 0, Math.PI * 2);
        ctx.fill();

        // Starlight pulse on strong beats
        if (isBeat) {
          ctx.beginPath();
          ctx.arc(cx, cy, 180 + sBass * 60, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
          ctx.fill();
        }
      }

      // ==========================================
      // SCENE 10: CRYSTAL 💎 (Faceted geometric refraction)
      // ==========================================
      else if (activeSceneName === 'crystal') {
        const polySides = 6;
        const crystalRadius = 90 + sBass * 65;
        const rot = cam.time * 0.4;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rot);

        // Outer crystal facets
        ctx.beginPath();
        for (let i = 0; i <= polySides; i++) {
          const a = (i * Math.PI * 2) / polySides;
          const px = Math.cos(a) * crystalRadius;
          const py = Math.sin(a) * crystalRadius;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 2.5;
        ctx.globalAlpha = 0.7 + high * 0.3;
        ctx.stroke();

        // Inner faceted triangles with translucent color gradients
        for (let i = 0; i < polySides; i++) {
          const a1 = (i * Math.PI * 2) / polySides;
          const a2 = ((i + 1) * Math.PI * 2) / polySides;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(a1) * crystalRadius, Math.sin(a1) * crystalRadius);
          ctx.lineTo(Math.cos(a2) * crystalRadius, Math.sin(a2) * crystalRadius);
          ctx.closePath();
          ctx.fillStyle = i % 2 === 0 ? 'rgba(0, 240, 255, 0.15)' : 'rgba(168, 85, 247, 0.15)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        ctx.restore();
      }

      // ==========================================
      // SCENE 11: VORTEX 🌀 (Spiral energy arms)
      // ==========================================
      else if (activeSceneName === 'vortex') {
        const armCount = 4;
        const pointsPerArm = performanceMode === 'battery' ? 25 : 45;
        const vortexSpeed = cam.time * (1.2 + sBass * 2.0);

        for (let a = 0; a < armCount; a++) {
          const armAngle = (a * Math.PI * 2) / armCount;
          ctx.beginPath();
          for (let p = 0; p < pointsPerArm; p++) {
            const rad = p * 6 + sBass * 20;
            const theta = armAngle + p * 0.18 + vortexSpeed;
            const vx = cx + Math.cos(theta) * rad;
            const vy = cy + Math.sin(theta) * rad;
            if (p === 0) ctx.moveTo(vx, vy);
            else ctx.lineTo(vx, vy);
          }
          ctx.strokeStyle = a % 2 === 0 ? palette.primary : palette.accent;
          ctx.lineWidth = 2 + (a % 2 === 0 ? 1 : 0);
          ctx.globalAlpha = 0.4 + sBass * 0.4;
          ctx.stroke();
        }

        // Luminous Core
        const coreRad = 35 + sBass * 25;
        const coreGrad = ctx.createRadialGradient(cx, cy, 5, cx, cy, coreRad);
        coreGrad.addColorStop(0, '#ffffff');
        coreGrad.addColorStop(0.5, palette.primary);
        coreGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = coreGrad;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.arc(cx, cy, coreRad, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
      }

      // ==========================================
      // SCENE 12: PRISM 🌈 (Optical light dispersion)
      // ==========================================
      else if (activeSceneName === 'prism') {
        const prismColors = ['#ff0055', '#ff7700', '#ffee00', '#00ff66', '#00eeff', '#7700ff'];
        const bandWidth = 14 + sBass * 8;
        const startX = cx - (prismColors.length * bandWidth) / 2;

        for (let c = 0; c < prismColors.length; c++) {
          const bx = startX + c * bandWidth;
          const pAngle = cam.time * 0.8 + c * 0.3;
          ctx.beginPath();
          ctx.moveTo(bx, 0);
          ctx.bezierCurveTo(
            bx + Math.sin(pAngle) * 60,
            cy - 50,
            bx - Math.cos(pAngle) * 60,
            cy + 50,
            bx + (c - 2.5) * 45,
            height
          );
          ctx.strokeStyle = prismColors[c];
          ctx.lineWidth = bandWidth * 0.9;
          ctx.globalAlpha = 0.25 + high * 0.4;
          ctx.stroke();
        }
        ctx.globalAlpha = 1.0;
      }

      // ==========================================
      // SCENE 13: METEOR SHOWER 🌠 (Diagonal speed streaks)
      // ==========================================
      else if (activeSceneName === 'meteor_shower') {
        const meteorCount = performanceMode === 'battery' ? 4 : 8;
        for (let m = 0; m < meteorCount; m++) {
          const progress = ((cam.time * 280 + m * 140) * (1 + sBass * 1.5)) % (width + height);
          const sx = width - progress + (m * 70);
          const sy = progress - (m * 40);
          const len = 70 + sBass * 90;

          const mGrad = ctx.createLinearGradient(sx, sy, sx - len, sy + len * 0.6);
          mGrad.addColorStop(0, '#ffffff');
          mGrad.addColorStop(0.3, palette.primary);
          mGrad.addColorStop(1, 'transparent');

          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx - len, sy + len * 0.6);
          ctx.strokeStyle = mGrad;
          ctx.lineWidth = 2.5;
          ctx.globalAlpha = 0.6 + sBass * 0.4;
          ctx.stroke();
        }
        ctx.globalAlpha = 1.0;
      }

      // ==========================================
      // SCENE 14: NATURE 🌿 (Organic branching fractals)
      // ==========================================
      else if (activeSceneName === 'nature') {
        const branchCount = 6;
        for (let b = 0; b < branchCount; b++) {
          const bAngle = (b * Math.PI * 2) / branchCount + Math.sin(cam.time * 0.5) * 0.15;
          let curX = cx;
          let curY = cy;
          let curAngle = bAngle;
          const maxSeg = performanceMode === 'battery' ? 6 : 9;

          ctx.beginPath();
          ctx.moveTo(curX, curY);
          for (let s = 0; s < maxSeg; s++) {
            const segLen = 22 - s * 1.5 + sBass * 12;
            curAngle += Math.sin(cam.time * 1.5 + s + b) * 0.25;
            curX += Math.cos(curAngle) * segLen;
            curY += Math.sin(curAngle) * segLen;
            ctx.lineTo(curX, curY);
          }
          ctx.strokeStyle = b % 2 === 0 ? '#10b981' : '#06b6d4';
          ctx.lineWidth = Math.max(1, 3 - b * 0.3);
          ctx.globalAlpha = 0.45 + sVol * 0.4;
          ctx.stroke();
        }
        ctx.globalAlpha = 1.0;
      }

      // ==========================================
      // SCENE 15: NEURAL NETWORK 🧬 (Synaptic nodes & axons)
      // ==========================================
      else if (activeSceneName === 'neural_network') {
        const nodes = neuralNodesRef.current;
        const maxDist = performanceMode === 'battery' ? 110 : 140;

        // Update and draw nodes
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          n.x += n.vx * (1 + sBass);
          n.y += n.vy * (1 + sBass);

          // Wrap edges
          if (n.x < 0) n.x = width;
          if (n.x > width) n.x = 0;
          if (n.y < 0) n.y = height;
          if (n.y > height) n.y = 0;

          // Connecting axons
          for (let j = i + 1; j < nodes.length; j++) {
            const n2 = nodes[j];
            const dx = n.x - n2.x;
            const dy = n.y - n2.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < maxDist) {
              ctx.beginPath();
              ctx.moveTo(n.x, n.y);
              ctx.lineTo(n2.x, n2.y);
              ctx.strokeStyle = i % 2 === 0 ? palette.primary : palette.secondary;
              ctx.lineWidth = 1;
              ctx.globalAlpha = (1 - dist / maxDist) * (0.3 + sBass * 0.5);
              ctx.stroke();
            }
          }

          // Node body
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.radius + (freq ? freq[i % 20] / 80 : 0), 0, Math.PI * 2);
          ctx.fillStyle = i % 3 === 0 ? '#ffffff' : palette.primary;
          ctx.globalAlpha = 0.7 + high * 0.3;
          ctx.fill();
        }
        ctx.globalAlpha = 1.0;
      }

      // ==========================================
      // SCENE 16: BLACK HOLE 🕳️ (Gravitational accretion disk)
      // ==========================================
      else if (activeSceneName === 'black_hole') {
        const holeRadius = 60 + sBass * 15;

        // Warped Einstein ring / Event Horizon halo
        const haloGrad = ctx.createRadialGradient(cx, cy, holeRadius * 0.9, cx, cy, holeRadius * 2.8);
        haloGrad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
        haloGrad.addColorStop(0.2, 'rgba(168, 85, 247, 0.6)');
        haloGrad.addColorStop(0.6, 'rgba(0, 240, 255, 0.25)');
        haloGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = haloGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, holeRadius * 2.8, 0, Math.PI * 2);
        ctx.fill();

        // Relativistic accretion disk swirl
        const trailCount = performanceMode === 'battery' ? 12 : 24;
        for (let t = 0; t < trailCount; t++) {
          const a = (t * Math.PI * 2) / trailCount + cam.time * 2.5;
          const r = holeRadius * 1.3 + Math.sin(t + cam.time * 3) * (holeRadius * 0.8) + sBass * 30;
          ctx.beginPath();
          ctx.ellipse(cx, cy, r, r * 0.4, a * 0.2, a, a + Math.PI * 0.8);
          ctx.strokeStyle = t % 2 === 0 ? '#00f0ff' : '#ec4899';
          ctx.lineWidth = 2.5;
          ctx.globalAlpha = 0.5 + high * 0.4;
          ctx.stroke();
        }

        // PITCH-BLACK CENTRAL VOID
        ctx.beginPath();
        ctx.arc(cx, cy, holeRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#010204';
        ctx.globalAlpha = 1.0;
        ctx.fill();
        ctx.strokeStyle = '#a855f7';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // ==========================================
      // UNIVERSAL 3D PARTICLES SYSTEM
      // ==========================================
      const particles = particlesRef.current;
      const speed = (0.8 + sBass * 3.5 + sVol * 1.5) * (activeSceneName === 'energy' || activeSceneName === 'meteor_shower' ? 2.2 : 1.0);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.z -= speed * 1.8;

        // Reset particle if passed camera
        if (p.z <= 10) {
          p.z = 800;
          p.x = (Math.random() - 0.5) * 900;
          p.y = (Math.random() - 0.5) * 900;
        }

        // Project 3D to 2D
        const fov = 400;
        const px = cx + (p.x / p.z) * fov;
        const py = cy + (p.y / p.z) * fov;
        const pRadius = Math.max(0.6, (p.baseRadius * fov) / p.z + sBass * 1.2);

        if (px >= 0 && px <= width && py >= 0 && py <= height) {
          ctx.beginPath();
          ctx.arc(px, py, pRadius, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.globalAlpha = Math.min(1, (1 - p.z / 800) * (p.alpha + sBass * 0.4));
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1.0;

      // ==========================================
      // AUDIO-REACTIVE CENTER ENERGY RING
      // ==========================================
      const circleRadius = Math.min(cx, cy) * 0.38;
      const ringSegments = performanceMode === 'battery' ? 48 : 72;
      const ringStep = (Math.PI * 2) / ringSegments;

      ctx.beginPath();
      for (let i = 0; i < ringSegments; i++) {
        const angle = i * ringStep + cam.time * 0.5;
        const binIndex = Math.floor((i < ringSegments / 2 ? i : ringSegments - i) * 1.5);
        const val = freq && freq[binIndex] ? freq[binIndex] / 255 : 0;
        const disp = val * (25 + sBass * 35);
        const r = circleRadius + disp + 6;
        const rx = cx + Math.cos(angle) * r;
        const ry = cy + Math.sin(angle) * r;

        if (i === 0) {
          ctx.moveTo(rx, ry);
        } else {
          ctx.lineTo(rx, ry);
        }
      }
      ctx.closePath();
      ctx.strokeStyle = palette.primary;
      ctx.lineWidth = 2.5;
      ctx.globalAlpha = 0.65 + sBass * 0.35;
      ctx.stroke();

      // Secondary outer particle sparkles on high frequencies
      if (high > 0.3 && performanceMode !== 'battery') {
        const sparkCount = Math.floor(high * 12);
        for (let s = 0; s < sparkCount; s++) {
          const sAngle = Math.random() * Math.PI * 2;
          const sDist = circleRadius + 14 + Math.random() * 40;
          const sx = cx + Math.cos(sAngle) * sDist;
          const sy = cy + Math.sin(sAngle) * sDist;
          ctx.beginPath();
          ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
          ctx.fillStyle = palette.accent;
          ctx.globalAlpha = 0.8;
          ctx.fill();
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
