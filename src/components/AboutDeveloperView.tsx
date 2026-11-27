import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, User, Mail, Share2, Check, ExternalLink, Heart } from 'lucide-react';
import { APK_DOWNLOAD_URL } from '../services/nativeUpdate';

interface AboutDeveloperViewProps {
  onBack: () => void;
}

export const AboutDeveloperView: React.FC<AboutDeveloperViewProps> = ({ onBack }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [copiedShare, setCopiedShare] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const shareTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emailTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    const scrollParent = containerRef.current?.closest('main');
    if (scrollParent) {
      scrollParent.scrollTop = 0;
    }

    return () => {
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
        // If user cancelled, don't fallback to copy
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
      }
    }

    // Fallback: Copy to clipboard
    try {
      await navigator.clipboard.writeText(shareText);
      setCopiedShare(true);
      if (shareTimerRef.current) clearTimeout(shareTimerRef.current);
      shareTimerRef.current = setTimeout(() => {
        setCopiedShare(false);
      }, 2500);
    } catch {
      // Ignore
    }
  };

  const handleCopyEmail = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText('fatormajohn999@gmail.com').then(() => {
      setCopiedEmail(true);
      if (emailTimerRef.current) clearTimeout(emailTimerRef.current);
      emailTimerRef.current = setTimeout(() => {
        setCopiedEmail(false);
      }, 2500);
    }).catch(() => {});
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
          <User className="w-5 h-5 text-cyan-400" />
          <h2 className="text-lg font-bold text-white tracking-wide">About the Developer</h2>
        </div>
      </div>

      {/* Main Developer Card */}
      <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-br from-[#0c1330]/90 via-[#0a0f24]/90 to-[#120a26]/90 border border-cyan-500/30 space-y-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-500/20 to-purple-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300 shadow-lg shadow-cyan-500/10">
            <User className="w-6 h-6 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Johnny TEC (JTEC)</h3>
            <p className="text-xs text-cyan-300/80 font-medium">Independent Software Developer</p>
          </div>
        </div>

        <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
          JTEC MUSIC is built by Johnny TEC (JTEC), a developer who loves music and building apps. The goal is simple: a fast, beautiful music player that works offline, with your own songs and free music from JTEC Cloud and Jamendo.
        </p>

        <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Share Button */}
          <button
            type="button"
            onClick={handleShare}
            className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-500 via-purple-600 to-pink-500 hover:opacity-95 active:scale-98 text-white font-bold text-xs shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 transition cursor-pointer"
          >
            {copiedShare ? (
              <>
                <Check className="w-4 h-4 text-white" />
                <span>Copied to Clipboard!</span>
              </>
            ) : (
              <>
                <Share2 className="w-4 h-4" />
                <span>Share JTEC MUSIC</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Contact Section */}
      <div className="p-5 rounded-2xl bg-slate-900/60 border border-white/5 space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <Mail className="w-4 h-4 text-cyan-400" />
          Contact & Inquiries
        </h4>

        <a
          href="mailto:fatormajohn999@gmail.com"
          className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-slate-950/60 border border-cyan-500/20 hover:border-cyan-400/50 transition group cursor-pointer gap-2"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
              <Mail className="w-5 h-5 text-cyan-400" />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-bold text-white group-hover:text-cyan-300 transition">Email Developer</span>
              <p className="text-xs text-slate-300 font-mono truncate">fatormajohn999@gmail.com</p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto pt-1 sm:pt-0">
            <button
              type="button"
              onClick={handleCopyEmail}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-semibold transition"
            >
              {copiedEmail ? 'Copied' : 'Copy'}
            </button>
            <span className="text-cyan-400 text-xs font-semibold flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
              Open Email App <ExternalLink className="w-3 h-3" />
            </span>
          </div>
        </a>
      </div>

      {/* Attribution Note */}
      <div className="p-4 rounded-2xl bg-slate-950/40 border border-white/5 flex items-center gap-3 text-xs text-slate-400 leading-relaxed">
        <Heart className="w-4 h-4 text-pink-400 shrink-0" />
        <p>
          Music from Jamendo is provided by independent artists under Creative Commons licenses.
        </p>
      </div>

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
