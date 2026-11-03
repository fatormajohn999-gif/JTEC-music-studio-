import { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { SupabaseService } from '../services/supabase';
import { audioEngine } from '../services/audioEngine';
import { PersistentSettingsService } from '../services/persistentSettings';
import { getPartySupabaseClient } from './backend/supabaseClient';
import {
  PartyRole,
  PartyMember,
  PartyMemberStatus,
  PartyTrack,
  PartyPlaybackStatus,
  PartyState,
  PartyListener,
  HostDiagnostic,
  PartyBroadcastPayload,
  PartyBroadcastInput,
  FloatingReaction,
  SyncLogEntry,
} from './types';
import { MockPartyBackend, DEMO_BOT_TRACKS } from './MockPartyBackend';

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_MEMBERS = 8;
const CLOCK_SAMPLES_MAX = 7;
const PING_INTERVAL_MS = 10000;
const STATE_BROADCAST_INTERVAL_MS = 2000;
const READY_TIMEOUT_MS = 10000;
const HOST_HEARTBEAT_TIMEOUT_MS = 60000;
const REACTION_COOLDOWN_MS = 500;

export function generateRoomCode(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, (byte) => ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length]).join('');
  return `JT${suffix}`;
}

export const triggerHapticFeedback = (): void => {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(15);
    }
  } catch {
    // Ignore devices that don't support vibration
  }
};

interface PresencePayload {
  id: string;
  partyId?: string;
  accountId?: string;
  username?: string;
  nickname: string;
  avatar?: string;
  avatarUrl?: string | null;
  tag?: string;
  isHost: boolean;
  status: PartyMemberStatus;
  joinedAt: number;
}

class PartyServiceClass {
  private client: SupabaseClient | null = null;
  private channel: RealtimeChannel | null = null;
  private isBotDemoRoom = false;

  private selfTag = this.getOrCreateTag();
  private selfAvatar = this.getAvatarColor(PersistentSettingsService.getPartyNicknameSync());
  private lastReactionTimeMs = 0;

  // Sync engine deduplication & command tracking
  private lastSeenSeqBySender: Map<string, number> = new Map();
  private lastProcessedLoadCommandId: string | null = null;
  private lastProcessedStartCommandId: string | null = null;
  private lastProcessedSeekCommandId: string | null = null;
  private currentCommandId: string = '';
  private lastGuestSeekPerfMs: number = 0;
  private lastReachedPositionMs: number = 0;

  private state: PartyState = {
    roomCode: null,
    role: 'guest',
    selfId: this.getOrCreateSelfId(),
    partyId: '',
    nickname: PersistentSettingsService.getPartyNicknameSync(),
    avatar: this.selfAvatar,
    avatarUrl: null,
    tag: this.selfTag,
    isLocked: false,
    members: [],
    currentTrack: null,
    playbackStatus: 'idle',
    countdownNumber: null,
    isConnected: false,
    isReconnecting: false,
    errorMessage: null,
    targetStartTime: null,
    diagnostics: [],
    // Vote-to-skip
    skipVotes: [],
    autoSkipEnabled: false,
    // Queue list
    queue: [],
    // Reactions
    activeReactions: [],
    isReactionsMuted: false,
    // Sync logs
    syncLogs: [],
  };

  private listeners: Set<PartyListener> = new Set();

  // Members tracking
  private realPresenceMembers: PartyMember[] = [];
  private botMembers: PartyMember[] = [];
  private botDiagnostics: HostDiagnostic[] = [];

  // Clock sync
  private clockOffsetSamples: number[] = [];
  private medianOffsetMs = 0;
  private currentLatencyMs = 0;
  private currentDriftMs = 0;

  // Timers
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private stateBroadcastTimer: ReturnType<typeof setInterval> | null = null;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private readyCheckTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;

  // Heartbeat & Sequence
  private lastHostSeenMs = Date.now();
  private hostHeartbeatChecker: ReturnType<typeof setInterval> | null = null;
  private broadcastSeq = 0;

  // Track playback handlers attached by usePartyPlayer
  private playerHandlers: {
    loadTrack?: (track: PartyTrack) => Promise<boolean>;
    play?: () => Promise<void>;
    pause?: () => void;
    seek?: (positionSeconds: number) => void;
    getCurrentPositionSeconds?: () => number;
  } = {};


