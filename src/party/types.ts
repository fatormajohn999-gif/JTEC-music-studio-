// Types for JTEC Party - synchronized listening rooms via PartyBackend

export type PartyRole = 'host' | 'guest';

export type PartyMemberStatus = 'idle' | 'loading' | 'ready' | 'countdown' | 'playing' | 'paused';

export interface PartyMember {
  id: string;
  nickname: string;
  avatar?: string; // hex color or initial avatar gradient
  tag?: string; // e.g. #3041
  isHost: boolean;
  status: PartyMemberStatus;
  latencyMs?: number;
  clockOffsetMs?: number;
  driftMs?: number;
  lastSeen: number;
}

export interface PartyTrack {
  source: string; // 'nasheed' | 'love_chill' | 'jtec_main' | 'jamendo' | 'archive' | 'cloud'
  id: string;
  title: string;
  artist: string;
  cover?: string;
  audioUrl: string;
  duration?: number;
  size?: number;
}

export type PartyPlaybackStatus = 'idle' | 'loading' | 'ready' | 'countdown' | 'playing' | 'paused';

export interface HostDiagnostic {
  memberId: string;
  nickname: string;
  avatar?: string;
  tag?: string;
  latencyMs: number;
  clockOffsetMs: number;
  driftMs: number;
  lastUpdated: number;
}

export interface OnlineFriend {
  id: string;
  name: string;
  avatar: string;
  tag: string;
  isOnline: boolean;
}

export interface NetworkSimulationConfig {
  latencyMs: number; // 20 to 800 ms
  jitterMs: number; // 0 to 200 ms
  packetLossRate: number; // 0 to 0.2 (0% - 20%)
}

export const PARTY_REACTION_EMOJIS = ['👍', '❤️', '🔥', '😂', '👏', '🤲'] as const;
export type PartyReactionEmoji = typeof PARTY_REACTION_EMOJIS[number];

export interface FloatingReaction {
  id: string;
  emoji: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  senderTag?: string;
  timestamp: number;
  xOffsetPercent: number; // 10 to 90%
}

export interface PartyState {
  roomCode: string | null;
  role: PartyRole;
  selfId: string;
  nickname: string;
  avatar: string;
  tag: string;
  isLocked: boolean; // host closed room to new members
  members: PartyMember[];
  currentTrack: PartyTrack | null;
  playbackStatus: PartyPlaybackStatus;
  countdownNumber: number | null; // 3, 2, 1, or null
  isConnected: boolean;
  isReconnecting: boolean;
  errorMessage: string | null;
  targetStartTime: number | null;
  diagnostics: HostDiagnostic[];
  // Vote-to-skip
  skipVotes: string[]; // member IDs who voted to skip current track
  autoSkipEnabled: boolean; // host setting: auto-skip when > 50% vote
  // Queue list for host
  queue: PartyTrack[];
  // Reactions
  activeReactions: FloatingReaction[];
  isReactionsMuted: boolean;
}

export type PartyBroadcastPayload =
  | { type: 'load'; track: PartyTrack; hostTimestamp: number; seq: number }
  | { type: 'member_status'; memberId: string; status: PartyMemberStatus; seq: number }
  | { type: 'start_countdown'; targetStartTime: number; hostTimestamp: number; seq: number }
  | { type: 'state'; track: PartyTrack | null; status: PartyPlaybackStatus; positionMs: number; hostTimestamp: number; seq: number }
  | { type: 'ping'; fromId: string; t0: number }
  | { type: 'pong'; forId: string; t0: number; t_host: number }
  | { type: 'guest_diag'; memberId: string; nickname: string; avatar?: string; tag?: string; latencyMs: number; clockOffsetMs: number; driftMs: number }
  | { type: 'hello'; memberId: string; nickname: string; avatar?: string; tag?: string }
  | { type: 'close_room'; reason: string }
  | { type: 'kick_member'; targetId: string; reason?: string }
  | { type: 'room_lock'; isLocked: boolean }
  | { type: 'reaction'; id: string; emoji: string; memberId: string; nickname: string; avatar: string; tag?: string; timestamp: number }
  | { type: 'vote_skip'; memberId: string; seq: number }
  | { type: 'skip_votes_update'; skipVotes: string[]; autoSkipEnabled: boolean; seq: number }
  | { type: 'set_auto_skip'; enabled: boolean }
  | { type: 'queue_update'; queue: PartyTrack[]; seq: number }
  | { type: 'skip_track'; nextTrack?: PartyTrack | null; seq: number };

export type PartyListener = (state: PartyState) => void;
