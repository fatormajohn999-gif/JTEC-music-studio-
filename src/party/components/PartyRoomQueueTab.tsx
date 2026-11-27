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
      className={`${sizeClass} rounded-xl bg-[#070A11] border border-white/10 overflow-hidden shrink-0 flex items-center justify-center`}
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
    <div className="flex flex-col flex-1 min-h-0 h-full w-full bg-[#090C14] overflow-hidden animate-in fade-in duration-200">
      {/* Pinned Now Playing + Queue Controls Header */}
      <div className="shrink-0 border-b border-white/10 bg-gradient-to-b from-[#131828] to-[#0D111C] px-4 sm:px-6 pt-3.5 pb-3">
        <div className="max-w-3xl mx-auto w-full space-y-3">
          {/* Now Playing Row */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
                <Music className="w-3.5 h-3.5 text-cyan-400" />
                <span>Now Playing</span>
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">
                {partyState.playbackStatus}
              </span>
            </div>

            {partyState.currentTrack ? (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <QueueArtwork
                    src={partyState.currentTrack.cover}
                    alt={partyState.currentTrack.title}
                    sizeClass="w-12 h-12 sm:w-14 sm:h-14"
                    iconClass="w-5 h-5 text-cyan-400/60"
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
                    className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-35 border border-white/10 text-xs font-bold text-white flex items-center gap-1.5 shrink-0 cursor-pointer transition"
                  >
                    <SkipForward className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Next</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={hasSelfVotedSkip}
                    onClick={() => PartyService.voteToSkip()}
                    className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer transition ${
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
                Nothing is playing right now. Add music below to start listening together.
              </p>
            )}
          </div>

          {/* Up Next Toolbar */}
          <div className="pt-2.5 border-t border-white/10 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ListMusic className="w-4 h-4 text-purple-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                Up Next ({partyState.queue.length})
              </h3>
            </div>

            <span className="text-[11px] font-medium text-slate-400">
              {partyState.allowGuestQueue ? 'Members can add music' : 'Host-only queue'}
            </span>
          </div>
        </div>
      </div>

      {/* Scrollable Upcoming Tracks List */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-3 pb-4">
        <div className="max-w-3xl mx-auto w-full h-full flex flex-col space-y-2.5">
          {!canAddMusic && (
            <div className="px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-[11px] text-slate-400 flex items-center gap-2 shrink-0">
              <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>Only the host can add or reorder songs in this room right now.</span>
            </div>
          )}

          {partyState.queue.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-10 px-4 text-center space-y-2.5">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                <ListMusic className="w-6 h-6 text-purple-300/75" />
              </div>
              <p className="text-sm font-semibold text-slate-200">The shared queue is empty</p>
              <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                {canAddMusic
                  ? 'Tap "Add Music" below to pick tracks from Downloaded Music, JTEC Cloud, or Online Catalogs.'
                  : 'Songs queued by the host will appear here and play automatically.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.07]">
              {partyState.queue.map((track, idx) => (
                <div
                  key={`${track.id}-${idx}`}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 py-3 first:pt-1"
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
                      <p className="text-[10px] text-cyan-300/85 truncate mt-0.5">
                        Added by {track.addedBy?.name || 'Host'}
                      </p>
                    </div>
                  </div>

                  {isHost && (
                    <div className="flex items-center justify-end gap-1.5 shrink-0 pl-7 sm:pl-0">
                      <button
                        type="button"
                        onClick={() => PartyService.hostPlayTrackFromQueue(idx)}
                        aria-label={`Play ${track.title} now`}
                        className="min-h-[40px] min-w-[40px] p-2 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 flex items-center justify-center transition cursor-pointer"
                        title="Play now"
                      >
                        <Play className="w-4 h-4 fill-current" />
                      </button>

                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => PartyService.hostReorderQueue(idx, idx - 1)}
                        aria-label="Move up"
                        className="min-h-[40px] min-w-[40px] p-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-25 text-slate-300 flex items-center justify-center transition cursor-pointer"
                        title="Move up"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        disabled={idx === partyState.queue.length - 1}
                        onClick={() => PartyService.hostReorderQueue(idx, idx + 1)}
                        aria-label="Move down"
                        className="min-h-[40px] min-w-[40px] p-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-25 text-slate-300 flex items-center justify-center transition cursor-pointer"
                        title="Move down"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => PartyService.hostRemoveFromQueue(idx)}
                        aria-label={`Remove ${track.title}`}
                        className="min-h-[40px] min-w-[40px] p-2 rounded-xl bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 flex items-center justify-center transition cursor-pointer"
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

      {/* Prominent Bottom Add Music Action Bar */}
      {canAddMusic && (
        <div className="shrink-0 border-t border-white/10 bg-[#0D111C]/95 backdrop-blur-md px-4 sm:px-6 py-2.5">
          <div className="max-w-3xl mx-auto w-full">
            <button
              type="button"
              onClick={onOpenAddMusic}
              className="w-full h-12 rounded-2xl bg-gradient-to-r from-cyan-500 to-purple-600 hover:brightness-110 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 active:scale-[0.99] transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Music</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