  constructor() {
    // Listen for window visibility changes to trigger re-sync when returning to foreground
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && this.state.roomCode) {
          this.handleForegroundReturn();
        }
      });
    }

    // Register with MockPartyBackend
    MockPartyBackend.registerCallbacks(
      (msg) => {
        this.handleBroadcastMessage(msg);
      },
      (bots, diags) => {
        this.botMembers = bots;
        this.botDiagnostics = diags;
        this.updateMergedMembers();
      }
    );
  }

  private getOrCreateSelfId(): string {
    const key = 'jtec_party_self_id';
    try {
      let id = localStorage.getItem(key);
      if (!id) {
        const rand = new Uint8Array(8);
        crypto.getRandomValues(rand);
        id = Array.from(rand, (b) => b.toString(16).padStart(2, '0')).join('');
        localStorage.setItem(key, id);
      }
      return id;
    } catch {
      return 'user_' + Math.random().toString(36).substring(2, 10);
    }
  }

  private getOrCreateTag(): string {
    const key = 'jtec_party_self_tag';
    try {
      let tag = localStorage.getItem(key);
      if (!tag) {
        tag = '#' + Math.floor(1000 + Math.random() * 9000).toString();
        localStorage.setItem(key, tag);
      }
      return tag;
    } catch {
      return '#2048';
    }
  }

  private getAvatarColor(name: string): string {
    const colors = ['#06b6d4', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#3b82f6'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  public getState(): PartyState {
    return {
      ...this.state,
      members: [...this.state.members],
      diagnostics: [...this.state.diagnostics],
      skipVotes: [...this.state.skipVotes],
      queue: [...this.state.queue],
      activeReactions: [...this.state.activeReactions],
    };
  }

  public subscribe(listener: PartyListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emitState(): void {
    const copy = this.getState();
    this.updateMediaSessionMetadata();
    this.listeners.forEach((listener) => {
      try {
        listener(copy);
      } catch (err) {
        console.warn('[PartyService] Listener error:', err);
      }
    });
  }

  private updateMediaSessionMetadata(): void {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    if (this.state.roomCode) {
      const track = this.state.currentTrack;
      const title = track ? track.title : `In JTEC Party • Room ${this.state.roomCode}`;
      const artist = track ? `${track.artist} (In JTEC Party)` : `Room ${this.state.roomCode}`;
      const album = `JTEC Party • ${this.state.members.length} Listeners`;

      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title,
          artist,
          album,
          artwork: track?.cover ? [{ src: track.cover, sizes: '512x512', type: 'image/jpeg' }] : [],
        });
      } catch {
        // Ignore media session errors
      }
    }
  }

  public registerPlayerHandlers(handlers: {
    loadTrack?: (track: PartyTrack) => Promise<boolean>;
    play?: () => Promise<void>;
    pause?: () => void;
    seek?: (positionSeconds: number) => void;
    getCurrentPositionSeconds?: () => number;
  }): () => void {
    this.playerHandlers = { ...this.playerHandlers, ...handlers };
    return () => {
      this.playerHandlers = {};
    };
  }

  public addSyncLog(
    type: SyncLogEntry['type'],
    summary: string,
    details?: Record<string, any>
  ): void {
    const entry: SyncLogEntry = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      timestamp: Date.now(),
      type,
      summary,
      details,
    };
    this.state.syncLogs = [entry, ...this.state.syncLogs].slice(0, 30);
    // Emit state so UI sync log views update
    this.emitState();
  }

  private broadcastMessage(payload: PartyBroadcastInput): void {
    const fullPayload = {
      ...payload,
      senderId: payload.senderId || this.state.selfId,
      seq: payload.seq || ++this.broadcastSeq,
    } as PartyBroadcastPayload;
    this.sendBroadcast(fullPayload);
  }

  public setNickname(name: string): void {
    const clean = (name || '').trim().slice(0, 20) || 'Guest';
    this.state.nickname = clean;
    this.state.avatar = this.getAvatarColor(clean);
    PersistentSettingsService.savePartyNickname(clean);
    this.emitState();

    if (this.channel && this.state.isConnected) {
      this.channel
        .track({
          id: this.state.selfId,
          partyId: this.state.partyId || '',
          accountId: this.state.partyId || '',
          username: clean,
          nickname: clean,
          avatar: this.state.avatar,
          avatarUrl: this.state.avatarUrl || null,
          tag: this.state.tag,
          isHost: this.state.role === 'host',
          status: this.state.playbackStatus,
          joinedAt: Date.now(),
        })
        .catch((err) => console.warn('[PartyService] track update failed:', err));
    }
  }

  public setProfile(profile: { username: string; id?: string; avatarUrl?: string | null; tag?: string }): void {
    const clean = (profile.username || '').trim().slice(0, 20) || 'Guest';
    this.state.nickname = clean;
    this.state.partyId = profile.id || '';
    this.state.avatarUrl = profile.avatarUrl || null;
    this.state.tag = profile.tag || '';
    this.state.avatar = profile.avatarUrl || this.getAvatarColor(clean);
    PersistentSettingsService.savePartyNickname(clean);
    this.emitState();

    if (this.channel && this.state.isConnected) {
      this.channel
        .track({
          id: this.state.selfId,
          partyId: this.state.partyId || '',
          accountId: this.state.partyId || '',
          username: clean,
          nickname: clean,
          avatar: this.state.avatar,
          avatarUrl: this.state.avatarUrl || null,
          tag: this.state.tag,
          isHost: this.state.role === 'host',
          status: this.state.playbackStatus,
          joinedAt: Date.now(),
        })
        .catch((err) => console.warn('[PartyService] track update failed:', err));
    }
  }

  // =========================================================================
  // EMOJI REACTIONS (Requirement 1)
  // =========================================================================
  public sendReaction(emoji: string): boolean {
    const now = Date.now();
    if (now - this.lastReactionTimeMs < REACTION_COOLDOWN_MS) {
      return false; // Rate limit 500ms
    }
    this.lastReactionTimeMs = now;
    triggerHapticFeedback();

    const reactionId = 'rx_' + Math.random().toString(36).slice(2, 9);
    const reaction: FloatingReaction = {
      id: reactionId,
      emoji,
      senderId: this.state.selfId,
      senderName: this.state.nickname,
      senderAvatar: this.state.avatar,
      senderTag: this.state.tag,
      timestamp: now,
      xOffsetPercent: 12 + Math.random() * 76,
    };

    if (!this.state.isReactionsMuted) {
      this.addFloatingReaction(reaction);
    }

    this.broadcastMessage({
      type: 'reaction',
      id: reactionId,
      emoji,
      memberId: this.state.selfId,
      nickname: this.state.nickname,
      avatar: this.state.avatar,
      tag: this.state.tag,
      timestamp: now,
    });

    return true;
  }

  public toggleMuteReactions(): void {
    this.state.isReactionsMuted = !this.state.isReactionsMuted;
    if (this.state.isReactionsMuted) {
      this.state.activeReactions = [];
    }
    triggerHapticFeedback();
    this.emitState();
  }

  private addFloatingReaction(reaction: FloatingReaction): void {
    if (this.state.isReactionsMuted) return;

    this.state.activeReactions = [...this.state.activeReactions, reaction];
    this.emitState();

    // Auto-prune reaction after 2.5 seconds
    setTimeout(() => {
      this.state.activeReactions = this.state.activeReactions.filter((r) => r.id !== reaction.id);
      this.emitState();
    }, 2500);
  }

  // =========================================================================
  // VOTE TO SKIP (Requirement 2)
  // =========================================================================
  public voteToSkip(): void {
    if (this.state.skipVotes.includes(this.state.selfId)) return;
    triggerHapticFeedback();

    const updatedVotes = [...this.state.skipVotes, this.state.selfId];
    this.state.skipVotes = updatedVotes;
    this.emitState();

    this.broadcastMessage({
      type: 'vote_skip',
      memberId: this.state.selfId,
    });

    // If host voted or guest voted, host checks auto-skip
    if (this.state.role === 'host') {
      this.checkAutoSkipCondition();
    }
  }

  public hostSetAutoSkip(enabled: boolean): void {
    if (this.state.role !== 'host') return;
    triggerHapticFeedback();
    this.state.autoSkipEnabled = enabled;
    this.emitState();

    this.broadcastMessage({
      type: 'set_auto_skip',
      enabled,
    });

    if (enabled) {
      this.checkAutoSkipCondition();
    }
  }

  private checkAutoSkipCondition(): void {
    if (this.state.role !== 'host' || !this.state.autoSkipEnabled) return;
    const totalMembers = Math.max(1, this.state.members.length);
    const votesCount = this.state.skipVotes.length;

    // Trigger auto-skip when more than half have voted
    if (votesCount > Math.floor(totalMembers / 2)) {
      console.info('[PartyService] Auto-skip triggered: majority voted to skip');
      this.hostSkipTrack();
    }
  }

  public hostSkipTrack(): void {
    if (this.state.role !== 'host') return;
    triggerHapticFeedback();

    // Reset votes for new track
    this.state.skipVotes = [];

    // Next track from queue or demo track
    let nextTrack: PartyTrack | null = null;
    if (this.state.queue.length > 0) {
      nextTrack = this.state.queue.shift() || null;
      this.broadcastMessage({
        type: 'queue_update',
        queue: this.state.queue,
      });
    } else {
      // Pick next demo track if available
      nextTrack = DEMO_BOT_TRACKS[1];
    }

    if (nextTrack) {
      this.hostSelectTrack(nextTrack);
    }
  }

  // =========================================================================
  // QUEUE LIST FOR HOST (Requirement 3)
  // =========================================================================
  public hostAddToQueue(track: PartyTrack): void {
    if (this.state.role !== 'host') return;
    triggerHapticFeedback();
    this.state.queue = [...this.state.queue, track];
    this.emitState();

    this.broadcastMessage({
      type: 'queue_update',
      queue: this.state.queue,
    });
  }

  public hostRemoveFromQueue(index: number): void {
    if (this.state.role !== 'host') return;
    triggerHapticFeedback();
    this.state.queue = this.state.queue.filter((_, i) => i !== index);
    this.emitState();

    this.broadcastMessage({
      type: 'queue_update',
      queue: this.state.queue,
    });
  }

  public hostReorderQueue(fromIndex: number, toIndex: number): void {
    if (this.state.role !== 'host') return;
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= this.state.queue.length || toIndex >= this.state.queue.length) return;

    triggerHapticFeedback();
    const updated = [...this.state.queue];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    this.state.queue = updated;
    this.emitState();

    this.broadcastMessage({
      type: 'queue_update',
      queue: this.state.queue,
    });
  }

  /**
   * Toggle room lock (close / open to new members)
   */
  public toggleRoomLock(): void {
    if (this.state.role !== 'host') return;
    triggerHapticFeedback();
    const newLock = !this.state.isLocked;
    this.state.isLocked = newLock;
    this.broadcastMessage({
      type: 'room_lock',
      isLocked: newLock,
    });
    this.emitState();
  }

  /**
   * Host removes / kicks a member
   */
  public kickMember(memberId: string): void {
    if (this.state.role !== 'host') return;
    triggerHapticFeedback();

    if (memberId.startsWith('bot_')) {
      this.botMembers = this.botMembers.filter((b) => b.id !== memberId);
      this.botDiagnostics = this.botDiagnostics.filter((d) => d.memberId !== memberId);
      this.state.skipVotes = this.state.skipVotes.filter((id) => id !== memberId);
      this.updateMergedMembers();
      return;
    }

    this.broadcastMessage({
      type: 'kick_member',
      targetId: memberId,
      reason: 'You were removed from the room by the host.',
    });

    this.realPresenceMembers = this.realPresenceMembers.filter((m) => m.id !== memberId);
    this.state.diagnostics = this.state.diagnostics.filter((d) => d.memberId !== memberId);
    this.state.skipVotes = this.state.skipVotes.filter((id) => id !== memberId);
    this.updateMergedMembers();
  }

  /**
   * Create a new room as Host
   */
  public async createRoom(): Promise<string> {
    const code = generateRoomCode();
    await this.initRoom(code, 'host');
    return code;
  }

  /**
   * Join an existing room as Guest
   */
  public async joinRoom(roomCode: string): Promise<void> {
    const cleanCode = (roomCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (cleanCode.length !== 6) {
      throw new Error('Room code must be 6 letters or numbers.');
    }
    if (cleanCode === 'BOT999') {
      await this.startBotDemoRoom();
      return;
    }
    await this.initRoom(cleanCode, 'guest');
  }

  /**
   * Start Demo Room hosted by a simulated bot ("DJ Nova")
   */
  public async startBotDemoRoom(): Promise<void> {
    await this.leaveRoom(false);

    this.isBotDemoRoom = true;
    this.state.roomCode = 'BOT999';
    this.state.role = 'guest';
    this.state.errorMessage = null;
    this.state.isConnected = true;
    this.state.isReconnecting = false;
    this.state.playbackStatus = 'idle';
    this.state.currentTrack = null;
    this.state.countdownNumber = null;
    this.state.isLocked = false;
    this.state.skipVotes = [];
    this.state.queue = [];
    this.state.activeReactions = [];
    this.clockOffsetSamples = [];
    this.medianOffsetMs = 0;
    this.lastHostSeenMs = Date.now();
    this.broadcastSeq = 0;

    audioEngine.setPartyNeutralOverride(true);

    const { hostMember } = MockPartyBackend.startBotHostRoom(this.state.nickname, (msg) => {
      this.handleBroadcastMessage(msg);
    });

    this.realPresenceMembers = [
      hostMember,
      {
        id: this.state.selfId,
        nickname: this.state.nickname,
        avatar: this.state.avatar,
        tag: this.state.tag,
        isHost: false,
        status: 'idle',
        lastSeen: Date.now(),
      },
    ];
    this.updateMergedMembers();
    this.startPingTimer();
    this.startHostHeartbeatChecker();
  }

  private async initRoom(code: string, role: PartyRole): Promise<void> {
    await this.leaveRoom(false);

    // Prefer dedicated Party Supabase client, fallback to main if testing
    this.client = getPartySupabaseClient() || SupabaseService.getClientForCategory('jtec_main');
    if (!this.client) {
      throw new Error('JTEC Party is unavailable right now');
    }

    this.state.roomCode = code;
    this.state.role = role;
    this.state.errorMessage = null;
    this.state.isLocked = false;
    this.state.skipVotes = [];
    this.state.queue = [];
    this.state.activeReactions = [];
    this.realPresenceMembers = [];
    this.botMembers = [];
    this.botDiagnostics = [];
    this.state.members = [];
    this.state.diagnostics = [];
    this.state.isReconnecting = false;
    this.state.playbackStatus = 'idle';
    this.state.currentTrack = null;
    this.state.countdownNumber = null;
    this.clockOffsetSamples = [];
    this.medianOffsetMs = 0;
    this.lastHostSeenMs = Date.now();
    this.broadcastSeq = 0;

    // Apply neutral sound effects override during party
    audioEngine.setPartyNeutralOverride(true);
    this.emitState();

    await this.connectChannel(code, role);
  }

  private async connectChannel(code: string, role: PartyRole): Promise<void> {
    if (!this.client) return;

    const presenceKey = this.state.partyId || this.state.selfId;
    const channelName = `party:${code}`;
    const channel = this.client.channel(channelName, {
      config: {
        presence: { key: presenceKey },
        broadcast: { self: false, ack: false },
      },
    });

    this.channel = channel;

    // Presence listeners
    channel
      .on('presence', { event: 'sync' }, () => {
        this.handlePresenceSync();
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        this.handlePresenceJoin(newPresences as unknown as PresencePayload[]);
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        this.handlePresenceLeave(leftPresences as unknown as PresencePayload[]);
      });

    // Broadcast listeners
    channel.on('broadcast', { event: 'party_msg' }, ({ payload }) => {
      this.handleBroadcastMessage(payload as PartyBroadcastPayload);
    });

    try {
      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          this.state.isConnected = true;
          this.state.isReconnecting = false;
          this.state.errorMessage = null;
          this.reconnectAttempts = 0;

          // Track presence
          await channel.track({
            id: this.state.selfId,
            partyId: this.state.partyId || '',
            accountId: this.state.partyId || '',
            username: this.state.nickname,
            nickname: this.state.nickname,
            avatar: this.state.avatar,
            avatarUrl: this.state.avatarUrl || null,
            tag: this.state.tag,
            isHost: role === 'host',
            status: this.state.playbackStatus,
            joinedAt: Date.now(),
          });

          this.handlePresenceSync();

          if (role === 'guest') {
            // Send hello to host to receive current state immediately
            this.broadcastMessage({
              type: 'hello',
              memberId: this.state.selfId,
              partyId: this.state.partyId || '',
              accountId: this.state.partyId || '',
              username: this.state.nickname,
              nickname: this.state.nickname,
              avatar: this.state.avatar,
              avatarUrl: this.state.avatarUrl || null,
              tag: this.state.tag,
            });

            this.startPingTimer();
          } else {
            this.startHostStateBroadcastTimer();
          }

          this.startHostHeartbeatChecker();
          this.emitState();
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          console.warn(`[PartyService] Channel status: ${status}`);
          this.handleConnectionDrop();
        }
      });
    } catch (err) {
      console.warn('[PartyService] Subscription failed:', err);
      this.handleConnectionDrop();
    }
  }

  private handlePresenceSync(): void {
    if (!this.channel) return;
    const presenceState = this.channel.presenceState<PresencePayload>();
    const memberMap = new Map<string, PartyMember>();

    // Always include self in members list
    memberMap.set(this.state.selfId, {
      id: this.state.selfId,
      partyId: this.state.partyId || '',
      accountId: this.state.partyId || '',
      username: this.state.nickname,
      nickname: this.state.nickname,
      avatar: this.state.avatar,
      avatarUrl: this.state.avatarUrl || null,
      tag: this.state.tag,
      isHost: this.state.role === 'host',
      status: this.state.playbackStatus,
      lastSeen: Date.now(),
    });

    Object.keys(presenceState).forEach((key) => {
      const presences = presenceState[key];
      if (Array.isArray(presences) && presences.length > 0) {
        const p = presences[0];
        const existing = this.state.members.find((m) => m.id === p.id);
        memberMap.set(p.id, {
          id: p.id,
          partyId: p.partyId || existing?.partyId || '',
          accountId: p.accountId || p.partyId || existing?.accountId || '',
          username: p.username || p.nickname || 'Guest',
          nickname: p.nickname || 'Guest',
          avatar: p.avatar || this.getAvatarColor(p.nickname || 'Guest'),
          avatarUrl: p.avatarUrl || existing?.avatarUrl || null,
          tag: p.tag || '',
          isHost: Boolean(p.isHost),
          status: p.status || 'idle',
          latencyMs: existing?.latencyMs,
          clockOffsetMs: existing?.clockOffsetMs,
          driftMs: existing?.driftMs,
          lastSeen: Date.now(),
        });

        if (p.isHost) {
          this.lastHostSeenMs = Date.now();
        }
      }
    });

    this.realPresenceMembers = Array.from(memberMap.values());
    this.updateMergedMembers();

    // Load member avatars with the RPC get_profiles for the ids in the room (Requirement 5)
    if (this.client) {
      const idsToFetch = Array.from(
        new Set(
          this.realPresenceMembers
            .map((m) => m.accountId || m.id)
            .filter((id): id is string => Boolean(id) && !id.startsWith('bot_'))
        )
      );

      if (idsToFetch.length > 0) {
        Promise.resolve(this.client.rpc('get_profiles', { p_ids: idsToFetch }))
          .then((res: any) => {
            const data = res?.data;
            if (Array.isArray(data) && data.length > 0) {
              let updated = false;
              data.forEach((p: any) => {
                const match = this.realPresenceMembers.find(
                  (m) => m.accountId === p.id || m.id === p.id || m.partyId === p.party_id
                );
                if (match) {
                  if (p.avatar && match.avatarUrl !== p.avatar) {
                    match.avatarUrl = p.avatar;
                    updated = true;
                  }
                  if (p.username && match.username !== p.username) {
                    match.username = p.username;
                    match.nickname = p.username;
                    updated = true;
                  }
                }
              });
              if (updated) {
                this.updateMergedMembers();
              }
            }
          })
          .catch(() => {});
      }
    }
  }

  private updateMergedMembers(): void {
    const combinedMap = new Map<string, PartyMember>();

    this.realPresenceMembers.forEach((m) => combinedMap.set(m.id, m));
    this.botMembers.forEach((b) => combinedMap.set(b.id, b));

    const members = Array.from(combinedMap.values());

    // Check room capacity (max 8)
    if (this.state.role === 'guest' && members.length > MAX_MEMBERS) {
      this.state.errorMessage = 'Room is full (maximum 8 listeners)';
      this.emitState();
      this.leaveRoom(false);
      return;
    }

    this.state.members = members;

    // Check if host is present when role is guest
    if (this.state.role === 'guest') {
      const hasHost = members.some((m) => m.isHost);
      if (hasHost) {
        this.lastHostSeenMs = Date.now();
      }
    }

    // Merge diagnostics
    const combinedDiags = new Map<string, HostDiagnostic>();
    this.state.diagnostics.forEach((d) => combinedDiags.set(d.memberId, d));
    this.botDiagnostics.forEach((d) => combinedDiags.set(d.memberId, d));
    this.state.diagnostics = Array.from(combinedDiags.values());

    this.emitState();
  }

  private handlePresenceJoin(newPresences: PresencePayload[]): void {
    if (!Array.isArray(newPresences)) return;
    newPresences.forEach((p) => {
      if (p.isHost) {
        this.lastHostSeenMs = Date.now();
      }
    });
    this.handlePresenceSync();
  }

  private handlePresenceLeave(leftPresences: PresencePayload[]): void {
    if (!Array.isArray(leftPresences)) return;
    const hostLeft = leftPresences.some((p) => p.isHost && p.id !== this.state.selfId);
    if (hostLeft && this.state.role === 'guest') {
      this.endPartyByHost('The host ended the party.');
      return;
    }
    this.handlePresenceSync();
  }

  private sendBroadcast(payload: PartyBroadcastPayload): void {
    MockPartyBackend.handleHostBroadcast(payload);

    if (!this.channel || !this.state.isConnected) return;
    this.channel
      .send({
        type: 'broadcast',
        event: 'party_msg',
        payload,
      })
      .catch((err) => {
        console.warn('[PartyService] Failed to send broadcast:', err);
      });
  }

  private handleBroadcastMessage(msg: PartyBroadcastPayload): void {
    if (!msg || !msg.type) return;

    // Requirement 2: Ignore my own messages
    if (msg.senderId && msg.senderId === this.state.selfId) {
      return;
    }

    // Drop messages targeted specifically to another member
    if (msg.targetMemberId && msg.targetMemberId !== this.state.selfId) {
      return;
    }

    // Requirement 2: Drop any message whose sequence number is older than newest already applied for that sender
    if (msg.senderId && typeof msg.seq === 'number') {
      const lastSeq = this.lastSeenSeqBySender.get(msg.senderId) ?? -1;
      if (msg.seq <= lastSeq) {
        this.addSyncLog(
          'duplicate_dropped',
          `Dropped duplicate/out-of-order ${msg.type} from ${msg.senderId.slice(0, 8)} (seq ${msg.seq} <= ${lastSeq})`,
          { type: msg.type, senderId: msg.senderId, seq: msg.seq, lastSeq }
        );
        return;
      }
      this.lastSeenSeqBySender.set(msg.senderId, msg.seq);
    }

    // Record incoming message in sync log
    this.addSyncLog(
      'msg_received',
      `Received ${msg.type} from ${msg.senderId ? msg.senderId.slice(0, 8) : 'unknown'} (seq: ${msg.seq ?? 0})`,
      { type: msg.type, senderId: msg.senderId, seq: msg.seq }
    );

    // Requirement 1: The HOST never applies incoming "state", "load", "start" or drift corrections.
    // Only guests do. The host never seeks because of any received message.
    if (this.state.role === 'host') {
      if (msg.type === 'state' || msg.type === 'load' || msg.type === 'start_countdown') {
        return;
      }
    }

    switch (msg.type) {
      case 'load': {
        if (this.state.role !== 'guest') return;

        // Requirement 4: "load" has a unique commandId. Repeated commandId is ignored (idempotent).
        if (msg.commandId && msg.commandId === this.lastProcessedLoadCommandId) {
          this.addSyncLog('duplicate_dropped', `Ignored repeated load commandId: ${msg.commandId}`);
          return;
        }
        this.lastProcessedLoadCommandId = msg.commandId;
        this.lastHostSeenMs = Date.now();
        this.lastReachedPositionMs = 0;
        this.state.currentTrack = msg.track;
        this.state.playbackStatus = 'loading';
        this.state.skipVotes = [];
        this.emitState();

        this.bufferTrackAsGuest(msg.track);
        break;
      }

      case 'member_status': {
        const member = this.state.members.find((m) => m.id === msg.memberId);
        if (member) {
          member.status = msg.status;
          this.emitState();
        }

        if (this.state.role === 'host' && this.state.playbackStatus === 'loading') {
          this.checkAutoStartReadiness();
        }
        break;
      }

      case 'start_countdown': {
        if (this.state.role !== 'guest') return;

        // Requirement 4: "start" has a unique commandId. Repeated commandId is ignored (idempotent).
        if (msg.commandId && msg.commandId === this.lastProcessedStartCommandId) {
          this.addSyncLog('duplicate_dropped', `Ignored repeated start commandId: ${msg.commandId}`);
          return;
        }
        this.lastProcessedStartCommandId = msg.commandId;
        this.lastHostSeenMs = Date.now();
        this.executeCountdown(msg.targetStartTime);
        break;
      }

      case 'state': {
        this.lastHostSeenMs = Date.now();
        if (this.state.role === 'guest') {
          this.handleHostStateUpdate(msg);
        }
        break;
      }

      case 'reaction': {
        if (!this.state.isReactionsMuted && msg.memberId !== this.state.selfId) {
          this.addFloatingReaction({
            id: msg.id || 'rx_' + Math.random().toString(36).slice(2, 9),
            emoji: msg.emoji,
            senderId: msg.memberId,
            senderName: msg.nickname,
            senderAvatar: msg.avatar,
            senderTag: msg.tag,
            timestamp: msg.timestamp || Date.now(),
            xOffsetPercent: 12 + Math.random() * 76,
          });
        }
        break;
      }

      case 'vote_skip': {
        if (!this.state.skipVotes.includes(msg.memberId)) {
          this.state.skipVotes = [...this.state.skipVotes, msg.memberId];
          this.emitState();
        }

        if (this.state.role === 'host') {
          this.checkAutoSkipCondition();
          this.broadcastMessage({
            type: 'skip_votes_update',
            skipVotes: this.state.skipVotes,
            autoSkipEnabled: this.state.autoSkipEnabled,
          });
        }
        break;
      }

      case 'skip_votes_update': {
        this.state.skipVotes = msg.skipVotes;
        this.state.autoSkipEnabled = msg.autoSkipEnabled;
        this.emitState();
        break;
      }

      case 'set_auto_skip': {
        this.state.autoSkipEnabled = msg.enabled;
        this.emitState();
        break;
      }

      case 'queue_update': {
        this.state.queue = msg.queue;
        this.emitState();
        break;
      }

      case 'ping': {
        if (this.state.role === 'host') {
          this.broadcastMessage({
            type: 'pong',
            forId: msg.fromId,
            t0: msg.t0,
            t_host: Date.now(),
            targetMemberId: msg.fromId,
          });
        }
        break;
      }

      case 'pong': {
        if (this.state.role === 'guest' && msg.forId === this.state.selfId) {
          this.handlePong(msg.t0, msg.t_host);
        }
        break;
      }

      case 'guest_diag': {
        if (this.state.role === 'host') {
          this.updateHostDiagnostic(msg);
        }
        break;
      }

      case 'hello': {
        if (this.state.role === 'host') {
          if (this.state.isLocked) {
            this.broadcastMessage({
              type: 'kick_member',
              targetId: msg.memberId,
              reason: 'This party room is closed to new members.',
              targetMemberId: msg.memberId,
            });
            return;
          }

          // Requirement 3: A new member joining, a "hello", a presence change or a reconnect
          // must never restart, seek or reload playback for other members.
          // The host answers a "hello" with a "state" message addressed only to that member.
          const posSec = this.playerHandlers.getCurrentPositionSeconds
            ? this.playerHandlers.getCurrentPositionSeconds()
            : audioEngine.currentTime;

          this.broadcastMessage({
            type: 'state',
            track: this.state.currentTrack,
            status: this.state.playbackStatus,
            positionMs: Math.round(posSec * 1000),
            hostTimestamp: Date.now(),
            commandId: this.currentCommandId,
            targetMemberId: msg.memberId,
          });

          this.broadcastMessage({
            type: 'room_lock',
            isLocked: this.state.isLocked,
            targetMemberId: msg.memberId,
          });

          this.broadcastMessage({
            type: 'skip_votes_update',
            skipVotes: this.state.skipVotes,
            autoSkipEnabled: this.state.autoSkipEnabled,
            targetMemberId: msg.memberId,
          });

          this.broadcastMessage({
            type: 'queue_update',
            queue: this.state.queue,
            targetMemberId: msg.memberId,
          });
        }
        break;
      }

      case 'kick_member': {
        if (msg.targetId === this.state.selfId) {
          this.endPartyByHost(msg.reason || 'You were removed from the room by the host.');
        } else {
          this.realPresenceMembers = this.realPresenceMembers.filter((m) => m.id !== msg.targetId);
          this.state.diagnostics = this.state.diagnostics.filter((d) => d.memberId !== msg.targetId);
          this.state.skipVotes = this.state.skipVotes.filter((id) => id !== msg.targetId);
          this.updateMergedMembers();
        }
        break;
      }

      case 'room_lock': {
        this.state.isLocked = msg.isLocked;
        this.emitState();
        break;
      }

      case 'close_room': {
        if (this.state.role === 'guest') {
          this.endPartyByHost(msg.reason || 'The host ended the party.');
        }
        break;
      }
    }
  }

  private handlePong(t0: number, t_host: number): void {
    const t3 = Date.now();
    const rtt = Math.max(1, t3 - t0);
    this.currentLatencyMs = Math.round(rtt / 2);

    const offset = t_host - (t0 + t3) / 2;
    this.clockOffsetSamples.push(offset);
    if (this.clockOffsetSamples.length > CLOCK_SAMPLES_MAX) {
      this.clockOffsetSamples.shift();
    }

    const sorted = [...this.clockOffsetSamples].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    this.medianOffsetMs = Math.round(
      sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
    );

    this.broadcastMessage({
      type: 'guest_diag',
      memberId: this.state.selfId,
      nickname: this.state.nickname,
      avatar: this.state.avatar,
      tag: this.state.tag,
      latencyMs: this.currentLatencyMs,
      clockOffsetMs: this.medianOffsetMs,
      driftMs: this.currentDriftMs,
    });
  }

  private updateHostDiagnostic(diag: {
    memberId: string;
    nickname: string;
    avatar?: string;
    tag?: string;
    latencyMs: number;
    clockOffsetMs: number;
    driftMs: number;
  }): void {
    const existingIdx = this.state.diagnostics.findIndex((d) => d.memberId === diag.memberId);
    const item: HostDiagnostic = {
      memberId: diag.memberId,
      nickname: diag.nickname,
      avatar: diag.avatar,
      tag: diag.tag,
      latencyMs: diag.latencyMs,
      clockOffsetMs: diag.clockOffsetMs,
      driftMs: diag.driftMs,
      lastUpdated: Date.now(),
    };

    if (existingIdx >= 0) {
      this.state.diagnostics[existingIdx] = item;
    } else {
      this.state.diagnostics.push(item);
    }

    const member = this.state.members.find((m) => m.id === diag.memberId);
    if (member) {
      member.latencyMs = diag.latencyMs;
      member.clockOffsetMs = diag.clockOffsetMs;
      member.driftMs = diag.driftMs;
      if (diag.avatar) member.avatar = diag.avatar;
      if (diag.tag) member.tag = diag.tag;
    }

    this.emitState();
  }

  public async hostSelectTrack(track: PartyTrack): Promise<void> {
    if (this.state.role !== 'host') return;

    if (!track.audioUrl) {
      throw new Error('This track does not have a streamable audio address.');
    }

    // Requirement 4: unique commandId on load
    this.currentCommandId = 'cmd_load_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    this.state.currentTrack = track;
    this.state.playbackStatus = 'loading';
    this.state.skipVotes = []; // Reset votes on track change
    this.emitState();

    this.broadcastMessage({
      type: 'load',
      track,
      commandId: this.currentCommandId,
      hostTimestamp: Date.now(),
    });

    if (this.playerHandlers.loadTrack) {
      await this.playerHandlers.loadTrack(track);
    }

    const hostMember = this.state.members.find((m) => m.id === this.state.selfId);
    if (hostMember) hostMember.status = 'ready';
    this.emitState();

    if (this.readyCheckTimer) clearTimeout(this.readyCheckTimer);
    this.readyCheckTimer = setTimeout(() => {
      if (this.state.role === 'host' && this.state.playbackStatus === 'loading') {
        console.info('[PartyService] Ready timeout reached (10s), starting party playback...');
        this.hostStartParty();
      }
    }, READY_TIMEOUT_MS);
  }

  private checkAutoStartReadiness(): void {
    const otherMembers = this.state.members.filter((m) => m.id !== this.state.selfId);
    if (otherMembers.length === 0) return;

    const allReady = otherMembers.every((m) => m.status === 'ready');
    if (allReady) {
      if (this.readyCheckTimer) clearTimeout(this.readyCheckTimer);
      this.hostStartParty();
    }
  }

  public hostStartParty(): void {
    if (this.state.role !== 'host') return;
    if (this.readyCheckTimer) clearTimeout(this.readyCheckTimer);

    // Requirement 4: unique commandId on start
    const startCmdId = 'cmd_start_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    const targetStartTime = Date.now() + 3000;
    this.broadcastMessage({
      type: 'start_countdown',
      commandId: startCmdId,
      targetStartTime,
      hostTimestamp: Date.now(),
    });

    this.executeCountdown(targetStartTime);
  }

  private executeCountdown(targetStartTime: number): void {
    if (this.countdownTimer) clearInterval(this.countdownTimer);

    this.state.playbackStatus = 'countdown';
    this.state.targetStartTime = targetStartTime;

    const tick = () => {
      const adjustedTarget =
        this.state.role === 'guest' ? targetStartTime - this.medianOffsetMs : targetStartTime;

      const remainingMs = adjustedTarget - Date.now();

      if (remainingMs <= 0) {
        if (this.countdownTimer) clearInterval(this.countdownTimer);
        this.countdownTimer = null;
        this.state.countdownNumber = null;
        this.state.playbackStatus = 'playing';
        this.emitState();

        if (this.playerHandlers.play) {
          this.playerHandlers.play().catch((err) => console.warn('[PartyService] play error:', err));
        }

        if (this.state.role === 'host') {
          this.broadcastCurrentHostState();
        }
        return;
      }

      const sec = Math.ceil(remainingMs / 1000);
      this.state.countdownNumber = Math.min(3, Math.max(1, sec));
      this.emitState();
    };

    tick();
    this.countdownTimer = setInterval(tick, 100);
  }

  private async bufferTrackAsGuest(track: PartyTrack): Promise<void> {
    try {
      if (this.playerHandlers.loadTrack) {
        await this.playerHandlers.loadTrack(track);
      }
      this.state.playbackStatus = 'ready';
      this.emitState();

      this.broadcastMessage({
        type: 'member_status',
        memberId: this.state.selfId,
        status: 'ready',
      });
    } catch (err) {
      console.warn('[PartyService] Guest buffering failed:', err);
      this.state.playbackStatus = 'idle';
      this.emitState();
    }
  }

  public hostPlay(): void {
    if (this.state.role !== 'host') return;
    triggerHapticFeedback();
    this.state.playbackStatus = 'playing';
    this.emitState();

    if (this.playerHandlers.play) {
      this.playerHandlers.play().catch((err) => console.warn('hostPlay error:', err));
    }
    this.broadcastCurrentHostState();
  }

  public hostPause(): void {
    if (this.state.role !== 'host') return;
    triggerHapticFeedback();
    this.state.playbackStatus = 'paused';
    this.emitState();

    if (this.playerHandlers.pause) {
      this.playerHandlers.pause();
    }
    this.broadcastCurrentHostState();
  }

  public hostSeek(positionSeconds: number): void {
    if (this.state.role !== 'host') return;
    triggerHapticFeedback();
    const seekCmdId = 'cmd_seek_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    if (this.playerHandlers.seek) {
      this.playerHandlers.seek(positionSeconds);
    }
    this.addSyncLog('seek_performed', `Host seeked to ${positionSeconds.toFixed(1)}s`, {
      reason: 'host_seek_action',
      from: audioEngine.currentTime,
      to: positionSeconds,
    });

    // Broadcast seek state immediately
    this.broadcastMessage({
      type: 'state',
      track: this.state.currentTrack,
      status: this.state.playbackStatus,
      positionMs: Math.round(positionSeconds * 1000),
      hostTimestamp: Date.now(),
      isSeek: true,
      seekCommandId: seekCmdId,
      commandId: this.currentCommandId,
    });
  }

  private broadcastCurrentHostState(): void {
    if (this.state.role !== 'host') return;
    const posSec = this.playerHandlers.getCurrentPositionSeconds
      ? this.playerHandlers.getCurrentPositionSeconds()
      : audioEngine.currentTime;

    this.broadcastMessage({
      type: 'state',
      track: this.state.currentTrack,
      status: this.state.playbackStatus,
      positionMs: Math.round(posSec * 1000),
      hostTimestamp: Date.now(),
      commandId: this.currentCommandId,
    });
  }

  private handleHostStateUpdate(msg: {
    track: PartyTrack | null;
    status: PartyPlaybackStatus;
    positionMs: number;
    hostTimestamp: number;
    commandId?: string;
    isSeek?: boolean;
    seekCommandId?: string;
  }): void {
    if (this.state.role !== 'guest') return;

    // Track change via state (for newly joined guest or reconnect)
    if (msg.track && (!this.state.currentTrack || this.state.currentTrack.id !== msg.track.id)) {
      this.state.currentTrack = msg.track;
      this.state.skipVotes = [];
      this.lastReachedPositionMs = 0;
      this.bufferTrackAsGuest(msg.track);
    }

    if (msg.status === 'paused') {
      this.state.playbackStatus = 'paused';
      if (this.playerHandlers.pause) this.playerHandlers.pause();
      if (this.playerHandlers.seek) this.playerHandlers.seek(msg.positionMs / 1000);
      audioEngine.setPartyDriftSpeed(1.0);
      this.emitState();
      return;
    }

    if (msg.status === 'playing') {
      if (this.state.playbackStatus === 'ready' || (!audioEngine.isPlaying && this.playerHandlers.play)) {
        this.state.playbackStatus = 'playing';
        if (this.playerHandlers.play) {
          this.playerHandlers.play().catch(() => {});
        }
      }

      // Requirement 5: Guest drift correction ONLY after the track has really started
      const isReallyStarted =
        this.state.playbackStatus === 'playing' &&
        audioEngine.isPlaying &&
        this.state.currentTrack !== null;

      if (!isReallyStarted) {
        return;
      }

      // Requirement 5: Compare with target computed from host's reported position and clock offset,
      // using performance.now() for elapsed monotonic time and never Date.now() mixed with it.
      const transitEstMs = Math.max(0, this.currentLatencyMs);
      const targetPositionMs = Math.max(0, msg.positionMs + transitEstMs);

      const realPosSec = this.playerHandlers.getCurrentPositionSeconds?.() || audioEngine.currentTime;
      const realPositionMs = Math.round(realPosSec * 1000);

      // Keep track of the highest position reached by playback
      this.lastReachedPositionMs = Math.max(this.lastReachedPositionMs, realPositionMs);

      const diffMs = realPositionMs - targetPositionMs;
      this.currentDriftMs = diffMs;
      const absDiff = Math.abs(diffMs);

      const nowPerf = performance.now();

      if (absDiff > 300) {
        // Seek only when drift is more than 300 ms and at least 3 seconds have passed since the last seek
        const timeSinceLastSeek = nowPerf - this.lastGuestSeekPerfMs;
        if (timeSinceLastSeek >= 3000) {
          const isExplicitHostSeek = Boolean(
            msg.isSeek && msg.seekCommandId && msg.seekCommandId !== this.lastProcessedSeekCommandId
          );

          if (isExplicitHostSeek) {
            this.lastProcessedSeekCommandId = msg.seekCommandId || null;
            if (this.playerHandlers.seek) {
              this.playerHandlers.seek(targetPositionMs / 1000);
            }
            this.lastGuestSeekPerfMs = nowPerf;
            this.lastReachedPositionMs = targetPositionMs;
            this.addSyncLog(
              'seek_performed',
              `Host seek synced: ${realPosSec.toFixed(1)}s -> ${(targetPositionMs / 1000).toFixed(1)}s`,
              { reason: 'host_seek_flag', from: realPosSec, to: targetPositionMs / 1000 }
            );
            audioEngine.setPartyDriftSpeed(1.0);
          } else {
            // Never seek to a position older than the last one reached unless the host actually seeked
            if (targetPositionMs < this.lastReachedPositionMs) {
              audioEngine.setPartyDriftSpeed(0.98);
              this.addSyncLog(
                'drift_corrected',
                `Protected playback: avoided jumping backward (${targetPositionMs}ms < ${this.lastReachedPositionMs}ms); rate set to 0.98x`,
                { diffMs, speed: 0.98 }
              );
            } else {
              if (this.playerHandlers.seek) {
                this.playerHandlers.seek(targetPositionMs / 1000);
              }
              this.lastGuestSeekPerfMs = nowPerf;
              this.lastReachedPositionMs = targetPositionMs;
              this.addSyncLog(
                'seek_performed',
                `Drift correction seek: ${realPosSec.toFixed(1)}s -> ${(targetPositionMs / 1000).toFixed(1)}s (drift ${diffMs}ms)`,
                { reason: 'drift > 300ms', from: realPosSec, to: targetPositionMs / 1000 }
              );
              audioEngine.setPartyDriftSpeed(1.0);
            }
          }
        }
      } else {
        // Below 300ms: adjust playbackRate by at most 2%
        if (absDiff < 40) {
          audioEngine.setPartyDriftSpeed(1.0);
        } else {
          const speed = diffMs > 0 ? 0.98 : 1.02; // +diff = ahead -> slow down; -diff = behind -> speed up
          audioEngine.setPartyDriftSpeed(speed);
          this.addSyncLog(
            'drift_corrected',
            `Drift ${diffMs > 0 ? '+' : ''}${diffMs}ms -> playbackRate ${speed}x`,
            { diffMs, speed }
          );
        }
      }

      this.emitState();
    }
  }

  private startPingTimer(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    const doPing = () => {
      if (this.state.role === 'guest' && this.state.isConnected) {
        if (this.isBotDemoRoom) {
          MockPartyBackend.handleGuestPingToBotHost(Date.now(), this.state.selfId, (pong) => {
            this.handleBroadcastMessage(pong);
          });
        } else {
          this.broadcastMessage({
            type: 'ping',
            fromId: this.state.selfId,
            t0: Date.now(),
          });
        }
      }
    };
    doPing();
    this.pingTimer = setInterval(doPing, PING_INTERVAL_MS);
  }

  private startHostStateBroadcastTimer(): void {
    if (this.stateBroadcastTimer) clearInterval(this.stateBroadcastTimer);
    this.stateBroadcastTimer = setInterval(() => {
      if (
        this.state.role === 'host' &&
        this.state.isConnected &&
        this.state.playbackStatus === 'playing'
      ) {
        this.broadcastCurrentHostState();
      }
    }, STATE_BROADCAST_INTERVAL_MS);
  }

  private startHostHeartbeatChecker(): void {
    if (this.hostHeartbeatChecker) clearInterval(this.hostHeartbeatChecker);
    this.hostHeartbeatChecker = setInterval(() => {
      if (this.state.role === 'guest' && this.state.isConnected) {
        const elapsed = Date.now() - this.lastHostSeenMs;
        if (elapsed > HOST_HEARTBEAT_TIMEOUT_MS) {
          console.warn('[PartyService] Host heartbeat timed out (>60s)');
          this.endPartyByHost('The host ended the party.');
        }
      }
    }, 5000);
  }

  private handleConnectionDrop(): void {
    if (!this.state.roomCode) return;
    this.state.isConnected = false;
    this.state.isReconnecting = true;
    this.state.errorMessage = 'Connection lost, reconnecting...';
    this.emitState();

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const delay = Math.min(10000, 1000 * Math.pow(2, this.reconnectAttempts++));

    this.reconnectTimer = setTimeout(async () => {
      if (!this.state.roomCode) return;
      try {
        if (this.channel) {
          await this.channel.unsubscribe();
        }
        await this.connectChannel(this.state.roomCode, this.state.role);
      } catch (err) {
        console.warn('[PartyService] Reconnect attempt failed:', err);
        this.handleConnectionDrop();
      }
    }, delay);
  }

  private handleForegroundReturn(): void {
    this.lastHostSeenMs = Date.now();
    if (this.state.role === 'guest' && this.state.isConnected) {
      this.broadcastMessage({
        type: 'hello',
        memberId: this.state.selfId,
        partyId: this.state.partyId,
        accountId: this.state.partyId,
        nickname: this.state.nickname,
        avatar: this.state.avatar,
        avatarUrl: this.state.avatarUrl,
        tag: this.state.tag,
      });
      this.broadcastMessage({
        type: 'ping',
        fromId: this.state.selfId,
        t0: Date.now(),
      });
    } else if (this.state.role === 'host' && this.state.isConnected) {
      this.broadcastCurrentHostState();
    }
  }

  private endPartyByHost(reason: string): void {
    this.state.errorMessage = reason;
    this.leaveRoom(false);
  }

  /**
   * Leave room & restore user's persistent sound effects (Requirement 4)
   */
  public async leaveRoom(notifyHost = true): Promise<void> {
    triggerHapticFeedback();

    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.stateBroadcastTimer) clearInterval(this.stateBroadcastTimer);
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    if (this.readyCheckTimer) clearTimeout(this.readyCheckTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.hostHeartbeatChecker) clearInterval(this.hostHeartbeatChecker);

    if (this.isBotDemoRoom) {
      MockPartyBackend.stopBotHostRoom();
      this.isBotDemoRoom = false;
    }

    if (this.channel) {
      if (this.state.role === 'host' && notifyHost && this.state.isConnected) {
        try {
          this.broadcastMessage({
            type: 'close_room',
            reason: 'The host ended the party.',
          });
        } catch {}
      }

      try {
        await this.channel.untrack();
        await this.channel.unsubscribe();
      } catch (e) {
        console.warn('[PartyService] Channel cleanup error:', e);
      }
      this.channel = null;
    }

    // Restore user's persisted audio effects (Slow + Reverb, EQ, speed)
    audioEngine.setPartyNeutralOverride(false);

    // Reset media session
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = null;
      } catch {}
    }

    this.realPresenceMembers = [];
    this.botMembers = [];
    this.botDiagnostics = [];

    this.state = {
      roomCode: null,
      role: 'guest',
      selfId: this.state.selfId,
      partyId: this.state.partyId,
      nickname: this.state.nickname,
      avatar: this.state.avatar,
      avatarUrl: this.state.avatarUrl,
      tag: this.state.tag,
      isLocked: false,
      members: [],
      currentTrack: null,
      playbackStatus: 'idle',
      countdownNumber: null,
      isConnected: false,
      isReconnecting: false,
      errorMessage: this.state.errorMessage,
      targetStartTime: null,
      diagnostics: [],
      skipVotes: [],
      autoSkipEnabled: false,
      queue: [],
      activeReactions: [],
      isReactionsMuted: this.state.isReactionsMuted,
      syncLogs: this.state.syncLogs || [],
    };

    this.emitState();
  }

  public getRoomChannelStatus(): string {
    if (!this.channel) return 'IDLE';
    return this.state.isConnected ? 'SUBSCRIBED' : 'CONNECTING';
  }

  public clearErrorMessage(): void {
    this.state.errorMessage = null;
    this.emitState();
  }
}

export const PartyService = new PartyServiceClass();
