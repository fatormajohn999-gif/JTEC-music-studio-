import React from 'react';
import { RefreshCw } from 'lucide-react';

interface PWAUpdateBannerProps {
  onUpdate: () => void;
  isUpdating: boolean;
  hasMiniPlayer?: boolean;
}

export const PWAUpdateBanner: React.FC<PWAUpdateBannerProps> = ({
  onUpdate,
  isUpdating,
  hasMiniPlayer = false,
}) => {
  return (
    <div
      className={`fixed ${
        hasMiniPlayer ? 'bottom-32 sm:bottom-36' : 'bottom-20 sm:bottom-24'
      } left-0 right-0 z-40 px-3 max-w-sm mx-auto pointer-events-none transition-all duration-300 animate-in fade-in slide-in-from-bottom-4`}
    >
      <div className="pointer-events-auto flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-2xl bg-slate-900/95 border border-cyan-500/50 shadow-2xl shadow-cyan-950/90 backdrop-blur-xl">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
          </span>
          <span className="text-xs font-semibold text-slate-100 truncate">
            New version available
          </span>
        </div>
        <button
          onClick={onUpdate}
          disabled={isUpdating}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-bold text-xs shadow-md shadow-cyan-500/30 active:scale-95 transition disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`w-3 h-3 ${isUpdating ? 'animate-spin' : ''}`} />
          <span>{isUpdating ? 'Updating...' : 'Update'}</span>
        </button>
      </div>
    </div>
  );
};
