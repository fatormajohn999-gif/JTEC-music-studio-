// MockPartyBackend & LoopbackTransport for JTEC Party
// Provides network simulation, bot guests, bot reactions, vote-to-skip,
// and a bot-hosted demo room with multiple tracks.

import {
  PartyMember,
  PartyTrack,
  HostDiagnostic,
  NetworkSimulationConfig,
  PartyBroadcastPayload,
  OnlineFriend,
  PARTY_REACTION_EMOJIS,
} from './types';

export interface SimulatedBotGuest {
  id: string;
  partyId: string;
  accountId: string;
  username: string;
  nickname: string;
  avatar: string;
  avatarUrl: string | null;
  tag: string;
  clockOffsetMs: number;
  baseLatencyMs: number;
  driftMs: number;
  status: 'idle' | 'loading' | 'ready' | 'playing' | 'paused';
}

const DEFAULT_BOT_GUESTS: SimulatedBotGuest[] = [
  {
    id: 'bot_aisha_4092',
    partyId: 'K7M2Q9XA',
    accountId: 'K7M2Q9XA',
    username: 'Aisha',
    nickname: 'Aisha',
    avatar: '#ec4899',
    avatarUrl: null,
    tag: '#4092',
    clockOffsetMs: 350,
    baseLatencyMs: 85,
    driftMs: 14,
    status: 'idle',
  },
  {
    id: 'bot_marcus_8811',
    partyId: 'P4X9J2LQ',
    accountId: 'P4X9J2LQ',
    username: 'Marcus',
    nickname: 'Marcus',
    avatar: '#8b5cf6',
    avatarUrl: null,
    tag: '#8811',
    clockOffsetMs: -120,
    baseLatencyMs: 140,
    driftMs: -22,
    status: 'idle',
  },
  {
    id: 'bot_devon_1304',
    partyId: 'R8T3N6VY',
    accountId: 'R8T3N6VY',
    username: 'Devon',
    nickname: 'Devon',
    avatar: '#3b82f6',
    avatarUrl: null,
    tag: '#1304',
    clockOffsetMs: 45,
    baseLatencyMs: 55,
    driftMs: 8,
    status: 'idle',
  },
];


export const DEMO_ONLINE_FRIENDS: OnlineFriend[] = [
  { id: 'friend_1', name: 'Tariq', avatar: '#10b981', tag: '#1024', isOnline: true },
  { id: 'friend_2', name: 'Fatima', avatar: '#ec4899', tag: '#8842', isOnline: true },
  { id: 'friend_3', name: 'Bilal', avatar: '#f59e0b', tag: '#5512', isOnline: true },
  { id: 'friend_4', name: 'Zainab', avatar: '#8b5cf6', tag: '#3190', isOnline: true },
  { id: 'friend_5', name: 'Sam', avatar: '#06b6d4', tag: '#7712', isOnline: false },
];

export const DEMO_BOT_TRACKS: PartyTrack[] = [
  {
    source: 'nasheed',
    id: 'nasheed_bismillah_demo',
    title: 'Bismillah (In the Name of God)',
    artist: 'JTEC Spiritual Collection',
    cover: 'https://images.unsplash.com/photo-1507838153414-b4b713384a76?w=300&q=80',
    audioUrl: 'https://archive.org/download/IslamicNasheedCollection/bismillah.mp3',
    duration: 198,
  },
  {
    source: 'nasheed',
    id: 'nasheed_subhanallah_demo',
    title: 'SubhanAllah (Glory Be to God)',
    artist: 'JTEC Spiritual Collection',
    cover: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=300&q=80',
    audioUrl: 'https://archive.org/download/IslamicNasheedCollection/subhanallah.mp3',
    duration: 224,
  },
  {
    source: 'jamendo',
    id: 'jamendo_peaceful_demo',
    title: 'Peaceful Ambient Harmony',
    artist: 'Nova Acoustic',
    cover: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&q=80',
    audioUrl: 'https://prod-1.storage.jamendo.com/?trackid=1889218&format=mp31&from=app-dev-demo',
    duration: 185,
  },
];

export class LoopbackTransport {
  private config: NetworkSimulationConfig = {
    latencyMs: 65,
    jitterMs: 15,
    packetLossRate: 0,
  };
  private isDisconnected = false;

