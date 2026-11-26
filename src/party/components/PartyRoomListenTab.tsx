import React, { useEffect, useState } from 'react';
import {
  Crown,
  Music,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Bell,
  BellOff,
  Plus,
  Radio,
  Users,
  Wifi,
  WifiOff,
  RefreshCw,
  LayoutGrid,
} from 'lucide-react';
import { PartyState, PARTY_REACTION_EMOJIS } from '../types';
import { PartyService, PartyServiceDiagnostics, triggerHapticFeedback } from '../PartyService';
import { Avatar } from './Avatar';

interface PartyRoomListenTabProps {
  partyState: PartyState;
  diagnostics: PartyServiceDiagnostics;
  currentPlaybackSec: number;
  unreadChatCount: number;
  onOpenDashboard: () => void;
  onOpenPeople: () => void;
  onOpenAddMusic: () => void;
}

const formatSeconds = (sec: number): string => {
  const s = Math.max(0, Math.floor(sec || 0));
  const mins = Math.floor(s / 60);
  const remainder = s % 60;
  return `${mins}:${remainder.toString().padStart(2, '0')}`;
};

export const PartyRoomListenTab: React.FC<PartyRoomListenTabProps> = ({
  partyState,
  diagnostics,
  currentPlaybackSec,
  unreadChatCount,
  onOpenDashboard,
  onOpenPeople,
  onOpenAddMusic,
}) => {
  const [artworkError, setArtworkError] = useState(false);

  const isHost = partyState.role === 'host';
  const track = partyState.currentTrack;

  useEffect(() => {
    setArtworkError(false);
  }, [track?.id, track?.cover]);

  const durationSec = track?.duration || 0;
  const clampedCurrentSec = durationSec > 0 ? Math.min(durationSec, currentPlaybackSec) : currentPlaybackSec;
  const progressPct = durationSec > 0 ? Math.min(100, Math.max(0, (clampedCurrentSec / durationSec) * 100)) : 0;

  const totalMembers = Math.max(1, partyState.members.length);
  const skipVotesCount = partyState.skipVotes.length;
  const isMajoritySkip = skipVotesCount > Math.floor(totalMembers / 2);
  const hasSelfVotedSkip = partyState.skipVotes.includes(partyState.selfId);

  const hostMember = partyState.members.find((m) => m.isHost);

  const syncStatus = (() => {
    if (diagnostics.isBotDemoRoom) {
      return {
        label: 'Demo Sync',
        tone: 'text-purple-300 bg-purple-500/15 border-purple-500/30',
        dot: 'bg-purple-400',
        icon: <Radio className="w-3 h-3 text-purple-300" />,
      };
    }
    if (partyState.isReconnecting) {
      return {
        label: 'Reconnecting',
        tone: 'text-amber-300 bg-amber-500/15 border-amber-500/30',
        dot: 'bg-amber-400 animate-pulse',
        icon: <RefreshCw className="w-3 h-3 text-amber-300 animate-spin" />,
      };
    }
    if (!partyState.isConnected || diagnostics.connectionStatus !== 'SUBSCRIBED') {
      return {
        label: 'Disconnected',
        tone: 'text-rose-300 bg-rose-500/15 border-rose-500/30',
        dot: 'bg-rose-400',
        icon: <WifiOff className="w-3 h-3 text-rose-300" />,
      };
    }
    if (partyState.playbackStatus === 'playing') {
      return {
        label: 'Live Synced',
        tone: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30',
        dot: 'bg-emerald-400 animate-pulse',
        icon: <Wifi className="w-3 h-3 text-emerald-300" />,
      };
    }
    if (partyState.playbackStatus === 'loading' || partyState.playbackStatus === 'countdown') {
      return {
        label: 'Syncing',
        tone: 'text-cyan-300 bg-cyan-500/15 border-cyan-500/30',
        dot: 'bg-cyan-400 animate-pulse',
        icon: <RefreshCw className="w-3 h-3 text-cyan-300 animate-spin" />,
      };
    }
    return {
      label: 'Synced',
      tone: 'text-cyan-300 bg-cyan-500/15 border-cyan-500/30',
      dot: 'bg-cyan-400',
      icon: <Wifi className="w-3 h-3 text-cyan-300" />,
    };
  })();

  const handleSeekInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isHost || !track || durationSec <= 0) return;
    const nextSec = Number(e.target.value);
    if (!Number.isNaN(nextSec)) {
      PartyService.hostSeek(nextSec);
    }
  };

  const canPlayPause = Boolean(track);
  const isCurrentlyPlaying = partyState.playbackStatus === 'playing';
  const canPrevious = Boolean(track && (partyState.history.length > 0 || clampedCurrentSec > 3));
  const canNext = Boolean(partyState.queue.length > 0 || diagnostics.isBotDemoRoom);
  const canAddMusic = isHost || partyState.allowGuestQueue;

  const getStatusRing = (status: string) => {
    if (status === 'playing') return 'ring-2 ring-cyan-400';
    if (status === 'ready') return 'ring-2 ring-emerald-400/70';
    if (status === 'loading' || status === 'countdown') return 'ring-2 ring-amber-400/70';
    return 'ring-2 ring-[#121622]';
  };

  return (
    <div className="flex flex-col justify-between gap-3.5 animate-in fade-in duration-200">
      {/* Immersive Full-Screen Player Surface */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-[#171D2E] via-[#111522] to-[#0B0E17] border border-white/10 shadow-2xl p-4 sm:p-6 space-y-5">
        {/* Ambient Radial Accent Glow */}
        <div
          className={`pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full blur-3xl transition-opacity duration-700 ${
            isCurrentlyPlaying ? 'opacity-40' : 'opacity-15'
          } bg-gradient-to-tr from-cyan-500/45 via-purple-600/40 to-transparent`}
        />

        {/* Top Room Metadata & Realtime Sync Bar */}
        <div className="relative flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono text-xs font-black tracking-widest text-cyan-300 bg-white/5 border border-white/10 px-2.5 py-1 rounded-xl shrink-0">
              {partyState.roomCode}
            </span>
            <span className="text-[11px] text-slate-300 font-semibold truncate flex items-center gap-1">
              <Crown className="w-3 h-3 text-amber-400 shrink-0" />
              <span className="truncate">
                {isHost
                  ? 'You host'
                  : hostMember
                  ? hostMember.username || hostMember.nickname
                  : 'Host'}
              </span>
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-semibold border ${syncStatus.tone}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${syncStatus.dot}`} />
              {syncStatus.icon}
              <span>{syncStatus.label}</span>
            </span>
          </div>
        </div>

        {/* Large Album Artwork */}
        <div className="relative flex justify-center py-1">
          <div
            className={`w-56 h-56 sm:w-64 sm:h-64 rounded-3xl bg-[#090C14] border border-white/15 overflow-hidden shadow-2xl flex items-center justify-center transition-transform duration-500 ${
              isCurrentlyPlaying ? 'scale-[1.01] shadow-cyan-500/20' : ''
            }`}
          >
            {track?.cover && !artworkError ? (
              <img
                src={track.cover}
                alt={track.title}
                referrerPolicy="no-referrer"
                onError={() => setArtworkError(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-[#142033] via-[#131727] to-[#231433] flex flex-col items-center justify-center gap-2.5 px-4 text-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-purple-500/25 border border-white/15 flex items-center justify-center">
                  <Music className="w-8 h-8 text-cyan-300" />
                </div>
                <span className="text-xs font-medium text-slate-400">
                  {track ? 'No album artwork' : 'Ready for music'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Song Title, Artist & Attribution */}
        <div className="relative text-center space-y-1 max-w-md mx-auto">
          <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight truncate px-2">
            {track?.title || (isHost ? 'Choose a song to play' : 'Waiting for host to pick a song')}
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 truncate px-4">
            {track?.artist || 'Synchronized Group Listening'}
          </p>
          {track?.addedBy && (
            <p className="text-[11px] text-cyan-300/85 font-medium truncate">
              Added by {track.addedBy.name}
            </p>
          )}
        </div>

        {/* Playback Progress Bar */}
        <div className="relative space-y-1.5">
          {isHost && track && durationSec > 0 ? (
            <input
              type="range"
              min={0}
              max={durationSec}
              step={0.5}
              value={clampedCurrentSec}
              onChange={handleSeekInput}
              aria-label="Seek track position"
              className="w-full h-2.5 rounded-full appearance-none cursor-pointer bg-[#090C14] accent-cyan-400"
              style={{
                background: `linear-gradient(to right, #22d3ee 0%, #a855f7 ${progressPct}%, #090c14 ${progressPct}%, #090c14 100%)`,
              }}
            />
          ) : (
            <div className="h-2.5 w-full rounded-full bg-[#090C14] overflow-hidden border border-white/5">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 to-purple-500 transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          )}

          <div className="flex justify-between text-[11px] font-mono tabular-nums text-slate-400">
            <span>{formatSeconds(clampedCurrentSec)}</span>
            <span>{durationSec > 0 ? formatSeconds(durationSec) : '--:--'}</span>
          </div>
        </div>

        {/* Playback Controls */}
        <div className="relative">
          {isHost ? (
            <div className="flex flex-col items-center gap-3">
              {!track ? (
                <button
                  type="button"
                  onClick={() => {
                    triggerHapticFeedback();
                    onOpenAddMusic();
                  }}
                  className="min-h-[48px] px-6 py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-purple-600 hover:brightness-110 text-white font-bold text-sm shadow-lg shadow-cyan-500/25 flex items-center gap-2 active:scale-95 transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Music to Party</span>
                </button>
              ) : (
                <div className="flex items-center justify-center gap-5 sm:gap-7">
                  <button
                    type="button"
                    disabled={!canPrevious}
                    onClick={() => PartyService.hostPreviousTrack()}
                    aria-label="Previous track"
                    className="w-12 h-12 min-h-[44px] min-w-[44px] rounded-2xl bg-white/5 hover:bg-white/10 disabled:opacity-35 border border-white/10 text-white flex items-center justify-center active:scale-90 transition cursor-pointer"
                  >
                    <SkipBack className="w-5 h-5" />
                  </button>

                  <button
                    type="button"
                    disabled={!canPlayPause}
                    onClick={() => {
                      if (isCurrentlyPlaying) {
                        PartyService.hostPause();
                      } else {
                        PartyService.hostPlay();
                      }
                    }}
                    aria-label={isCurrentlyPlaying ? 'Pause' : 'Play'}
                    className="w-16 h-16 min-h-[64px] min-w-[64px] rounded-full bg-gradient-to-br from-cyan-400 to-purple-600 hover:brightness-110 disabled:opacity-40 text-slate-950 shadow-xl shadow-cyan-500/30 flex items-center justify-center active:scale-95 transition cursor-pointer"
                  >
                    {isCurrentlyPlaying ? (
                      <Pause className="w-7 h-7 fill-current" />
                    ) : (
                      <Play className="w-7 h-7 fill-current ml-0.5" />
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={!canNext}
                    onClick={() => PartyService.hostNextTrack(false)}
                    aria-label="Next track"
                    className={`w-12 h-12 min-h-[44px] min-w-[44px] rounded-2xl border flex items-center justify-center active:scale-90 transition cursor-pointer disabled:opacity-35 ${
                      isMajoritySkip
                        ? 'bg-gradient-to-r from-pink-500 to-rose-600 border-pink-400/50 text-white animate-pulse'
                        : 'bg-white/5 hover:bg-white/10 border-white/10 text-white'
                    }`}
                  >
                    <SkipForward className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-1">
              <div className="text-xs text-slate-300 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400" />
                <span>Synced with host playback</span>
              </div>

              <div className="flex items-center gap-2">
                {canAddMusic && !track && (
                  <button
                    type="button"
                    onClick={() => {
                      triggerHapticFeedback();
                      onOpenAddMusic();
                    }}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer active:scale-95 transition"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Music</span>
                  </button>
                )}

                {track && (
                  <button
                    type="button"
                    disabled={hasSelfVotedSkip}
                    onClick={() => PartyService.voteToSkip()}
                    className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      hasSelfVotedSkip
                        ? 'bg-purple-500/20 text-purple-200 border border-purple-500/35'
                        : 'bg-white/5 hover:bg-white/10 text-white border border-white/10'
                    }`}
                  >
                    <SkipForward className="w-3.5 h-3.5 text-purple-400" />
                    <span>
                      {hasSelfVotedSkip
                        ? `Voted Skip (${skipVotesCount}/${totalMembers})`
                        : skipVotesCount > 0
                        ? `Vote Skip (${skipVotesCount}/${totalMembers})`
                        : 'Vote Skip'}
                    </span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Friends Profile Pictures & Listening Status Strip */}
        <button
          type="button"
          onClick={() => {
            triggerHapticFeedback();
            onOpenPeople();
          }}
          className="relative w-full p-2.5 rounded-2xl bg-[#0D101B]/85 hover:bg-[#14192A] border border-white/10 flex items-center justify-between gap-3 transition cursor-pointer min-h-[52px]"
          aria-label="View listeners in room"
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1 overflow-x-auto no-scrollbar">
            {partyState.members.map((member) => {
              const displayName = member.username || member.nickname;
              return (
                <div key={member.id} className="flex items-center gap-1.5 shrink-0 pr-1">
                  <Avatar
                    url={member.avatarUrl || (member.avatar?.startsWith('data:') ? member.avatar : null)}
                    name={displayName}
                    size={28}
                    className={getStatusRing(member.status)}
                  />
                  <div className="text-left leading-tight">
                    <span className="text-[11px] font-bold text-slate-200 block max-w-[72px] truncate">
                      {displayName}
                    </span>
                    <span className="text-[9px] text-slate-400 capitalize block">
                      {member.isHost ? 'Host' : member.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white/5 border border-white/10 text-[11px] font-bold text-cyan-300 shrink-0">
            <Users className="w-3.5 h-3.5" />
            <span>{partyState.members.length}</span>
          </span>
        </button>
      </section>

      {/* Compact Reactions Strip */}
      <div className="p-3 rounded-2xl bg-[#111522]/95 border border-white/10 space-y-2 shadow-lg">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Reactions
          </span>
          <button
            type="button"
            onClick={() => PartyService.toggleMuteReactions()}
            className={`min-h-[34px] px-2.5 py-1 rounded-xl text-[11px] font-semibold flex items-center gap-1.5 transition cursor-pointer ${
              partyState.isReactionsMuted
                ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
            }`}
          >
            {partyState.isReactionsMuted ? (
              <>
                <BellOff className="w-3.5 h-3.5" />
                <span>Muted</span>
              </>
            ) : (
              <>
                <Bell className="w-3.5 h-3.5 text-cyan-400" />
                <span>Mute</span>
              </>
            )}
          </button>
        </div>

        <div className="grid grid-cols-6 gap-1.5">
          {PARTY_REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => PartyService.sendReaction(emoji)}
              aria-label={`Send ${emoji} reaction`}
              className="min-h-[44px] h-11 rounded-xl bg-[#181E30] hover:bg-[#222A42] border border-white/10 text-xl flex items-center justify-center active:scale-90 transition cursor-pointer"
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      {/* Prominent Room Menu Button */}
      <button
        type="button"
        onClick={() => {
          triggerHapticFeedback();
          onOpenDashboard();
        }}
        className="w-full min-h-[54px] px-5 py-3 rounded-2xl bg-gradient-to-r from-[#132236] via-[#191B32] to-[#281538] hover:brightness-110 border border-cyan-400/40 text-white font-extrabold text-sm shadow-xl shadow-cyan-500/10 flex items-center justify-between gap-3 active:scale-[0.98] transition cursor-pointer"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-purple-600 text-slate-950 flex items-center justify-center shrink-0">
            <LayoutGrid className="w-5 h-5" />
          </div>
          <div className="text-left min-w-0">
            <span className="block text-sm font-extrabold text-white">Room Menu</span>
            <span className="block text-[11px] font-medium text-slate-300 truncate">
              People · Invite · Chat · Queue ({partyState.queue.length})
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {unreadChatCount > 0 && (
            <span className="min-w-[24px] h-6 px-2 rounded-full bg-rose-500 text-white text-[11px] font-extrabold flex items-center justify-center">
              {unreadChatCount > 99 ? '99+' : unreadChatCount}
            </span>
          )}
          <span className="text-xs font-bold text-cyan-300">Open</span>
        </div>
      </button>
    </div>
  );
};
