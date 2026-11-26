import React from 'react';
import {
  Users,
  Crown,
  Lock,
  Unlock,
  UserMinus,
  Activity,
  ListPlus,
  SkipForward,
  Wifi,
  WifiOff,
  RefreshCw,
} from 'lucide-react';
import { PartyMember, PartyState } from '../types';
import { PartyService, PartyServiceDiagnostics, triggerHapticFeedback } from '../PartyService';
import { Avatar } from './Avatar';

interface PartyRoomPeopleTabProps {
  partyState: PartyState;
  diagnostics: PartyServiceDiagnostics;
  onSelectMember: (member: PartyMember) => void;
  onKickMember: (member: PartyMember) => void;
  onOpenConnectionDetails: () => void;
}

export const PartyRoomPeopleTab: React.FC<PartyRoomPeopleTabProps> = ({
  partyState,
  diagnostics,
  onSelectMember,
  onKickMember,
  onOpenConnectionDetails,
}) => {
  const isHost = partyState.role === 'host';
  const readyCount = partyState.members.filter(
    (m) => m.status === 'ready' || m.status === 'playing'
  ).length;

  const getMemberConnectionState = (member: PartyMember) => {
    const isSelf = member.id === partyState.selfId;
    if (isSelf) {
      if (partyState.isReconnecting) {
        return { label: 'Reconnecting', color: 'text-amber-300 bg-amber-500/15 border-amber-500/30', dot: 'bg-amber-400 animate-pulse' };
      }
      if (!partyState.isConnected && !diagnostics.isBotDemoRoom) {
        return { label: 'Disconnected', color: 'text-rose-300 bg-rose-500/15 border-rose-500/30', dot: 'bg-rose-400' };
      }
      return { label: 'Online', color: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30', dot: 'bg-emerald-400' };
    }

    if (partyState.isReconnecting) {
      return { label: 'Reconnecting', color: 'text-amber-300 bg-amber-500/15 border-amber-500/30', dot: 'bg-amber-400 animate-pulse' };
    }

    const ageMs = Date.now() - (member.lastSeen || Date.now());
    if (!partyState.isConnected && !diagnostics.isBotDemoRoom) {
      return { label: 'Disconnected', color: 'text-rose-300 bg-rose-500/15 border-rose-500/30', dot: 'bg-rose-400' };
    }
    if (ageMs > 45000) {
      return { label: 'Reconnecting', color: 'text-amber-300 bg-amber-500/15 border-amber-500/30', dot: 'bg-amber-400' };
    }
    return { label: 'Online', color: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30', dot: 'bg-emerald-400' };
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Room Connection Summary */}
      <div className="p-4 rounded-2xl bg-[#121622]/90 border border-white/10 flex items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center border shrink-0 ${
              partyState.isConnected || diagnostics.isBotDemoRoom
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                : partyState.isReconnecting
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
            }`}
          >
            {partyState.isReconnecting ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : partyState.isConnected || diagnostics.isBotDemoRoom ? (
              <Wifi className="w-5 h-5" />
            ) : (
              <WifiOff className="w-5 h-5" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-white truncate">
              {diagnostics.isBotDemoRoom
                ? 'Demo Room Active'
                : partyState.isConnected
                ? 'Realtime Room Connected'
                : partyState.isReconnecting
                ? 'Reconnecting to Room...'
                : 'Disconnected'}
            </p>
            <p className="text-[11px] text-slate-400 truncate">
              {readyCount} of {partyState.members.length} synced • Max 8 members
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenConnectionDetails}
          className="min-h-[44px] px-3.5 py-2 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-200 text-xs font-semibold flex items-center gap-1.5 shrink-0 active:scale-95 transition cursor-pointer"
        >
          <Activity className="w-4 h-4 text-cyan-400" />
          <span>Sync Log</span>
        </button>
      </div>

      {/* Host Room Controls */}
      {isHost && (
        <div className="p-4 rounded-3xl bg-[#121622]/90 border border-purple-500/25 space-y-3 shadow-lg">
          <div className="flex items-center gap-2">
            <Crown className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-white">
              Host Controls
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => PartyService.toggleRoomLock()}
              className={`min-h-[48px] px-3.5 py-2.5 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-2 transition active:scale-98 cursor-pointer ${
                partyState.isLocked
                  ? 'bg-rose-500/15 border-rose-500/35 text-rose-200'
                  : 'bg-[#181D2C] border-white/10 text-slate-200 hover:border-cyan-500/30'
              }`}
            >
              <span className="flex items-center gap-2">
                {partyState.isLocked ? <Lock className="w-4 h-4 text-rose-400" /> : <Unlock className="w-4 h-4 text-cyan-400" />}
                <span>{partyState.isLocked ? 'Room Locked' : 'Room Open'}</span>
              </span>
              <span className="text-[10px] opacity-75">{partyState.isLocked ? 'Tap to open' : 'Tap to lock'}</span>
            </button>

            <button
              type="button"
              onClick={() => PartyService.hostSetGuestQueueAllowed(!partyState.allowGuestQueue)}
              className={`min-h-[48px] px-3.5 py-2.5 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-2 transition active:scale-98 cursor-pointer ${
                partyState.allowGuestQueue
                  ? 'bg-cyan-500/15 border-cyan-500/35 text-cyan-200'
                  : 'bg-[#181D2C] border-white/10 text-slate-300 hover:border-cyan-500/30'
              }`}
            >
              <span className="flex items-center gap-2">
                <ListPlus className="w-4 h-4 text-cyan-400" />
                <span>Guest Queue</span>
              </span>
              <span className="text-[10px] font-bold">{partyState.allowGuestQueue ? 'ON' : 'OFF'}</span>
            </button>

            <button
              type="button"
              onClick={() => PartyService.hostSetAutoSkip(!partyState.autoSkipEnabled)}
              className={`min-h-[48px] px-3.5 py-2.5 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-2 transition active:scale-98 cursor-pointer ${
                partyState.autoSkipEnabled
                  ? 'bg-purple-500/20 border-purple-500/40 text-purple-200'
                  : 'bg-[#181D2C] border-white/10 text-slate-300 hover:border-purple-500/30'
              }`}
            >
              <span className="flex items-center gap-2">
                <SkipForward className="w-4 h-4 text-purple-400" />
                <span>Vote Auto-Skip</span>
              </span>
              <span className="text-[10px] font-bold">{partyState.autoSkipEnabled ? 'ON' : 'OFF'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Room Members Card */}
      <div className="p-4 rounded-3xl bg-[#121622]/90 border border-white/10 space-y-3 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-purple-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-white">
              People in Room ({partyState.members.length}/8)
            </h3>
          </div>
          {partyState.isLocked && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-[10px] font-bold text-rose-300">
              <Lock className="w-3 h-3" />
              Locked
            </span>
          )}
        </div>

        <div className="space-y-2">
          {partyState.members.map((member) => {
            const conn = getMemberConnectionState(member);
            const isSelf = member.id === partyState.selfId;

            return (
              <div
                key={member.id}
                onClick={() => {
                  triggerHapticFeedback();
                  onSelectMember(member);
                }}
                className="flex items-center justify-between p-3 rounded-2xl bg-[#171C2B]/90 hover:bg-[#1E2438] border border-white/5 hover:border-cyan-500/30 transition cursor-pointer min-h-[60px] gap-2"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="relative shrink-0">
                    <Avatar
                      url={member.avatarUrl || (member.avatar?.startsWith('data:') ? member.avatar : null)}
                      name={member.username || member.nickname}
                      size={42}
                      className="border border-white/15"
                    />
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-[#171C2B] ${conn.dot}`}
                    />
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs sm:text-sm font-bold text-white truncate">
                        {member.username || member.nickname}
                        {isSelf ? ' (You)' : ''}
                      </span>

                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          member.isHost
                            ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                            : 'bg-cyan-500/10 text-cyan-300 border-cyan-500/25'
                        }`}
                      >
                        {member.isHost && <Crown className="w-2.5 h-2.5" />}
                        <span>{member.isHost ? 'Host' : 'Member'}</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap text-[10px] text-slate-400">
                      <span className={`px-1.5 py-0.5 rounded-md border font-semibold ${conn.color}`}>
                        {conn.label}
                      </span>
                      <span className="capitalize">Player: {member.status}</span>
                      {member.latencyMs !== undefined && (
                        <span className="font-mono text-cyan-300">{member.latencyMs}ms</span>
                      )}
                    </div>
                  </div>
                </div>

                {isHost && !member.isHost && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onKickMember(member);
                    }}
                    aria-label={`Remove ${member.username || member.nickname}`}
                    className="min-h-[44px] min-w-[44px] p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/25 border border-rose-500/20 text-rose-300 transition flex items-center justify-center shrink-0 cursor-pointer"
                    title="Remove from room"
                  >
                    <UserMinus className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