  public setConfig(config: Partial<NetworkSimulationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  public getConfig(): NetworkSimulationConfig {
    return { ...this.config };
  }

  public setDisconnected(disconnected: boolean): void {
    this.isDisconnected = disconnected;
  }

  public isNetworkDown(): boolean {
    return this.isDisconnected;
  }

  public deliver(action: () => void): void {
    if (this.isDisconnected) {
      return;
    }

    if (this.config.packetLossRate > 0 && Math.random() < this.config.packetLossRate) {
      return;
    }

    const jitter = (Math.random() * 2 - 1) * this.config.jitterMs;
    const delay = Math.max(5, this.config.latencyMs + jitter);

    setTimeout(() => {
      if (!this.isDisconnected) {
        action();
      }
    }, delay);
  }
}

export class MockPartyBackendClass {
  public transport = new LoopbackTransport();
  private bots: SimulatedBotGuest[] = JSON.parse(JSON.stringify(DEFAULT_BOT_GUESTS));
  private botsActiveInRoom = false;
  private botsDisconnectedTemporarily = false;

  // Bot Demo Room state
  private botDemoRoomActive = false;
  private botDemoTrackIndex = 0;
  private botDemoTrackPositionSec = 0;
  private botDemoTimer: ReturnType<typeof setInterval> | null = null;
  private botStateSeq = 100;
  private onHostMessageCallback: ((msg: PartyBroadcastPayload) => void) | null = null;

  // Callbacks to PartyService
  private onMessageCallback: ((msg: PartyBroadcastPayload) => void) | null = null;
  private onBotsUpdatedCallback: ((bots: PartyMember[], diags: HostDiagnostic[]) => void) | null = null;

  public registerCallbacks(
    onMessage: (msg: PartyBroadcastPayload) => void,
    onBotsUpdated: (bots: PartyMember[], diags: HostDiagnostic[]) => void
  ): void {
    this.onMessageCallback = onMessage;
    this.onBotsUpdatedCallback = onBotsUpdated;
  }

  public areBotsActive(): boolean {
    return this.botsActiveInRoom && this.bots.length > 0;
  }

  public isBotDemoRoomActive(): boolean {
    return this.botDemoRoomActive;
  }

  /**
   * Add bots to the user's hosted room
   */
  public addBotsToCurrentRoom(): void {
    this.botsActiveInRoom = true;
    this.bots = JSON.parse(JSON.stringify(DEFAULT_BOT_GUESTS));
    this.publishBotState();
  }

  public removeBotsFromRoom(): void {
    this.botsActiveInRoom = false;
    this.publishBotState();
  }

  /**
   * A bot sends a reaction (Requirement 6)
   */
  public botSendReaction(): { botName: string; emoji: string } | null {
    if (!this.botsActiveInRoom || this.bots.length === 0) {
      // If not in host room, check if demo room is active
      if (this.botDemoRoomActive) {
        const emoji = PARTY_REACTION_EMOJIS[Math.floor(Math.random() * PARTY_REACTION_EMOJIS.length)];
        this.onMessageCallback?.({
          type: 'reaction',
          id: 'rx_' + Math.random().toString(36).slice(2, 9),
          emoji,
          memberId: 'bot_host_dj_nova',
          nickname: 'DJ Nova',
          avatar: '#06b6d4',
          tag: '#0001',
          timestamp: Date.now(),
          senderId: 'bot_host_dj_nova',
          seq: ++this.botStateSeq,
        });
        return { botName: 'DJ Nova', emoji };
      }
      return null;
    }

    const bot = this.bots[Math.floor(Math.random() * this.bots.length)];
    const emoji = PARTY_REACTION_EMOJIS[Math.floor(Math.random() * PARTY_REACTION_EMOJIS.length)];

    this.transport.deliver(() => {
      this.onMessageCallback?.({
        type: 'reaction',
        id: 'rx_' + Math.random().toString(36).slice(2, 9),
        emoji,
        memberId: bot.id,
        nickname: bot.nickname,
        avatar: bot.avatar,
        tag: bot.tag,
        timestamp: Date.now(),
        senderId: bot.id,
        seq: ++this.botStateSeq,
      });
    });

    return { botName: bot.nickname, emoji };
  }

  /**
   * A bot votes to skip (Requirement 6)
   */
  public botVoteToSkip(): { botName: string } | null {
    if (!this.botsActiveInRoom || this.bots.length === 0) return null;

    const bot = this.bots[Math.floor(Math.random() * this.bots.length)];
    this.transport.deliver(() => {
      this.onMessageCallback?.({
        type: 'vote_skip',
        memberId: bot.id,
        senderId: bot.id,
        seq: ++this.botStateSeq,
      });
    });

    return { botName: bot.nickname };
  }

