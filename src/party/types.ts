// Types for JTEC Party - synchronized listening rooms via PartyBackend

export type PartyRole = 'host' | 'guest';

export type PartyMemberStatus = 'idle' | 'loading' | 'ready' | 'countdown' | 'playing' | 'paused';

export interface PartyMember {
  id: string;
  partyId?: string;
  accountId?: string;
  username?: string;
  nickname: string;
  avatar?: string; // hex color or initial avatar gradient
  avatarUrl?: string | null;
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

export interface SyncLogEntry {
  id: string;
  timestamp: number;
  type: 'msg_received' | 'seek_performed' | 'drift_corrected' | 'duplicate_dropped' | 'info';
  summary: string;
  details?: Record<string, any>;
}

export interface PartyState {
  roomCode: string | null;
  role: PartyRole;
  selfId: string;
  partyId?: string;
  nickname: string;
  avatar: string;
  avatarUrl?: string | null;
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
  // Sync engine log (last 30 events)
  syncLogs: SyncLogEntry[];
}

export type PartyBroadcastPayload =
  | { type: 'load'; track: PartyTrack; commandId: string; hostTimestamp: number; senderId: string; seq: number; targetMemberId?: string }
  | { type: 'member_status'; memberId: string; status: PartyMemberStatus; senderId: string; seq: number; targetMemberId?: string }
  | { type: 'start_countdown'; commandId: string; targetStartTime: number; hostTimestamp: number; senderId: string; seq: number; targetMemberId?: string }
  | { type: 'state'; track: PartyTrack | null; status: PartyPlaybackStatus; positionMs: number; hostTimestamp: number; commandId?: string; isSeek?: boolean; seekCommandId?: string; senderId: string; seq: number; targetMemberId?: string }
  | { type: 'ping'; fromId: string; t0: number; senderId: string; seq: number; targetMemberId?: string }
  | { type: 'pong'; forId: string; t0: number; t_host: number; senderId: string; seq: number; targetMemberId?: string }
  | { type: 'guest_diag'; memberId: string; nickname: string; avatar?: string; tag?: string; latencyMs: number; clockOffsetMs: number; driftMs: number; senderId: string; seq: number; targetMemberId?: string }
  | { type: 'hello'; memberId: string; partyId?: string; accountId?: string; nickname: string; username?: string; avatar?: string; avatarUrl?: string | null; tag?: string; senderId: string; seq: number; targetMemberId?: string }
  | { type: 'close_room'; reason: string; senderId: string; seq: number; targetMemberId?: string }
  | { type: 'kick_member'; targetId: string; reason?: string; senderId: string; seq: number; targetMemberId?: string }
  | { type: 'room_lock'; isLocked: boolean; senderId: string; seq: number; targetMemberId?: string }
  | { type: 'reaction'; id: string; emoji: string; memberId: string; nickname: string; avatar: string; tag?: string; timestamp: number; senderId: string; seq: number; targetMemberId?: string }
  | { type: 'vote_skip'; memberId: string; senderId: string; seq: number; targetMemberId?: string }
  | { type: 'skip_votes_update'; skipVotes: string[]; autoSkipEnabled: boolean; senderId: string; seq: number; targetMemberId?: string }
  | { type: 'set_auto_skip'; enabled: boolean; senderId: string; seq: number; targetMemberId?: string }
  | { type: 'queue_update'; queue: PartyTrack[]; senderId: string; seq: number; targetMemberId?: string }
  | { type: 'skip_track'; nextTrack?: PartyTrack | null; senderId: string; seq: number; targetMemberId?: string };

export type PartyListener = (state: PartyState) => void;

type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;
export type PartyBroadcastInput = DistributiveOmit<PartyBroadcastPayload, 'senderId' | 'seq'> & {
  senderId?: string;
  seq?: number;
  targetMemberId?: string;
};

