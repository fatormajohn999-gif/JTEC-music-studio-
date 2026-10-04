import React, { useEffect, useRef } from 'react';
import { VisualizerMode, PerformanceMode } from '../types/music';
import { audioEngine } from '../services/audioEngine';

interface VisualizerCanvasProps {
  mode: VisualizerMode;
  performanceMode: PerformanceMode;
  isActive: boolean;
  className?: string;
  artworkUrl?: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseRadius: number;
  color: string;
  alpha: number;
}

export const VisualizerCanvas: React.FC<VisualizerCanvasProps> = ({
  mode,
  performanceMode,
  isActive,
  className = '',
  artworkUrl,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const lastFrameTimeRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isActive || mode === 'off') {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle Resize & Pixel Ratio
    const updateCanvasDimensions = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = performanceMode === 'battery' ? 1 : Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.scale(dpr, dpr);
    };

    updateCanvasDimensions();
    const resizeObserver = new ResizeObserver(() => updateCanvasDimensions());
    resizeObserver.observe(canvas);

    // Initialize particles if particles or circular mode
    const particleCount = performanceMode === 'battery' ? 18 : performanceMode === 'balanced' ? 36 : 60;
    const colors = ['#00f0ff', '#38bdf8', '#818cf8', '#a855f7', '#ec4899'];
    particlesRef.current = Array.from({ length: particleCount }, () => ({
      x: Math.random() * (canvas.width || 300),
      y: Math.random() * (canvas.height || 300),
      vx: (Math.random() - 0.5) * 0.8,
      vy: (Math.random() - 0.5) * 0.8,
      radius: Math.random() * 2.5 + 1.5,
      baseRadius: Math.random() * 2.5 + 1.5,
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: Math.random() * 0.6 + 0.3,
    }));

    // Target FPS control for Battery Saver mode
    const targetFps = performanceMode === 'battery' ? 30 : 60;
    const frameInterval = 1000 / targetFps;

    let rotAngle = 0;

    const render = (currentTime: number) => {
      animFrameRef.current = requestAnimationFrame(render);

      // Frame throttle for battery saver
      const elapsed = currentTime - lastFrameTimeRef.current;
      if (elapsed < frameInterval - 1) return;
      lastFrameTimeRef.current = currentTime - (elapsed % frameInterval);

      const dpr = performanceMode === 'battery' ? 1 : Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;

      ctx.clearRect(0, 0, width, height);

      const freqData = audioEngine.getFrequencyData();
      const timeData = audioEngine.getTimeDomainData();

      // Calculate bass energy (bins 1 to 10)
      let bassEnergy = 0;
      if (freqData) {
        let sum = 0;
        const bassCount = Math.min(10, freqData.length);
        for (let i = 1; i < bassCount; i++) {
          sum += freqData[i];
        }
        bassEnergy = sum / (bassCount * 255); // 0 to 1
      }

      // 1. CIRCULAR SPECTRUM MODE
      if (mode === 'circular') {
        const cx = width / 2;
        const cy = height / 2;
        const baseRadius = Math.min(cx, cy) * 0.42 + bassEnergy * 8;
        const barCount = performanceMode === 'battery' ? 48 : 72;
        const step = (Math.PI * 2) / barCount;

        rotAngle += 0.003;

        // Subtle glowing backdrop ring
        ctx.beginPath();
        ctx.arc(cx, cy, baseRadius - 6, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0, 240, 255, ${0.15 + bassEnergy * 0.25})`;
        ctx.lineWidth = 2;
        ctx.stroke();

        if (freqData) {
          for (let i = 0; i < barCount; i++) {
            const angle = i * step + rotAngle;
            // Sample frequency bin symmetrically
            const binIdx = Math.floor((i < barCount / 2 ? i : barCount - i) * (freqData.length / barCount));
            const val = freqData[binIdx] || 0;
            const barHeight = (val / 255) * (Math.min(cx, cy) * 0.38);

            const x1 = cx + Math.cos(angle) * baseRadius;
            const y1 = cy + Math.sin(angle) * baseRadius;
            const x2 = cx + Math.cos(angle) * (baseRadius + Math.max(3, barHeight));
            const y2 = cy + Math.sin(angle) * (baseRadius + Math.max(3, barHeight));

            const grad = ctx.createLinearGradient(x1, y1, x2, y2);
            grad.addColorStop(0, '#00f0ff');
            grad.addColorStop(0.5, '#a855f7');
            grad.addColorStop(1, '#ec4899');

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.strokeStyle = grad;
            ctx.lineWidth = performanceMode === 'battery' ? 3 : 2.5;
            ctx.lineCap = 'round';
            ctx.stroke();
          }
        }
      }

      // 2. SPECTRUM (BARS) MODE
      else if (mode === 'spectrum') {
        const barCount = performanceMode === 'battery' ? 32 : 56;
        const barWidth = (width / barCount) * 0.75;
        const spacing = (width - barWidth * barCount) / (barCount + 1);

        if (freqData) {
          for (let i = 0; i < barCount; i++) {
            const binIdx = Math.floor((i / barCount) * (freqData.length * 0.85));
            const val = freqData[binIdx] || 0;
            const barHeight = Math.max(4, (val / 255) * (height * 0.85));
            const x = spacing + i * (barWidth + spacing);
            const y = height - barHeight;

            const grad = ctx.createLinearGradient(x, height, x, y);
            grad.addColorStop(0, '#00f0ff');
            grad.addColorStop(0.5, '#818cf8');
            grad.addColorStop(1, '#ec4899');

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.roundRect(x, y, barWidth, barHeight, [3, 3, 0, 0]);
            ctx.fill();

            // Peak cap dot
            if (performanceMode !== 'battery' && val > 60) {
              ctx.fillStyle = '#ffffff';
              ctx.beginPath();
              ctx.arc(x + barWidth / 2, Math.max(2, y - 4), barWidth * 0.35, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }

      // 3. WAVEFORM (OSCILLOSCOPE) MODE
      else if (mode === 'waveform') {
        if (timeData) {
          ctx.beginPath();
          const sliceWidth = width / timeData.length;
          let x = 0;

          for (let i = 0; i < timeData.length; i++) {
            const v = timeData[i] / 128.0; // centered at 1.0
            const y = (v * height) / 2;

            if (i === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
            x += sliceWidth;
          }

          const grad = ctx.createLinearGradient(0, 0, width, 0);
          grad.addColorStop(0, '#00f0ff');
          grad.addColorStop(0.5, '#a855f7');
          grad.addColorStop(1, '#ec4899');

          ctx.strokeStyle = grad;
          ctx.lineWidth = performanceMode === 'battery' ? 2 : 2.5;
          ctx.stroke();

          // Subtle mirrored glow wave
          if (performanceMode === 'high') {
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#00f0ff';
            ctx.stroke();
            ctx.shadowBlur = 0;
          }
        }
      }

      // 4. PARTICLES MODE
      else if (mode === 'particles') {
        const particles = particlesRef.current;
        const speedMultiplier = 1 + bassEnergy * 2.5;

        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          p.x += p.vx * speedMultiplier;
          p.y += p.vy * speedMultiplier;

          // Wrap edges
          if (p.x < 0) p.x = width;
          if (p.x > width) p.x = 0;
          if (p.y < 0) p.y = height;
          if (p.y > height) p.y = 0;

          p.radius = p.baseRadius + bassEnergy * 4;

          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.globalAlpha = Math.min(1, p.alpha + bassEnergy * 0.4);
          ctx.fill();
        }
        ctx.globalAlpha = 1.0;
      }
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      resizeObserver.disconnect();
    };
  }, [mode, performanceMode, isActive, artworkUrl]);

  return (
    <div className={`relative overflow-hidden pointer-events-none ${className}`}>
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
};
