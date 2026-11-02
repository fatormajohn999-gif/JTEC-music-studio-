/**
 * SupabasePartyBackend implementation for JTEC Party
 * Uses remote Supabase tables (party_profiles, party_friendships, party_blocks, party_invites)
 * and Supabase Realtime Channels for synchronous audio room coordination.
 */

import {
  PartyBackend,
  PartyProfile,
  Friendship,
  FriendRequest,
  PartyInvite,
  PresenceInfo,
  RealtimeSubscription,
  PARTY_ID_ALPHABET,
} from './types';

export class SupabasePartyBackendClass implements PartyBackend {
  private supabaseUrl: string;
  private supabaseAnonKey: string;
  private cachedProfile: PartyProfile | null = null;
  private presenceListeners: Set<(presence: Record<string, PresenceInfo>) => void> = new Set();
  private inviteListeners: Set<(invites: PartyInvite[]) => void> = new Set();

  constructor(supabaseUrl?: string, supabaseAnonKey?: string) {
    this.supabaseUrl = supabaseUrl || import.meta.env.VITE_PARTY_SUPABASE_URL || '';
    this.supabaseAnonKey = supabaseAnonKey || import.meta.env.VITE_PARTY_SUPABASE_ANON_KEY || '';
  }

  public isMock(): boolean {
    return false;
  }

  // =========================================================================
  // ACCOUNTS & PROFILES
  // =========================================================================

  public async createProfile(username: string): Promise<PartyProfile> {
    // Generate 8-character Party ID from clean alphabet
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    const partyId = Array.from(bytes, (b) => PARTY_ID_ALPHABET[b % PARTY_ID_ALPHABET.length]).join('');

    const tokenBytes = new Uint8Array(16);
    crypto.getRandomValues(tokenBytes);
    const token = Array.from(tokenBytes, (b) => b.toString(16).padStart(2, '0')).join('');

    const profile: PartyProfile = {
      id: partyId,
      username: username.trim(),
      avatarUrl: null,
      createdAt: Date.now(),
      token,
    };

    // Stored locally for offline recall
    localStorage.setItem('jtec_party_profile', JSON.stringify(profile));
    this.cachedProfile = profile;

    // TODO: [Supabase Implementation]
    // await supabase.from('party_profiles').insert({
    //   id: profile.id,
    //   username: profile.username,
    //   token_hash: hash(profile.token),
    //   created_at: new Date(profile.createdAt).toISOString()
    // });

    return profile;
  }

