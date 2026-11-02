# JTEC Party Module Architecture & Migration Guide

## 1. Overview
The `src/party` module provides social listening and synchronous audio room playback within JTEC MUSIC. It is completely isolated from the core player and offline library, ensuring zero regressions on the primary music playback experience.

The module interfaces with an abstract `PartyBackend` interface (`src/party/backend/types.ts`), allowing the app to run completely in offline/mock mode (`MockPartyBackend`) without external database dependencies, or seamlessly switch to a cloud-backed implementation (`SupabasePartyBackend`).

To toggle backends:
```env
VITE_PARTY_BACKEND=mock # default: uses on-device persistent storage (jtec_party_*) and simulated bots
# or:
VITE_PARTY_BACKEND=supabase # connects to remote Supabase tables and Realtime channels
```

---

## 2. Abstraction Layer: PartyBackend
All social and realtime operations flow through `PartyBackend`:
- **Accounts & Profiles**: `createProfile`, `loadProfile`, `updateProfile`, `deleteProfile`.
- **Social Graph & Friends**: `sendFriendRequest`, `acceptFriendRequest`, `declineFriendRequest`, `removeFriend`, `blockUser`, `unblockUser`, `listFriends`, `listFriendRequests`, `listBlockedUsers`.
- **Presence**: `getPresence`, `subscribePresence`.
- **Invites**: `sendInvite`, `listPendingInvites`, `acceptInvite`, `declineInvite`, `subscribeInvites`.
- **Realtime Transport**: `joinChannel` (broadcasts, heartbeat, latency ping/pong).

---

## 3. Future Supabase Implementation Schema (PostgreSQL / Supabase)

When adding `SupabasePartyBackend`, the following tables and RLS policies should be provisioned:

### 3.1 `party_profiles`
Stores user profile information. The profile is decoupled from global app auth:
```sql
create table if not exists public.party_profiles (
  id uuid primary key default gen_random_uuid(),
  username text not null check (char_length(username) >= 2 and char_length(username) <= 20),
  tag varchar(4) not null,
  avatar_url text,
  token_hash text not null,
  created_at timestamptz not null default now(),
  constraint unique_username_tag unique (username, tag)
);

-- Index for searching friends by Display ID ("Username #TAG")
create index idx_party_profiles_lookup on public.party_profiles (lower(username), upper(tag));

-- RLS: Public read, update only with valid token header
alter table public.party_profiles enable row level security;
create policy "Party profiles are viewable by everyone" on public.party_profiles for select using (true);
create policy "Users can insert their own profile" on public.party_profiles for insert with check (true);
```

### 3.2 `party_friendships`
Bidirectional or directed friend relations:
```sql
create table if not exists public.party_friendships (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.party_profiles(id) on delete cascade,
  user_b uuid not null references public.party_profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  constraint unique_friendship unique (user_a, user_b)
);

alter table public.party_friendships enable row level security;
create policy "Users see their friendships" on public.party_friendships 
  for select using (auth.uid() = user_a or auth.uid() = user_b);
```

### 3.3 `party_blocks`
Tracks blocked users so they cannot send requests, invites, or interact:
```sql
create table if not exists public.party_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.party_profiles(id) on delete cascade,
  blocked_id uuid not null references public.party_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint unique_block unique (blocker_id, blocked_id)
);

alter table public.party_blocks enable row level security;
```

### 3.4 `party_invites`
Party invitations between friends:
```sql
create table if not exists public.party_invites (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references public.party_profiles(id) on delete cascade,
  to_id uuid not null references public.party_profiles(id) on delete cascade,
  room_code varchar(6) not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now()
);

create index idx_party_invites_to on public.party_invites (to_id, status);
```

### 3.5 Realtime & Ephemeral Rooms
Party rooms use Supabase Realtime Channels (`party:room:<ROOM_CODE>`) with:
- **Presence**: Tracks who is active in the room, host/guest status, and round-trip latency.
- **Broadcast**: Fast UDP-like message delivery for player sync (`play`, `pause`, `seek`, `track_change`), emoji reactions, and skip voting. No persistent database row is required for transient playback packets.

---

## 4. Current Mock Implementation (`MockPartyBackend`)
The existing mock implementation persists data locally in `localStorage` under `jtec_party_*`:
- `jtec_party_profile`: Local profile with ID and secret token.
- `jtec_party_friends`: List of friends (seeds 3 initial bots: Sana, Tariq, Fatima).
- `jtec_party_requests`: Pending friend requests.
- `jtec_party_blocked`: Blocked profiles.
- `jtec_party_invites`: Pending invitations.

Simulated friends ("bots") automatically accept friend requests after 3 seconds, fluctuate online/offline states, and can be commanded via the hidden Developer Page (tap build 7 times) to simulate real-world social interaction.
