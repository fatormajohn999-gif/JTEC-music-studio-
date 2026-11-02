import React, { useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { getPartyBackend, PartyInvite } from './backend';
import { PartyService, triggerHapticFeedback } from './PartyService';
import { Avatar } from './components/Avatar';

interface PartyInviteBannerProps {
  onOpenPartyScreen: () => void;
}

export const PartyInviteBanner: React.FC<PartyInviteBannerProps> = ({ onOpenPartyScreen }) => {
  const [invites, setInvites] = useState<PartyInvite[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const backend = getPartyBackend();
    const unsub = backend.subscribeInvites((newInvites) => {
      setInvites(newInvites);
    });
    return () => unsub();
  }, []);

  if (invites.length === 0) return null;

  const activeInvite = invites[0];

  const handleJoin = async () => {
    triggerHapticFeedback();
    setIsProcessing(true);
    try {
      const backend = getPartyBackend();
      const res = await backend.acceptInvite(activeInvite.id);
      await PartyService.joinRoom(res.roomCode);
      onOpenPartyScreen();
    } catch (err) {
      console.error('Failed to accept party invite:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDecline = async () => {
    triggerHapticFeedback();
    setIsProcessing(true);
    try {
      const backend = getPartyBackend();
      await backend.declineInvite(activeInvite.id);
    } catch (err) {
      console.error('Failed to decline party invite:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="sticky top-0 z-40 px-3 py-2 bg-gradient-to-r from-purple-950 via-slate-900 to-cyan-950 border-b border-cyan-500/30 shadow-lg animate-in slide-in-from-top duration-300">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <Avatar
            url={activeInvite.from.avatarUrl}
            name={activeInvite.from.username}
            size={36}
          />
          <div className="min-w-0">
            <p className="text-white font-medium truncate">
              <strong className="text-cyan-300 font-bold">{activeInvite.from.username}</strong>{' '}
              invited you to party room <span className="font-mono text-purple-300 font-bold">{activeInvite.roomCode}</span>
            </p>
            <p className="text-[10px] text-slate-400">Synchronized listening with friends</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={isProcessing}
            onClick={handleJoin}
            className="flex items-center gap-1 px-3 py-1.5 min-h-[44px] rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 hover:brightness-110 text-white font-bold text-xs shadow-md shadow-cyan-500/20 active:scale-95 transition cursor-pointer disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Join</span>
          </button>
          <button
            type="button"
            disabled={isProcessing}
            onClick={handleDecline}
            className="px-3 py-1.5 min-h-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold text-xs border border-white/10 active:scale-95 transition cursor-pointer"
          >
            Decline
          </button>
        </div>
      </div>
    </div>
  );
};
