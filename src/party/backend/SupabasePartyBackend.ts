/**
 * SupabasePartyBackend implementation for JTEC Party
 * Uses a SEPARATE Supabase client created exclusively from
 * VITE_PARTY_SUPABASE_URL and VITE_PARTY_SUPABASE_ANON_KEY (never uses the music Supabase client).
 * Implements real-time presence, social notifications, invites, friendships, blocks, and room channels.
 */

import { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import {
  PartyBackend,
  PartyProfile,
  Friendship,
  FriendRequest,
  PartyInvite,
  PresenceInfo,
  RealtimeSubscription,
  SocialNotification,
  BackendPartyStatus,
  PARTY_ID_ALPHABET,
} from './types';
import { getPartySupabaseClient, isPartySupabaseConfigured } from './supabaseClient';

const INVITE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

function generatePartyId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => PARTY_ID_ALPHABET[b % PARTY_ID_ALPHABET.length]).join('');
}

export class SupabasePartyBackendClass implements PartyBackend {
  private client: SupabaseClient | null = null;
  private cachedProfile: PartyProfile | null = null;
  private onlineChannel: RealtimeChannel | null = null;
  private notificationsChannel: RealtimeChannel | null = null;
  private roomChannel: RealtimeChannel | null = null;

  private presenceListeners: Set<(presence: Record<string, PresenceInfo>) => void> = new Set();
  private inviteListeners: Set<(invites: PartyInvite[]) => void> = new Set();
  private socialNotificationListeners: Set<(notification: SocialNotification) => void> = new Set();

  private onlineChannelStatus: string = 'DISCONNECTED';
  private roomChannelStatus: string = 'IDLE';
  private lastErrorMessage: string | null = null;
  private localLastSeenMap: Map<string, number> = new Map();
  private isLifecycleInitialized = false;

  constructor() {
    this.client = getPartySupabaseClient();
    this.initLifecycleListeners();
  }

  public isMock(): boolean {
    return false;
  }

  public isConfigured(): boolean {
    return isPartySupabaseConfigured();
  }

  public getStatus(): BackendPartyStatus {
    return {
      backendType: 'Supabase',
      accountId: this.cachedProfile?.accountId || null,
      partyId: this.cachedProfile?.id || null,
      onlineChannelState: this.onlineChannelStatus,
      roomChannelState: this.roomChannelStatus,
      lastError: this.lastErrorMessage,
    };
  }

  private setLastError(err: unknown): void {
    if (!err) return;
    const msg = err instanceof Error ? err.message : String(err);
    this.lastErrorMessage = msg;
    console.warn('[SupabasePartyBackend]', msg);
  }

