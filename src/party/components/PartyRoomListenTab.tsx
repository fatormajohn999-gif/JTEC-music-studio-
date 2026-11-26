import React from 'react';
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
} from 'lucide-react';
import { PartyState, PARTY_REACTION_EMOJIS } from '../types';
import { PartyService, PartyServiceDiagnostics } from '../PartyService';
import { Avatar } from './Avatar';

interface PartyRoomListenTabProps {
  partyState: PartyState;
  diagnostics: PartyServiceDiagnostics;
  currentPlaybackSec: number;
  onOpenPeopleTab: () => void;
  onOpenQueueTab: () => void;
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
  onOpenPeopleTab,
  onOpenQueueTab,
  onOpenAddMusic,
}) => {
  const isHost = partyState.role === 'host';
  const track = partyState.currentTrack;
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
        label: 'Demo Room Active',
        tone: 'text-purple-300 bg-purple-500/15 border-purple-500/30',
        icon: <Radio className="w-3 h-3 text-purple-300 animate-pulse" />,
      };
    }
    if (partyState.isReconnecting) {
      return {
        label: 'Reconnecting Sync...',
        tone: 'text-amber-300 bg-amber-500/15 border-amber-500/30',
        icon: <RefreshCw className="w-3 h-3 text-amber-300 animate-spin" />,
      };
    }
    if (!partyState.isConnected || diagnostics.connectionStatus !== 'SUBSCRIBED') {
      return {
        label: 'Disconnected',
        tone: 'text-rose-300 bg-rose-500/15 border-rose-500/30',
        icon: <WifiOff className="w-3 h-3 text-rose-300" />,
      };
    }
    if (partyState.playbackStatus === 'playing') {
      return {
        label: 'Live Synced',
        tone: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30',
        icon: <Wifi className="w-3 h-3 text-emerald-300" />,
      };
    }
    if (partyState.playbackStatus === 'loading' || partyState.playbackStatus === 'countdown') {
      return {
        label: 'Syncing Group...',
        tone: 'text-cyan-300 bg-cyan-500/15 border-cyan-500/30',
        icon: <RefreshCw className="w-3 h-3 text-cyan-300 animate-spin" />,
      };
    }
    return {
      label: 'Connected • Ready',
      tone: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/25',
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

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Top Status Strip: Host Badge + Realtime Sync Status + Listening Members Stack */}
      <div className="p-3.5 rounded-2xl bg-[#131722]/90 border border-white/10 flex flex-wrap items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
              isHost
                ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                : 'bg-purple-500/15 text-purple-200 border-purple-500/30'
            }`}
          >
            <Crown className="w-3.5 h-3.5 text-amber-400" />
            <span>
              {isHost
                ? 'You are Host'
                : hostMember
                ? `Host: ${hostMember.username || hostMember.nickname}`
                : 'Host Controlled'}
            </span>
          </span>

          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${syncStatus.tone}`}
          >
            {syncStatus.icon}
            <span>{syncStatus.label}</span>
          </span>
        </div>

        {/* Listening Members Avatars Stack */}
        <button
          type="button"
          onClick={onOpenPeopleTab}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition active:scale-95 cursor-pointer min-h-[38px]"
          title="View room members"
        >
          <div className="flex -space-x-2">
            {partyState.members.slice(0, 4).map((m) => (
              <Avatar
                key={m.id}
                url={m.avatarUrl || (m.avatar?.startsWith('data:') ? m.avatar : null)}
                name={m.username || m.nickname}
                size={26}
                className="ring-2 ring-[#131722]"
              />
            ))}
          </div>
          <span className="text-[11px] font-semibold text-slate-200 flex items-center gap-1">
            <Users className="w-3 h-3 text-cyan-400" />
            <span>{partyState.members.length}</span>
          </span>
        </button>
      </div>

      {/* Main Player Card */}
      <div className="relative overflow-hidden p-5 sm:p-6 rounded-3xl bg-gradient-to-b from-[#171C2B] via-[#121622] to-[#0D1019] border border-white/10 shadow-2xl space-y-5">
        {/* Ambient Background Glow */}
        <div
          className={`pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full blur-3xl transition-opacity duration-700 ${
            isCurrentlyPlaying ? 'opacity-35' : 'opacity-15'
          } bg-gradient-to-tr from-cyan-500/40 via-purple-600/40 to-transparent`}
        />

        {/* Large Album Artwork */}
        <div className="relative flex justify-center pt-1">
          <div
            className={`w-52 h-52 sm:w-64 sm:h-64 rounded-3xl bg-[#0B0E17] border border-white/15 overflow-hidden shadow-2xl flex items-center justify-center transition-transform duration-500 ${
              isCurrentlyPlaying ? 'scale-[1.01] shadow-cyan-500/20' : ''
            }`}
          >
            {track?.cover ? (
              <img
                src={track.cover}
                alt={track.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 text-slate-500">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500/15 to-purple-500/20 border border-white/10 flex items-center justify-center">
                  <Music className="w-8 h-8 text-cyan-400/70" />
                </div>
                <span className="text-xs font-medium text-slate-400">No track selected</span>
              </div>
            )}
          </div>
        </div>

        {/* Title, Artist & Added By */}
        <div className="relative text-center space-y-1.5 max-w-md mx-auto">
          <h2 className="text-lg sm:text-xl font-extrabold text-white truncate px-2">
            {track?.title || (isHost ? 'Pick a song to start the party' : 'Waiting for host to pick a song...')}
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 truncate px-4">
            {track?.artist || 'Synchronized Group Listening'}
          </p>
          {track?.addedBy && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] text-slate-300">
              <span>Added by {track.addedBy.name}</span>
            </div>
          )}
        </div>

        {/* Progress Bar & Time */}
        <div className="relative space-y-1.5">
          {isHost && track && durationSec > 0 ? (
            <div className="relative flex items-center">
              <input
                type="range"
                min={0}
                max={durationSec}
                step={0.5}
                value={clampedCurrentSec}
                onChange={handleSeekInput}
                aria-label="Seek track position"
                className="w-full h-2 rounded-full appearance-none cursor-pointer bg-[#090C14] accent-cyan-400"
                style={{
                  background: `linear-gradient(to right, #22d3ee 0%, #a855f7 ${progressPct}%, #0b0e17 ${progressPct}%, #0b0e17 100%)`,
                }}
              />
            </div>
          ) : (
            <div className="h-2 w-full rounded-full bg-[#090C14] overflow-hidden border border-white/5">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 to-purple-500 transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          )}

          <div className="flex justify-between text-[11px] font-mono text-slate-400">
            <span>{formatSeconds(clampedCurrentSec)}</span>
            <span>{durationSec > 0 ? formatSeconds(durationSec) : '--:--'}</span>
          </div>
        </div>

        {/* Playback Controls */}
        <div className="relative pt-1">
          {isHost ? (
            <div className="flex flex-col items-center gap-3">
              {!track ? (
                <button
                  type="button"
                  onClick={onOpenAddMusic}
                  className="min-h-[48px] px-6 py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-purple-600 hover:brightness-110 text-white font-bold text-sm shadow-lg shadow-cyan-500/20 flex items-center gap-2 active:scale-95 transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Music to Party</span>
                </button>
              ) : (
                <div className="flex items-center justify-center gap-4 sm:gap-6">
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
                    className="w-16 h-16 min-h-[56px] min-w-[56px] rounded-full bg-gradient-to-br from-cyan-400 to-purple-600 hover:brightness-110 disabled:opacity-40 text-slate-950 shadow-xl shadow-cyan-500/25 flex items-center justify-center active:scale-95 transition cursor-pointer"
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

              {partyState.queue.length > 0 && (
                <button
                  type="button"
                  onClick={onOpenQueueTab}
                  className="text-[11px] text-cyan-300 hover:text-cyan-200 font-semibold px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 transition cursor-pointer"
                >
                  Up Next: {partyState.queue[0].title} ({partyState.queue.length} in queue)
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-1 border-t border-white/5">
              <div className="text-xs text-slate-400 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                <span>Playback is synced with the host</span>
              </div>

              <div className="flex items-center gap-2">
                {skipVotesCount > 0 && (
                  <span className="text-[11px] text-slate-300 font-medium">
                    {skipVotesCount}/{totalMembers} skip votes
                  </span>
                )}
                <button
                  type="button"
                  disabled={hasSelfVotedSkip || !track}
                  onClick={() => PartyService.voteToSkip()}
                  className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    hasSelfVotedSkip
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                      : 'bg-white/5 hover:bg-white/10 text-white border border-white/10 disabled:opacity-40'
                  }`}
                >
                  <SkipForward className="w-3.5 h-3.5 text-purple-400" />
                  <span>{hasSelfVotedSkip ? 'Voted to Skip' : 'Vote Skip'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Reactions Bar - Dedicated non-overlapping card below controls */}
      <div className="p-3.5 rounded-2xl bg-[#121622]/90 border border-white/10 space-y-2.5 shadow-lg">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Live Reactions
          </span>
          <button
            type="button"
            onClick={() => PartyService.toggleMuteReactions()}
            className={`min-h-[36px] px-2.5 py-1 rounded-xl text-[11px] font-semibold flex items-center gap-1.5 transition cursor-pointer ${
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

        <div className="grid grid-cols-6 gap-2">
          {PARTY_REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => PartyService.sendReaction(emoji)}
              aria-label={`Send ${emoji} reaction`}
              className="min-h-[44px] h-11 rounded-xl bg-[#1A2032] hover:bg-[#232A40] border border-white/10 text-xl flex items-center justify-center active:scale-90 transition cursor-pointer shadow-sm"
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
