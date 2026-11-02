import React from 'react';
import { Radio, ChevronRight } from 'lucide-react';
import { PartyState } from './types';
import { triggerHapticFeedback } from './PartyService';

interface PartyBannerProps {
  partyState: PartyState;
  onOpenPartyScreen: () => void;
}

export const PartyBanner: React.FC<PartyBannerProps> = ({ partyState, onOpenPartyScreen }) => {
  if (!partyState.roomCode) return null;

  const handleClick = () => {
    triggerHapticFeedback();
    onOpenPartyScreen();
  };

  return (
    <div className="w-full h-12 bg-slate-950/95 border-b border-cyan-500/30 px-3.5 flex items-center justify-between shadow-md backdrop-blur-md z-30 shrink-0">
      <button
        type="button"
        onClick={handleClick}
        aria-label={`Open JTEC Party room ${partyState.roomCode}`}
        className="w-full h-full flex items-center justify-between gap-2.5 text-left cursor-pointer group min-w-0"
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-6 h-6 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 flex items-center justify-center shrink-0">
            <Radio className="w-3.5 h-3.5 animate-pulse text-cyan-400" />
          </div>

          <span className="text-xs font-bold text-white tracking-wide truncate">
            JTEC Party • <strong className="font-mono text-cyan-300 font-black">{partyState.roomCode}</strong>
          </span>
        </div>

        <div className="flex items-center text-slate-400 group-hover:text-cyan-300 transition shrink-0 pl-1">
          <ChevronRight className="w-4 h-4" />
        </div>
      </button>
    </div>
  );
};