  /**
   * A bot leaves the room (Requirement 6)
   */
  public botLeaveRoom(): { botName: string } | null {
    if (!this.botsActiveInRoom || this.bots.length === 0) return null;

    const removed = this.bots.pop();
    if (!removed) return null;

    this.publishBotState();
    return { botName: removed.nickname };
  }

  /**
   * Disconnect all bots for 15 seconds
   */
  public disconnectAllBotsFor15Seconds(): void {
    if (!this.botsActiveInRoom) return;

    this.botsDisconnectedTemporarily = true;
    this.publishBotState();

    setTimeout(() => {
      this.botsDisconnectedTemporarily = false;
      this.publishBotState();

      if (this.onMessageCallback) {
        this.bots.forEach((bot) => {
          this.onMessageCallback?.({
            type: 'hello',
            memberId: bot.id,
            partyId: bot.partyId,
            accountId: bot.accountId,
            nickname: bot.nickname,
            username: bot.username,
            avatar: bot.avatar,
            avatarUrl: bot.avatarUrl,
            tag: bot.tag,
            senderId: bot.id,
            seq: ++this.botStateSeq,
          });
        });
      }
    }, 15000);
  }

  /**
   * Host bot skips a song (Requirement 6)
   */
  public botHostSkipSong(): PartyTrack | null {
    if (!this.botDemoRoomActive || !this.onHostMessageCallback) return null;

    this.botDemoTrackIndex = (this.botDemoTrackIndex + 1) % DEMO_BOT_TRACKS.length;
    const nextTrack = DEMO_BOT_TRACKS[this.botDemoTrackIndex];
    this.botDemoTrackPositionSec = 0;

    this.onHostMessageCallback({
      type: 'load',
      track: nextTrack,
      commandId: 'cmd_bot_load_' + Date.now(),
      hostTimestamp: Date.now(),
      senderId: 'bot_host_dj_nova',
      seq: ++this.botStateSeq,
    });

    setTimeout(() => {
      if (!this.botDemoRoomActive || !this.onHostMessageCallback) return;
      const targetStartTime = Date.now() + 3000;
      this.onHostMessageCallback({
        type: 'start_countdown',
        commandId: 'cmd_bot_start_' + Date.now(),
        targetStartTime,
        hostTimestamp: Date.now(),
        senderId: 'bot_host_dj_nova',
        seq: ++this.botStateSeq,
      });
    }, 1500);

    return nextTrack;
  }

  /**
   * Respond to host actions
   */
  public handleHostBroadcast(msg: PartyBroadcastPayload): void {
    if (!this.botsActiveInRoom || this.botsDisconnectedTemporarily) return;

    switch (msg.type) {
      case 'load': {
        this.bots.forEach((bot) => {
          bot.status = 'loading';
        });
        this.publishBotState();

        this.bots.forEach((bot, index) => {
          this.transport.deliver(() => {
            if (!this.botsActiveInRoom || this.botsDisconnectedTemporarily) return;
            bot.status = 'ready';
            this.publishBotState();

            this.onMessageCallback?.({
              type: 'member_status',
              memberId: bot.id,
              status: 'ready',
              senderId: bot.id,
              seq: ++this.botStateSeq,
            });
          });
        });
        break;
      }


      case 'start_countdown': {
        this.bots.forEach((bot) => {
          bot.status = 'playing';
        });
        this.publishBotState();
        break;
      }

      case 'state': {
        if (msg.status === 'playing') {
          this.bots.forEach((bot) => {
            bot.status = 'playing';
          });
        } else if (msg.status === 'paused') {
          this.bots.forEach((bot) => {
            bot.status = 'paused';
          });
        }
        this.publishBotState();
        break;
      }
    }
  }

