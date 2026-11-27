import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  User,
  Mail,
  Share2,
  Check,
  ExternalLink,
  Heart,
  Sparkles,
  Smartphone,
  Music2,
  Radio,
  Download,
} from 'lucide-react';
import { APK_DOWNLOAD_URL, getCurrentAppVersion } from '../services/nativeUpdate';
import { isNativeAndroid } from '../services/appConfig';
import { APP_VERSION, BUILD_DATE } from '../version';

interface AboutDeveloperViewProps {
  onBack: () => void;
}

export const AboutDeveloperView: React.FC<AboutDeveloperViewProps> = ({ onBack }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [copiedShare, setCopiedShare] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const shareTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emailTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    let active = true;
    getCurrentAppVersion().then((info) => {
      if (active) {
        setVersionInfo({ version: info.version, build: info.build });
      }
    });

    return () => {
      active = false;
      if (shareTimerRef.current) clearTimeout(shareTimerRef.current);
      if (emailTimerRef.current) clearTimeout(emailTimerRef.current);
    };
  }, []);

  const getWebsiteUrl = (): string => {
    if (typeof window === 'undefined') return '';
    const origin = window.location.origin;
    const pathname = window.location.pathname.replace(/\/index\.html$/, '').replace(/\/+$/, '');
    return `${origin}${pathname || '/'}`;
  };

  const handleShare = async () => {
    const webUrl = getWebsiteUrl();
    const shareText = `Get JTEC MUSIC, a free offline music player.\n\nAndroid APK: ${APK_DOWNLOAD_URL}\nWebsite: ${webUrl}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'JTEC MUSIC',
          text: shareText,
          url: webUrl,
        });
        return;
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
      }
    }

    try {
      await navigator.clipboard.writeText(shareText);
      setCopiedShare(true);
      if (shareTimerRef.current) clearTimeout(shareTimerRef.current);
      shareTimerRef.current = setTimeout(() => {
        setCopiedShare(false);
      }, 2500);
    } catch {
      // Ignore clipboard errors
    }
  };

  const handleCopyEmail = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard
      .writeText('fatormajohn999@gmail.com')
      .then(() => {
        setCopiedEmail(true);
        if (emailTimerRef.current) clearTimeout(emailTimerRef.current);
        emailTimerRef.current = setTimeout(() => {
          setCopiedEmail(false);
        }, 2500);
      })
      .catch(() => {});
  };

  return (
    <div
      ref={containerRef}
      className="min-h-full bg-gradient-to-b from-[#0E1320] via-[#0A0D15] to-[#080A10] pb-40 px-4 sm:px-6 pt-3 max-w-3xl mx-auto animate-in fade-in duration-200 space-y-5"
    >
      {/* Top Navigation Header */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-white/10">
        <button
          type="button"
          onClick={onBack}
          className="h-9 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.11] border border-white/10 text-cyan-300 font-semibold text-xs active:scale-95 transition flex items-center gap-1.5 cursor-pointer shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back</span>
        </button>

        <div className="flex items-center gap-2 min-w-0">
          <User className="w-4 h-4 text-cyan-400 shrink-0" />
          <h2 className="text-base sm:text-lg font-extrabold text-white tracking-tight truncate">
            About the Developer
          </h2>
        </div>

        <div className="w-14 shrink-0" />
      </div>

      {/* Hero Developer Identity Card */}
      <div className="relative overflow-hidden p-5 sm:p-6 rounded-3xl bg-gradient-to-br from-[#142338] via-[#151A2E] to-[#241536] border border-cyan-400/35 shadow-2xl space-y-5">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-400 to-purple-600 text-slate-950 flex items-center justify-center shrink-0 shadow-lg shadow-cyan-500/25">
            <User className="w-7 h-7" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
              Johnny TEC (JTEC)
            </h3>
            <p className="text-xs sm:text-sm font-semibold text-cyan-300">
              Independent Software Developer
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Founder of the JTEC Project
            </p>
          </div>
        </div>

        <p className="text-xs sm:text-sm text-slate-200 leading-relaxed bg-black/25 border border-white/10 rounded-2xl p-4">
          JTEC is an independent technology and software project founded by Johnny TEC (JTEC). It focuses on creating practical digital products, mobile applications and connected experiences that make technology more useful and accessible. Through projects such as JTEC MUSIC and JTEC Party, the aim is to build thoughtful, reliable products with a strong focus on usability, performance and continuous improvement.
        </p>

        {/* Share JTEC MUSIC Action */}
        <button
          type="button"
          onClick={handleShare}
          className="w-full min-h-[46px] py-3 px-4 rounded-2xl bg-gradient-to-r from-cyan-500 via-purple-600 to-pink-500 hover:brightness-110 active:scale-[0.99] text-white font-bold text-xs sm:text-sm shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 transition cursor-pointer"
        >
          {copiedShare ? (
            <>
              <Check className="w-4 h-4 text-white" />
              <span>Share link copied to clipboard</span>
            </>
          ) : (
            <>
              <Share2 className="w-4 h-4" />
              <span>Share JTEC MUSIC</span>
            </>
          )}
        </button>
      </div>

      {/* JTEC Project Identity Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="p-4 rounded-2xl bg-gradient-to-br from-[#151B2B] to-[#101420] border border-white/10 space-y-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 flex items-center justify-center shrink-0">
              <Music2 className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-bold text-white">JTEC MUSIC</h4>
              <p className="text-[11px] text-slate-400">Offline Player, DSP & Cloud</p>
            </div>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Built for fast local playback, Slow + Reverb audio effects, offline storage, JTEC Cloud streaming, and public archive discovery.
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-gradient-to-br from-[#17192B] to-[#101320] border border-white/10 space-y-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-300 flex items-center justify-center shrink-0">
              <Radio className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-bold text-white">JTEC Party</h4>
              <p className="text-[11px] text-slate-400">Synchronized Group Listening</p>
            </div>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Connected listening rooms with real-time playback synchronization, shared queues, friends, and live room chat.
          </p>
        </div>
      </div>

      {/* Contact Developer */}
      <div className="p-5 rounded-2xl bg-gradient-to-br from-[#151B2B] to-[#101420] border border-white/10 space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
          <Mail className="w-4 h-4 text-cyan-400" />
          <span>Contact & Inquiries</span>
        </div>

        <a
          href="mailto:fatormajohn999@gmail.com"
          className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl bg-[#090D16] border border-cyan-500/25 hover:border-cyan-400/55 transition group cursor-pointer gap-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 flex items-center justify-center shrink-0">
              <Mail className="w-5 h-5 text-cyan-400" />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-bold text-white group-hover:text-cyan-300 transition block">
                Email Johnny TEC (JTEC)
              </span>
              <p className="text-xs text-slate-300 font-mono truncate">
                fatormajohn999@gmail.com
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              onClick={handleCopyEmail}
              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-slate-200 text-xs font-semibold transition cursor-pointer"
            >
              {copiedEmail ? 'Copied' : 'Copy Email'}
            </button>
            <span className="text-cyan-400 text-xs font-semibold flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
              Open <ExternalLink className="w-3.5 h-3.5" />
            </span>
          </div>
        </a>
      </div>

      {/* App Version, Build & Links */}
      <div className="p-5 rounded-2xl bg-gradient-to-br from-[#141A29] to-[#0F131F] border border-white/10 space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
          <Sparkles className="w-4 h-4 text-purple-400" />
          <span>App Version & Links</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
          <div className="p-3.5 rounded-xl bg-[#090D16] border border-white/10 flex items-center gap-3">
            <Smartphone className="w-4 h-4 text-cyan-400 shrink-0" />
            <div className="min-w-0">
              <span className="text-[11px] text-slate-400 block">Current Release</span>
              <span className="font-bold text-white font-mono">
                {isNativeAndroid()
                  ? `v${versionInfo.version} (Build ${versionInfo.build})`
                  : `Web App (${versionInfo.version})`}
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#090D16] border border-white/10 flex items-center gap-3">
            <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
            <div className="min-w-0">
              <span className="text-[11px] text-slate-400 block">Build Date</span>
              <span className="font-bold text-white font-mono">{BUILD_DATE}</span>
            </div>
          </div>
        </div>

        <a
          href={APK_DOWNLOAD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between p-3.5 rounded-xl bg-[#090D16] border border-white/10 hover:border-cyan-400/40 transition text-xs text-slate-200 group"
        >
          <span className="flex items-center gap-2.5 font-semibold">
            <Download className="w-4 h-4 text-cyan-400" />
            <span>Official Android APK Releases</span>
          </span>
          <span className="text-cyan-400 font-semibold flex items-center gap-1">
            Releases <ExternalLink className="w-3.5 h-3.5" />
          </span>
        </a>
      </div>

      {/* Music Catalog Attribution */}
      <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center gap-3 text-xs text-slate-400 leading-relaxed">
        <Heart className="w-4 h-4 text-pink-400 shrink-0" />
        <p>
          Independent tracks from Jamendo and public collections from the Internet Archive are displayed with their respective artist and license details.
        </p>
      </div>

      {/* Bottom Return Action */}
      <button
        type="button"
        onClick={onBack}
        className="w-full min-h-[46px] py-3 rounded-2xl bg-white/[0.06] hover:bg-white/[0.11] border border-white/10 text-cyan-300 font-bold text-xs active:scale-[0.99] transition cursor-pointer"
      >
        ← Return to Settings
      </button>
    </div>
  );
};
