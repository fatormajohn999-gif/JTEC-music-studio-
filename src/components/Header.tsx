import React from 'react';
import { Search, Cloud, Settings, ArrowLeft } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';

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
  onOpenCloud,
  onLogoClick,
  isSettingsView = false,
  onBackFromSettings,
}) => {
  return (
    <header
      role="banner"
      className="sticky top-0 z-40 w-full shrink-0 bg-[#060810]/98 backdrop-blur-2xl border-b border-cyan-500/20 shadow-2xl shadow-black/80 transition-all duration-200"
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-[max(1.375rem,calc(env(safe-area-inset-top)+1rem))] pb-4 sm:pb-5 min-h-[82px] sm:min-h-[94px] flex items-center justify-between gap-2.5 sm:gap-3">
        {/* Left Side: Substantial Brand Typography & PRO Badge */}
        {isSettingsView ? (
          <div className="flex items-center gap-3">
            {onBackFromSettings && (
              <button
                type="button"
                onClick={onBackFromSettings}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onBackFromSettings();
                  }
                }}
                className="flex items-center gap-2 px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-cyan-500/30 hover:border-cyan-400 text-cyan-300 font-bold text-xs sm:text-sm active:scale-95 transition-all shadow-md shadow-cyan-500/10 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#060810]"
                aria-label="Back to music player"
                title="Back to music player"
              >
                <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                <span>Back</span>
              </button>
            )}
            <div className="flex items-center gap-2 sm:gap-2.5">
              <h1 className="text-xl sm:text-3xl font-black text-white tracking-wide">Settings</h1>
              <span className="text-[10px] sm:text-xs font-mono uppercase px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-black tracking-wider shadow-sm shadow-cyan-500/20">
                PRO
              </span>
            </div>
          </div>
        ) : (
          <div
            onClick={onLogoClick}
            className="flex items-center gap-2 sm:gap-2.5 cursor-pointer group select-none shrink-0 rounded-2xl p-1 -m-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#060810]"
            role="link"
            tabIndex={0}
            aria-label="JTEC MUSIC Home - Return to home screen"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onLogoClick?.();
              }
            }}
            title="JTEC MUSIC Home"
          >
            {/* Pure Typography Branding - Premium & Substantial */}
            <h1 className="text-2xl sm:text-3xl font-black tracking-wider text-white whitespace-nowrap drop-shadow-xl">
              JTEC <span className="text-gradient-cyan-purple">MUSIC</span>
            </h1>
            <span className="text-[10px] sm:text-xs font-mono uppercase px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-black tracking-wider shadow-sm shadow-cyan-500/20">
              PRO
            </span>
          </div>
        )}

        {/* Right Side: Neatly Aligned Search, Cloud & Settings Icons */}
        <nav aria-label="Quick Controls" className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          <PWAInstallButton compact />

          {/* Search Library Button */}
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
            aria-label="Search local library and songs by title, artist, or album"
            className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center bg-slate-900/80 border border-white/10 hover:border-cyan-500/50 text-slate-300 hover:text-cyan-300 active:scale-95 transition-all shadow-md shadow-black/40 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#060810]"
          >
            <Search className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
          </button>

          {/* Cloud Catalog Button */}
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
              aria-label="Browse JTEC Cloud Music Catalog and Online Streams"
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center bg-slate-900/80 border border-white/10 hover:border-cyan-500/50 text-slate-300 hover:text-cyan-300 active:scale-95 transition-all shadow-md shadow-black/40 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#060810]"
            >
              <Cloud className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
            </button>
          )}

          {/* Player Settings Button - Highlighted & Prominent */}
          <button
            type="button"
            onClick={onOpenSettings}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpenSettings();
              }
            }}
            title="Player Settings"
            aria-label={isSettingsView ? "Currently in Player Settings" : "Open Player Settings and audio configuration"}
            aria-pressed={isSettingsView}
            className={`w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center transition-all shadow-lg active:scale-95 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#060810] ${
              isSettingsView
                ? 'text-cyan-300 bg-cyan-500/25 border border-cyan-400 shadow-cyan-500/30 scale-105'
                : 'bg-gradient-to-tr from-cyan-500/15 via-purple-500/15 to-slate-900/90 border border-cyan-500/40 hover:border-cyan-400 text-cyan-300 hover:text-white shadow-cyan-500/15 hover:shadow-cyan-400/25'
            }`}
          >
            <Settings className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
          </button>
        </nav>
      </div>

      {/* Radiant cyan accent border line */}
      <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent shadow-sm shadow-cyan-400/50" />
    </header>
  );
};
