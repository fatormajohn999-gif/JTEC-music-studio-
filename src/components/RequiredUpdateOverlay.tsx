import React from 'react';
import { Download, AlertTriangle, Loader2, CheckCircle2, ShieldAlert, RefreshCw } from 'lucide-react';
import { NativeUpdateService } from '../services/nativeUpdate';

interface RequiredUpdateOverlayProps {
  versionName?: string;
  notesBullets?: string[];
  formattedSize?: string;
  isDownloading?: boolean;
  downloadProgress?: number;
  isDownloaded?: boolean;
  downloadError?: string | null;
  onUpdateNow?: () => void;
  customMessage?: string;
  isWeb?: boolean;
  onReloadWeb?: () => void;
}

export const RequiredUpdateOverlay: React.FC<RequiredUpdateOverlayProps> = ({
  versionName,
  notesBullets = [],
  formattedSize = '',
  isDownloading = false,
  downloadProgress = 0,
  isDownloaded = false,
  downloadError = null,
  onUpdateNow,
  customMessage,
  isWeb = false,
  onReloadWeb,
}) => {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/95 backdrop-blur-xl p-4 sm:p-6 select-none animate-in fade-in duration-300">
      {/* Background artwork & glowing lights */}
      <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md bg-gradient-to-b from-[#0f1738] via-[#090e24] to-[#050814] border border-cyan-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-cyan-950/80 flex flex-col text-center">
        {/* Top Badge */}
        <div className="flex justify-center mb-4">
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-bold tracking-wider uppercase">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Update Required{versionName ? ` • ${versionName}` : ''}</span>
          </span>
        </div>

        {/* Title */}
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mb-2">
          Update <span className="text-gradient-cyan-purple">JTEC MUSIC</span>
        </h2>

        {/* Message */}
        <p className="text-xs sm:text-sm text-slate-300 mb-5 leading-relaxed">
          {customMessage || 'An update is required to continue using JTEC MUSIC.'}
        </p>

        {/* What's New notes if available */}
        {notesBullets.length > 0 && (
          <div className="rounded-2xl bg-slate-950/70 border border-white/5 p-4 text-left space-y-2 mb-5 max-h-48 overflow-y-auto">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              <span>What&apos;s New</span>
              {formattedSize && <span className="text-cyan-400 font-semibold">{formattedSize}</span>}
            </div>
            {notesBullets.map((bullet, idx) => (
              <div key={idx} className="flex items-start gap-2 text-xs text-slate-200">
                <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                <span>{bullet}</span>
              </div>
            ))}
          </div>
        )}

        {/* Progress bar if downloading */}
        {isDownloading && !isWeb && (
          <div className="w-full space-y-2 mb-5">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-cyan-300">Downloading package...</span>
              <span className="text-white">{downloadProgress}%</span>
            </div>
            <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden border border-cyan-500/20">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500 rounded-full transition-all duration-200"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Download Error Banner & Browser Download Link */}
        {downloadError && !isWeb && (
          <div className="p-3 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs space-y-1.5 text-left">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{downloadError}</span>
            </div>
            <div className="pl-6">
              <button
                type="button"
                onClick={() => NativeUpdateService.openBrowserDownload()}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 underline font-semibold cursor-pointer active:opacity-75 transition inline-block"
              >
                Download from browser instead
              </button>
            </div>
          </div>
        )}

        {/* Action Button: Web = Reload to update, Native = Update now / Install */}
        {isWeb ? (
          <button
            type="button"
            onClick={onReloadWeb || (() => window.location.reload())}
            className="w-full py-3.5 px-5 rounded-2xl font-bold text-sm shadow-xl active:scale-95 transition flex items-center justify-center gap-2 cursor-pointer bg-gradient-to-r from-cyan-500 via-purple-600 to-pink-500 text-white shadow-cyan-500/25 hover:shadow-cyan-400/40"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Reload to update</span>
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onUpdateNow}
              disabled={isDownloading}
              className={`w-full py-3.5 px-5 rounded-2xl font-bold text-sm shadow-xl active:scale-95 transition flex items-center justify-center gap-2 cursor-pointer ${
                isDownloading
                  ? 'bg-slate-800 text-slate-400 cursor-wait'
                  : isDownloaded && !downloadError
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-emerald-500/25 hover:shadow-emerald-400/40'
                  : 'bg-gradient-to-r from-cyan-500 via-purple-600 to-pink-500 text-white shadow-cyan-500/25 hover:shadow-cyan-400/40'
              }`}
            >
              {isDownloading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                  <span>Downloading ({downloadProgress}%)...</span>
                </>
              ) : isDownloaded && !downloadError ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Install update</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>{downloadError ? 'Retry update' : 'Update now'}</span>
                </>
              )}
            </button>

            {/* Installation Hint Text */}
            <p className="text-[11px] text-slate-400 mt-4 leading-relaxed">
              Tap to download and install. Android may ask you to allow installs from JTEC MUSIC.
            </p>
          </>
        )}
      </div>
    </div>
  );
};