  private publishBotState(): void {
    if (!this.onBotsUpdatedCallback) return;

    if (!this.botsActiveInRoom || this.botsDisconnectedTemporarily) {
      this.onBotsUpdatedCallback([], []);
      return;
    }

    const members: PartyMember[] = this.bots.map((bot) => ({
      id: bot.id,
      partyId: bot.partyId,
      accountId: bot.accountId,
      username: bot.username,
      nickname: bot.nickname,
      avatar: bot.avatar,
      avatarUrl: bot.avatarUrl,
      tag: bot.tag,
      isHost: false,
      status: bot.status,
      latencyMs: Math.round(bot.baseLatencyMs + this.transport.getConfig().latencyMs),
      clockOffsetMs: bot.clockOffsetMs,
      driftMs: Math.round(bot.driftMs + (Math.random() * 6 - 3)),
      lastSeen: Date.now(),
    }));

    const diags: HostDiagnostic[] = members.map((m) => ({
      memberId: m.id,
      nickname: m.nickname,
      avatar: m.avatar,
      tag: m.tag,
      latencyMs: m.latencyMs ?? 50,
      clockOffsetMs: m.clockOffsetMs ?? 0,
      driftMs: m.driftMs ?? 0,
      lastUpdated: Date.now(),
    }));

    this.onBotsUpdatedCallback(members, diags);
  }

  /**
   * Start Demo Room hosted by a bot ("DJ Nova")
   */
  public startBotHostRoom(
    userNickname: string,
    onHostMessage: (msg: PartyBroadcastPayload) => void
  ): { code: string; hostMember: PartyMember } {
    this.botDemoRoomActive = true;
    this.botDemoTrackIndex = 0;
    this.botDemoTrackPositionSec = 0;
    this.botStateSeq = 500;
    this.onHostMessageCallback = onHostMessage;

    const code = 'BOT999';
    const hostMember: PartyMember = {
      id: 'bot_host_dj_nova',
      partyId: 'NOVA9999',
      accountId: 'NOVA9999',
      username: 'DJ Nova',
      nickname: 'DJ Nova',
      avatar: '#06b6d4',
      avatarUrl: null,
      tag: '#0001',
      isHost: true,
      status: 'idle',
      lastSeen: Date.now(),
    };

    const firstTrack = DEMO_BOT_TRACKS[0];

    setTimeout(() => {
      if (!this.botDemoRoomActive) return;
      hostMember.status = 'loading';

      onHostMessage({
        type: 'load',
        track: firstTrack,
        commandId: 'cmd_bot_first_load',
        hostTimestamp: Date.now(),
        senderId: 'bot_host_dj_nova',
        seq: ++this.botStateSeq,
      });

      setTimeout(() => {
        if (!this.botDemoRoomActive) return;
        hostMember.status = 'ready';

        const targetStartTime = Date.now() + 3000;
        onHostMessage({
          type: 'start_countdown',
          commandId: 'cmd_bot_first_start',
          targetStartTime,
          hostTimestamp: Date.now(),
          senderId: 'bot_host_dj_nova',
          seq: ++this.botStateSeq,
        });

        setTimeout(() => {
          if (!this.botDemoRoomActive) return;
          hostMember.status = 'playing';

          if (this.botDemoTimer) clearInterval(this.botDemoTimer);
          this.botDemoTimer = setInterval(() => {
            if (!this.botDemoRoomActive) return;
            this.botDemoTrackPositionSec += 2;
            const curTrack = DEMO_BOT_TRACKS[this.botDemoTrackIndex];
            if (this.botDemoTrackPositionSec > (curTrack.duration || 180)) {
              // Advance to next demo track
              this.botHostSkipSong();
              return;
            }

            onHostMessage({
              type: 'state',
              track: curTrack,
              status: 'playing',
              positionMs: Math.round(this.botDemoTrackPositionSec * 1000),
              hostTimestamp: Date.now(),
              senderId: 'bot_host_dj_nova',
              seq: ++this.botStateSeq,
            });
          }, 2000);
        }, 3000);
      }, 3000);
    }, 1500);

    return { code, hostMember };
  }

  public handleGuestPingToBotHost(
    t0: number,
    fromId: string,
    onReply: (pong: PartyBroadcastPayload) => void
  ): void {
    if (!this.botDemoRoomActive) return;
    this.transport.deliver(() => {
      onReply({
        type: 'pong',
        forId: fromId,
        t0,
        t_host: Date.now(),
        senderId: 'bot_host_dj_nova',
        seq: ++this.botStateSeq,
      });
    });
  }

  public stopBotHostRoom(): void {
    this.botDemoRoomActive = false;
    this.onHostMessageCallback = null;
    if (this.botDemoTimer) {
      clearInterval(this.botDemoTimer);
      this.botDemoTimer = null;
    }
  }
}

export const MockPartyBackend = new MockPartyBackendClass();
