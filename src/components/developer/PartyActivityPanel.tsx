import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  Database,
  Radio,
  RefreshCw,
  Search,
  Users,
  Wifi,
  Clock,
  Send,
} from 'lucide-react';
import { BackendPartyStatus } from '../../party/backend/types';
import { PartyServiceDiagnostics } from '../../party/PartyService';
import { PartyState } from '../../party/types';
import { PartyActivitySnapshot } from '../../services/partyAdminTelemetry';

interface PartyActivityPanelProps {
  partyStatus: BackendPartyStatus;
  partyDiagnostics: PartyServiceDiagnostics;
  partyLiveState: PartyState;
  partyActivity: PartyActivitySnapshot | null;
  isLoading: boolean;
  onRefresh: () => void;
  formatTimestamp: (ts: number | null) => string;
}

const UserAvatarChip: React.FC<{ username: string; avatarUrl: string | null }> = ({
  username,
  avatarUrl,
}) => {
  const [imgError, setImgError] = useState(false);
  const initial = (username.trim().charAt(0) || 'U').toUpperCase();

  if (avatarUrl && !imgError) {
    return (
      <img
        src={avatarUrl}
        alt={username}
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        className="w-9 h-9 rounded-full object-cover border border-slate-700 shrink-0 bg-slate-800"
      />
    );
  }

  return (
    <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-cyan-300 shrink-0">
      {initial}
    </div>
  );
};

