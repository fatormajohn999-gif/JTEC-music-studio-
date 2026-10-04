import React, { useState } from 'react';
import { Download, Share, PlusSquare, X, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  // Android / Chromium / Desktop flow
  if (isInstallable) {
    if (compact) {
      return (
        <button
          onClick={install}
          title="Install JTEC MUSIC"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-gradient-to-r from-cyan-500 to-purple-600 text-white shadow-lg shadow-cyan-500/20 hover:brightness-110 active:scale-95 transition"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Install App</span>
        </button>
      );
    }

    return (
      <button
        onClick={install}
        className="w-full flex items-center justify-between p-3.5 rounded-xl bg-gradient-to-r from-cyan-500/15 via-purple-500/15 to-pink-500/15 border border-cyan-500/30 hover:border-cyan-400 text-white transition group"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-cyan-500 to-purple-600 flex items-center justify-center text-white shadow-md shadow-cyan-500/20 group-hover:scale-105 transition">
            <Download className="w-5 h-5" />
          </div>
          <div className="text-left">
            <div className="text-sm font-semibold text-white">Install JTEC MUSIC</div>
            <div className="text-xs text-slate-400">Play offline anytime on your home screen</div>
          </div>
        </div>
        <span className="px-3 py-1 text-xs font-semibold rounded-full bg-cyan-500 text-black">
          Install
        </span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        {compact ? (
          <button
            onClick={() => setShowIOSGuide(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-slate-800 border border-slate-700 text-cyan-300 hover:bg-slate-700 transition"
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Install on iOS</span>
          </button>
        ) : (
          <button
            onClick={() => setShowIOSGuide(true)}
            className="w-full flex items-center justify-between p-3.5 rounded-xl bg-slate-900/80 border border-cyan-500/30 text-white transition hover:border-cyan-400"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-cyan-950/60 border border-cyan-500/40 flex items-center justify-center text-cyan-300">
                <Smartphone className="w-5 h-5" />
              </div>
              <div className="text-left">
                <div className="text-sm font-semibold text-white">Add to Home Screen</div>
                <div className="text-xs text-slate-400">Install standalone player for iPhone & iPad</div>
              </div>
            </div>
            <span className="px-3 py-1 text-xs font-semibold rounded-full bg-slate-800 border border-slate-700 text-cyan-300">
              Guide
            </span>
          </button>
        )}

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-sm rounded-2xl bg-[#0e1428] border border-cyan-500/30 p-6 shadow-2xl text-left">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center text-cyan-300">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <h3 className="text-base font-bold text-white">Install on iPhone</h3>
                </div>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3.5 text-sm text-slate-300">
                <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400">
                    <Share className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-white">1. Tap the Share button</div>
                    <div className="text-xs text-slate-400">Located in Safari's bottom toolbar</div>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="p-2 rounded-lg bg-purple-500/20 text-purple-400">
                    <PlusSquare className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-white">2. Select "Add to Home Screen"</div>
                    <div className="text-xs text-slate-400">Scroll down the share sheet menu</div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-300">
                  Enjoy fullscreen offline listening without browser toolbars.
                </div>
              </div>

              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-medium text-sm hover:opacity-90 transition"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