  // =========================================================================
  // LIFECYCLE, NETWORK & FOREGROUND LISTENERS
  // =========================================================================
  private initLifecycleListeners(): void {
    if (this.isLifecycleInitialized || typeof window === 'undefined') return;
    this.isLifecycleInitialized = true;

    // Foreground / Visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.handleForegroundReturn();
      } else {
        this.handleBackground();
      }
    });

    // Online / Network changes
    window.addEventListener('online', () => {
      this.reconnect();
    });
  }

  private async handleForegroundReturn(): Promise<void> {
    if (!this.cachedProfile?.accountId) return;

    // Track presence when visible
    if (this.onlineChannel && this.onlineChannelStatus === 'SUBSCRIBED') {
      try {
        await this.onlineChannel.track({ id: this.cachedProfile.accountId });
      } catch (err) {
        this.setLastError(err);
      }
    } else {
      await this.startOnlinePresence();
    }

    // Refresh notifications & invites channel if needed
    if (!this.notificationsChannel) {
      await this.startSocialNotifications();
    }

    // Dispatch fresh pending invites
    try {
      const invs = await this.listPendingInvites();
      this.notifyInviteListeners(invs);
    } catch {}
  }

  private async handleBackground(): Promise<void> {
    // Untrack presence when backgrounded
    if (this.onlineChannel && this.onlineChannelStatus === 'SUBSCRIBED') {
      try {
        await this.onlineChannel.untrack();
      } catch (err) {
        this.setLastError(err);
      }
    }
  }

  public async reconnect(): Promise<void> {
    this.client = getPartySupabaseClient();
    if (!this.client || !this.cachedProfile?.accountId) return;

    try {
      await this.startOnlinePresence();
      await this.startSocialNotifications();
      const invs = await this.listPendingInvites();
      this.notifyInviteListeners(invs);
    } catch (err) {
      this.setLastError(err);
    }
  }

  // =========================================================================
  // 1. ACCOUNTS & PROFILES
  // =========================================================================

  public async createProfile(username: string, avatarUrl?: string | null): Promise<PartyProfile> {
    this.client = getPartySupabaseClient();
    if (!this.client) {
      throw new Error('JTEC Party is unavailable right now');
    }

    const cleanUsername = username.trim().slice(0, 20);
    if (cleanUsername.length < 2) {
      throw new Error('Please choose a username between 2 and 20 characters.');
    }

    // Call signInAnonymously() if no active session
    let session = (await this.client.auth.getSession()).data.session;
    if (!session || !session.user) {
      const { data: authData, error: authErr } = await this.client.auth.signInAnonymously();
      if (authErr) {
        this.setLastError(authErr);
        throw new Error('JTEC Party is unavailable right now');
      }
      session = authData.session;
    }

    const userId = session?.user?.id;
    if (!userId) {
      throw new Error('JTEC Party is unavailable right now');
    }

    // Generate 8-character Party ID and insert into profiles (retry up to 5 times if collision)
    let finalPartyId = '';
    let inserted = false;
    let lastError: any = null;

    for (let attempt = 0; attempt < 5; attempt++) {
      const candidateId = generatePartyId();
      const { error } = await this.client
        .from('profiles')
        .insert({
          id: userId,
          party_id: candidateId,
          username: cleanUsername,
          avatar: avatarUrl || null,
        });

      if (!error) {
        finalPartyId = candidateId;
        inserted = true;
        break;
      }

      lastError = error;

      // If user row already exists, update it instead
      if (error.code === '23505' && String(error.message || '').includes('profiles_pkey')) {
        const { error: updErr } = await this.client
          .from('profiles')
          .update({
            username: cleanUsername,
            avatar: avatarUrl || null,
          })
          .eq('id', userId);

        if (!updErr) {
          const { data: existing } = await this.client
            .from('profiles')
            .select('party_id')
            .eq('id', userId)
            .single();

          finalPartyId = existing?.party_id || candidateId;
          inserted = true;
          break;
        }
      }
    }

    if (!inserted) {
      this.setLastError(lastError);
      throw new Error('Could not reserve a unique Party ID. Please try again.');
    }

    const profile: PartyProfile = {
      id: finalPartyId,
      accountId: userId,
      username: cleanUsername,
      avatarUrl: avatarUrl || null,
      createdAt: Date.now(),
    };

    this.cachedProfile = profile;
    try {
      localStorage.setItem('jtec_party_profile', JSON.stringify(profile));
    } catch {}

    // Initialize online presence & notifications
    await this.startOnlinePresence();
    await this.startSocialNotifications();

    return profile;
  }

  public async loadProfile(): Promise<PartyProfile | null> {
    if (this.cachedProfile) {
      return this.cachedProfile;
    }

    this.client = getPartySupabaseClient();
    if (!this.client) {
      return null;
    }

    // Check auth session
    const { data: authData } = await this.client.auth.getUser();
    const user = authData?.user;
    if (!user) {
      return null;
    }

    // Fetch profile row
    const { data: row, error } = await this.client
      .from('profiles')
      .select('id, party_id, username, avatar, created_at')
      .eq('id', user.id)
      .maybeSingle();

    if (error || !row) {
      if (error) this.setLastError(error);
      return null;
    }

    const profile: PartyProfile = {
      id: row.party_id,
      accountId: row.id,
      username: row.username,
      avatarUrl: row.avatar || null,
      createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    };

    this.cachedProfile = profile;
    try {
      localStorage.setItem('jtec_party_profile', JSON.stringify(profile));
    } catch {}

    // Initialize presence and notifications in background
    this.startOnlinePresence().catch((err) => this.setLastError(err));
    this.startSocialNotifications().catch((err) => this.setLastError(err));

    return profile;
  }

  public async updateProfile(updates: { username?: string; avatarUrl?: string | null }): Promise<PartyProfile> {
    const cur = await this.loadProfile();
    if (!cur || !cur.accountId) {
      throw new Error('Please create a profile first.');
    }

    this.client = getPartySupabaseClient();
    if (!this.client) {
      throw new Error('JTEC Party is unavailable right now');
    }

    const patch: Record<string, any> = {};
    if (updates.username !== undefined) {
      patch.username = updates.username.trim().slice(0, 20);
    }
    if (updates.avatarUrl !== undefined) {
      patch.avatar = updates.avatarUrl;
    }

    const { error } = await this.client
      .from('profiles')
      .update(patch)
      .eq('id', cur.accountId);

    if (error) {
      this.setLastError(error);
      throw new Error('Could not update profile. Please try again.');
    }

    const updated: PartyProfile = {
      ...cur,
      username: updates.username !== undefined ? updates.username.trim().slice(0, 20) : cur.username,
      avatarUrl: updates.avatarUrl !== undefined ? updates.avatarUrl : cur.avatarUrl,
    };

    this.cachedProfile = updated;
    try {
      localStorage.setItem('jtec_party_profile', JSON.stringify(updated));
    } catch {}

    return updated;
  }

  public async deleteProfile(): Promise<void> {
    const cur = await this.loadProfile();
    this.client = getPartySupabaseClient();

    if (this.client && cur?.accountId) {
      try {
        await this.client.rpc('delete_my_account');
      } catch (err) {
        this.setLastError(err);
      }

      try {
        await this.client.auth.signOut();
      } catch (err) {
        this.setLastError(err);
      }
    }

    this.cleanupChannels();
    this.cachedProfile = null;

    try {
      localStorage.removeItem('jtec_party_profile');
      localStorage.removeItem('jtec_party_friends');
      localStorage.removeItem('jtec_party_requests');
      localStorage.removeItem('jtec_party_blocked');
      localStorage.removeItem('jtec_party_invites');
    } catch {}
  }

  private cleanupChannels(): void {
    if (this.onlineChannel) {
      try {
        this.onlineChannel.unsubscribe();
      } catch {}
      this.onlineChannel = null;
      this.onlineChannelStatus = 'DISCONNECTED';
    }

    if (this.notificationsChannel) {
      try {
        this.notificationsChannel.unsubscribe();
      } catch {}
      this.notificationsChannel = null;
    }

    if (this.roomChannel) {
      try {
        this.roomChannel.unsubscribe();
      } catch {}
      this.roomChannel = null;
      this.roomChannelStatus = 'IDLE';
    }
  }

  // =========================================================================
  // 2. FRIENDS & SOCIAL GRAPH
  // =========================================================================

  public async sendFriendRequest(targetPartyId: string): Promise<Friendship | FriendRequest> {
    const me = await this.loadProfile();
    if (!me || !me.accountId) {
      throw new Error('Please create a profile first.');
    }

    this.client = getPartySupabaseClient();
    if (!this.client) {
      throw new Error('JTEC Party is unavailable right now');
    }

    const cleanId = targetPartyId.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (cleanId.length !== 8) {
      throw new Error('Please enter a valid 8-character Party ID.');
    }

    // Call find_profile(p_party_id)
    const { data: foundProfile, error: findErr } = await this.client.rpc('find_profile', {
      p_party_id: cleanId,
    });

    if (findErr) {
      this.setLastError(findErr);
      throw new Error('No one has this ID');
    }

    const target = Array.isArray(foundProfile) ? foundProfile[0] : foundProfile;
    if (!target || !target.id) {
      throw new Error('No one has this ID');
    }

    // That's you check
    if (target.id === me.accountId || target.party_id === me.id) {
      throw new Error("That's you");
    }

    // Check existing friendships
    const { data: existing } = await this.client
      .from('friendships')
      .select('id, requester, addressee, status')
      .or(`and(requester.eq.${me.accountId},addressee.eq.${target.id}),and(requester.eq.${target.id},addressee.eq.${me.accountId})`);

    if (existing && existing.length > 0) {
      const rel = existing[0];
      if (rel.status === 'accepted') {
        throw new Error('Already friends');
      } else {
        throw new Error('Request already sent');
      }
    }

    // Insert pending friendships row
    const { data: inserted, error: insertErr } = await this.client
      .from('friendships')
      .insert({
        requester: me.accountId,
        addressee: target.id,
        status: 'pending',
      })
      .select('id, created_at')
      .single();

    if (insertErr) {
      if (insertErr.code === '23505') {
        throw new Error('Request already sent');
      }
      this.setLastError(insertErr);
      throw new Error('Could not send friend request');
    }

    return {
      id: inserted.id,
      from: me,
      toId: target.id,
      createdAt: inserted.created_at ? new Date(inserted.created_at).getTime() : Date.now(),
    };
  }

  public async listFriends(): Promise<PartyProfile[]> {
    const me = await this.loadProfile();
    if (!me || !me.accountId) return [];

    this.client = getPartySupabaseClient();
    if (!this.client) return [];

    try {
      const { data: rows, error } = await this.client
        .from('friendships')
        .select('requester, addressee, status')
        .or(`requester.eq.${me.accountId},addressee.eq.${me.accountId}`)
        .eq('status', 'accepted');

      if (error || !rows || rows.length === 0) return [];

      const friendUserIds = rows.map((r: any) =>
        r.requester === me.accountId ? r.addressee : r.requester
      );

      const { data: profiles, error: pErr } = await this.client.rpc('get_profiles', {
        p_ids: friendUserIds,
      });

      if (pErr || !profiles) return [];

      return (Array.isArray(profiles) ? profiles : []).map((p: any) => ({
        id: p.party_id,
        accountId: p.id,
        username: p.username,
        avatarUrl: p.avatar || null,
        createdAt: p.created_at ? new Date(p.created_at).getTime() : Date.now(),
      }));
    } catch (err) {
      this.setLastError(err);
      return [];
    }
  }

  public async listFriendRequests(): Promise<FriendRequest[]> {
    const me = await this.loadProfile();
    if (!me || !me.accountId) return [];

    this.client = getPartySupabaseClient();
    if (!this.client) return [];

    try {
      const { data: requests, error } = await this.client
        .from('friendships')
        .select('id, requester, addressee, status, created_at')
        .eq('addressee', me.accountId)
        .eq('status', 'pending');

      if (error || !requests || requests.length === 0) return [];

      const requesterIds = requests.map((r: any) => r.requester);
      const { data: profiles } = await this.client.rpc('get_profiles', {
        p_ids: requesterIds,
      });

      const profileMap = new Map<string, any>();
      if (Array.isArray(profiles)) {
        profiles.forEach((p) => profileMap.set(p.id, p));
      }

      return requests.map((r: any) => {
        const p = profileMap.get(r.requester);
        return {
          id: r.id,
          from: {
            id: p?.party_id || r.requester.slice(0, 8),
            accountId: r.requester,
            username: p?.username || 'JTEC Listener',
            avatarUrl: p?.avatar || null,
            createdAt: p?.created_at ? new Date(p.created_at).getTime() : Date.now(),
          },
          toId: me.accountId!,
          createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
        };
      });
    } catch (err) {
      this.setLastError(err);
      return [];
    }
  }

  public async acceptFriendRequest(requestId: string): Promise<void> {
    this.client = getPartySupabaseClient();
    if (!this.client) {
      throw new Error('JTEC Party is unavailable right now');
    }

    // Call accept_friend(p_id)
    const { error } = await this.client.rpc('accept_friend', { p_id: requestId });
    if (error) {
      // Direct update fallback in case p_id is row id or user id
      const { error: updErr } = await this.client
        .from('friendships')
        .update({ status: 'accepted' })
        .eq('id', requestId);

      if (updErr) {
        this.setLastError(updErr);
        throw new Error('Could not accept friend request');
      }
    }
  }

  public async declineFriendRequest(requestId: string): Promise<void> {
    this.client = getPartySupabaseClient();
    if (!this.client) {
      throw new Error('JTEC Party is unavailable right now');
    }

    const { error } = await this.client.from('friendships').delete().eq('id', requestId);
    if (error) {
      this.setLastError(error);
      throw new Error('Could not decline friend request');
    }
  }

  public async removeFriend(friendId: string): Promise<void> {
    const me = await this.loadProfile();
    if (!me || !me.accountId) return;

    this.client = getPartySupabaseClient();
    if (!this.client) return;

    let targetAccountId = friendId;
    if (friendId.length === 8 && !friendId.includes('-')) {
      const { data } = await this.client.rpc('find_profile', { p_party_id: friendId });
      const p = Array.isArray(data) ? data[0] : data;
      if (p?.id) targetAccountId = p.id;
    }

    const { error } = await this.client
      .from('friendships')
      .delete()
      .or(
        `and(requester.eq.${me.accountId},addressee.eq.${targetAccountId}),and(requester.eq.${targetAccountId},addressee.eq.${me.accountId}),id.eq.${friendId}`
      );

    if (error) {
      this.setLastError(error);
      throw new Error('Could not remove friend');
    }
  }

  public async blockUser(targetId: string): Promise<void> {
    const me = await this.loadProfile();
    if (!me || !me.accountId) return;

    this.client = getPartySupabaseClient();
    if (!this.client) return;

    let targetAccountId = targetId;
    if (targetId.length === 8 && !targetId.includes('-')) {
      const { data } = await this.client.rpc('find_profile', { p_party_id: targetId });
      const p = Array.isArray(data) ? data[0] : data;
      if (p?.id) targetAccountId = p.id;
    }

    // Insert into blocks
    try {
      await this.client.from('blocks').insert({ blocker_id: me.accountId, blocked_id: targetAccountId });
    } catch {
      await this.client.from('blocks').insert({ user_id: me.accountId, blocked_id: targetAccountId });
    }

    // Delete any friendship between them
    await this.client
      .from('friendships')
      .delete()
      .or(
        `and(requester.eq.${me.accountId},addressee.eq.${targetAccountId}),and(requester.eq.${targetAccountId},addressee.eq.${me.accountId})`
      );
  }

  public async unblockUser(targetId: string): Promise<void> {
    const me = await this.loadProfile();
    if (!me || !me.accountId) return;

    this.client = getPartySupabaseClient();
    if (!this.client) return;

    let targetAccountId = targetId;
    if (targetId.length === 8 && !targetId.includes('-')) {
      const { data } = await this.client.rpc('find_profile', { p_party_id: targetId });
      const p = Array.isArray(data) ? data[0] : data;
      if (p?.id) targetAccountId = p.id;
    }

    await this.client
      .from('blocks')
      .delete()
      .or(
        `and(blocker_id.eq.${me.accountId},blocked_id.eq.${targetAccountId}),and(user_id.eq.${me.accountId},blocked_id.eq.${targetAccountId})`
      );
  }

  public async listBlockedUsers(): Promise<PartyProfile[]> {
    const me = await this.loadProfile();
    if (!me || !me.accountId) return [];

    this.client = getPartySupabaseClient();
    if (!this.client) return [];

    try {
      const { data: rows, error } = await this.client
        .from('blocks')
        .select('*')
        .or(`blocker_id.eq.${me.accountId},user_id.eq.${me.accountId}`);

      if (error || !rows || rows.length === 0) return [];

      const blockedIds = rows.map((r: any) => r.blocked_id || r.blockedId);
      const { data: profiles } = await this.client.rpc('get_profiles', { p_ids: blockedIds });

      if (!profiles) return [];

      return (Array.isArray(profiles) ? profiles : []).map((p: any) => ({
        id: p.party_id,
        accountId: p.id,
        username: p.username,
        avatarUrl: p.avatar || null,
        createdAt: p.created_at ? new Date(p.created_at).getTime() : Date.now(),
      }));
    } catch (err) {
      this.setLastError(err);
      return [];
    }
  }

  // =========================================================================
  // 3. REAL-TIME NOTIFICATIONS & SUBSCRIPTIONS
  // =========================================================================

  private async startSocialNotifications(): Promise<void> {
    const me = await this.loadProfile();
    if (!me || !me.accountId || !this.client) return;

    if (this.notificationsChannel) {
      try {
        this.notificationsChannel.unsubscribe();
      } catch {}
      this.notificationsChannel = null;
    }

    const channelName = `party_social_notifications_${me.accountId}`;
    const channel = this.client.channel(channelName);

    // 1. Friend requests (friendships where addressee = me and status = pending)
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'friendships',
        filter: `addressee=eq.${me.accountId}`,
      },
      async (payload) => {
        try {
          const req = payload.new;
          if (req.status === 'pending') {
            const { data } = await this.client!.rpc('get_profiles', { p_ids: [req.requester] });
            const sender = Array.isArray(data) ? data[0] : data;
            const name = sender?.username || 'Someone';

            this.socialNotificationListeners.forEach((fn) =>
              fn({ type: 'friend_request', name, requestId: req.id })
            );
          }
        } catch (err) {
          this.setLastError(err);
        }
      }
    );

    // 2. Friend accepted (friendships where requester = me and status = accepted)
    channel.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'friendships',
        filter: `requester=eq.${me.accountId}`,
      },
      async (payload) => {
        try {
          const rel = payload.new;
          if (rel.status === 'accepted') {
            const { data } = await this.client!.rpc('get_profiles', { p_ids: [rel.addressee] });
            const friend = Array.isArray(data) ? data[0] : data;
            const name = friend?.username || 'Your friend';

            this.socialNotificationListeners.forEach((fn) =>
              fn({ type: 'friend_accepted', name })
            );
          }
        } catch (err) {
          this.setLastError(err);
        }
      }
    );

    // 3. Party invites (invites where to_id = me)
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'invites',
        filter: `to_id=eq.${me.accountId}`,
      },
      async (payload) => {
        try {
          const invRow = payload.new;
          const createdAtMs = invRow.created_at ? new Date(invRow.created_at).getTime() : Date.now();
          if (Date.now() - createdAtMs > INVITE_MAX_AGE_MS) {
            return; // Ignore invites older than 10 minutes
          }

          const { data } = await this.client!.rpc('get_profiles', { p_ids: [invRow.from_id] });
          const fromProf = Array.isArray(data) ? data[0] : data;

          const newInvite: PartyInvite = {
            id: invRow.id,
            from: {
              id: fromProf?.party_id || invRow.from_id.slice(0, 8),
              accountId: invRow.from_id,
              username: fromProf?.username || 'Host',
              avatarUrl: fromProf?.avatar || null,
              createdAt: createdAtMs,
            },
            toId: me.accountId!,
            roomCode: invRow.room_code,
            createdAt: createdAtMs,
          };

          const current = await this.listPendingInvites();
          this.notifyInviteListeners([newInvite, ...current.filter((i) => i.id !== newInvite.id)]);
        } catch (err) {
          this.setLastError(err);
        }
      }
    );

    channel.subscribe((status) => {
      if (status === 'CHANNEL_ERROR') {
        this.setLastError('Social notifications channel error');
      }
    });

    this.notificationsChannel = channel;
  }

  public subscribeSocialNotifications(callback: (notification: SocialNotification) => void): () => void {
    this.socialNotificationListeners.add(callback);
    return () => {
      this.socialNotificationListeners.delete(callback);
    };
  }

  // =========================================================================
  // 4. ONLINE STATUS (Realtime channel "online")
  // =========================================================================

  private async startOnlinePresence(): Promise<void> {
    const me = await this.loadProfile();
    if (!me || !me.accountId || !this.client) return;

    if (this.onlineChannel) {
      try {
        this.onlineChannel.unsubscribe();
      } catch {}
      this.onlineChannel = null;
    }

    const channel = this.client.channel('online', {
      config: {
        presence: { key: me.accountId },
      },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        this.broadcastPresenceState();
      })
      .on('presence', { event: 'join' }, () => {
        this.broadcastPresenceState();
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        if (key) {
          const now = Date.now();
          this.localLastSeenMap.set(key, now);
          try {
            localStorage.setItem(`jtec_party_last_seen_${key}`, now.toString());
          } catch {}
        }
        this.broadcastPresenceState();
      });

    channel.subscribe(async (status) => {
      this.onlineChannelStatus = status;
      if (status === 'SUBSCRIBED') {
        try {
          await channel.track({ id: me.accountId });
        } catch (err) {
          this.setLastError(err);
        }
      }
    });

    this.onlineChannel = channel;
  }

  private broadcastPresenceState(): void {
    if (!this.onlineChannel) return;
    const presenceState = this.onlineChannel.presenceState();
    const result: Record<string, PresenceInfo> = {};

    Object.keys(presenceState).forEach((k) => {
      result[k] = { isOnline: true, lastSeen: Date.now() };
    });

    this.presenceListeners.forEach((fn) => fn(result));
  }

  public async getPresence(userIds: string[]): Promise<Record<string, PresenceInfo>> {
    const result: Record<string, PresenceInfo> = {};
    const presenceState = this.onlineChannel ? this.onlineChannel.presenceState() : {};

    for (const rawId of userIds) {
      const isPresent = Boolean(presenceState[rawId]);
      if (isPresent) {
        result[rawId] = { isOnline: true, lastSeen: Date.now() };
      } else {
        let storedLastSeen = this.localLastSeenMap.get(rawId);
        if (!storedLastSeen) {
          try {
            const raw = localStorage.getItem(`jtec_party_last_seen_${rawId}`);
            if (raw) storedLastSeen = Number(raw);
          } catch {}
        }
        result[rawId] = {
          isOnline: false,
          lastSeen: storedLastSeen || Date.now() - 3600 * 1000,
        };
      }
    }

    return result;
  }

  public subscribePresence(callback: (presence: Record<string, PresenceInfo>) => void): () => void {
    this.presenceListeners.add(callback);
    return () => {
      this.presenceListeners.delete(callback);
    };
  }

  // =========================================================================
  // 5. INVITES
  // =========================================================================

  public async sendInvite(toUserId: string, roomCode: string): Promise<PartyInvite> {
    const me = await this.loadProfile();
    if (!me || !me.accountId) {
      throw new Error('Please create a profile first.');
    }

    this.client = getPartySupabaseClient();
    if (!this.client) {
      throw new Error('JTEC Party is unavailable right now');
    }

    // Resolve target account ID if 8-char party_id
    let targetAccountId = toUserId;
    if (toUserId.length === 8 && !toUserId.includes('-')) {
      const { data } = await this.client.rpc('find_profile', { p_party_id: toUserId });
      const p = Array.isArray(data) ? data[0] : data;
      if (p?.id) targetAccountId = p.id;
    }

    const { data: inserted, error } = await this.client
      .from('invites')
      .insert({
        from_id: me.accountId,
        to_id: targetAccountId,
        room_code: roomCode,
      })
      .select('id, created_at')
      .single();

    if (error) {
      this.setLastError(error);
      throw new Error('Could not send party invitation.');
    }

    return {
      id: inserted.id,
      from: me,
      toId: targetAccountId,
      roomCode,
      createdAt: inserted.created_at ? new Date(inserted.created_at).getTime() : Date.now(),
    };
  }

  public async listPendingInvites(): Promise<PartyInvite[]> {
    const me = await this.loadProfile();
    if (!me || !me.accountId) return [];

    this.client = getPartySupabaseClient();
    if (!this.client) return [];

    try {
      const tenMinutesAgo = new Date(Date.now() - INVITE_MAX_AGE_MS).toISOString();

      const { data: rows, error } = await this.client
        .from('invites')
        .select('id, from_id, to_id, room_code, created_at')
        .eq('to_id', me.accountId)
        .gte('created_at', tenMinutesAgo)
        .order('created_at', { ascending: false });

      if (error || !rows || rows.length === 0) return [];

      const senderIds = Array.from(new Set(rows.map((r: any) => r.from_id)));
      const { data: profiles } = await this.client.rpc('get_profiles', { p_ids: senderIds });

      const profileMap = new Map<string, any>();
      if (Array.isArray(profiles)) {
        profiles.forEach((p) => profileMap.set(p.id, p));
      }

      return rows.map((r: any) => {
        const p = profileMap.get(r.from_id);
        const createdAtMs = r.created_at ? new Date(r.created_at).getTime() : Date.now();
        return {
          id: r.id,
          from: {
            id: p?.party_id || r.from_id.slice(0, 8),
            accountId: r.from_id,
            username: p?.username || 'Host',
            avatarUrl: p?.avatar || null,
            createdAt: createdAtMs,
          },
          toId: me.accountId!,
          roomCode: r.room_code,
          createdAt: createdAtMs,
        };
      });
    } catch (err) {
      this.setLastError(err);
      return [];
    }
  }

  public async acceptInvite(inviteId: string): Promise<{ roomCode: string }> {
    this.client = getPartySupabaseClient();
    if (!this.client) throw new Error('JTEC Party is unavailable right now');

    // Fetch room code from invite
    const { data: inviteRow, error } = await this.client
      .from('invites')
      .select('room_code')
      .eq('id', inviteId)
      .maybeSingle();

    if (error || !inviteRow) {
      throw new Error('Invite is no longer available');
    }

    const roomCode = inviteRow.room_code;

    // Delete invite after acting on it
    try {
      await this.client.from('invites').delete().eq('id', inviteId);
    } catch {}

    return { roomCode };
  }

  public async declineInvite(inviteId: string): Promise<void> {
    this.client = getPartySupabaseClient();
    if (!this.client) return;

    try {
      await this.client.from('invites').delete().eq('id', inviteId);
    } catch (err) {
      this.setLastError(err);
    }
  }

  public subscribeInvites(callback: (invites: PartyInvite[]) => void): () => void {
    this.inviteListeners.add(callback);
    return () => {
      this.inviteListeners.delete(callback);
    };
  }

  private notifyInviteListeners(invites: PartyInvite[]): void {
    this.inviteListeners.forEach((fn) => fn(invites));
  }

  // =========================================================================
  // 6. REALTIME ROOM TRANSPORT (party:<CODE>)
  // =========================================================================

  public joinChannel(
    channelName: string,
    selfId: string,
    onMessage: (msg: any) => void,
    onPresenceChange?: (presences: any[]) => void
  ): RealtimeSubscription {
    this.client = getPartySupabaseClient();
    const formattedChannelName = channelName.startsWith('party:') ? channelName : `party:${channelName}`;

    if (!this.client) {
      return {
        send: async () => {},
        leave: async () => {},
        getLatency: () => 0,
      };
    }

    const channel = this.client.channel(formattedChannelName, {
      config: {
        presence: { key: this.cachedProfile?.accountId || selfId },
        broadcast: { self: false, ack: false },
      },
    });

    this.roomChannel = channel;
    this.roomChannelStatus = 'CONNECTING';

    channel
      .on('broadcast', { event: 'party_msg' }, ({ payload }) => {
        onMessage(payload);
      })
      .on('presence', { event: 'sync' }, () => {
        if (onPresenceChange) {
          const presences = Object.values(channel.presenceState()).flat();
          onPresenceChange(presences);
        }
      });

    channel.subscribe((status) => {
      this.roomChannelStatus = status;
    });

    return {
      send: async (msg: any) => {
        try {
          await channel.send({
            type: 'broadcast',
            event: 'party_msg',
            payload: msg,
          });
        } catch (err) {
          this.setLastError(err);
        }
      },
      leave: async () => {
        try {
          await channel.untrack();
          await channel.unsubscribe();
        } catch {}
        this.roomChannel = null;
        this.roomChannelStatus = 'IDLE';
      },
      getLatency: () => 35,
    };
  }
}

export const SupabasePartyBackendInstance = new SupabasePartyBackendClass();