export const PartyActivityPanel: React.FC<PartyActivityPanelProps> = ({
  partyStatus,
  partyDiagnostics,
  partyLiveState,
  partyActivity,
  isLoading,
  onRefresh,
  formatTimestamp,
}) => {
  const [userSearch, setUserSearch] = useState('');
  const [userPresenceFilter, setUserPresenceFilter] = useState<'all' | 'online'>('all');

  const users = partyActivity?.users || [];
  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return users.filter((u) => {
      if (userPresenceFilter === 'online' && !u.isOnline) return false;
      if (!q) return true;
      return (
        u.username.toLowerCase().includes(q) ||
        u.partyId.toLowerCase().includes(q) ||
        u.accountId.toLowerCase().includes(q)
      );
    });
  }, [users, userSearch, userPresenceFilter]);

  const syncLogs = partyLiveState.syncLogs || [];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
            <Radio className="w-5 h-5 text-cyan-400 shrink-0" />
            <span>Party Users &amp; Activity</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5 break-words">
            Dedicated Party Supabase project:{' '}
            <span className="font-mono text-cyan-300">
              {partyActivity?.maskedHost || partyDiagnostics.maskedHost}
            </span>
            {partyActivity?.fetchedAt ? ` · Updated ${formatTimestamp(partyActivity.fetchedAt)}` : ''}
          </p>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="min-h-[40px] px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50 shrink-0 self-start sm:self-auto whitespace-nowrap"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>{isLoading ? 'Refreshing...' : 'Refresh Activity'}</span>
        </button>
      </div>

      {/* Configuration / RLS Availability Notice */}
      {partyActivity && !partyActivity.isConfigured && (
        <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/35 text-xs text-rose-200 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1 min-w-0">
            <p className="font-semibold text-white">JTEC Party Supabase is not configured</p>
            <p className="text-rose-200/90 break-words">
              {partyActivity.configReason ||
                'Missing VITE_PARTY_SUPABASE_URL or VITE_PARTY_SUPABASE_ANON_KEY in this build.'}
            </p>
          </div>
        </div>
      )}

      {partyActivity?.isConfigured && partyActivity.profilesError && (
        <div className="p-4 rounded-2xl bg-amber-950/35 border border-amber-500/35 text-xs text-amber-200 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1 min-w-0">
            <p className="font-semibold text-amber-100">
              {partyActivity.profilesAccessStatus === 'rls_restricted'
                ? 'Limited profile visibility under database security rules'
                : 'Could not load Party profiles'}
            </p>
            <p className="text-amber-200/90 break-words">{partyActivity.profilesError}</p>
          </div>
        </div>
      )}

      {/* Activity Overview KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 space-y-1">
          <span className="text-xs font-medium text-slate-400 block">Registered Users</span>
          <div className="text-2xl font-bold text-white font-mono tabular-nums">
            {isLoading && !partyActivity
              ? '—'
              : partyActivity?.totalRegisteredUsers !== null &&
                partyActivity?.totalRegisteredUsers !== undefined
              ? partyActivity.totalRegisteredUsers.toLocaleString()
              : 'Unavailable'}
          </div>
          <span className="text-[11px] text-slate-400 block">
            {partyActivity?.profilesAccessStatus === 'ready'
              ? 'From profiles table'
              : partyActivity?.profilesAccessStatus === 'rls_restricted'
              ? 'Restricted by RLS'
              : 'Requires Party Supabase'}
          </span>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 space-y-1">
          <span className="text-xs font-medium text-slate-400 block">Online Now</span>
          <div className="text-2xl font-bold text-emerald-300 font-mono tabular-nums">
            {typeof partyActivity?.onlineUsersCount === 'number'
              ? partyActivity.onlineUsersCount.toLocaleString()
              : typeof partyStatus.onlineUsersCount === 'number'
              ? partyStatus.onlineUsersCount.toLocaleString()
              : 'Unavailable'}
          </div>
          <span className="text-[11px] text-slate-400 block truncate" title={partyActivity?.onlineUsersReason || partyStatus.onlineUsersUnavailableReason || ''}>
            {typeof partyStatus.onlineUsersCount === 'number'
              ? 'Live Realtime presence'
              : partyStatus.onlineUsersUnavailableReason || 'No active presence channel'}
          </span>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 space-y-1">
          <span className="text-xs font-medium text-slate-400 block">Parties Observed</span>
          <div className="text-2xl font-bold text-cyan-300 font-mono tabular-nums">
            {isLoading && !partyActivity
              ? '—'
              : partyActivity?.totalPartiesCreated !== null &&
                partyActivity?.totalPartiesCreated !== undefined
              ? partyActivity.totalPartiesCreated.toLocaleString()
              : 'Unavailable'}
          </div>
          <span className="text-[11px] text-slate-400 block truncate" title={partyActivity?.totalPartiesSourceLabel || ''}>
            {partyActivity?.totalPartiesSourceLabel || 'Observed room codes'}
          </span>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 space-y-1">
          <span className="text-xs font-medium text-slate-400 block">Social &amp; Invites</span>
          <div className="text-base sm:text-lg font-bold text-white font-mono tabular-nums pt-1">
            {partyActivity?.totalInvitesCount !== null &&
            partyActivity?.totalInvitesCount !== undefined
              ? `${partyActivity.totalInvitesCount} inv`
              : '— inv'}
            <span className="text-slate-500 mx-1.5">·</span>
            {partyActivity?.acceptedFriendshipsCount !== null &&
            partyActivity?.acceptedFriendshipsCount !== undefined
              ? `${partyActivity.acceptedFriendshipsCount} friends`
              : '— friends'}
          </div>
          <span className="text-[11px] text-slate-400 block">
            {partyActivity?.pendingRequestsCount !== null &&
            partyActivity?.pendingRequestsCount !== undefined
              ? `${partyActivity.pendingRequestsCount} pending requests`
              : 'Visible social rows'}
          </span>
        </div>
      </div>

      {/* Live Realtime & Session Network Diagnostics */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800/80">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-cyan-400 shrink-0">
              <Wifi className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-bold text-white">Party Network &amp; Session Telemetry</h4>
              <p className="text-xs text-slate-400 truncate">
                Live Realtime channels and active device session state
              </p>
            </div>
          </div>

          <span
            className={`self-start sm:self-auto px-2.5 py-1 rounded-lg text-[11px] font-semibold border whitespace-nowrap ${
              partyStatus.backendType === 'Supabase' && partyDiagnostics.isConfigured
                ? 'bg-emerald-500/12 border-emerald-500/35 text-emerald-300'
                : 'bg-rose-500/12 border-rose-500/35 text-rose-300'
            }`}
          >
            {partyDiagnostics.isConfigured ? 'Supabase Connected Config' : 'Not Configured'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-slate-950/75 border border-slate-800/80 space-y-1">
            <span className="text-[11px] text-slate-400 block">Current Device Party ID</span>
            <span className="font-mono font-semibold text-white block truncate">
              {partyStatus.partyId || partyLiveState.partyId || 'No active profile'}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/75 border border-slate-800/80 space-y-1">
            <span className="text-[11px] text-slate-400 block">Online Presence Channel</span>
            <span className="font-mono font-semibold text-cyan-300 block">
              {partyStatus.onlineChannelState || 'DISCONNECTED'}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/75 border border-slate-800/80 space-y-1">
            <span className="text-[11px] text-slate-400 block">Notifications Channel</span>
            <span className="font-mono font-semibold text-slate-200 block">
              {partyStatus.notificationsChannelState || 'IDLE'}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/75 border border-slate-800/80 space-y-1">
            <span className="text-[11px] text-slate-400 block">Active Room Channel</span>
            <span className="font-mono font-semibold text-white block truncate">
              {partyDiagnostics.roomCode && !partyDiagnostics.isBotDemoRoom
                ? `${partyDiagnostics.roomCode} (${partyDiagnostics.connectionStatus})`
                : partyStatus.roomChannelState || 'IDLE'}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/75 border border-slate-800/80 space-y-1">
            <span className="text-[11px] text-slate-400 block">Device Room Events</span>
            <span className="font-mono tabular-nums font-semibold text-slate-200 block">
              {partyActivity?.deviceRoomEventsCount ?? 0} connection events
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/75 border border-slate-800/80 space-y-1">
            <span className="text-[11px] text-slate-400 block">Most Recent Party Error</span>
            <span
              className={`font-mono block break-words ${
                partyDiagnostics.lastErrorMessage || partyStatus.lastError
                  ? 'text-rose-300 font-semibold'
                  : 'text-slate-400'
              }`}
            >
              {partyDiagnostics.lastErrorMessage || partyStatus.lastError || 'None'}
            </span>
          </div>
        </div>
      </section>

      {/* Registered Party Users Directory */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-cyan-400 shrink-0">
              <Users className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-bold text-white">Registered Party Users</h4>
              <p className="text-xs text-slate-400">
                Showing {filteredUsers.length} of {users.length} visible user{' '}
                {users.length === 1 ? 'record' : 'records'}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search username or Party ID..."
                className="w-full sm:w-56 min-h-[38px] pl-8 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
              />
            </div>

            <div className="inline-flex rounded-xl bg-slate-950 p-1 border border-slate-800 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setUserPresenceFilter('all')}
                className={`min-h-[30px] px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                  userPresenceFilter === 'all'
                    ? 'bg-cyan-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                All ({users.length})
              </button>
              <button
                type="button"
                onClick={() => setUserPresenceFilter('online')}
                className={`min-h-[30px] px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                  userPresenceFilter === 'online'
                    ? 'bg-cyan-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Online ({users.filter((u) => u.isOnline).length})
              </button>
            </div>
          </div>
        </div>

        {isLoading && !partyActivity ? (
          <div className="py-10 px-4 rounded-xl bg-slate-950/60 border border-slate-800 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin" />
            <span>Loading registered Party profiles from Supabase...</span>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-10 px-4 rounded-xl bg-slate-950/60 border border-slate-800 text-center space-y-2">
            <Database className="w-6 h-6 text-slate-500 mx-auto" />
            <p className="text-xs font-semibold text-slate-200">
              {userSearch || userPresenceFilter === 'online'
                ? 'No Party users match your current filter'
                : 'No registered Party user records available'}
            </p>
            <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              {!partyActivity?.isConfigured
                ? 'Configure VITE_PARTY_SUPABASE_URL and VITE_PARTY_SUPABASE_ANON_KEY to inspect Party accounts.'
                : partyActivity?.profilesAccessStatus === 'rls_restricted'
                ? 'Database RLS policies prevent anonymous listing of other accounts. Sign into a Party profile or adjust admin/read policies if directory listing is desired.'
                : 'Registered users from the JTEC Party profiles table will appear here once accounts are created.'}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-800/80 bg-slate-950/60">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/90 text-[11px] font-semibold text-slate-400">
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Party ID</th>
                    <th className="py-3 px-4">Status / Last Seen</th>
                    <th className="py-3 px-4">Activity</th>
                    <th className="py-3 px-4 text-right">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {filteredUsers.map((u) => (
                    <tr key={u.accountId} className="hover:bg-slate-900/60 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <UserAvatarChip username={u.username} avatarUrl={u.avatarUrl} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-white truncate max-w-[180px]">
                                {u.username}
                              </span>
                              {u.isCurrentDeviceUser && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/35 text-cyan-300">
                                  This device
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] font-mono text-slate-500 block truncate max-w-[200px]">
                              {u.accountId}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums font-semibold text-cyan-300 whitespace-nowrap">
                        {u.partyId}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${
                            u.isOnline
                              ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300'
                              : 'bg-slate-900 border-slate-700/80 text-slate-300'
                          }`}
                        >
                          {u.isOnline ? (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          ) : (
                            <Clock className="w-3 h-3 text-slate-400" />
                          )}
                          <span>{u.lastSeenLabel}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-slate-300 whitespace-nowrap">
                        {u.friendsCount !== null ? `${u.friendsCount} friends` : 'Friends: N/A'}
                        {' · '}
                        {u.invitesSentCount} sent / {u.invitesReceivedCount} recv
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-400 whitespace-nowrap">
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'Unknown'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-2.5">
              {filteredUsers.map((u) => (
                <div
                  key={u.accountId}
                  className="p-3.5 rounded-xl bg-slate-950/75 border border-slate-800 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <UserAvatarChip username={u.username} avatarUrl={u.avatarUrl} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-bold text-white truncate">
                            {u.username}
                          </span>
                          {u.isCurrentDeviceUser && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/35 text-cyan-300">
                              You
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-mono tabular-nums text-cyan-300 block">
                          ID: {u.partyId}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold border shrink-0 whitespace-nowrap ${
                        u.isOnline
                          ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300'
                          : 'bg-slate-900 border-slate-700/80 text-slate-300'
                      }`}
                    >
                      {u.isOnline ? (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      ) : (
                        <Clock className="w-3 h-3 text-slate-400" />
                      )}
                      <span>{u.lastSeenLabel}</span>
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80 text-[11px]">
                    <div>
                      <span className="text-slate-400 block">Activity</span>
                      <span className="font-mono tabular-nums text-slate-200">
                        {u.friendsCount !== null ? `${u.friendsCount} friends · ` : ''}
                        {u.invitesSentCount}↑ / {u.invitesReceivedCount}↓ inv
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-400 block">Joined</span>
                      <span className="font-mono tabular-nums text-slate-300">
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'Unknown'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Bottom 2-Column Activity Split: Recent Invites & Sync Engine Log */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Room Invites */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 space-y-3">
          <div className="flex items-center gap-2.5 pb-2.5 border-b border-slate-800/80">
            <Send className="w-4 h-4 text-cyan-400 shrink-0" />
            <div>
              <h4 className="text-sm font-bold text-white">Recent Party Invites</h4>
              <p className="text-xs text-slate-400">Latest rows from the Party invites table</p>
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto space-y-2 pr-0.5">
            {!partyActivity?.recentInvites || partyActivity.recentInvites.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 rounded-xl bg-slate-950/60 border border-slate-800/80">
                No recent party invites visible.
              </div>
            ) : (
              partyActivity.recentInvites.map((inv) => (
                <div
                  key={inv.id}
                  className="p-3 rounded-xl bg-slate-950/75 border border-slate-800/80 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <p className="text-slate-100 font-medium truncate">
                      {inv.fromUsername} → {inv.toUsername}
                    </p>
                    <p className="text-[11px] font-mono text-cyan-300 mt-0.5">
                      Room {inv.roomCode}
                    </p>
                  </div>
                  <span className="text-[11px] font-mono tabular-nums text-slate-400 shrink-0">
                    {formatTimestamp(inv.createdAt)}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Live Party Sync Engine Log */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 space-y-3">
          <div className="flex items-center gap-2.5 pb-2.5 border-b border-slate-800/80">
            <Activity className="w-4 h-4 text-cyan-400 shrink-0" />
            <div>
              <h4 className="text-sm font-bold text-white">Party Sync Engine Log</h4>
              <p className="text-xs text-slate-400">
                Recent sync, seek, drift &amp; deduplication events on this device
              </p>
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto space-y-2 pr-0.5">
            {syncLogs.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 rounded-xl bg-slate-950/60 border border-slate-800/80">
                No sync events recorded yet on this device.
              </div>
            ) : (
              syncLogs.map((log) => {
                const timeStr =
                  new Date(log.timestamp).toLocaleTimeString('en-US', {
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  }) +
                  '.' +
                  (log.timestamp % 1000).toString().padStart(3, '0');

                const badgeColor =
                  log.type === 'seek_performed'
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/35'
                    : log.type === 'drift_corrected'
                    ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/35'
                    : log.type === 'duplicate_dropped'
                    ? 'bg-rose-500/15 text-rose-300 border-rose-500/35'
                    : 'bg-slate-800 text-slate-200 border-slate-700';

                return (
                  <div
                    key={log.id}
                    className="p-2.5 rounded-xl bg-slate-950/75 border border-slate-800/80 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className={`px-2 py-0.5 rounded font-semibold border ${badgeColor}`}>
                        {log.type.replace('_', ' ')}
                      </span>
                      <span className="font-mono tabular-nums text-slate-400">{timeStr}</span>
                    </div>
                    <p className="text-slate-200 text-xs leading-snug break-words">{log.summary}</p>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
