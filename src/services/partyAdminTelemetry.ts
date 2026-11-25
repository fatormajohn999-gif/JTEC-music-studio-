import { AppLogger } from './appLogger';
import {
  getPartySupabaseClient,
  getPartySupabaseConfigStatus,
  getPartySupabaseMaskedHost,
} from '../party/backend/supabaseClient';
import { getPartyBackendStatus } from '../party/backend';
import { PartyService } from '../party/PartyService';
import { sanitizeSecretText } from './supabase';

export interface PartyRegisteredUserTelemetry {
  accountId: string;
  partyId: string;
  username: string;
  avatarUrl: string | null;
  createdAt: number | null;
  lastSeenAt: number | null;
  lastSeenLabel: string;
  lastSeenSource: 'online_presence' | 'profile_timestamp' | 'local_presence_cache' | 'joined_fallback' | 'unknown';
  isOnline: boolean;
  friendsCount: number | null;
  invitesSentCount: number;
  invitesReceivedCount: number;
  isCurrentDeviceUser: boolean;
}

export interface PartyInviteActivityRow {
  id: string;
  roomCode: string;
  fromAccountId: string;
  fromUsername: string;
  toAccountId: string;
  toUsername: string;
  createdAt: number | null;
}

export interface PartyActivitySnapshot {
  isConfigured: boolean;
  configReason: string | null;
  maskedHost: string;
  fetchedAt: number;
  profilesAccessStatus: 'ready' | 'rls_restricted' | 'error' | 'not_configured';
  profilesError: string | null;
  totalRegisteredUsers: number | null;
  onlineUsersCount: number | null;
  onlineUsersReason: string | null;
  totalPartiesCreated: number | null;
  totalPartiesSourceLabel: string;
  totalInvitesCount: number | null;
  acceptedFriendshipsCount: number | null;
  pendingRequestsCount: number | null;
  users: PartyRegisteredUserTelemetry[];
  recentInvites: PartyInviteActivityRow[];
  deviceRoomEventsCount: number;
  activeRoomCode: string | null;
  activeRoomRealMembersCount: number;
}

