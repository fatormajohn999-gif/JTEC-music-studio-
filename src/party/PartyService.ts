import { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { SupabaseService } from '../services/supabase';
import { audioEngine } from '../services/audioEngine';
import { PersistentSettingsService } from '../services/persistentSettings';
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
  FloatingReaction,
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
  nickname: string;
  avatar?: string;
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

  private state: PartyState = {
    roomCode: null,
    role: 'guest',
    selfId: this.getOrCreateSelfId(),
    nickname: PersistentSettingsService.getPartyNicknameSync(),
    avatar: this.selfAvatar,
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
          nickname: clean,
          avatar: this.state.avatar,
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
    this.state.tag = profile.tag || '';
    this.state.avatar = profile.avatarUrl || this.getAvatarColor(clean);
    PersistentSettingsService.savePartyNickname(clean);
    this.emitState();

    if (this.channel && this.state.isConnected) {
      this.channel
        .track({
          id: this.state.selfId,
          nickname: clean,
          avatar: this.state.avatar,
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

    this.sendBroadcast({
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

    this.sendBroadcast({
      type: 'vote_skip',
      memberId: this.state.selfId,
      seq: ++this.broadcastSeq,
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

    this.sendBroadcast({
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
      this.sendBroadcast({
        type: 'queue_update',
        queue: this.state.queue,
        seq: ++this.broadcastSeq,
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

    this.sendBroadcast({
      type: 'queue_update',
      queue: this.state.queue,
      seq: ++this.broadcastSeq,
    });
  }

  public hostRemoveFromQueue(index: number): void {
    if (this.state.role !== 'host') return;
    triggerHapticFeedback();
    this.state.queue = this.state.queue.filter((_, i) => i !== index);
    this.emitState();

    this.sendBroadcast({
      type: 'queue_update',
      queue: this.state.queue,
      seq: ++this.broadcastSeq,
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

    this.sendBroadcast({
      type: 'queue_update',
      queue: this.state.queue,
      seq: ++this.broadcastSeq,
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
    this.sendBroadcast({
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

    this.sendBroadcast({
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

    this.client = SupabaseService.getClientForCategory('jtec_main');
    if (!this.client) {
      throw new Error('Could not connect to JTEC Network. Check your internet connection.');
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

    const channelName = `party:${code}`;
    const channel = this.client.channel(channelName, {
      config: {
        presence: { key: this.state.selfId },
        broadcast: { self: false },
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
            nickname: this.state.nickname,
            avatar: this.state.avatar,
            tag: this.state.tag,
            isHost: role === 'host',
            status: this.state.playbackStatus,
            joinedAt: Date.now(),
          });

          this.handlePresenceSync();

          if (role === 'guest') {
            // Send hello to host to receive current state immediately
            this.sendBroadcast({
              type: 'hello',
              memberId: this.state.selfId,
              nickname: this.state.nickname,
              avatar: this.state.avatar,
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
      nickname: this.state.nickname,
      avatar: this.state.avatar,
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
          nickname: p.nickname || 'Guest',
          avatar: p.avatar || this.getAvatarColor(p.nickname || 'Guest'),
          tag: p.tag || '#2048',
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

    switch (msg.type) {
      case 'load': {
        this.lastHostSeenMs = Date.now();
        this.state.currentTrack = msg.track;
        this.state.playbackStatus = 'loading';
        // Reset votes on new track
        this.state.skipVotes = [];
        this.emitState();

        if (this.state.role === 'guest') {
          this.bufferTrackAsGuest(msg.track);
        }
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
          this.sendBroadcast({
            type: 'skip_votes_update',
            skipVotes: this.state.skipVotes,
            autoSkipEnabled: this.state.autoSkipEnabled,
            seq: ++this.broadcastSeq,
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
          this.sendBroadcast({
            type: 'pong',
            forId: msg.fromId,
            t0: msg.t0,
            t_host: Date.now(),
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
            this.sendBroadcast({
              type: 'kick_member',
              targetId: msg.memberId,
              reason: 'This party room is closed to new members.',
            });
            return;
          }

          this.broadcastCurrentHostState();
          this.sendBroadcast({
            type: 'room_lock',
            isLocked: this.state.isLocked,
          });
          this.sendBroadcast({
            type: 'skip_votes_update',
            skipVotes: this.state.skipVotes,
            autoSkipEnabled: this.state.autoSkipEnabled,
            seq: ++this.broadcastSeq,
          });
          this.sendBroadcast({
            type: 'queue_update',
            queue: this.state.queue,
            seq: ++this.broadcastSeq,
          });

          if (this.state.currentTrack) {
            this.sendBroadcast({
              type: 'load',
              track: this.state.currentTrack,
              hostTimestamp: Date.now(),
              seq: ++this.broadcastSeq,
            });
          }
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

    this.sendBroadcast({
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

    this.state.currentTrack = track;
    this.state.playbackStatus = 'loading';
    this.state.skipVotes = []; // Reset votes on track change
    this.emitState();

    this.sendBroadcast({
      type: 'load',
      track,
      hostTimestamp: Date.now(),
      seq: ++this.broadcastSeq,
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

    const targetStartTime = Date.now() + 3000;
    this.sendBroadcast({
      type: 'start_countdown',
      targetStartTime,
      hostTimestamp: Date.now(),
      seq: ++this.broadcastSeq,
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

      this.sendBroadcast({
        type: 'member_status',
        memberId: this.state.selfId,
        status: 'ready',
        seq: ++this.broadcastSeq,
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
    if (this.playerHandlers.seek) {
      this.playerHandlers.seek(positionSeconds);
    }
    this.broadcastCurrentHostState();
  }

  private broadcastCurrentHostState(): void {
    if (this.state.role !== 'host') return;
    const posSec = this.playerHandlers.getCurrentPositionSeconds
      ? this.playerHandlers.getCurrentPositionSeconds()
      : audioEngine.currentTime;

    this.sendBroadcast({
      type: 'state',
      track: this.state.currentTrack,
      status: this.state.playbackStatus,
      positionMs: Math.round(posSec * 1000),
      hostTimestamp: Date.now(),
      seq: ++this.broadcastSeq,
    });
  }

  private handleHostStateUpdate(msg: {
    track: PartyTrack | null;
    status: PartyPlaybackStatus;
    positionMs: number;
    hostTimestamp: number;
    seq: number;
  }): void {
    if (msg.track && (!this.state.currentTrack || this.state.currentTrack.id !== msg.track.id)) {
      this.state.currentTrack = msg.track;
      this.state.skipVotes = []; // Reset votes
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
      this.state.playbackStatus = 'playing';

      if (this.playerHandlers.play && !audioEngine.isPlaying) {
        this.playerHandlers.play().catch(() => {});
      }

      const guestNow = Date.now();
      const elapsedSinceHostBroadcast = guestNow + this.medianOffsetMs - msg.hostTimestamp;
      const expectedPositionMs = Math.max(0, msg.positionMs + elapsedSinceHostBroadcast);

      const realPositionMs = Math.round(
        (this.playerHandlers.getCurrentPositionSeconds?.() || audioEngine.currentTime) * 1000
      );
      const diffMs = realPositionMs - expectedPositionMs;
      this.currentDriftMs = diffMs;

      const absDiff = Math.abs(diffMs);

      if (absDiff < 40) {
        audioEngine.setPartyDriftSpeed(1.0);
      } else if (absDiff <= 300) {
        if (diffMs > 0) {
          audioEngine.setPartyDriftSpeed(0.98);
        } else {
          audioEngine.setPartyDriftSpeed(1.02);
        }
      } else {
        if (this.playerHandlers.seek) {
          this.playerHandlers.seek(expectedPositionMs / 1000);
        }
        audioEngine.setPartyDriftSpeed(1.0);
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
          this.sendBroadcast({
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
      this.sendBroadcast({
        type: 'hello',
        memberId: this.state.selfId,
        nickname: this.state.nickname,
        avatar: this.state.avatar,
        tag: this.state.tag,
      });
      this.sendBroadcast({
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
          this.sendBroadcast({
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
      nickname: this.state.nickname,
      avatar: this.state.avatar,
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
    };

    this.emitState();
  }

  public clearErrorMessage(): void {
    this.state.errorMessage = null;
    this.emitState();
  }
}

export const PartyService = new PartyServiceClass();
