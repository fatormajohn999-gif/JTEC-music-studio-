import React from 'react';
import { Search, Settings, Sliders, Cloud, ArrowLeft } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';

interface HeaderProps {
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onOpenEffects: () => void;
  onOpenCloud?: () => void;
  onLogoClick?: () => void;
  isSettingsView?: boolean;
  onBackFromSettings?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSearch,
  onOpenSettings,
  onOpenEffects,
  onOpenCloud,
  onLogoClick,
  isSettingsView = false,
  onBackFromSettings,
}) => {
  return (
    <header className="sticky top-0 z-30 w-full shrink-0 bg-[#060810]/95 backdrop-blur-2xl border-b border-white/10 shadow-lg shadow-black/50 transition-all duration-200">
      <div className="max-w-4xl mx-auto px-3 sm:px-5 pt-[max(0.625rem,env(safe-area-inset-top))] pb-2.5 flex items-center justify-between gap-2">
        {/* Brand or Back Navigation */}
        {isSettingsView ? (
          <div className="flex items-center gap-3">
            {onBackFromSettings && (
              <button
                type="button"
                onClick={onBackFromSettings}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-white/10 text-cyan-300 font-semibold text-xs active:scale-95 transition cursor-pointer"
                aria-label="Back to music player"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
            )}
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-bold text-white tracking-wide">Settings</h1>
              <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                PRO
              </span>
            </div>
          </div>
        ) : (
          <div 
            onClick={onLogoClick}
            className="flex items-center gap-2.5 cursor-pointer group select-none"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onLogoClick?.()}
            title="JTEC MUSIC Home"
          >
            {/* Glowing Brand Logo */}
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-cyan-400 via-purple-500 to-pink-500 p-[1.5px] shadow-lg shadow-cyan-500/20 group-hover:shadow-cyan-400/40 transition shrink-0 overflow-hidden">
              <img
                src="./logo.png"
                alt="JTEC MUSIC"
                className="w-full h-full rounded-[10px] object-cover"
                loading="eager"
              />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm sm:text-base font-extrabold tracking-wider text-white whitespace-nowrap">
                  JTEC <span className="text-gradient-cyan-purple">MUSIC</span>
                </h1>
                <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold">
                  PRO
                </span>
              </div>
              <p className="hidden sm:block text-[10px] text-slate-400 font-medium tracking-tight truncate">
                Your Music • Your Vibe • Offline
              </p>
            </div>
          </div>
        )}

        {/* Action Controls */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <PWAInstallButton compact />

          <button
            type="button"
            onClick={onOpenEffects}
            title="Audio Effects Lab"
            aria-label="Open Audio Effects Lab"
            className="p-2 rounded-xl text-slate-300 hover:text-cyan-300 hover:bg-white/5 active:scale-95 transition cursor-pointer"
          >
            <Sliders className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>

          {onOpenCloud && (
            <button
              type="button"
              onClick={onOpenCloud}
              title="Browse JTEC CLOUD Music"
              aria-label="Browse Cloud Music"
              className="p-2 rounded-xl text-slate-300 hover:text-cyan-300 hover:bg-white/5 active:scale-95 transition cursor-pointer"
            >
              <Cloud className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          )}

          <button
            type="button"
            onClick={onOpenSearch}
            title="Search Music Library"
            aria-label="Search Library"
            className="p-2 rounded-xl text-slate-300 hover:text-cyan-300 hover:bg-white/5 active:scale-95 transition cursor-pointer"
          >
            <Search className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            title="Player Settings"
            aria-label="Open Settings"
            className={`p-2 rounded-xl transition cursor-pointer active:scale-95 ${
              isSettingsView 
                ? 'text-cyan-400 bg-cyan-500/15 border border-cyan-500/30' 
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>
      </div>
      {/* Subtle neon gradient accent line */}
      <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />
    </header>
  );
};