function parseTimestampMs(raw: unknown): number | null {
  if (!raw) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const parsed = new Date(String(raw)).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function formatRelativeSeen(ts: number | null): string {
  if (!ts) return 'Not tracked';
  const diffMs = Math.max(0, Date.now() - ts);
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(ts).toLocaleDateString();
}

export async function fetchPartyAdminTelemetry(): Promise<PartyActivitySnapshot> {
  const cfg = getPartySupabaseConfigStatus();
  const maskedHost = getPartySupabaseMaskedHost();
  const backendStatus = getPartyBackendStatus();
  const partyState = PartyService.getState();
  const partyDiag = PartyService.getDiagnostics();
  const now = Date.now();

  // Real local device party room logs (never includes simulated bots)
  const partyLogs = AppLogger.getLogs({ project: 'jtec_party' });
  const deviceRoomCodes = new Set<string>();
  let deviceRoomEventsCount = 0;

  for (const log of partyLogs) {
    if (
      log.event === 'party_channel_subscribed' ||
      log.event === 'party_room_connecting'
    ) {
      deviceRoomEventsCount += 1;
      const rc = log.details?.roomCode;
      if (typeof rc === 'string' && rc.trim() && rc.trim() !== 'BOT999') {
        deviceRoomCodes.add(rc.trim().toUpperCase());
      }
    }
  }

  if (partyState.roomCode && partyState.roomCode !== 'BOT999') {
    deviceRoomCodes.add(partyState.roomCode);
  }

  if (!cfg.isConfigured) {
    return {
      isConfigured: false,
      configReason: cfg.reason || 'VITE_PARTY_SUPABASE_URL and VITE_PARTY_SUPABASE_ANON_KEY are missing.',
      maskedHost,
      fetchedAt: now,
      profilesAccessStatus: 'not_configured',
      profilesError: cfg.reason,
      totalRegisteredUsers: null,
      onlineUsersCount: null,
      onlineUsersReason: cfg.reason,
      totalPartiesCreated: null,
      totalPartiesSourceLabel: 'Unavailable (Party Supabase not configured)',
      totalInvitesCount: null,
      acceptedFriendshipsCount: null,
      pendingRequestsCount: null,
      users: [],
      recentInvites: [],
      deviceRoomEventsCount,
      activeRoomCode: partyState.roomCode && partyState.roomCode !== 'BOT999' ? partyState.roomCode : null,
      activeRoomRealMembersCount: partyDiag.realParticipantsCount,
    };
  }

  const client = getPartySupabaseClient();
  if (!client) {
    return {
      isConfigured: false,
      configReason: 'Failed to initialize JTEC Party Supabase client.',
      maskedHost,
      fetchedAt: now,
      profilesAccessStatus: 'error',
      profilesError: 'JTEC Party Supabase client unavailable.',
      totalRegisteredUsers: null,
      onlineUsersCount: backendStatus.onlineUsersCount ?? null,
      onlineUsersReason: backendStatus.onlineUsersUnavailableReason || null,
      totalPartiesCreated: null,
      totalPartiesSourceLabel: 'Unavailable',
      totalInvitesCount: null,
      acceptedFriendshipsCount: null,
      pendingRequestsCount: null,
      users: [],
      recentInvites: [],
      deviceRoomEventsCount,
      activeRoomCode: partyState.roomCode && partyState.roomCode !== 'BOT999' ? partyState.roomCode : null,
      activeRoomRealMembersCount: partyDiag.realParticipantsCount,
    };
  }

  // Query existing JTEC Party tables in parallel (read-only)
  const [profilesRes, invitesRes, friendshipsRes] = await Promise.allSettled([
    client
      .from('profiles')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(200),
    client
      .from('invites')
      .select('id, from_id, to_id, room_code, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(100),
    client
      .from('friendships')
      .select('id, requester, addressee, status, created_at', { count: 'exact' })
      .limit(250),
  ]);

  let profilesAccessStatus: PartyActivitySnapshot['profilesAccessStatus'] = 'ready';
  let profilesError: string | null = null;
  let profileRows: any[] = [];
  let totalRegisteredUsers: number | null = null;

  if (profilesRes.status === 'fulfilled') {
    const { data, error, count, status } = profilesRes.value as any;
    if (error) {
      const msg = sanitizeSecretText(error.message || 'Could not query profiles.');
      const lower = msg.toLowerCase();
      if (status === 401 || status === 403 || error.code === '42501' || lower.includes('permission denied') || lower.includes('rls')) {
        profilesAccessStatus = 'rls_restricted';
        profilesError = 'Row-level security limits public directory listing on profiles. Showing only records accessible to the current Party session.';
      } else {
        profilesAccessStatus = 'error';
        profilesError = msg;
      }
    } else {
      profileRows = Array.isArray(data) ? data : [];
      totalRegisteredUsers = typeof count === 'number' ? count : profileRows.length;
    }
  } else {
    profilesAccessStatus = 'error';
    profilesError = sanitizeSecretText(profilesRes.reason);
  }

  let inviteRows: any[] = [];
  let totalInvitesCount: number | null = null;
  if (invitesRes.status === 'fulfilled') {
    const { data, error, count } = invitesRes.value as any;
    if (!error) {
      inviteRows = Array.isArray(data) ? data : [];
      totalInvitesCount = typeof count === 'number' ? count : inviteRows.length;
    }
  }

  let friendshipRows: any[] = [];
  let acceptedFriendshipsCount: number | null = null;
  let pendingRequestsCount: number | null = null;
  if (friendshipsRes.status === 'fulfilled') {
    const { data, error } = friendshipsRes.value as any;
    if (!error && Array.isArray(data)) {
      friendshipRows = data;
      acceptedFriendshipsCount = friendshipRows.filter((r) => r.status === 'accepted').length;
      pendingRequestsCount = friendshipRows.filter((r) => r.status === 'pending').length;
    }
  }

  // Fallback: if profiles table returned empty/restricted under RLS, ensure currently signed-in device Party profile (if any) is checked
  if (profileRows.length === 0 && backendStatus.accountId) {
    try {
      const { data: selfRow } = await client
        .from('profiles')
        .select('*')
        .eq('id', backendStatus.accountId)
        .maybeSingle();
      if (selfRow) {
        profileRows = [selfRow];
        if (totalRegisteredUsers === null) totalRegisteredUsers = 1;
      }
    } catch {
      // keep honest empty state
    }
  }

  // Also resolve any invite/friend profile IDs via existing safe RPC get_profiles if available
  const extraIds = new Set<string>();
  const knownIds = new Set<string>(profileRows.map((p) => String(p.id)));
  inviteRows.forEach((inv) => {
    if (inv.from_id && !knownIds.has(inv.from_id)) extraIds.add(inv.from_id);
    if (inv.to_id && !knownIds.has(inv.to_id)) extraIds.add(inv.to_id);
  });

  if (extraIds.size > 0) {
    try {
      const { data: extraProfiles } = await client.rpc('get_profiles', {
        p_ids: Array.from(extraIds).slice(0, 50),
      });
      if (Array.isArray(extraProfiles)) {
        extraProfiles.forEach((p: any) => {
          if (p?.id && !knownIds.has(p.id)) {
            knownIds.add(p.id);
            profileRows.push(p);
          }
        });
      }
    } catch {
      // ignore if RPC requires session
    }
  }

  // Collect online account IDs from real active room members (non-bot)
  const activeRoomOnlineIds = new Set<string>();
  partyState.members
    .filter((m) => !m.id.startsWith('bot_'))
    .forEach((m) => {
      if (m.accountId) activeRoomOnlineIds.add(m.accountId);
    });
  if (backendStatus.accountId && backendStatus.onlineChannelState === 'SUBSCRIBED') {
    activeRoomOnlineIds.add(backendStatus.accountId);
  }

  // Per-user social & invite counts
  const friendsPerUser = new Map<string, number>();
  friendshipRows
    .filter((r) => r.status === 'accepted')
    .forEach((r) => {
      friendsPerUser.set(r.requester, (friendsPerUser.get(r.requester) || 0) + 1);
      friendsPerUser.set(r.addressee, (friendsPerUser.get(r.addressee) || 0) + 1);
    });

  const invitesSentMap = new Map<string, number>();
  const invitesReceivedMap = new Map<string, number>();
  const inviteRoomCodes = new Set<string>();

  inviteRows.forEach((inv) => {
    if (inv.from_id) invitesSentMap.set(inv.from_id, (invitesSentMap.get(inv.from_id) || 0) + 1);
    if (inv.to_id) invitesReceivedMap.set(inv.to_id, (invitesReceivedMap.get(inv.to_id) || 0) + 1);
    if (inv.room_code) inviteRoomCodes.add(String(inv.room_code).trim().toUpperCase());
  });

  const usersById = new Map<string, PartyRegisteredUserTelemetry>();
  let summedProfilePartiesCreated = 0;
  let hasProfilePartiesColumn = false;

  for (const row of profileRows) {
    const accountId = String(row.id || '');
    if (!accountId) continue;

    if (typeof row.parties_created === 'number') {
      hasProfilePartiesColumn = true;
      summedProfilePartiesCreated += row.parties_created;
    }

    const createdAt = parseTimestampMs(row.created_at);
    const explicitLastSeen = parseTimestampMs(row.last_seen || row.updated_at);

    let cachedPresenceTs: number | null = null;
    try {
      const rawCached = localStorage.getItem(`jtec_party_last_seen_${accountId}`);
      if (rawCached) cachedPresenceTs = parseTimestampMs(Number(rawCached));
    } catch {
      // ignore storage errors
    }

    const isOnline = activeRoomOnlineIds.has(accountId);
    let lastSeenAt: number | null = explicitLastSeen || cachedPresenceTs;
    let lastSeenSource: PartyRegisteredUserTelemetry['lastSeenSource'] = 'unknown';

    if (isOnline) {
      lastSeenAt = now;
      lastSeenSource = 'online_presence';
    } else if (explicitLastSeen) {
      lastSeenSource = 'profile_timestamp';
    } else if (cachedPresenceTs) {
      lastSeenSource = 'local_presence_cache';
    } else if (createdAt) {
      lastSeenAt = createdAt;
      lastSeenSource = 'joined_fallback';
    }

    usersById.set(accountId, {
      accountId,
      partyId: String(row.party_id || accountId.slice(0, 8).toUpperCase()),
      username: String(row.username || 'Unnamed User'),
      avatarUrl: row.avatar || null,
      createdAt,
      lastSeenAt,
      lastSeenLabel: isOnline
        ? 'Online now'
        : lastSeenSource === 'joined_fallback'
        ? `Joined ${formatRelativeSeen(lastSeenAt)}`
        : formatRelativeSeen(lastSeenAt),
      lastSeenSource,
      isOnline,
      friendsCount: friendshipRows.length > 0 ? friendsPerUser.get(accountId) ?? 0 : null,
      invitesSentCount: invitesSentMap.get(accountId) || 0,
      invitesReceivedCount: invitesReceivedMap.get(accountId) || 0,
      isCurrentDeviceUser: Boolean(backendStatus.accountId && backendStatus.accountId === accountId),
    });
  }

  const users = Array.from(usersById.values()).sort((a, b) => {
    if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
    return (b.lastSeenAt || b.createdAt || 0) - (a.lastSeenAt || a.createdAt || 0);
  });

  const recentInvites: PartyInviteActivityRow[] = inviteRows.slice(0, 20).map((inv) => {
    const fromUser = usersById.get(inv.from_id);
    const toUser = usersById.get(inv.to_id);
    return {
      id: String(inv.id),
      roomCode: String(inv.room_code || '------'),
      fromAccountId: String(inv.from_id || ''),
      fromUsername: fromUser?.username || `User ${String(inv.from_id || '').slice(0, 6)}`,
      toAccountId: String(inv.to_id || ''),
      toUsername: toUser?.username || `User ${String(inv.to_id || '').slice(0, 6)}`,
      createdAt: parseTimestampMs(inv.created_at),
    };
  });

  // Honest total parties count from observable data (never fabricated)
  const combinedObservedRoomCodes = new Set<string>([...inviteRoomCodes, ...deviceRoomCodes]);
  let totalPartiesCreated: number | null = null;
  let totalPartiesSourceLabel = 'No global parties table in schema';

  if (hasProfilePartiesColumn) {
    totalPartiesCreated = summedProfilePartiesCreated;
    totalPartiesSourceLabel = 'Summed from profile telemetry';
  } else if (combinedObservedRoomCodes.size > 0) {
    totalPartiesCreated = combinedObservedRoomCodes.size;
    totalPartiesSourceLabel =
      inviteRoomCodes.size > 0 && deviceRoomCodes.size > 0
        ? 'Unique room codes (invites + this device)'
        : inviteRoomCodes.size > 0
        ? 'Unique room codes from invites'
        : 'Rooms created/joined on this device';
  } else if (profilesAccessStatus === 'ready') {
    totalPartiesCreated = 0;
    totalPartiesSourceLabel = 'Observed via invites & device room logs';
  }

  return {
    isConfigured: true,
    configReason: null,
    maskedHost,
    fetchedAt: now,
    profilesAccessStatus,
    profilesError,
    totalRegisteredUsers,
    onlineUsersCount: backendStatus.onlineUsersCount ?? null,
    onlineUsersReason: backendStatus.onlineUsersUnavailableReason || null,
    totalPartiesCreated,
    totalPartiesSourceLabel,
    totalInvitesCount,
    acceptedFriendshipsCount,
    pendingRequestsCount,
    users,
    recentInvites,
    deviceRoomEventsCount,
    activeRoomCode: partyState.roomCode && partyState.roomCode !== 'BOT999' ? partyState.roomCode : null,
    activeRoomRealMembersCount: partyDiag.realParticipantsCount,
  };
}
