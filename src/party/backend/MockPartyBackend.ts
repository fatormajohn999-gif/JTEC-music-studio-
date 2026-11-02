// MockPartyBackend implementation for JTEC Party
// Persistent on-device storage with jtec_party_ prefix, simulated friends ("bots"),
// automated request acceptance, presence tracking, and invite dispatching.

import {
  PartyBackend,
  PartyProfile,
  FriendRequest,
  BlockRecord,
  PartyInvite,
  PresenceInfo,
  RealtimeSubscription,
  PARTY_ID_ALPHABET,
} from './types';

export function generatePartyId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => PARTY_ID_ALPHABET[b % PARTY_ID_ALPHABET.length]).join('');
}

export function generateRoomCode(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return 'JT' + Array.from(bytes, (b) => PARTY_ID_ALPHABET[b % PARTY_ID_ALPHABET.length]).join('');
}

export function generateRandomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function isValidPartyId(id: string): boolean {
  if (typeof id !== 'string' || id.length !== 8) return false;
  for (let i = 0; i < id.length; i++) {
    if (!PARTY_ID_ALPHABET.includes(id[i])) return false;
  }
  return true;
}

export function getAvatarColor(name: string): string {
  const colors = ['#06b6d4', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#3b82f6'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

// 6 default simulated companions with valid 8-character Party IDs
export const DEFAULT_BOT_FRIENDS: (PartyProfile & { baseOnline: boolean; lastSeenOffsetMs: number })[] = [
  {
    id: 'K7M2Q9XA',
    username: 'Sana',
    avatarUrl: null,
    createdAt: Date.now() - 86400000 * 3,
    baseOnline: true,
    lastSeenOffsetMs: 0,
  },
  {
    id: 'T4R8Q2NM',
    username: 'Tariq',
    avatarUrl: null,
    createdAt: Date.now() - 86400000 * 5,
    baseOnline: true,
    lastSeenOffsetMs: 0,
  },
  {
    id: 'F9T3M58K',
    username: 'Fatima',
    avatarUrl: null,
    createdAt: Date.now() - 86400000 * 8,
    baseOnline: false,
    lastSeenOffsetMs: 2 * 3600 * 1000,
  },
  {
    id: 'B8L2K67X',
    username: 'Bilal',
    avatarUrl: null,
    createdAt: Date.now() - 86400000 * 2,
    baseOnline: true,
    lastSeenOffsetMs: 0,
  },
  {
    id: 'Z3N8P4WQ',
    username: 'Zainab',
    avatarUrl: null,
    createdAt: Date.now() - 86400000 * 10,
    baseOnline: false,
    lastSeenOffsetMs: 5 * 3600 * 1000,
  },
  {
    id: 'S7M9H24C',
    username: 'Sam',
    avatarUrl: null,
    createdAt: Date.now() - 86400000 * 4,
    baseOnline: true,
    lastSeenOffsetMs: 0,
  },
];

class MockPartyBackendClass implements PartyBackend {
  private profile: PartyProfile | null = null;
  private friends: PartyProfile[] = [];
  private friendRequests: FriendRequest[] = [];
  private blockedUsers: PartyProfile[] = [];
  private pendingInvites: PartyInvite[] = [];

  private presenceState: Record<string, PresenceInfo> = {};
  private presenceListeners: Set<(presence: Record<string, PresenceInfo>) => void> = new Set();
  private inviteListeners: Set<(invites: PartyInvite[]) => void> = new Set();

  private isInitialized = false;

  constructor() {
    this.initFromStorage();
  }

  public isMock(): boolean {
    return true;
  }

  private initFromStorage(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;

    try {
      // 1. Load Profile & Migrate to 8-character ID format
      const rawProfile = localStorage.getItem('jtec_party_profile');
      if (rawProfile) {
        this.profile = JSON.parse(rawProfile);
        if (this.profile) {
          let needsSave = false;
          if (!isValidPartyId(this.profile.id)) {
            this.profile.id = generatePartyId();
            needsSave = true;
          }
          if ('tag' in this.profile) {
            delete (this.profile as any).tag;
            needsSave = true;
          }
          if (needsSave) {
            this.saveProfile();
          }
        }
      }

      // 2. Load Friends & Migrate
      const rawFriends = localStorage.getItem('jtec_party_friends');
      if (rawFriends) {
        const loaded: any[] = JSON.parse(rawFriends);
        let friendsChanged = false;
        this.friends = loaded.map((f, i) => {
          let cleanId = f.id;
          if (!isValidPartyId(cleanId)) {
            cleanId = DEFAULT_BOT_FRIENDS[i % DEFAULT_BOT_FRIENDS.length]?.id || generatePartyId();
            friendsChanged = true;
          }
          if ('tag' in f) {
            delete f.tag;
            friendsChanged = true;
          }
          return {
            id: cleanId,
            username: f.username || 'Friend',
            avatarUrl: f.avatarUrl || null,
            createdAt: f.createdAt || Date.now(),
          };
        });
        if (friendsChanged) {
          this.saveFriends();
        }
      } else {
        // Seed initial 3 friends
        this.friends = [
          DEFAULT_BOT_FRIENDS[0],
          DEFAULT_BOT_FRIENDS[1],
          DEFAULT_BOT_FRIENDS[2],
        ];
        this.saveFriends();
      }

      // 3. Load Requests & Migrate
      const rawRequests = localStorage.getItem('jtec_party_requests');
      if (rawRequests) {
        const loadedRequests: any[] = JSON.parse(rawRequests);
        this.friendRequests = loadedRequests.map((r) => {
          if ('tag' in r.from) delete r.from.tag;
          if (!isValidPartyId(r.from.id)) {
            r.from.id = generatePartyId();
          }
          return r;
        });
      }

      // 4. Load Blocked & Migrate
      const rawBlocked = localStorage.getItem('jtec_party_blocked');
      if (rawBlocked) {
        const loadedBlocked: any[] = JSON.parse(rawBlocked);
        this.blockedUsers = loadedBlocked.map((b) => {
          if ('tag' in b) delete b.tag;
          if (!isValidPartyId(b.id)) b.id = generatePartyId();
          return b;
        });
      }

      // 5. Load Invites
      const rawInvites = localStorage.getItem('jtec_party_invites');
      if (rawInvites) {
        this.pendingInvites = JSON.parse(rawInvites);
      }

      // 6. Setup Initial Presence
      this.initPresence();
    } catch (err) {
      console.warn('[MockPartyBackend] Storage init error:', err);
    }
  }

  private initPresence(): void {
    DEFAULT_BOT_FRIENDS.forEach((bot) => {
      this.presenceState[bot.id] = {
        isOnline: bot.baseOnline,
        lastSeen: bot.baseOnline ? Date.now() : Date.now() - bot.lastSeenOffsetMs,
      };
    });
  }

  private saveProfile(): void {
    if (this.profile) {
      localStorage.setItem('jtec_party_profile', JSON.stringify(this.profile));
    } else {
      localStorage.removeItem('jtec_party_profile');
      localStorage.removeItem('jtec_party_token');
    }
  }

  private saveFriends(): void {
    localStorage.setItem('jtec_party_friends', JSON.stringify(this.friends));
  }

  private saveRequests(): void {
    localStorage.setItem('jtec_party_requests', JSON.stringify(this.friendRequests));
  }

  private saveBlocked(): void {
    localStorage.setItem('jtec_party_blocked', JSON.stringify(this.blockedUsers));
  }

  private saveInvites(): void {
    localStorage.setItem('jtec_party_invites', JSON.stringify(this.pendingInvites));
    this.notifyInviteListeners();
  }

  private notifyPresenceListeners(): void {
    const copy = { ...this.presenceState };
    this.presenceListeners.forEach((l) => {
      try {
        l(copy);
      } catch (e) {
        console.warn(e);
      }
    });
  }

  private notifyInviteListeners(): void {
    const copy = [...this.pendingInvites];
    this.inviteListeners.forEach((l) => {
      try {
        l(copy);
      } catch (e) {
        console.warn(e);
      }
    });
  }

  // =========================================================================
  // ACCOUNTS & PROFILE
  // =========================================================================

  public async createProfile(username: string): Promise<PartyProfile> {
    const cleanName = (username || '').trim();
    if (cleanName.length < 2 || cleanName.length > 20) {
      throw new Error('Username must be between 2 and 20 characters.');
    }
    if (!/^[a-zA-Z0-9 ._-]+$/.test(cleanName)) {
      throw new Error('Username can only contain letters, numbers, spaces, and . _ -');
    }

    const id = generatePartyId();
    const token = generateRandomToken();

    const profile: PartyProfile = {
      id,
      username: cleanName,
      avatarUrl: null,
      createdAt: Date.now(),
      token,
    };

    localStorage.setItem('jtec_party_token', token);
    this.profile = profile;
    this.saveProfile();
    return profile;
  }

  public async loadProfile(): Promise<PartyProfile | null> {
    this.initFromStorage();
    return this.profile;
  }

  public async updateProfile(updates: { username?: string; avatarUrl?: string | null }): Promise<PartyProfile> {
    if (!this.profile) {
      throw new Error('No party profile exists. Please create one first.');
    }

    if (updates.username !== undefined) {
      const cleanName = updates.username.trim();
      if (cleanName.length < 2 || cleanName.length > 20) {
        throw new Error('Username must be between 2 and 20 characters.');
      }
      this.profile.username = cleanName;
    }

    if (updates.avatarUrl !== undefined) {
      this.profile.avatarUrl = updates.avatarUrl;
    }

    this.saveProfile();
    return this.profile;
  }

  public async deleteProfile(): Promise<void> {
    this.profile = null;
    this.friends = [];
    this.friendRequests = [];
    this.blockedUsers = [];
    this.pendingInvites = [];

    const keysToRemove = [
      'jtec_party_profile',
      'jtec_party_token',
      'jtec_party_friends',
      'jtec_party_requests',
      'jtec_party_blocked',
      'jtec_party_invites',
      'jtec_party_self_tag',
      'jtec_party_nickname',
    ];
    keysToRemove.forEach((k) => localStorage.removeItem(k));

    this.notifyInviteListeners();
    this.notifyPresenceListeners();
  }

  // =========================================================================
  // FRIENDS & SOCIAL GRAPH
  // =========================================================================

  public async sendFriendRequest(targetPartyId: string): Promise<any> {
    const cleanId = (targetPartyId || '').replace(/[\s-]/g, '').toUpperCase();
    if (!isValidPartyId(cleanId)) {
      throw new Error('Please enter a valid 8-character Party ID.');
    }

    // Check if adding own ID
    if (this.profile && this.profile.id.toUpperCase() === cleanId) {
      throw new Error("You can't add your own Party ID.");
    }

    // Check if blocked
    const isBlocked = this.blockedUsers.some((b) => b.id.toUpperCase() === cleanId);
    if (isBlocked) {
      throw new Error('You have blocked this user. Unblock them first.');
    }

    // Check if already friends
    const alreadyFriend = this.friends.some((f) => f.id.toUpperCase() === cleanId);
    if (alreadyFriend) {
      throw new Error('This user is already in your friends list.');
    }

    // Find in default friends or generate profile
    let targetFriend = DEFAULT_BOT_FRIENDS.find((b) => b.id.toUpperCase() === cleanId);

    if (!targetFriend) {
      targetFriend = {
        id: cleanId,
        username: 'Listener ' + cleanId.slice(0, 4),
        avatarUrl: null,
        createdAt: Date.now(),
        baseOnline: true,
        lastSeenOffsetMs: 0,
      };
    }

    // Auto-accept in background after 3 seconds
    setTimeout(() => {
      if (!this.friends.some((f) => f.id === targetFriend!.id)) {
        this.friends.push(targetFriend!);
        this.saveFriends();

        this.presenceState[targetFriend!.id] = {
          isOnline: true,
          lastSeen: Date.now(),
        };
        this.notifyPresenceListeners();
      }
    }, 3000);

    return {
      id: 'req_' + Math.random().toString(36).slice(2, 10),
      from: this.profile || { id: 'me', username: 'Me', avatarUrl: null, createdAt: Date.now() },
      toId: targetFriend.id,
      status: 'pending',
    };
  }

  public async acceptFriendRequest(requestId: string): Promise<void> {
    const idx = this.friendRequests.findIndex((r) => r.id === requestId);
    if (idx === -1) throw new Error('Friend request not found or expired.');

    const req = this.friendRequests[idx];
    this.friendRequests.splice(idx, 1);
    this.saveRequests();

    if (!this.friends.some((f) => f.id === req.from.id)) {
      this.friends.push(req.from);
      this.saveFriends();

      this.presenceState[req.from.id] = {
        isOnline: true,
        lastSeen: Date.now(),
      };
      this.notifyPresenceListeners();
    }
  }

  public async declineFriendRequest(requestId: string): Promise<void> {
    this.friendRequests = this.friendRequests.filter((r) => r.id !== requestId);
    this.saveRequests();
  }

  public async removeFriend(friendId: string): Promise<void> {
    this.friends = this.friends.filter((f) => f.id !== friendId);
    this.saveFriends();
  }

  public async blockUser(targetId: string): Promise<void> {
    const friend = this.friends.find((f) => f.id === targetId);
    const candidate =
      friend ||
      this.friendRequests.find((r) => r.from.id === targetId)?.from ||
      DEFAULT_BOT_FRIENDS.find((b) => b.id === targetId) || {
        id: targetId,
        username: 'User ' + targetId.slice(0, 4),
        avatarUrl: null,
        createdAt: Date.now(),
      };

    this.friends = this.friends.filter((f) => f.id !== targetId);
    this.friendRequests = this.friendRequests.filter((r) => r.from.id !== targetId);
    this.pendingInvites = this.pendingInvites.filter((i) => i.from.id !== targetId);

    if (!this.blockedUsers.some((b) => b.id === targetId)) {
      this.blockedUsers.push(candidate);
    }

    this.saveFriends();
    this.saveRequests();
    this.saveBlocked();
    this.saveInvites();
  }

  public async unblockUser(targetId: string): Promise<void> {
    this.blockedUsers = this.blockedUsers.filter((b) => b.id !== targetId);
    this.saveBlocked();
  }

  public async listFriends(): Promise<PartyProfile[]> {
    this.initFromStorage();
    return [...this.friends];
  }

  public async listFriendRequests(): Promise<FriendRequest[]> {
    this.initFromStorage();
    return [...this.friendRequests];
  }

  public async listBlockedUsers(): Promise<PartyProfile[]> {
    this.initFromStorage();
    return [...this.blockedUsers];
  }

  // =========================================================================
  // PRESENCE
  // =========================================================================

  public async getPresence(userIds: string[]): Promise<Record<string, PresenceInfo>> {
    const res: Record<string, PresenceInfo> = {};
    userIds.forEach((id) => {
      res[id] = this.presenceState[id] || { isOnline: true, lastSeen: Date.now() };
    });
    return res;
  }

  public subscribePresence(callback: (presence: Record<string, PresenceInfo>) => void): () => void {
    this.presenceListeners.add(callback);
    callback({ ...this.presenceState });
    return () => {
      this.presenceListeners.delete(callback);
    };
  }

  // =========================================================================
  // INVITES
  // =========================================================================

  public async sendInvite(toUserId: string, roomCode: string): Promise<PartyInvite> {
    if (this.blockedUsers.some((b) => b.id === toUserId)) {
      throw new Error('Cannot invite a blocked user.');
    }

    const invite: PartyInvite = {
      id: 'inv_' + Math.random().toString(36).slice(2, 10),
      from: this.profile || { id: 'me', username: 'Host', avatarUrl: null, createdAt: Date.now() },
      toId: toUserId,
      roomCode,
      createdAt: Date.now(),
    };

    return invite;
  }

  public async listPendingInvites(): Promise<PartyInvite[]> {
    this.initFromStorage();
    return [...this.pendingInvites];
  }

  public async acceptInvite(inviteId: string): Promise<{ roomCode: string }> {
    const inv = this.pendingInvites.find((i) => i.id === inviteId);
    if (!inv) throw new Error('Invite no longer available.');
    this.pendingInvites = this.pendingInvites.filter((i) => i.id !== inviteId);
    this.saveInvites();
    return { roomCode: inv.roomCode };
  }

  public async declineInvite(inviteId: string): Promise<void> {
    this.pendingInvites = this.pendingInvites.filter((i) => i.id !== inviteId);
    this.saveInvites();
  }

  public subscribeInvites(callback: (invites: PartyInvite[]) => void): () => void {
    this.inviteListeners.add(callback);
    callback([...this.pendingInvites]);
    return () => {
      this.inviteListeners.delete(callback);
    };
  }

  // =========================================================================
  // REALTIME TRANSPORT
  // =========================================================================

  public joinChannel(
    channelName: string,
    selfId: string,
    onMessage: (msg: any) => void,
    onPresenceChange?: (presences: any[]) => void
  ): RealtimeSubscription {
    return {
      send: async (msg: any) => {
        setTimeout(() => onMessage(msg), 40);
      },
      leave: async () => {},
      getLatency: () => 45,
    };
  }

  // =========================================================================
  // SIMULATION HELPERS (For Hidden Developer Page Only)
  // =========================================================================

  public async resetDemoData(): Promise<void> {
    this.friends = [DEFAULT_BOT_FRIENDS[0], DEFAULT_BOT_FRIENDS[1], DEFAULT_BOT_FRIENDS[2]];
    this.friendRequests = [];
    this.blockedUsers = [];
    this.pendingInvites = [];
    this.initPresence();
    this.saveFriends();
    this.saveRequests();
    this.saveBlocked();
    this.saveInvites();
    this.notifyPresenceListeners();
  }

  public async simulateBotFriendRequest(botId?: string): Promise<FriendRequest> {
    const candidate =
      DEFAULT_BOT_FRIENDS.find((b) => b.id === botId) ||
      DEFAULT_BOT_FRIENDS.find((b) => !this.friends.some((f) => f.id === b.id)) ||
      DEFAULT_BOT_FRIENDS[3];

    const req: FriendRequest = {
      id: 'req_' + Math.random().toString(36).slice(2, 10),
      from: candidate,
      toId: this.profile?.id || 'me',
      createdAt: Date.now(),
    };

    this.friendRequests.push(req);
    this.saveRequests();
    return req;
  }

  public async simulateBotInvite(botId?: string, roomCode?: string): Promise<PartyInvite> {
    const code = roomCode || generateRoomCode();
    const sender =
      DEFAULT_BOT_FRIENDS.find((b) => b.id === botId) ||
      this.friends[0] ||
      DEFAULT_BOT_FRIENDS[0];

    const inv: PartyInvite = {
      id: 'inv_' + Math.random().toString(36).slice(2, 10),
      from: sender,
      toId: this.profile?.id || 'me',
      roomCode: code,
      createdAt: Date.now(),
    };

    this.pendingInvites = [inv, ...this.pendingInvites];
    this.saveInvites();
    return inv;
  }

  public async toggleBotOnline(botId?: string): Promise<void> {
    const id = botId || DEFAULT_BOT_FRIENDS[0].id;
    const current = this.presenceState[id]?.isOnline ?? true;
    this.presenceState[id] = {
      isOnline: !current,
      lastSeen: current ? Date.now() : Date.now() - 1800000,
    };
    this.notifyPresenceListeners();
  }
}

export const MockPartyBackendInstance = new MockPartyBackendClass();
