import React, { useState, useEffect } from 'react';

interface StartupScreenProps {
  onComplete: () => void;
}

export const StartupScreen: React.FC<StartupScreenProps> = ({ onComplete }) => {
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    // Show splash animation smoothly then fade out
    const timer = setTimeout(() => {
      setIsFading(true);
    }, 900);

    const finishTimer = setTimeout(() => {
      onComplete();
    }, 1300);

    return () => {
      clearTimeout(timer);
      clearTimeout(finishTimer);
    };
  }, [onComplete]);

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#050711] transition-opacity duration-500 pointer-events-none select-none ${
        isFading ? 'opacity-0' : 'opacity-100'
      }`}
      aria-hidden="true"
    >
      {/* Ambient background glow */}
      <div className="absolute w-72 h-72 rounded-full bg-gradient-to-tr from-cyan-500/20 via-purple-600/25 to-pink-500/20 blur-3xl" />

      {/* Rotating and pulsing neon ring around logo */}
      <div className="relative flex items-center justify-center mb-6">
        <div className="absolute -inset-4 rounded-3xl bg-gradient-to-tr from-cyan-400 via-purple-500 to-pink-500 opacity-60 blur-md animate-pulse" />
        <div className="relative w-32 h-32 rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl shadow-cyan-500/40 bg-black flex items-center justify-center">
          <img
            src="./logo.png"
            alt="JTEC MUSIC"
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      {/* Brand title */}
      <div className="text-center z-10 space-y-1 mb-6">
        <h1 className="text-2xl font-black tracking-wider text-white">
          JTEC <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400">MUSIC</span>
        </h1>
        <p className="text-xs font-mono uppercase tracking-widest text-cyan-300/80">
          Your Music • Your Vibe • Offline
        </p>
      </div>

      {/* Restrained audio-wave equalizer bars */}
      <div className="flex items-center gap-1.5 h-6 z-10">
        {[0.4, 0.8, 0.6, 1.0, 0.7, 0.5, 0.9, 0.3].map((heightRatio, idx) => (
          <span
            key={idx}
            className="w-1 rounded-full bg-gradient-to-t from-cyan-400 to-purple-500 animate-pulse"
            style={{
              height: `${heightRatio * 20}px`,
              animationDelay: `${idx * 100}ms`,
              animationDuration: '700ms',
            }}
          />
        ))}
      </div>
    </div>
  );
};
