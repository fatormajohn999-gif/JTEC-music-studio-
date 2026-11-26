import React, { useState } from 'react';
import {
  ListMusic,
  Music,
  Plus,
  Trash2,
  Play,
  ArrowUp,
  ArrowDown,
  SkipForward,
  Lock,
  Unlock,
} from 'lucide-react';
import { PartyState } from '../types';
import { PartyService } from '../PartyService';

interface PartyRoomQueueTabProps {
  partyState: PartyState;
  onOpenAddMusic: () => void;
}

const formatSeconds = (sec?: number): string => {
  if (!sec || sec <= 0) return '';
  const s = Math.floor(sec);
  const mins = Math.floor(s / 60);
  const remainder = s % 60;
  return `${mins}:${remainder.toString().padStart(2, '0')}`;
};

const QueueArtwork: React.FC<{ src?: string; alt: string; sizeClass: string; iconClass: string }> = ({
  src,
  alt,
  sizeClass,
  iconClass,
}) => {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className={`${sizeClass} rounded-xl bg-[#090C14] border border-white/10 overflow-hidden shrink-0 flex items-center justify-center`}
    >
      {src && !failed ? (
        <img
          src={src}
          alt={alt}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <Music className={iconClass} />
      )}
    </div>
  );
};

export const PartyRoomQueueTab: React.FC<PartyRoomQueueTabProps> = ({
  partyState,
  onOpenAddMusic,
}) => {
  const isHost = partyState.role === 'host';
  const canAddMusic = isHost || partyState.allowGuestQueue;
  const totalMembers = Math.max(1, partyState.members.length);
  const skipVotesCount = partyState.skipVotes.length;
  const hasSelfVotedSkip = partyState.skipVotes.includes(partyState.selfId);

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Now Playing in Queue */}
      <div className="p-4 rounded-3xl bg-gradient-to-br from-[#171C2B] via-[#121622] to-[#1A132B] border border-cyan-500/25 space-y-3 shadow-xl">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
            <Music className="w-3.5 h-3.5 text-cyan-400" />
            <span>Now Playing</span>
          </span>
          <span className="px-2 py-0.5 rounded-xl text-[10px] font-bold bg-white/5 border border-white/10 text-slate-300 uppercase">
            {partyState.playbackStatus}
          </span>
        </div>

        {partyState.currentTrack ? (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <QueueArtwork
                src={partyState.currentTrack.cover}
                alt={partyState.currentTrack.title}
                sizeClass="w-14 h-14"
                iconClass="w-6 h-6 text-cyan-400/60"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white truncate">
                  {partyState.currentTrack.title}
                </p>
                <p className="text-xs text-slate-300 truncate">
                  {partyState.currentTrack.artist}
                </p>
                {partyState.currentTrack.addedBy && (
                  <p className="text-[10px] text-cyan-300/90 mt-0.5 truncate">
                    Added by {partyState.currentTrack.addedBy.name}
                  </p>
                )}
              </div>
            </div>

            {isHost ? (
              <button
                type="button"
                disabled={partyState.queue.length === 0}
                onClick={() => PartyService.hostNextTrack(false)}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-35 border border-white/10 text-xs font-bold text-white flex items-center gap-1.5 shrink-0 cursor-pointer transition"
              >
                <SkipForward className="w-3.5 h-3.5 text-cyan-400" />
                <span>Next</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={hasSelfVotedSkip}
                onClick={() => PartyService.voteToSkip()}
                className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer transition ${
                  hasSelfVotedSkip
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                    : 'bg-white/5 hover:bg-white/10 text-white border border-white/10'
                }`}
              >
                <SkipForward className="w-3.5 h-3.5 text-purple-400" />
                <span>{hasSelfVotedSkip ? `Voted (${skipVotesCount}/${totalMembers})` : 'Vote Skip'}</span>
              </button>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-400 py-1">
            Nothing is playing right now. Add music to start listening together.
          </p>
        )}
      </div>

      {/* Upcoming Shared Queue Card */}
      <div className="p-4 rounded-3xl bg-[#121622]/90 border border-white/10 space-y-3.5 shadow-lg">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <ListMusic className="w-4 h-4 text-purple-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-white">
              Up Next ({partyState.queue.length})
            </h3>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {isHost && (
              <button
                type="button"
                onClick={() => PartyService.hostSetGuestQueueAllowed(!partyState.allowGuestQueue)}
                className={`min-h-[44px] px-3 py-1.5 rounded-xl border text-[11px] font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                  partyState.allowGuestQueue
                    ? 'bg-cyan-500/15 border-cyan-500/35 text-cyan-200'
                    : 'bg-[#181D2C] border-white/10 text-slate-400 hover:text-white'
                }`}
                title="Allow room members to add songs to the queue"
              >
                {partyState.allowGuestQueue ? (
                  <Unlock className="w-3.5 h-3.5 text-cyan-400" />
                ) : (
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span>Guests {partyState.allowGuestQueue ? 'Can Add' : 'View Only'}</span>
              </button>
            )}

            {canAddMusic && (
              <button
                type="button"
                onClick={onOpenAddMusic}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 hover:brightness-110 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-cyan-500/15 active:scale-95 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Music</span>
              </button>
            )}
          </div>
        </div>

        {!canAddMusic && (
          <div className="px-3 py-2 rounded-xl bg-[#181D2C] border border-white/5 text-[11px] text-slate-400 flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>Only the host can add or reorder songs in this room right now.</span>
          </div>
        )}

        {partyState.queue.length === 0 ? (
          <div className="py-8 px-4 text-center space-y-2 rounded-2xl bg-[#0C0F18]/70 border border-white/5">
            <ListMusic className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-xs font-semibold text-slate-300">The shared queue is empty</p>
            <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
              {canAddMusic
                ? 'Tap "Add Music" to pick songs from Downloaded Music, JTEC Cloud, or Online Catalogs.'
                : 'Songs queued by the host will appear here and play automatically.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {partyState.queue.map((track, idx) => (
              <div
                key={`${track.id}-${idx}`}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-2.5 sm:p-3 rounded-2xl bg-[#171C2B]/90 border border-white/5 hover:border-white/15 transition"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <span className="text-[11px] font-mono text-slate-500 w-5 text-center shrink-0">
                    {idx + 1}
                  </span>

                  <QueueArtwork
                    src={track.cover}
                    alt={track.title}
                    sizeClass="w-11 h-11"
                    iconClass="w-4 h-4 text-cyan-400/60"
                  />

                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-bold text-white truncate">
                      {track.title}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {track.artist}
                      {track.duration ? ` • ${formatSeconds(track.duration)}` : ''}
                    </p>
                    <p className="text-[10px] text-cyan-300/80 truncate mt-0.5">
                      Added by {track.addedBy?.name || 'Host'}
                    </p>
                  </div>
                </div>

                {isHost && (
                  <div className="flex items-center justify-end gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => PartyService.hostPlayTrackFromQueue(idx)}
                      aria-label={`Play ${track.title} now`}
                      className="min-h-[44px] min-w-[44px] p-2 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 flex items-center justify-center transition cursor-pointer"
                      title="Play now"
                    >
                      <Play className="w-4 h-4 fill-current" />
                    </button>

                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => PartyService.hostReorderQueue(idx, idx - 1)}
                      aria-label="Move up"
                      className="min-h-[44px] min-w-[44px] p-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-25 text-slate-300 flex items-center justify-center transition cursor-pointer"
                      title="Move up"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      disabled={idx === partyState.queue.length - 1}
                      onClick={() => PartyService.hostReorderQueue(idx, idx + 1)}
                      aria-label="Move down"
                      className="min-h-[44px] min-w-[44px] p-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-25 text-slate-300 flex items-center justify-center transition cursor-pointer"
                      title="Move down"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => PartyService.hostRemoveFromQueue(idx)}
                      aria-label={`Remove ${track.title}`}
                      className="min-h-[44px] min-w-[44px] p-2 rounded-xl bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 flex items-center justify-center transition cursor-pointer"
                      title="Remove from queue"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
