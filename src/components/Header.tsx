import React from 'react';
import { Search, Settings, Sliders, Disc3 } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';

interface HeaderProps {
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onOpenEffects: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSearch,
  onOpenSettings,
  onOpenEffects,
}) => {
  return (
    <header className="sticky top-0 z-30 w-full glass-panel border-b border-white/10 px-4 py-3">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-2">
        {/* Brand & Subtitle */}
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-400 via-purple-500 to-pink-500 p-[1.5px] shadow-lg shadow-cyan-500/20 overflow-hidden">
            <img
              src="./logo.png"
              alt="JTEC MUSIC"
              className="w-full h-full rounded-[10px] object-cover"
            />
          </div>

          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-base font-extrabold tracking-wider text-white">
                JTEC <span className="text-gradient-cyan-purple">MUSIC</span>
              </h1>
              <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                PRO
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-medium tracking-tight">
              Your Music • Your Vibe • Offline
            </p>
          </div>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1.5">
          <PWAInstallButton compact />

          <button
            onClick={onOpenEffects}
            title="Audio Effects Lab"
            className="p-2 rounded-xl text-slate-300 hover:text-cyan-300 hover:bg-white/5 active:scale-95 transition"
          >
            <Sliders className="w-5 h-5" />
          </button>

          <button
            onClick={onOpenSearch}
            title="Search Library"
            className="p-2 rounded-xl text-slate-300 hover:text-cyan-300 hover:bg-white/5 active:scale-95 transition"
          >
            <Search className="w-5 h-5" />
          </button>

          <button
            onClick={onOpenSettings}
            title="Player Settings"
            className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/5 active:scale-95 transition"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
};
