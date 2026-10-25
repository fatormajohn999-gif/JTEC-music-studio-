import React from 'react';
import { Download } from 'lucide-react';

interface NativeUpdateBottomSheetProps {
  isOpen: boolean;
  versionName: string;
  onUpdateNow: () => void;
  onLater: () => void;
}

export const NativeUpdateBottomSheet: React.FC<NativeUpdateBottomSheetProps> = ({
  isOpen,
  versionName,
  onUpdateNow,
  onLater,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200">
      {/* Backdrop */}
      <div className="absolute inset-0" onClick={onLater} />

      {/* Bottom Sheet Card */}
      <div
        className="relative w-full max-w-md bg-slate-900 border-t sm:border border-slate-800 sm:border-slate-700/80 rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl shadow-cyan-950/60 z-10 flex flex-col items-center text-center animate-in slide-in-from-bottom duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="w-12 h-1.5 bg-slate-700/80 rounded-full mb-4" />

        {/* Download Icon */}
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-500/20 to-blue-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 mb-3 shadow-lg shadow-cyan-500/20">
          <Download className="w-6 h-6 animate-pulse" />
        </div>

        {/* Title */}
        <h3 className="text-lg font-bold text-white tracking-wide">
          New version available
        </h3>

        {/* Version */}
        <p className="text-xs font-semibold text-cyan-400 mt-1 mb-5">
          {versionName}
        </p>

        {/* Buttons */}
        <div className="w-full space-y-2.5">
          <button
            type="button"
            onClick={onUpdateNow}
            className="w-full py-3 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 shadow-lg shadow-cyan-500/25 active:scale-[0.98] transition cursor-pointer flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            <span>Update now</span>
          </button>

          <button
            type="button"
            onClick={onLater}
            className="w-full py-2.5 px-4 rounded-xl font-semibold text-sm bg-slate-800/90 hover:bg-slate-700/80 text-slate-300 border border-slate-700/80 active:scale-[0.98] transition cursor-pointer"
          >
            Later
          </button>
        </div>

        {/* Hint text */}
        <p className="text-[11px] text-slate-400 text-center leading-relaxed mt-4 px-1">
          When the download finishes, tap the file to install. If Android asks, allow installs from your browser.
        </p>
      </div>
    </div>
  );
};
