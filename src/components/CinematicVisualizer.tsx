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
  const lastFrameTimeRef = useRef<number>(0);
  const internalSceneRef = useRef<'aurora' | 'galaxy' | 'neon_city' | 'dream' | 'energy'>('aurora');
  const sceneTransitionRef = useRef<{ current: string; target: string; progress: number }>({
    current: 'aurora',
    target: 'aurora',
    progress: 1.0,
  });

  // Camera drift state
  const cameraRef = useRef({
    x: 0,
    y: 0,
    zoom: 1,
    targetZoom: 1,
    time: 0,
  });

  // Track smoothed bass for smooth physics
  const smoothedBassRef = useRef(0);
  const smoothedVolRef = useRef(0);

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
      x: (Math.random() - 0.5) * 800,
      y: (Math.random() - 0.5) * 800,
      z: Math.random() * 800 + 50,
      baseRadius: Math.random() * 2 + 1,
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: Math.random() * 0.7 + 0.3,
      seed: Math.random() * Math.PI * 2,
    }));

    const targetFps = performanceMode === 'battery' ? 30 : 60;
    const frameInterval = 1000 / targetFps;

    let sceneTimer = 0;

    const render = (currentTime: number) => {
      animFrameRef.current = requestAnimationFrame(render);

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
      const low = bands?.low || 0;
      const mid = bands?.mid || 0;
      const high = bands?.high || 0;
      const volume = bands?.volume || 0;
      const freq = bands?.rawFrequency;

      // Smooth physics
      smoothedBassRef.current += (bass - smoothedBassRef.current) * 0.18;
      smoothedVolRef.current += (volume - smoothedVolRef.current) * 0.15;
      const sBass = smoothedBassRef.current;
      const sVol = smoothedVolRef.current;

      // Camera drift & Bass bounce
      cameraRef.current.time += 0.008;
      const cam = cameraRef.current;
      cam.x = Math.sin(cam.time * 0.6) * 12 + (Math.sin(cam.time * 1.3) * 6);
      cam.y = Math.cos(cam.time * 0.4) * 8;
      cam.targetZoom = 1 + sBass * 0.08;
      cam.zoom += (cam.targetZoom - cam.zoom) * 0.1;

      // Auto Scene Decision logic (if scene === 'auto')
      sceneTimer += 1;
      if (scene === 'auto' && sceneTimer % 180 === 0) {
        let detected: 'aurora' | 'galaxy' | 'neon_city' | 'dream' | 'energy' = 'aurora';
        if (sBass > 0.65) {
          detected = 'energy';
        } else if (sBass < 0.25 && sVol < 0.35) {
          detected = 'dream';
        } else if (high > 0.45) {
          detected = 'galaxy';
        } else if (mid > 0.4) {
          detected = 'neon_city';
        } else {
          detected = 'aurora';
        }

        if (detected !== internalSceneRef.current) {
          internalSceneRef.current = detected;
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
      bgGrad.addColorStop(0, palette.darkBg);
      bgGrad.addColorStop(0.6, '#060812');
      bgGrad.addColorStop(1, '#020307');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(-cx * 0.5, -cy * 0.5, width * 2, height * 2);

      // SCENE 1: AURORA (Flowing atmospheric clouds & waves)
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

      // SCENE 2: GALAXY (Deep space, stars, spinning celestial energy)
      else if (activeSceneName === 'galaxy') {
        // Core nebula halo
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

        // Spiral cosmic dust rings
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

      // SCENE 3: NEON CITY (Horizon grid lines, vertical cyber beams)
      else if (activeSceneName === 'neon_city') {
        const horizonY = cy + 40;
        // Horizon glow
        const hGrad = ctx.createLinearGradient(0, horizonY - 80, 0, horizonY + 80);
        hGrad.addColorStop(0, 'transparent');
        hGrad.addColorStop(0.5, palette.primary);
        hGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = hGrad;
        ctx.globalAlpha = 0.2 + sBass * 0.35;
        ctx.fillRect(0, horizonY - 40, width, 80);
        ctx.globalAlpha = 1.0;

        // Perspective ground grid
        const gridStep = 45;
        ctx.strokeStyle = palette.secondary;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.18 + sBass * 0.2;

        // Perspective fan lines
        for (let x = -width * 0.5; x <= width * 1.5; x += gridStep) {
          ctx.beginPath();
          ctx.moveTo(cx, horizonY);
          ctx.lineTo(x, height);
          ctx.stroke();
        }

        // Horizontal scrolling grid lines
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

      // SCENE 4: DREAM (Bioluminescent floating mist, liquid calm waves)
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

      // SCENE 5: ENERGY (High-frequency arcs, hyperspace streaks, shockwaves)
      else if (activeSceneName === 'energy') {
        // Shockwave rings shooting outward on bass hits
        const shockRadius = (cam.time * 240 * (1 + sBass * 2)) % (Math.max(width, height) * 0.7);
        ctx.beginPath();
        ctx.arc(cx, cy, shockRadius, 0, Math.PI * 2);
        ctx.strokeStyle = palette.accent;
        ctx.lineWidth = 2.5;
        ctx.globalAlpha = Math.max(0, 0.6 - shockRadius / (Math.max(width, height) * 0.7));
        ctx.stroke();
        ctx.globalAlpha = 1.0;

        // Radiant energy spokes
        const spokeCount = performanceMode === 'battery' ? 16 : 32;
        const angleStep = (Math.PI * 2) / spokeCount;
        for (let i = 0; i < spokeCount; i++) {
          const angle = i * angleStep + cam.time * 1.2;
          const len = 120 + (freq ? freq[i % 30] * 0.9 : 0) * (1 + sBass);
          const x1 = cx + Math.cos(angle) * 110;
          const y1 = cy + Math.sin(angle) * 110;
          const x2 = cx + Math.cos(angle) * (110 + len);
          const y2 = cy + Math.sin(angle) * (110 + len);

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

      // 3D PARTICLES SYSTEM (Universal to all scenes, flying relative to center)
      const particles = particlesRef.current;
      const speed = (0.8 + sBass * 3.5 + sVol * 1.5) * (activeSceneName === 'energy' ? 2.2 : 1.0);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.z -= speed * 1.8;

        // Reset particle if passed camera
        if (p.z <= 10) {
          p.z = 800;
          p.x = (Math.random() - 0.5) * 800;
          p.y = (Math.random() - 0.5) * 800;
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

      // AUDIO-REACTIVE ORBITING ENERGY RING (Directly wraps the center album circle)
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
      resizeObserver.disconnect();
    };
  }, [scene, performanceMode, palette, isActive]);

  return (
    <div className={`relative overflow-hidden pointer-events-none ${className}`}>
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
};
