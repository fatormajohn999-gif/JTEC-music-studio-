import React from 'react';

interface PartySettingToggleProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onChange: (nextValue: boolean) => void;
  accent?: 'cyan' | 'purple' | 'emerald';
}

export const PartySettingToggle: React.FC<PartySettingToggleProps> = ({
  icon,
  title,
  description,
  checked,
  onChange,
  accent = 'cyan',
}) => {
  const activeTrackClass =
    accent === 'purple'
      ? 'bg-gradient-to-r from-purple-500 to-fuchsia-500 shadow-purple-500/25'
      : accent === 'emerald'
      ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 shadow-emerald-500/25'
      : 'bg-gradient-to-r from-cyan-500 to-purple-600 shadow-cyan-500/25';

  const activeContainerClass =
    accent === 'purple'
      ? 'border-purple-400/35 bg-purple-500/[0.08]'
      : accent === 'emerald'
      ? 'border-emerald-400/35 bg-emerald-500/[0.08]'
      : 'border-cyan-400/35 bg-cyan-500/[0.08]';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`w-full min-h-[58px] p-3.5 rounded-2xl border text-left flex items-center justify-between gap-3 transition active:scale-[0.99] cursor-pointer ${
        checked
          ? activeContainerClass
          : 'border-white/10 bg-[#0A0E19]/90 hover:border-white/20'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
            checked
              ? 'bg-white/10 border-white/20 text-white'
              : 'bg-white/[0.04] border-white/10 text-slate-400'
          }`}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs sm:text-sm font-bold text-white leading-snug">{title}</p>
          <p className="text-[11px] text-slate-400 leading-snug mt-0.5">{description}</p>
        </div>
      </div>

      <span
        aria-hidden="true"
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors duration-200 shadow-inner ${
          checked ? `${activeTrackClass} shadow-md` : 'bg-slate-800 border border-white/10'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </span>
    </button>
  );
};