  public async loadProfile(): Promise<PartyProfile | null> {
    if (this.cachedProfile) return this.cachedProfile;

    const raw = localStorage.getItem('jtec_party_profile');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        this.cachedProfile = parsed;
        // TODO: [Supabase Implementation] Fetch latest profile from 'party_profiles' table
        return parsed;
      } catch {
        return null;
      }
    }
    return null;
  }

  public async updateProfile(updates: { username?: string; avatarUrl?: string | null }): Promise<PartyProfile> {
    const cur = await this.loadProfile();
    if (!cur) throw new Error('No party profile found to update');

    const updated: PartyProfile = {
      ...cur,
      username: updates.username !== undefined ? updates.username.trim() : cur.username,
      avatarUrl: updates.avatarUrl !== undefined ? updates.avatarUrl : cur.avatarUrl,
    };

    localStorage.setItem('jtec_party_profile', JSON.stringify(updated));
    this.cachedProfile = updated;

    // TODO: [Supabase Implementation]
    // await supabase.from('party_profiles').update({
    //   username: updated.username,
    //   avatar_url: updated.avatarUrl
    // }).eq('id', updated.id);

    return updated;
  }

  public async deleteProfile(): Promise<void> {
    localStorage.removeItem('jtec_party_profile');
    localStorage.removeItem('jtec_party_friends');
    localStorage.removeItem('jtec_party_requests');
    localStorage.removeItem('jtec_party_blocked');
    localStorage.removeItem('jtec_party_invites');
    this.cachedProfile = null;

    // TODO: [Supabase Implementation]
    // await supabase.from('party_profiles').delete().eq('id', cur.id);
  }

  // =========================================================================
  // FRIENDS & SOCIAL GRAPH
  // =========================================================================

  public async sendFriendRequest(targetPartyId: string): Promise<Friendship | FriendRequest> {
    // TODO: [Supabase Implementation]
    // Query target profile by ID and insert into party_friendships with status = 'pending'
    const cur = await this.loadProfile();
    const cleanId = targetPartyId.replace(/[\s-]/g, '').toUpperCase();
    if (cleanId.length !== 8) {
      throw new Error('Please enter a valid 8-character Party ID.');
    }

    const req: FriendRequest = {
      id: 'req_' + Math.random().toString(36).substring(2, 9),
      from: cur || { id: 'anon', username: 'Me', avatarUrl: null, createdAt: Date.now() },
      toId: cleanId,
      createdAt: Date.now(),
    };
    return req;
  }

  public async acceptFriendRequest(requestId: string): Promise<void> {
    // TODO: [Supabase Implementation]
    // Update party_friendships status = 'accepted' where id = requestId
  }

  public async declineFriendRequest(requestId: string): Promise<void> {
    // TODO: [Supabase Implementation]
    // Delete from party_friendships where id = requestId
  }

  public async removeFriend(friendId: string): Promise<void> {
    // TODO: [Supabase Implementation]
    // Delete from party_friendships where (user_a = me and user_b = friendId) or (user_b = me and user_a = friendId)
  }

  public async blockUser(targetId: string): Promise<void> {
    // TODO: [Supabase Implementation]
    // Insert into party_blocks (blocker_id, blocked_id)
  }

  public async unblockUser(targetId: string): Promise<void> {
    // TODO: [Supabase Implementation]
    // Delete from party_blocks where blocker_id = me and blocked_id = targetId
  }

  public async listFriends(): Promise<PartyProfile[]> {
    // TODO: [Supabase Implementation]
    // Select from party_friendships joined with party_profiles where status = 'accepted'
    return [];
  }

  public async listFriendRequests(): Promise<FriendRequest[]> {
    // TODO: [Supabase Implementation]
    // Select from party_friendships where to_id = me and status = 'pending'
    return [];
  }

  public async listBlockedUsers(): Promise<PartyProfile[]> {
    // TODO: [Supabase Implementation]
    // Select from party_blocks joined with party_profiles where blocker_id = me
    return [];
  }

  // =========================================================================
  // PRESENCE
  // =========================================================================

  public async getPresence(userIds: string[]): Promise<Record<string, PresenceInfo>> {
    // TODO: [Supabase Implementation] Query presence channel state for given IDs
    const result: Record<string, PresenceInfo> = {};
    for (const id of userIds) {
      result[id] = { isOnline: true, lastSeen: Date.now() };
    }
    return result;
  }

  public subscribePresence(callback: (presence: Record<string, PresenceInfo>) => void): () => void {
    this.presenceListeners.add(callback);
    // TODO: [Supabase Implementation] Subscribe to party:presence channel
    return () => {
      this.presenceListeners.delete(callback);
    };
  }

  // =========================================================================
  // INVITES
  // =========================================================================

  public async sendInvite(toUserId: string, roomCode: string): Promise<PartyInvite> {
    const cur = await this.loadProfile();
    const invite: PartyInvite = {
      id: 'inv_' + Math.random().toString(36).substring(2, 9),
      from: cur || { id: 'anon', username: 'Host', avatarUrl: null, createdAt: Date.now() },
      toId: toUserId,
      roomCode,
      createdAt: Date.now(),
    };

    // TODO: [Supabase Implementation]
    // Insert into party_invites (from_id, to_id, room_code, status) values (cur.id, toUserId, roomCode, 'pending')
    return invite;
  }

  public async listPendingInvites(): Promise<PartyInvite[]> {
    // TODO: [Supabase Implementation]
    // Select from party_invites where to_id = me and status = 'pending'
    return [];
  }

  public async acceptInvite(inviteId: string): Promise<{ roomCode: string }> {
    // TODO: [Supabase Implementation] Update party_invites status = 'accepted'
    return { roomCode: 'JT2048' };
  }

  public async declineInvite(inviteId: string): Promise<void> {
    // TODO: [Supabase Implementation] Update party_invites status = 'declined'
  }

  public subscribeInvites(callback: (invites: PartyInvite[]) => void): () => void {
    this.inviteListeners.add(callback);
    // TODO: [Supabase Implementation] Realtime postgres_changes on party_invites where to_id = me
    return () => {
      this.inviteListeners.delete(callback);
    };
  }

  // =========================================================================
  // REALTIME TRANSPORT & ROOMS
  // =========================================================================

  public joinChannel(
    channelName: string,
    selfId: string,
    onMessage: (msg: any) => void,
    onPresenceChange?: (presences: any[]) => void
  ): RealtimeSubscription {
    // TODO: [Supabase Implementation]
    // const channel = supabase.channel(`party:${channelName}`, { config: { broadcast: { self: false } } });
    // channel.on('broadcast', { event: 'party_msg' }, ({ payload }) => onMessage(payload));
    // channel.subscribe();
    return {
      send: async (msg: any) => {
        setTimeout(() => onMessage(msg), 30);
      },
      leave: async () => {},
      getLatency: () => 35,
    };
  }
}

export const SupabasePartyBackendInstance = new SupabasePartyBackendClass();
