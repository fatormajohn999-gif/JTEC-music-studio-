// TypeScript interfaces and data models for JTEC Party Backend
// Defines the complete contract for accounts, profiles, friends, presence, invites, rooms, and realtime transport.

export const PARTY_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface PartyProfile {
  id: string; // 8-character Party ID from PARTY_ID_ALPHABET, e.g. "K7M2Q9XA"
  accountId?: string; // Supabase auth user UUID
  username: string; // 2 to 20 characters
  avatarUrl: string | null; // 256x256 JPEG under 40 KB data URL
  createdAt: number;
  token?: string; // Hidden random token stored locally, never shown to user
  tag?: string; // Optional legacy field for migration
}

export type FriendshipStatus = 'accepted' | 'pending';

export interface Friendship {
  id: string;
  userA: string;
  userB: string;
  status: FriendshipStatus;
  friend: PartyProfile;
  createdAt: number;
}

export interface FriendRequest {
  id: string;
  from: PartyProfile;
  toId: string;
  createdAt: number;
}

export interface BlockRecord {
  id: string;
  blockerId: string;
  blockedId: string;
  blockedUser: PartyProfile;
  createdAt: number;
}

export interface PartyInvite {
  id: string;
  from: PartyProfile;
  toId: string;
  roomCode: string;
  createdAt: number;
}

export interface PresenceInfo {
  isOnline: boolean;
  lastSeen: number;
}

export interface RealtimeSubscription {
  send: (msg: any) => Promise<void>;
  leave: () => Promise<void>;
  getLatency: () => number;
}

export type SocialNotification =
  | { type: 'friend_request'; name: string; requestId: string }
  | { type: 'friend_accepted'; name: string };

export interface BackendPartyStatus {
  backendType: 'Supabase' | 'Local';
  accountId: string | null;
  partyId: string | null;
  onlineChannelState: string;
  roomChannelState: string;
  lastError: string | null;
}

export interface PartyBackend {
  // Accounts & Profile
  createProfile(username: string): Promise<PartyProfile>;
  loadProfile(): Promise<PartyProfile | null>;
  updateProfile(updates: { username?: string; avatarUrl?: string | null }): Promise<PartyProfile>;
  deleteProfile(): Promise<void>;

  // Friends & Social Graph
  sendFriendRequest(targetPartyId: string): Promise<Friendship | FriendRequest>;
  acceptFriendRequest(requestId: string): Promise<void>;
  declineFriendRequest(requestId: string): Promise<void>;
  removeFriend(friendId: string): Promise<void>;
  blockUser(targetId: string): Promise<void>;
  unblockUser(targetId: string): Promise<void>;
  listFriends(): Promise<PartyProfile[]>;
  listFriendRequests(): Promise<FriendRequest[]>;
  listBlockedUsers(): Promise<PartyProfile[]>;

  // Presence
  getPresence(userIds: string[]): Promise<Record<string, PresenceInfo>>;
  subscribePresence(callback: (presence: Record<string, PresenceInfo>) => void): () => void;

  // Invites
  sendInvite(toUserId: string, roomCode: string): Promise<PartyInvite>;
  listPendingInvites(): Promise<PartyInvite[]>;
  acceptInvite(inviteId: string): Promise<{ roomCode: string }>;
  declineInvite(inviteId: string): Promise<void>;
  subscribeInvites(callback: (invites: PartyInvite[]) => void): () => void;

  // Realtime transport & rooms
  joinChannel(
    channelName: string,
    selfId: string,
    onMessage: (msg: any) => void,
    onPresenceChange?: (presences: any[]) => void
  ): RealtimeSubscription;

  // Real-time notifications & Status
  subscribeSocialNotifications?(callback: (notification: SocialNotification) => void): () => void;
  getStatus?(): BackendPartyStatus;
  isConfigured?(): boolean;
  reconnect?(): Promise<void>;

  // Helpers
  isMock(): boolean;
  resetDemoData?(): Promise<void>;
  simulateBotFriendRequest?(botId?: string): Promise<FriendRequest>;
  simulateBotInvite?(botId?: string, roomCode?: string): Promise<PartyInvite>;
  toggleBotOnline?(botId?: string): Promise<void>;
}
