import React, { useEffect, useRef, useState } from 'react';
import { 
  ArrowLeft, Download, Copy, Check, ExternalLink, Smartphone, 
  Globe, Apple, ShieldCheck, AlertTriangle 
} from 'lucide-react';
import { APK_DOWNLOAD_URL, NativeUpdateService } from '../services/nativeUpdate';

interface InstallGuideViewProps {
  onBack: () => void;
}

type InstallTab = 'android-apk' | 'android-web' | 'iphone';

export const InstallGuideView: React.FC<InstallGuideViewProps> = ({ onBack }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [activeTab, setActiveTab] = useState<InstallTab>(() => {
    if (typeof navigator === 'undefined') return 'android-apk';
    const ua = navigator.userAgent || '';
    const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return isIos ? 'iphone' : 'android-apk';
  });

  const [copiedApk, setCopiedApk] = useState(false);
  const [copiedWeb, setCopiedWeb] = useState(false);
  const apkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const webTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    const scrollParent = containerRef.current?.closest('main');
    if (scrollParent) {
      scrollParent.scrollTop = 0;
    }

    return () => {
      if (apkTimerRef.current) clearTimeout(apkTimerRef.current);
      if (webTimerRef.current) clearTimeout(webTimerRef.current);
    };
  }, []);

  const getWebsiteUrl = (): string => {
    if (typeof window === 'undefined') return '';
    const origin = window.location.origin;
    const pathname = window.location.pathname.replace(/\/index\.html$/, '').replace(/\/+$/, '');
    return `${origin}${pathname || '/'}`;
  };

  const handleCopyApk = async () => {
    try {
      await navigator.clipboard.writeText(APK_DOWNLOAD_URL);
      setCopiedApk(true);
      if (apkTimerRef.current) clearTimeout(apkTimerRef.current);
      apkTimerRef.current = setTimeout(() => setCopiedApk(false), 2500);
    } catch {
      // Ignore
    }
  };

  const handleCopyWeb = async () => {
    try {
      const url = getWebsiteUrl();
      await navigator.clipboard.writeText(url);
      setCopiedWeb(true);
      if (webTimerRef.current) clearTimeout(webTimerRef.current);
      webTimerRef.current = setTimeout(() => setCopiedWeb(false), 2500);
    } catch {
      // Ignore
    }
  };

  const handleDownloadApk = () => {
    NativeUpdateService.openDownloadPage();
  };

  const handleOpenWebsite = () => {
    const url = getWebsiteUrl();
    window.open(url, '_blank', 'noopener,noreferrer');
  };

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
          <Download className="w-5 h-5 text-cyan-400" />
          <h2 className="text-lg font-bold text-white tracking-wide">Install Guide</h2>
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-3 gap-2 p-1.5 rounded-2xl bg-slate-900/80 border border-white/10">
        <button
          type="button"
          onClick={() => setActiveTab('android-apk')}
          className={`flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            activeTab === 'android-apk'
              ? 'bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-cyan-400/50 text-cyan-300 shadow-md shadow-cyan-500/10'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Smartphone className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Android (APK)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('android-web')}
          className={`flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            activeTab === 'android-web'
              ? 'bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-cyan-400/50 text-cyan-300 shadow-md shadow-cyan-500/10'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Globe className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Android (Web)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('iphone')}
          className={`flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            activeTab === 'iphone'
              ? 'bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-cyan-400/50 text-cyan-300 shadow-md shadow-cyan-500/10'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Apple className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">iPhone</span>
        </button>
      </div>

      {/* Tab 1: Android (APK) */}
      {activeTab === 'android-apk' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="p-5 sm:p-6 rounded-3xl bg-slate-900/70 border border-cyan-500/30 space-y-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 flex items-center justify-center shrink-0">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Android Native App (Recommended)</h3>
                <p className="text-xs text-slate-400">Direct install with full offline playback and lock screen controls</p>
              </div>
            </div>

            <ol className="space-y-3 text-xs sm:text-sm text-slate-300 leading-relaxed pt-1">
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</span>
                <span>Tap <strong>Download APK</strong> below.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</span>
                <span>When the download finishes, open the file from your notifications or the Downloads folder.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">3</span>
                <span>If Android says the install is blocked, tap <strong>Settings</strong> and allow installs from this source, then go back and tap <strong>Install</strong>.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">4</span>
                <span>If Play Protect warns you, tap <strong>Install anyway</strong>. The app is safe, it just isn&apos;t from the Play Store.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">5</span>
                <span>Open <strong>JTEC MUSIC</strong>.</span>
              </li>
            </ol>

            {/* Action Buttons */}
            <div className="pt-3 flex flex-col sm:flex-row items-stretch gap-3">
              <button
                type="button"
                onClick={handleDownloadApk}
                className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-500 via-purple-600 to-pink-500 text-white font-bold text-xs shadow-lg shadow-cyan-500/25 hover:opacity-95 active:scale-98 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Download APK</span>
              </button>

              <button
                type="button"
                onClick={handleCopyApk}
                className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-200 text-xs font-bold active:scale-98 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                {copiedApk ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-cyan-400" />
                    <span>Copy link</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Android (website app) */}
      {activeTab === 'android-web' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="p-5 sm:p-6 rounded-3xl bg-slate-900/70 border border-purple-500/30 space-y-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-400 flex items-center justify-center shrink-0">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Android (Website App / PWA)</h3>
                <p className="text-xs text-slate-400">Install directly from your Google Chrome browser</p>
              </div>
            </div>

            <ol className="space-y-3 text-xs sm:text-sm text-slate-300 leading-relaxed pt-1">
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</span>
                <span>Open the website in Chrome.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</span>
                <span>Tap the three dots menu (<code className="text-slate-200 bg-white/5 px-1 py-0.5 rounded">⋮</code>).</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">3</span>
                <span>Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">4</span>
                <span>Tap <strong>Install</strong>.</span>
              </li>
            </ol>

            {/* Action Buttons */}
            <div className="pt-3 flex flex-col sm:flex-row items-stretch gap-3">
              <button
                type="button"
                onClick={handleOpenWebsite}
                className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 text-white font-bold text-xs shadow-lg shadow-purple-500/25 hover:opacity-95 active:scale-98 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Open website</span>
              </button>

              <button
                type="button"
                onClick={handleCopyWeb}
                className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-200 text-xs font-bold active:scale-98 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                {copiedWeb ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-purple-400" />
                    <span>Copy link</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: iPhone */}
      {activeTab === 'iphone' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="p-5 sm:p-6 rounded-3xl bg-slate-900/70 border border-pink-500/30 space-y-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-pink-500/15 border border-pink-500/30 text-pink-400 flex items-center justify-center shrink-0">
                <Apple className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Apple iPhone & iPad</h3>
                <p className="text-xs text-slate-400">Add to Home Screen using Safari</p>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
              iPhone can&apos;t install APK files. Use the website app instead.
            </p>

            <ol className="space-y-3 text-xs sm:text-sm text-slate-300 leading-relaxed pt-1">
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-pink-500/20 text-pink-300 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</span>
                <span>Open the website in Safari (it must be Safari, not Chrome).</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-pink-500/20 text-pink-300 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</span>
                <span>Tap the Share button, the square with an arrow.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-pink-500/20 text-pink-300 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">3</span>
                <span>Scroll down and tap <strong>Add to Home Screen</strong>.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-pink-500/20 text-pink-300 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">4</span>
                <span>Tap <strong>Add</strong>. JTEC MUSIC now has its own icon.</span>
              </li>
            </ol>

            {/* iPhone limitation note */}
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5 text-xs text-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                On iPhone the music may stop when the screen locks, and offline songs can be cleared by iOS, so the Android app is the full experience.
              </span>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 flex flex-col sm:flex-row items-stretch gap-3">
              <button
                type="button"
                onClick={handleOpenWebsite}
                className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-pink-500 to-rose-600 text-white font-bold text-xs shadow-lg shadow-pink-500/25 hover:opacity-95 active:scale-98 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Open website in Safari</span>
              </button>

              <button
                type="button"
                onClick={handleCopyWeb}
                className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-200 text-xs font-bold active:scale-98 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                {copiedWeb ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-pink-400" />
                    <span>Copy link</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

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
