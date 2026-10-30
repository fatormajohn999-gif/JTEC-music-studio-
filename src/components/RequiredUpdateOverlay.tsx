import React from 'react';
import { Download, AlertTriangle, Loader2, CheckCircle2, ShieldAlert, RefreshCw } from 'lucide-react';
import { NativeUpdateService, getInstalledBuildSync, resolveApkDownloadUrl } from '../services/nativeUpdate';

interface RequiredUpdateOverlayProps {
  versionName?: string;
  notesBullets?: string[];
  formattedSize?: string;
  minBuild?: number;
  isDownloading?: boolean;
  downloadProgress?: number;
  isDownloaded?: boolean;
  isInstalling?: boolean;
  isInstallerOpened?: boolean;
  downloadError?: string | null;
  reasonCode?: string | null;
  onUpdateNow?: () => void;
  onBrowserDownload?: () => void;
  onTryAgain?: () => void;
  apkUrl?: string;
  customMessage?: string;
  isWeb?: boolean;
  onReloadWeb?: () => void;
  isPreview?: boolean;
  onClosePreview?: () => void;
}

export const RequiredUpdateOverlay: React.FC<RequiredUpdateOverlayProps> = ({
  versionName,
  notesBullets = [],
  formattedSize = '',
  minBuild,
  isDownloading = false,
  downloadProgress = 0,
  isDownloaded = false,
  isInstalling = false,
  isInstallerOpened = false,
  downloadError = null,
  reasonCode = null,
  onUpdateNow,
  onBrowserDownload,
  onTryAgain,
  apkUrl,
  customMessage,
  isWeb = false,
  onReloadWeb,
  isPreview = false,
  onClosePreview,
}) => {
  // Safety rule: The required-update screen must never trap the user.
  // If the installed build is already equal to or higher than the target minBuild, it must never appear.
  const currentBuild = getInstalledBuildSync();
  if (!isPreview && minBuild && minBuild > 0 && currentBuild >= minBuild) {
    return null;
  }

  const effectiveApkUrl = resolveApkDownloadUrl(apkUrl);

  const handleBrowserDownload = () => {
    if (onBrowserDownload) {
      onBrowserDownload();
    } else {
      NativeUpdateService.openBrowserDownload(effectiveApkUrl);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/95 backdrop-blur-xl p-4 sm:p-6 select-none animate-in fade-in duration-300">
      {/* Background artwork & glowing lights */}
      <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md bg-gradient-to-b from-[#0f1738] via-[#090e24] to-[#050814] border border-cyan-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-cyan-950/80 flex flex-col text-center">
        {/* Preview badge or close button */}
        {isPreview && (
          <div className="flex items-center justify-between pb-3 mb-2 border-b border-cyan-500/20">
            <span className="text-[10px] font-bold text-amber-300 uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/30">
              Developer Preview Mode
            </span>
            {onClosePreview && (
              <button
                type="button"
                onClick={onClosePreview}
                className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded-lg bg-slate-800/80 cursor-pointer"
              >
                Close Preview ✕
              </button>
            )}
          </div>
        )}

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

        {/* Web vs Native Layout */}
        {isWeb ? (
          <div className="w-full space-y-3">
            <button
              type="button"
              onClick={onReloadWeb || (() => window.location.reload())}
              className="w-full py-3.5 px-5 rounded-2xl font-bold text-sm shadow-xl active:scale-95 transition flex items-center justify-center gap-2 cursor-pointer bg-gradient-to-r from-cyan-500 via-purple-600 to-pink-500 text-white shadow-cyan-500/25 hover:shadow-cyan-400/40"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Reload to update</span>
            </button>

            {/* Always show second button: Download from browser */}
            <button
              type="button"
              onClick={handleBrowserDownload}
              className="w-full py-3 px-5 rounded-2xl font-bold text-xs bg-slate-900/90 hover:bg-slate-800 text-cyan-300 hover:text-cyan-200 border border-cyan-500/30 active:scale-95 transition cursor-pointer flex items-center justify-center gap-2 shadow"
            >
              <Download className="w-4 h-4 text-cyan-400" />
              <span>Download from browser</span>
            </button>
          </div>
        ) : (
          <div className="w-full space-y-3">
            {/* Progress bar during download */}
            {isDownloading && (
              <div className="w-full space-y-2 mb-1">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-cyan-300">Downloading package...</span>
                  <span className="text-white font-mono">{downloadProgress}%</span>
                </div>
                <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden border border-cyan-500/20">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500 rounded-full transition-all duration-200"
                    style={{ width: `${downloadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Error Banner with small reason code if something failed */}
            {downloadError && (
              <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs space-y-1.5 text-left animate-in fade-in">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold text-rose-200">{downloadError}</p>
                    {reasonCode && (
                      <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-rose-950/60 text-rose-300 border border-rose-500/20">
                        Code: {reasonCode}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Short hint for Android install permissions */}
            <div className="p-3 rounded-2xl bg-cyan-950/40 border border-cyan-500/20 text-left flex items-start gap-2.5 text-xs text-cyan-200">
              <ShieldAlert className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <p className="leading-relaxed text-[11px] text-slate-300">
                Allow installs from JTEC MUSIC in the screen Android shows, then come back and tap Install update.
              </p>
            </div>

            {/* PRIMARY BUTTON: Update now / Downloading / Installing / Tap Install / Try again */}
            <button
              type="button"
              onClick={downloadError ? (onTryAgain || onUpdateNow) : onUpdateNow}
              disabled={isDownloading || isInstalling}
              className={`w-full py-3.5 px-5 rounded-2xl font-bold text-sm shadow-xl active:scale-95 transition flex items-center justify-center gap-2 cursor-pointer ${
                isDownloading || isInstalling
                  ? 'bg-slate-800 text-slate-400 cursor-wait'
                  : downloadError
                  ? 'bg-gradient-to-r from-amber-500 to-rose-500 text-white shadow-amber-500/25 hover:shadow-amber-400/40'
                  : isInstallerOpened
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-emerald-500/25 hover:shadow-emerald-400/40'
                  : isDownloaded
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-emerald-500/25 hover:shadow-emerald-400/40'
                  : 'bg-gradient-to-r from-cyan-500 via-purple-600 to-pink-500 text-white shadow-cyan-500/25 hover:shadow-cyan-400/40'
              }`}
            >
              {isDownloading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                  <span>Downloading... {downloadProgress}%</span>
                </>
              ) : isInstalling ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                  <span>Installing...</span>
                </>
              ) : isInstallerOpened ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-white" />
                  <span>Tap Install on the Android screen</span>
                </>
              ) : downloadError ? (
                <>
                  <RefreshCw className="w-4 h-4" />
                  <span>Try again</span>
                </>
              ) : isDownloaded ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Install update</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Update now</span>
                </>
              )}
            </button>

            {/* ALWAYS SHOW SECOND BUTTON: Download from browser */}
            <button
              type="button"
              onClick={handleBrowserDownload}
              className="w-full py-3 px-5 rounded-2xl font-bold text-xs bg-slate-900/90 hover:bg-slate-800 text-cyan-300 hover:text-cyan-200 border border-cyan-500/30 active:scale-95 transition cursor-pointer flex items-center justify-center gap-2 shadow"
            >
              <Download className="w-4 h-4 text-cyan-400" />
              <span>Download from browser</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
