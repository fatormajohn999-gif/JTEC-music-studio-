import React from 'react';
import { Check, CheckCircle2 } from 'lucide-react';

interface WhatsNewModalProps {
  isOpen: boolean;
  versionName: string;
  notesBullets: string[];
  onAcknowledge: () => void;
}

export const WhatsNewModal: React.FC<WhatsNewModalProps> = ({
  isOpen,
  versionName,
  notesBullets,
  onAcknowledge,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-md bg-gradient-to-b from-[#0e1530] via-[#0a0f24] to-[#060a19] border border-cyan-500/30 rounded-3xl p-6 sm:p-7 shadow-2xl shadow-cyan-950/60 flex flex-col animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glow Effects */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10">
          {/* Header pill & icon */}
          <div className="flex items-center justify-between mb-3">
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-xs font-semibold tracking-wide">
              UPDATED SUCCESSFULLY • {versionName}
            </span>
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center">
              <Check className="w-4 h-4" />
            </div>
          </div>

          {/* Title */}
          <h3 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight mb-2">
            What&apos;s New in <span className="text-gradient-cyan-purple">JTEC MUSIC</span>
          </h3>

          <p className="text-xs text-slate-400 mb-4 leading-relaxed">
            Your offline player has been upgraded with the latest features, engine enhancements, and fixes.
          </p>

          {/* Bullet points */}
          <div className="rounded-2xl bg-slate-950/60 border border-white/5 p-4 space-y-2.5 mb-5 max-h-60 overflow-y-auto">
            {notesBullets.length > 0 ? (
              notesBullets.map((bullet, idx) => (
                <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-200 leading-snug">
                  <div className="w-4 h-4 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0 mt-0.5">
                    <CheckCircle2 className="w-3 h-3" />
                  </div>
                  <span>{bullet}</span>
                </div>
              ))
            ) : (
              <div className="flex items-start gap-2.5 text-xs text-slate-200 leading-snug">
                <div className="w-4 h-4 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0 mt-0.5">
                  <CheckCircle2 className="w-3 h-3" />
                </div>
                <span>General performance improvements, smoother offline playback, and bug fixes.</span>
              </div>
            )}
          </div>

          {/* Action Button */}
          <button
            type="button"
            onClick={onAcknowledge}
            className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-cyan-500 via-purple-600 to-pink-500 hover:from-cyan-400 hover:to-pink-400 text-white font-bold text-sm shadow-xl shadow-cyan-500/25 active:scale-95 transition cursor-pointer flex items-center justify-center gap-2"
          >
            <span>Got it, let&apos;s play</span>
          </button>
        </div>
      </div>
    </div>
  );
};
