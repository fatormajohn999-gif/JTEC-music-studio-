import React from 'react';
import { Sliders, Cloud, Search, Settings } from 'lucide-react';

interface HeaderProps {
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onOpenEffects?: () => void;
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
  const handleSettingsClick = () => {
    if (isSettingsView && onBackFromSettings) {
      onBackFromSettings();
    } else {
      onOpenSettings();
    }
  };

  return (
    <header
      role="banner"
      className="sticky top-0 z-40 w-full shrink-0 bg-[#060810]/95 backdrop-blur-2xl border-b border-white/10 transition-colors"
      style={{
        paddingTop: 'max(0.625rem, env(safe-area-inset-top, 0px))',
        paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(1rem, env(safe-area-inset-right, 0px))',
      }}
    >
      <div className="max-w-3xl mx-auto w-full py-2.5 sm:py-3 flex items-center justify-between gap-3 min-w-0">
        {/* Left Side: JTEC MUSIC Title, PRO Badge, and Subtitle (No Logo) */}
        <div
          onClick={onLogoClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onLogoClick?.();
            }
          }}
          role="button"
          tabIndex={0}
          aria-label="JTEC MUSIC Home"
          className="flex flex-col min-w-0 flex-1 overflow-hidden cursor-pointer select-none group text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#060810] rounded-xl pr-2"
        >
          {/* Main Title Row: JTEC + MUSIC + PRO badge */}
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 overflow-hidden">
            <h1 className="text-lg sm:text-2xl font-black tracking-wide leading-tight truncate shrink-0">
              <span className="text-white">JTEC </span>
              <span className="text-gradient-cyan-purple">MUSIC</span>
            </h1>

            <span className="text-[10px] sm:text-[11px] font-mono font-bold px-1.5 sm:px-2 py-0.5 rounded-full border border-cyan-500/40 text-cyan-300 bg-cyan-950/40 shrink-0 tracking-wider shadow-sm shadow-cyan-500/10">
              PRO
            </span>
          </div>

          {/* Subtitle */}
          <p className="text-[11px] sm:text-xs text-slate-400 font-medium tracking-wide leading-tight truncate mt-0.5">
            Your Music • Your Vibe
          </p>
        </div>

        {/* Right Side: Four Icon Buttons in Exact Order (Equalizer, Cloud, Search, Settings) */}
        <nav aria-label="Quick Actions" className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* 1. Equalizer / Sound DSP Effects */}
          {onOpenEffects && (
            <button
              type="button"
              onClick={onOpenEffects}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpenEffects();
                }
              }}
              title="Equalizer & DSP Audio Effects"
              aria-label="Open Equalizer and Audio Effects"
              className="p-2 sm:p-2.5 rounded-xl text-slate-300 hover:text-cyan-300 hover:bg-white/5 active:scale-95 transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              <Sliders className="w-5 h-5 sm:w-[22px] sm:h-[22px]" strokeWidth={1.8} aria-hidden="true" />
            </button>
          )}

          {/* 2. Cloud Music Catalog */}
          {onOpenCloud && (
            <button
              type="button"
              onClick={onOpenCloud}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpenCloud();
                }
              }}
              title="Browse JTEC CLOUD Music"
              aria-label="Browse JTEC Cloud Music Catalogs"
              className="p-2 sm:p-2.5 rounded-xl text-slate-300 hover:text-cyan-300 hover:bg-white/5 active:scale-95 transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              <Cloud className="w-5 h-5 sm:w-[22px] sm:h-[22px]" strokeWidth={1.8} aria-hidden="true" />
            </button>
          )}

          {/* 3. Search Library */}
          <button
            type="button"
            onClick={onOpenSearch}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpenSearch();
              }
            }}
            title="Search Music Library"
            aria-label="Search local library songs"
            className="p-2 sm:p-2.5 rounded-xl text-slate-300 hover:text-cyan-300 hover:bg-white/5 active:scale-95 transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            <Search className="w-5 h-5 sm:w-[22px] sm:h-[22px]" strokeWidth={1.8} aria-hidden="true" />
          </button>

          {/* 4. Player Settings */}
          <button
            type="button"
            onClick={handleSettingsClick}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleSettingsClick();
              }
            }}
            title={isSettingsView ? "Back to Player" : "Settings"}
            aria-label={isSettingsView ? "Close settings and return to player" : "Open application and player settings"}
            aria-pressed={isSettingsView}
            className={`p-2 sm:p-2.5 rounded-xl transition-all cursor-pointer active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
              isSettingsView
                ? 'text-cyan-300 bg-cyan-500/15 border border-cyan-500/40 shadow-sm shadow-cyan-500/20'
                : 'text-slate-300 hover:text-cyan-300 hover:bg-white/5 border border-transparent'
            }`}
          >
            <Settings className="w-5 h-5 sm:w-[22px] sm:h-[22px]" strokeWidth={1.8} aria-hidden="true" />
          </button>
        </nav>
      </div>
    </header>
  );
};
