import React from 'react';
import {
  Headphones,
  Users,
  Share2,
  MessageCircle,
  ListMusic,
  ChevronRight,
  Crown,
  Radio,
  Wifi,
  WifiOff,
  RefreshCw,
} from 'lucide-react';
import { PartyState } from '../types';
import { PartyServiceDiagnostics, triggerHapticFeedback } from '../PartyService';
import { Avatar } from './Avatar';

export type PartyRoomSubView = 'listen' | 'people' | 'invite' | 'chat' | 'queue';

interface PartyRoomDashboardProps {
  partyState: PartyState;
  diagnostics: PartyServiceDiagnostics;
  unreadChatCount: number;
  onSelectView: (view: PartyRoomSubView) => void;
}

export const PartyRoomDashboard: React.FC<PartyRoomDashboardProps> = ({
  partyState,
  diagnostics,
  unreadChatCount,
  onSelectView,
}) => {
  const isHost = partyState.role === 'host';
  const track = partyState.currentTrack;
  const lastChat =
    partyState.chatMessages.length > 0
      ? partyState.chatMessages[partyState.chatMessages.length - 1]
      : null;

  const syncInfo = (() => {
    if (diagnostics.isBotDemoRoom) {
      return {
        label: 'Demo Room',
        color: 'text-purple-300',
        dot: 'bg-purple-400',
        icon: <Radio className="w-3.5 h-3.5 text-purple-300" />,
      };
    }
    if (partyState.isReconnecting) {
      return {
        label: 'Reconnecting...',
        color: 'text-amber-300',
        dot: 'bg-amber-400 animate-pulse',
        icon: <RefreshCw className="w-3.5 h-3.5 text-amber-300 animate-spin" />,
      };
    }
    if (!partyState.isConnected || diagnostics.connectionStatus !== 'SUBSCRIBED') {
      return {
        label: 'Disconnected',
        color: 'text-rose-300',
        dot: 'bg-rose-400',
        icon: <WifiOff className="w-3.5 h-3.5 text-rose-300" />,
      };
    }
    return {
      label: 'Realtime Sync Active',
      color: 'text-emerald-300',
      dot: 'bg-emerald-400',
      icon: <Wifi className="w-3.5 h-3.5 text-emerald-300" />,
    };
  })();

  const handleOpen = (view: PartyRoomSubView) => {
    triggerHapticFeedback();
    onSelectView(view);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Compact Room Summary Banner */}
      <div className="p-4 rounded-3xl bg-gradient-to-br from-[#161C2E] via-[#121622] to-[#1A132B] border border-white/10 shadow-xl flex items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-mono font-black tracking-widest text-cyan-300">
              {partyState.roomCode}
            </span>
            <span className="text-slate-600">·</span>
            <span className="inline-flex items-center gap-1 text-slate-300 font-semibold">
              {isHost && <Crown className="w-3.5 h-3.5 text-amber-400" />}
              <span>{isHost ? 'Hosting' : 'Listening'}</span>
            </span>
          </div>
          <div className={`flex items-center gap-1.5 text-[11px] font-semibold ${syncInfo.color}`}>
            {syncInfo.icon}
            <span>{syncInfo.label}</span>
            <span className="text-slate-600">·</span>
            <span className="text-slate-400">{partyState.members.length}/8 in room</span>
          </div>
        </div>

        <div className="flex -space-x-2 shrink-0">
          {partyState.members.slice(0, 3).map((m) => (
            <Avatar
              key={m.id}
              url={m.avatarUrl || (m.avatar?.startsWith('data:') ? m.avatar : null)}
              name={m.username || m.nickname}
              size={30}
              className="ring-2 ring-[#121622]"
            />
          ))}
        </div>
      </div>

      {/* 5 Large Navigation Cards */}
      <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-3">
        {/* Card 1: Listen (Featured Full-Width Card) */}
        <button
          type="button"
          onClick={() => handleOpen('listen')}
          className="min-[360px]:col-span-2 group relative overflow-hidden p-5 rounded-3xl bg-gradient-to-r from-[#142338] via-[#171B30] to-[#261538] border border-cyan-400/35 hover:border-cyan-400/70 text-left shadow-xl active:scale-[0.99] transition cursor-pointer min-h-[108px] flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-400 to-purple-600 text-slate-950 flex items-center justify-center shrink-0 shadow-lg shadow-cyan-500/20">
              <Headphones className="w-7 h-7" />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-extrabold text-white tracking-tight">
                  Listen
                </h2>
                {partyState.playbackStatus === 'playing' && (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">
                    Playing Now
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 truncate">
                {track ? `${track.title} — ${track.artist}` : 'Return to full-screen synchronized player'}
              </p>
            </div>
          </div>

          <div className="w-10 h-10 rounded-xl bg-white/10 group-hover:bg-white/15 flex items-center justify-center text-cyan-300 shrink-0 transition">
            <ChevronRight className="w-5 h-5" />
          </div>
        </button>

        {/* Card 2: People */}
        <button
          type="button"
          onClick={() => handleOpen('people')}
          className="group p-4 sm:p-5 rounded-3xl bg-gradient-to-br from-[#151B2B] to-[#101420] border border-white/10 hover:border-cyan-400/40 text-left shadow-lg active:scale-[0.98] transition cursor-pointer min-h-[124px] flex flex-col justify-between gap-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="w-11 h-11 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <span className="font-mono text-xs font-bold text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-1 rounded-xl">
              {partyState.members.length}/8
            </span>
          </div>

          <div className="space-y-0.5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm sm:text-base font-extrabold text-white">People</h2>
              <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-300 transition" />
            </div>
            <p className="text-[11px] text-slate-400 truncate">
              Members, status & controls
            </p>
          </div>
        </button>

        {/* Card 3: Invite */}
        <button
          type="button"
          onClick={() => handleOpen('invite')}
          className="group p-4 sm:p-5 rounded-3xl bg-gradient-to-br from-[#17192B] to-[#101320] border border-white/10 hover:border-purple-400/40 text-left shadow-lg active:scale-[0.98] transition cursor-pointer min-h-[124px] flex flex-col justify-between gap-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="w-11 h-11 rounded-2xl bg-purple-500/15 border border-purple-500/30 text-purple-300 flex items-center justify-center">
              <Share2 className="w-5 h-5" />
            </div>
            <span className="font-mono text-[11px] font-bold text-purple-200 bg-purple-500/15 border border-purple-500/25 px-2.5 py-1 rounded-xl">
              {partyState.roomCode}
            </span>
          </div>

          <div className="space-y-0.5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm sm:text-base font-extrabold text-white">Invite</h2>
              <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-purple-300 transition" />
            </div>
            <p className="text-[11px] text-slate-400 truncate">
              Code, link, QR & friends
            </p>
          </div>
        </button>

        {/* Card 4: Chat */}
        <button
          type="button"
          onClick={() => handleOpen('chat')}
          className="group p-4 sm:p-5 rounded-3xl bg-gradient-to-br from-[#141A29] to-[#0F131F] border border-white/10 hover:border-cyan-400/40 text-left shadow-lg active:scale-[0.98] transition cursor-pointer min-h-[124px] flex flex-col justify-between gap-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="w-11 h-11 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 flex items-center justify-center">
              <MessageCircle className="w-5 h-5" />
            </div>
            {unreadChatCount > 0 ? (
              <span className="min-w-[24px] h-6 px-2 rounded-xl bg-rose-500 text-white text-[11px] font-extrabold flex items-center justify-center shadow">
                {unreadChatCount > 99 ? '99+' : unreadChatCount}
              </span>
            ) : (
              <span className="font-mono text-[11px] font-bold text-slate-300 bg-white/5 border border-white/10 px-2.5 py-1 rounded-xl">
                {partyState.chatMessages.length}
              </span>
            )}
          </div>

          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center justify-between">
              <h2 className="text-sm sm:text-base font-extrabold text-white">Chat</h2>
              <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-300 transition" />
            </div>
            <p className="text-[11px] text-slate-400 truncate">
              {lastChat ? `${lastChat.senderName}: ${lastChat.text}` : 'Live room chat & reactions'}
            </p>
          </div>
        </button>

        {/* Card 5: Queue */}
        <button
          type="button"
          onClick={() => handleOpen('queue')}
          className="group p-4 sm:p-5 rounded-3xl bg-gradient-to-br from-[#19182B] to-[#111220] border border-white/10 hover:border-purple-400/40 text-left shadow-lg active:scale-[0.98] transition cursor-pointer min-h-[124px] flex flex-col justify-between gap-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="w-11 h-11 rounded-2xl bg-purple-500/15 border border-purple-500/30 text-purple-300 flex items-center justify-center">
              <ListMusic className="w-5 h-5" />
            </div>
            <span className="font-mono text-[11px] font-bold text-purple-200 bg-purple-500/15 border border-purple-500/25 px-2.5 py-1 rounded-xl">
              {partyState.queue.length} up next
            </span>
          </div>

          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center justify-between">
              <h2 className="text-sm sm:text-base font-extrabold text-white">Queue</h2>
              <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-purple-300 transition" />
            </div>
            <p className="text-[11px] text-slate-400 truncate">
              {partyState.queue.length > 0
                ? `Next: ${partyState.queue[0].title}`
                : 'Shared queue & Add Music'}
            </p>
          </div>
        </button>
      </div>
    </div>
  );
};
