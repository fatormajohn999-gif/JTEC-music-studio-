import React, { useMemo, useState } from 'react';
import { Copy, Check, Share2, Link2, QrCode, UserPlus, Users } from 'lucide-react';
import { PartyState } from '../types';
import { PartyProfile, PresenceInfo } from '../backend';
import { triggerHapticFeedback } from '../PartyService';
import { Avatar } from './Avatar';
import { QrCodeDisplay } from './QrCodeDisplay';

interface PartyRoomInviteTabProps {
  partyState: PartyState;
  friends: PartyProfile[];
  presenceMap: Record<string, PresenceInfo>;
  invitedFriendIds: Set<string>;
  onInviteFriend: (friendId: string) => void;
  onCopyCode: () => void;
  copiedCode: boolean;
  onShareRoom: () => void;
}

export const PartyRoomInviteTab: React.FC<PartyRoomInviteTabProps> = ({
  partyState,
  friends,
  presenceMap,
  invitedFriendIds,
  onInviteFriend,
  onCopyCode,
  copiedCode,
  onShareRoom,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);

  const inviteLink = useMemo(() => {
    if (!partyState.roomCode) return '';
    try {
      const origin = window.location.origin;
      const pathname = window.location.pathname || '/';
      return `${origin}${pathname}?party=${encodeURIComponent(partyState.roomCode)}`;
    } catch {
      return `?party=${partyState.roomCode}`;
    }
  }, [partyState.roomCode]);

  const handleCopyInviteLink = async () => {
    if (!inviteLink) return;
    triggerHapticFeedback();
    try {
      await navigator.clipboard.writeText(inviteLink);
    } catch {}
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleShareInviteLink = async () => {
    if (!partyState.roomCode) return;
    triggerHapticFeedback();
    const text = `Join my JTEC Party! Room Code: ${partyState.roomCode}\n${inviteLink}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join my JTEC Party',
          text: `Listen together with me in JTEC Party (Code: ${partyState.roomCode})`,
          url: inviteLink,
        });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
    handleCopyInviteLink();
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Room Code Hero Card */}
      <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-br from-[#171C2B] via-[#121622] to-[#1A132B] border border-cyan-500/30 shadow-2xl text-center space-y-4">
        <div className="space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-widest text-cyan-300">
            Room Code
          </span>
          <div className="text-4xl sm:text-5xl font-black font-mono tracking-[0.2em] text-white select-all py-1">
            {partyState.roomCode}
          </div>
          <p className="text-xs text-slate-400">
            Share this 6-character code or link with friends to listen in sync.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <button
            type="button"
            onClick={onCopyCode}
            className="min-h-[46px] px-4 py-2.5 rounded-2xl bg-[#1C2235] hover:bg-[#252C44] border border-white/10 text-white text-xs font-bold flex items-center justify-center gap-2 active:scale-95 transition cursor-pointer"
          >
            {copiedCode ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-300">Code Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-cyan-400" />
                <span>Copy Code</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onShareRoom}
            className="min-h-[46px] px-4 py-2.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-purple-600 hover:brightness-110 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 active:scale-95 transition cursor-pointer"
          >
            <Share2 className="w-4 h-4" />
            <span>Share Party</span>
          </button>
        </div>
      </div>

      {/* Invitation Link Card */}
      <div className="p-4 rounded-3xl bg-[#121622]/90 border border-white/10 space-y-3 shadow-lg">
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-purple-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-white">
            Invitation Link
          </h3>
        </div>

        <div className="p-3 rounded-2xl bg-[#0A0D16] border border-white/10 text-xs font-mono text-cyan-200 break-all select-all">
          {inviteLink}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleCopyInviteLink}
            className="min-h-[44px] px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition cursor-pointer"
          >
            {copiedLink ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-300">Link Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-cyan-400" />
                <span>Copy Link</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleShareInviteLink}
            className="min-h-[44px] px-3 py-2 rounded-xl bg-purple-600/25 hover:bg-purple-600/40 border border-purple-500/35 text-purple-200 text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5 text-purple-300" />
            <span>Share Link</span>
          </button>
        </div>
      </div>

      {/* QR Code Card */}
      <div className="p-5 rounded-3xl bg-[#121622]/90 border border-white/10 text-center space-y-3 shadow-lg">
        <div className="flex items-center justify-center gap-2">
          <QrCode className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-white">
            Scan to Join Room
          </h3>
        </div>

        <div className="flex justify-center py-1">
          <QrCodeDisplay value={inviteLink || partyState.roomCode || ''} size={168} />
        </div>

        <p className="text-[11px] text-slate-400">
          Friends nearby can scan this QR code to open the invitation link for room{' '}
          <span className="font-mono text-cyan-300 font-bold">{partyState.roomCode}</span>.
        </p>
      </div>

      {/* Invite Friends Directly */}
      <div className="p-4 rounded-3xl bg-[#121622]/90 border border-white/10 space-y-3 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-white">
              Invite JTEC Friends
            </h3>
          </div>
          <span className="text-[11px] text-slate-400">{friends.length} friends</span>
        </div>

        {friends.length === 0 ? (
          <p className="text-xs text-slate-400 py-3 text-center">
            No friends added yet. Add friends in the Party Lobby to send instant in-app invites.
          </p>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {friends.map((friend) => {
              const isInvited = invitedFriendIds.has(friend.id);
              const presence = presenceMap[friend.id] || { isOnline: true, lastSeen: Date.now() };
              return (
                <div
                  key={friend.id}
                  className="flex items-center justify-between p-2.5 rounded-2xl bg-[#171C2B] border border-white/5 min-h-[54px]"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar url={friend.avatarUrl} name={friend.username} size={36} />
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-white truncate block">
                        {friend.username}
                      </span>
                      <div className="flex items-center gap-1.5 text-[10px]">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            presence.isOnline ? 'bg-emerald-400' : 'bg-slate-500'
                          }`}
                        />
                        <span className="text-slate-400">
                          {presence.isOnline ? 'Online now' : 'Offline'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={isInvited}
                    onClick={() => onInviteFriend(friend.id)}
                    className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      isInvited
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-purple-600 hover:bg-purple-500 text-white active:scale-95'
                    }`}
                  >
                    {isInvited ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Invited</span>
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Invite</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
