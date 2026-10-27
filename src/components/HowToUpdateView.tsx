import React, { useEffect, useRef, useState } from 'react';
import { 
  ArrowLeft, RefreshCw, Smartphone, Globe, ShieldCheck, 
  AlertTriangle, CheckCircle2 
} from 'lucide-react';
import { getCurrentAppVersion } from '../services/nativeUpdate';
import { CheckForUpdatesButton } from './CheckForUpdatesButton';
import { APP_VERSION } from '../version';

interface HowToUpdateViewProps {
  onBack: () => void;
}

export const HowToUpdateView: React.FC<HowToUpdateViewProps> = ({ onBack }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [versionInfo, setVersionInfo] = useState<{ version: string; build: number }>(() => {
    const match = APP_VERSION.match(/^([^(]+)(?:\s*\(Build\s*(\d+)\))?/i);
    let v = '1.0.1';
    let b = 101;
    if (match) {
      v = match[1].trim();
      if (match[2]) {
        const parsed = parseInt(match[2], 10);
        if (!isNaN(parsed)) b = parsed;
      }
    }
    return { version: v, build: b };
  });

  useEffect(() => {
    window.scrollTo(0, 0);
    const scrollParent = containerRef.current?.closest('main');
    if (scrollParent) {
      scrollParent.scrollTop = 0;
    }

    getCurrentAppVersion().then((info) => {
      setVersionInfo({ version: info.version, build: info.build });
    });
  }, []);

  return (
    <div ref={containerRef} className="space-y-6 pb-48 px-4 pt-2 max-w-3xl mx-auto animate-in fade-in">
      {/* Top Navigation Bar with Back Button */}
      <div className="flex items-center gap-3 pb-3 border-b border-white/10">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-white/10 text-cyan-300 font-semibold text-xs active:scale-95 transition cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Settings</span>
        </button>
        <div className="flex items-center gap-2">
          <RefreshCw className="w-5 h-5 text-cyan-400" />
          <h2 className="text-lg font-bold text-white tracking-wide">How to Update</h2>
        </div>
      </div>

      {/* Version Status & Check Button Card */}
      <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-br from-[#0c1330]/90 via-[#0a0f24]/90 to-[#120a26]/90 border border-cyan-500/30 space-y-4 shadow-xl text-center">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-xs font-semibold mx-auto">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>You have version {versionInfo.version} (Build {versionInfo.build})</span>
        </div>

        <p className="text-xs sm:text-sm text-slate-300 max-w-md mx-auto leading-relaxed">
          Stay on the latest build to get new music improvements, offline stability, and audio engine refinements.
        </p>

        {/* Check for updates now button */}
        <div className="pt-1">
          <CheckForUpdatesButton label="Check for updates now" />
        </div>
      </div>

      {/* Guide 1: Android (APK) */}
      <section className="p-5 sm:p-6 rounded-2xl bg-slate-900/60 border border-cyan-500/20 space-y-3.5">
        <div className="flex items-center gap-2.5 text-white font-bold text-sm">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 flex items-center justify-center shrink-0">
            <Smartphone className="w-4 h-4" />
          </div>
          <h3>Android (APK)</h3>
        </div>

        <div className="space-y-3 text-xs sm:text-sm text-slate-300 leading-relaxed">
          <p>
            Open Settings and tap Check for updates. If a new version is found, tap Update now, then tap the downloaded file and tap Install. Your downloaded songs stay safe.
          </p>

          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5 text-xs text-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>
              If Android says the app can&apos;t be installed because it conflicts with the old one, uninstall the old version once and install again. Songs downloaded in the old version will have to be downloaded again.
            </span>
          </div>
        </div>
      </section>

      {/* Guide 2: Android and iPhone (website app) */}
      <section className="p-5 sm:p-6 rounded-2xl bg-slate-900/60 border border-purple-500/20 space-y-3.5">
        <div className="flex items-center gap-2.5 text-white font-bold text-sm">
          <div className="w-8 h-8 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-400 flex items-center justify-center shrink-0">
            <Globe className="w-4 h-4" />
          </div>
          <h3>Android and iPhone (website app)</h3>
        </div>

        <div className="space-y-3 text-xs sm:text-sm text-slate-300 leading-relaxed">
          <p>
            The website app updates by itself. Close it completely and open it again. If you still see the old version, tap Check for updates in Settings. On iPhone, if it still doesn&apos;t update, remove the icon from the home screen and add it again. This can remove offline songs.
          </p>
        </div>
      </section>

      {/* Return Button */}
      <div className="pt-2">
        <button
          type="button"
          onClick={onBack}
          className="w-full py-3 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-white/10 text-cyan-300 font-bold text-xs shadow-lg active:scale-98 transition cursor-pointer"
        >
          ← Return to Player Settings
        </button>
      </div>
    </div>
  );
};
