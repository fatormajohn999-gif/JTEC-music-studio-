-- ==============================================================================
-- JTEC LOVE & CHILL (TARGET: love_chill ONLY) — OWNER AUTH, AAL2 & STORAGE RLS
-- ==============================================================================
-- Run this script ONLY in the `love_chill` Supabase Dashboard -> SQL Editor.
-- Do NOT run this script on `jtec_main`, `nasheed`, or `jtec-party`.
--
-- Prerequisites:
-- 1. Run `supabase/checks/love_chill_pre_migration_audit.sql` first and save baselines.
-- 2. Confirm `fatormajohn999@gmail.com` exists in `love_chill` Authentication -> Users
--    with a verified email, and enable TOTP MFA under Authentication -> Multi-Factor Auth.
--
-- Security guarantees:
-- 1. Owner-only authorization (`public.admin_users`, `role = 'owner'` only):
--    zero non-owner admins, zero client INSERT/UPDATE/DELETE, zero `app_metadata` bypass.
-- 2. Mandatory TOTP MFA (`aal2`) for every database or storage write operation.
-- 3. Public listeners (`anon`, `authenticated`) can read/stream/download `songs`,
--    `'music'`, and `'artwork'`, while uploads/edits/replacements/deletes are blocked
--    unless verified as active owner at AAL2.
-- 4. Preserves all existing Love & Chill songs, metadata, and storage objects.
-- 5. Immutable `public.admin_audit_logs` + automatic `audit_song_mutations` trigger.
-- ==============================================================================

begin;

-- 1. Owner-Only Admins Table (zero client writes; `role = 'owner'` strictly enforced)
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role text not null default 'owner' check (role = 'owner'),
  is_active boolean not null default true,
  created_at timestamptz not null default pg_catalog.timezone('utc', pg_catalog.now())
);

alter table public.admin_users enable row level security;
alter table public.admin_users force row level security;

revoke all on table public.admin_users from public, anon, authenticated;
grant select on table public.admin_users to authenticated;

-- Seed ONLY the authorized owner account (never reactivates if disabled later)
insert into public.admin_users (user_id, email, role, is_active)
select u.id, pg_catalog.lower(u.email), 'owner', true
from auth.users u
where pg_catalog.lower(u.email) = 'fatormajohn999@gmail.com'
  and pg_catalog.coalesce(u.is_anonymous, false) = false
  and u.email_confirmed_at is not null
on conflict (user_id) do nothing;

-- 2. Immutable Admin & Music Audit Log Table (isolated to `love_chill`)
create table if not exists public.admin_audit_logs (
  id bigint generated always as identity primary key,
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  admin_email text,
  project_scope text not null default 'love_chill',
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.timezone('utc', pg_catalog.now())
);

alter table public.admin_audit_logs add column if not exists project_scope text not null default 'love_chill';

alter table public.admin_audit_logs enable row level security;
alter table public.admin_audit_logs force row level security;

revoke all on table public.admin_audit_logs from public, anon, authenticated;
grant select on table public.admin_audit_logs to authenticated;

-- 3. Non-destructive `public.songs` creation & column alignment for Love & Chill
create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist text default 'Unknown Artist',
  album text default 'Single',
  genre text default 'Love & Chill',
  duration numeric default 0,
  file_name text not null default 'track.mp3',
  storage_path text not null default '',
  file_path text not null default '',
  file_size bigint not null default 0,
  file_type text default 'audio/mpeg',
  public_url text not null default '',
  audio_url text not null default '',
  artwork_url text,
  cover_url text,
  file_hash text,
  created_at timestamptz not null default pg_catalog.timezone('utc', pg_catalog.now()),
  updated_at timestamptz not null default pg_catalog.timezone('utc', pg_catalog.now())
);

alter table public.songs add column if not exists title text;
alter table public.songs add column if not exists artist text default 'Unknown Artist';
alter table public.songs add column if not exists album text default 'Single';
alter table public.songs add column if not exists genre text default 'Love & Chill';
alter table public.songs add column if not exists duration numeric default 0;
alter table public.songs add column if not exists file_name text;
alter table public.songs add column if not exists storage_path text default '';
alter table public.songs add column if not exists file_path text default '';
alter table public.songs add column if not exists file_size bigint default 0;
alter table public.songs add column if not exists file_type text default 'audio/mpeg';
alter table public.songs add column if not exists public_url text default '';
alter table public.songs add column if not exists audio_url text default '';
alter table public.songs add column if not exists artwork_url text;
alter table public.songs add column if not exists cover_url text;
alter table public.songs add column if not exists file_hash text;
alter table public.songs add column if not exists created_at timestamptz default pg_catalog.timezone('utc', pg_catalog.now());
alter table public.songs add column if not exists updated_at timestamptz default pg_catalog.timezone('utc', pg_catalog.now());

create index if not exists idx_songs_created_at on public.songs (created_at desc);
create index if not exists idx_songs_title on public.songs (title);
create index if not exists idx_songs_artist on public.songs (artist);
create index if not exists idx_songs_file_hash on public.songs (file_hash) where file_hash is not null;

create or replace function public.touch_songs_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := pg_catalog.timezone('utc', pg_catalog.now());
  return new;
end;
$$;

drop trigger if exists trg_touch_songs_updated_at on public.songs;
create trigger trg_touch_songs_updated_at
  before update on public.songs
  for each row
  execute function public.touch_songs_updated_at();

-- 4. Drop ALL existing policies on protected Love & Chill tables & storage buckets cleanly
do $$
declare
  v_pol record;
begin
  for v_pol in
    select schemaname, tablename, policyname
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename in ('admin_users', 'admin_audit_logs', 'songs')
  loop
    execute pg_catalog.format(
      'drop policy if exists %I on %I.%I',
      v_pol.policyname,
      v_pol.schemaname,
      v_pol.tablename
    );
  end loop;
end
$$;

do $$
declare
  v_pol record;
begin
  for v_pol in
    select schemaname, tablename, policyname
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        pg_catalog.coalesce(qual, '') ilike '%music%'
        or pg_catalog.coalesce(with_check, '') ilike '%music%'
        or pg_catalog.coalesce(qual, '') ilike '%artwork%'
        or pg_catalog.coalesce(with_check, '') ilike '%artwork%'
        or policyname ilike '%music%'
        or policyname ilike '%artwork%'
      )
  loop
    execute pg_catalog.format(
      'drop policy if exists %I on %I.%I',
      v_pol.policyname,
      v_pol.schemaname,
      v_pol.tablename
    );
  end loop;
end
$$;

-- `admin_users`: owner reads own row only
create policy "Owner can view own admin row"
  on public.admin_users
  for select
  to authenticated
  using (auth.uid() = user_id);

-- 5. Owner-Only Authoritative Helpers & Mandatory TOTP MFA (`aal2`)
create or replace function public.is_jtec_owner()
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_jwt jsonb := auth.jwt();
  v_is_anon boolean := pg_catalog.coalesce((v_jwt ->> 'is_anonymous')::boolean, false);
  v_provider text := pg_catalog.coalesce(v_jwt -> 'app_metadata' ->> 'provider', '');
  v_amr jsonb := pg_catalog.coalesce(v_jwt -> 'amr', '[]'::jsonb);
  v_amr_anon boolean := false;
  v_user_valid boolean := false;
  v_active_owner boolean := false;
begin
  if v_uid is null or v_jwt is null or v_is_anon or v_provider = 'anonymous' then
    return false;
  end if;

  select exists (
    select 1
    from pg_catalog.jsonb_array_elements(v_amr) as elem
    where elem ->> 'method' = 'anonymous'
  ) into v_amr_anon;

  if v_amr_anon then
    return false;
  end if;

  select exists (
    select 1
    from auth.users u
    where u.id = v_uid
      and pg_catalog.coalesce(u.is_anonymous, false) = false
      and u.email is not null
      and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until <= pg_catalog.now())
  ) into v_user_valid;

  if not v_user_valid then
    return false;
  end if;

  select exists (
    select 1
    from public.admin_users a
    where a.user_id = v_uid
      and a.is_active = true
      and a.role = 'owner'
  ) into v_active_owner;

  return pg_catalog.coalesce(v_active_owner, false);
end;
$$;

create or replace function public.is_jtec_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select public.is_jtec_owner();
$$;

create or replace function public.is_jtec_owner_aal2()
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_jwt jsonb := auth.jwt();
  v_aal text := pg_catalog.coalesce(v_jwt ->> 'aal', 'aal1');
  v_has_verified_totp boolean := false;
begin
  if not public.is_jtec_owner() then
    return false;
  end if;

  if v_aal <> 'aal2' then
    return false;
  end if;

  select exists (
    select 1
    from auth.mfa_factors f
    where f.user_id = v_uid
      and f.factor_type = 'totp'
      and f.status = 'verified'
  ) into v_has_verified_totp;

  return pg_catalog.coalesce(v_has_verified_totp, false);
end;
$$;

create or replace function public.is_jtec_admin_aal2()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select public.is_jtec_owner_aal2();
$$;

revoke all on function public.is_jtec_owner() from public, anon;
grant execute on function public.is_jtec_owner() to authenticated;

revoke all on function public.is_jtec_admin() from public, anon;
grant execute on function public.is_jtec_admin() to authenticated;

revoke all on function public.is_jtec_owner_aal2() from public, anon;
grant execute on function public.is_jtec_owner_aal2() to authenticated;

revoke all on function public.is_jtec_admin_aal2() from public, anon;
grant execute on function public.is_jtec_admin_aal2() to authenticated;

-- 6. Client-Callable Owner Verification RPC (matches adminAuth.ts contract)
create or replace function public.verify_admin_access()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_jwt jsonb := auth.jwt();
  v_is_anon boolean := pg_catalog.coalesce((v_jwt ->> 'is_anonymous')::boolean, false);
  v_aal text := pg_catalog.coalesce(v_jwt ->> 'aal', 'aal1');
  v_email text := v_jwt ->> 'email';
  v_is_owner boolean := public.is_jtec_owner();
  v_has_verified_mfa boolean := false;
  v_role text := null;
begin
  if v_uid is null or v_jwt is null or v_is_anon then
    return pg_catalog.jsonb_build_object(
      'is_admin', false,
      'is_anonymous', true,
      'is_active', false,
      'mfa_required', true,
      'has_verified_mfa', false,
      'needs_mfa_enrollment', false,
      'current_aal', v_aal,
      'aal_enforced', false,
      'reason', 'Anonymous or unauthenticated sessions are not allowed.'
    );
  end if;

  if not v_is_owner then
    return pg_catalog.jsonb_build_object(
      'is_admin', false,
      'is_anonymous', false,
      'is_active', false,
      'mfa_required', true,
      'has_verified_mfa', false,
      'needs_mfa_enrollment', false,
      'current_aal', v_aal,
      'aal_enforced', false,
      'reason', 'Account is deactivated or not an authorized JTEC Love & Chill owner.'
    );
  end if;

  select a.role into v_role
  from public.admin_users a
  where a.user_id = v_uid
    and a.is_active = true
    and a.role = 'owner';

  if v_role is null then
    return pg_catalog.jsonb_build_object(
      'is_admin', false,
      'is_anonymous', false,
      'is_active', false,
      'mfa_required', true,
      'has_verified_mfa', false,
      'needs_mfa_enrollment', false,
      'current_aal', v_aal,
      'aal_enforced', false,
      'reason', 'Account is deactivated or not an authorized JTEC Love & Chill owner.'
    );
  end if;

  select exists (
    select 1
    from auth.mfa_factors f
    where f.user_id = v_uid
      and f.factor_type = 'totp'
      and f.status = 'verified'
  ) into v_has_verified_mfa;

  return pg_catalog.jsonb_build_object(
    'is_admin', true,
    'is_anonymous', false,
    'is_active', true,
    'role', v_role,
    'mfa_required', true,
    'has_verified_mfa', v_has_verified_mfa,
    'needs_mfa_enrollment', (not v_has_verified_mfa),
    'current_aal', v_aal,
    'aal_enforced', (v_has_verified_mfa and v_aal = 'aal2'),
    'user_id', v_uid,
    'email', v_email
  );
end;
$$;

revoke all on function public.verify_admin_access() from public, anon;
grant execute on function public.verify_admin_access() to authenticated;

-- 7. Immutable Audit Logging RPCs & `public.songs` Audit Trigger
create or replace function public.log_admin_action(p_action text, p_details jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := auth.jwt() ->> 'email';
begin
  if not public.is_jtec_owner_aal2() then
    raise exception 'Unauthorized Love & Chill owner audit log attempt' using errcode = '42501';
  end if;

  perform pg_catalog.set_config('app.jtec_audit_write', 'on', true);

  insert into public.admin_audit_logs (admin_user_id, admin_email, project_scope, action, details)
  values (
    v_uid,
    v_email,
    'love_chill',
    pg_catalog.left(pg_catalog.coalesce(p_action, 'unknown'), 80),
    pg_catalog.coalesce(p_details, '{}'::jsonb)
  );
end;
$$;

create or replace function public.log_music_action(p_action text, p_details jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  perform public.log_admin_action(
    p_action,
    pg_catalog.coalesce(p_details, '{}'::jsonb) || pg_catalog.jsonb_build_object('project', 'love_chill')
  );
end;
$$;

revoke all on function public.log_admin_action(text, jsonb) from public, anon;
grant execute on function public.log_admin_action(text, jsonb) to authenticated;

revoke all on function public.log_music_action(text, jsonb) from public, anon;
grant execute on function public.log_music_action(text, jsonb) to authenticated;

create policy "Owner read audit logs"
  on public.admin_audit_logs
  for select
  to authenticated
  using (public.is_jtec_owner_aal2());

create policy "Insert audit logs via RPC or trigger only"
  on public.admin_audit_logs
  for insert
  to authenticated
  with check (
    public.is_jtec_owner_aal2()
    and pg_catalog.current_setting('app.jtec_audit_write', true) = 'on'
  );

create policy "Deny all audit log updates"
  on public.admin_audit_logs
  as restrictive
  for update
  to public
  using (false)
  with check (false);

create policy "Deny all audit log deletes"
  on public.admin_audit_logs
  as restrictive
  for delete
  to public
  using (false);

create or replace function public.audit_song_mutations()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := auth.jwt() ->> 'email';
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then pg_catalog.to_jsonb(new) else null end;
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then pg_catalog.to_jsonb(old) else null end;
  v_action text;
  v_old_audio text;
  v_new_audio text;
  v_old_cover text;
  v_new_cover text;
  v_details jsonb;
begin
  if v_uid is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    v_action := 'song_uploaded';
    v_details := pg_catalog.jsonb_build_object(
      'project', 'love_chill',
      'song_id', v_new ->> 'id',
      'title', v_new ->> 'title',
      'artist', v_new ->> 'artist',
      'file_path', coalesce(v_new ->> 'storage_path', v_new ->> 'file_path', ''),
      'has_cover', coalesce(v_new ->> 'artwork_url', v_new ->> 'cover_url', '') <> ''
    );
  elsif tg_op = 'UPDATE' then
    v_old_audio := coalesce(v_old ->> 'storage_path', v_old ->> 'file_path', v_old ->> 'public_url', v_old ->> 'audio_url', '');
    v_new_audio := coalesce(v_new ->> 'storage_path', v_new ->> 'file_path', v_new ->> 'public_url', v_new ->> 'audio_url', '');
    v_old_cover := coalesce(v_old ->> 'artwork_url', v_old ->> 'cover_url', '');
    v_new_cover := coalesce(v_new ->> 'artwork_url', v_new ->> 'cover_url', '');

    if v_old_audio is distinct from v_new_audio or v_old_cover is distinct from v_new_cover then
      v_action := 'song_replaced';
    else
      v_action := 'song_edited';
    end if;

    v_details := pg_catalog.jsonb_build_object(
      'project', 'love_chill',
      'song_id', v_new ->> 'id',
      'title', v_new ->> 'title',
      'audio_changed', (v_old_audio is distinct from v_new_audio),
      'cover_changed', (v_old_cover is distinct from v_new_cover),
      'file_path', coalesce(v_new ->> 'storage_path', v_new ->> 'file_path', '')
    );
  else
    v_action := 'song_deleted';
    v_details := pg_catalog.jsonb_build_object(
      'project', 'love_chill',
      'song_id', v_old ->> 'id',
      'title', v_old ->> 'title',
      'file_path', coalesce(v_old ->> 'storage_path', v_old ->> 'file_path', '')
    );
  end if;

  perform pg_catalog.set_config('app.jtec_audit_write', 'on', true);

  insert into public.admin_audit_logs (admin_user_id, admin_email, project_scope, action, details)
  values (v_uid, v_email, 'love_chill', v_action, v_details);

  return coalesce(new, old);
end;
$$;

revoke all on function public.audit_song_mutations() from public, anon, authenticated;

drop trigger if exists trg_audit_song_mutations on public.songs;
create trigger trg_audit_song_mutations
  after insert or update or delete on public.songs
  for each row
  execute function public.audit_song_mutations();

-- 8. Lock down `public.songs` & Storage (`'music'` + `'artwork'` buckets)
alter table public.songs enable row level security;
alter table public.songs force row level security;

revoke all on table public.songs from public, anon;
grant select on table public.songs to anon, authenticated;
grant insert, update, delete on table public.songs to authenticated;

create policy "Allow public read on songs"
  on public.songs
  for select
  to anon, authenticated
  using (true);

create policy "Owner insert songs"
  on public.songs
  for insert
  to authenticated
  with check (public.is_jtec_owner_aal2());

create policy "Owner update songs"
  on public.songs
  for update
  to authenticated
  using (public.is_jtec_owner_aal2())
  with check (public.is_jtec_owner_aal2());

create policy "Owner delete songs"
  on public.songs
  for delete
  to authenticated
  using (public.is_jtec_owner_aal2());

insert into storage.buckets (id, name, public, file_size_limit)
values ('music', 'music', true, null)
on conflict (id) do update
set public = true;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'artwork',
  'artwork',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = true,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

create policy "Public Access music"
  on storage.objects
  for select
  to public
  using (bucket_id = 'music');

create policy "Public Access artwork"
  on storage.objects
  for select
  to public
  using (bucket_id = 'artwork');

create policy "Owner manage music and artwork buckets"
  on storage.objects
  for all
  to authenticated
  using (bucket_id in ('music', 'artwork') and public.is_jtec_owner_aal2())
  with check (bucket_id in ('music', 'artwork') and public.is_jtec_owner_aal2());

create policy "Restrict anon writes on music and artwork buckets"
  on storage.objects
  as restrictive
  for insert
  to anon
  with check (bucket_id not in ('music', 'artwork'));

create policy "Restrict anon updates on music and artwork buckets"
  on storage.objects
  as restrictive
  for update
  to anon
  using (bucket_id not in ('music', 'artwork'))
  with check (bucket_id not in ('music', 'artwork'));

create policy "Restrict anon deletes on music and artwork buckets"
  on storage.objects
  as restrictive
  for delete
  to anon
  using (bucket_id not in ('music', 'artwork'));

create policy "Restrict authenticated inserts on music and artwork buckets"
  on storage.objects
  as restrictive
  for insert
  to authenticated
  with check (bucket_id not in ('music', 'artwork') or public.is_jtec_owner_aal2());

create policy "Restrict authenticated updates on music and artwork buckets"
  on storage.objects
  as restrictive
  for update
  to authenticated
  using (bucket_id not in ('music', 'artwork') or public.is_jtec_owner_aal2())
  with check (bucket_id not in ('music', 'artwork') or public.is_jtec_owner_aal2());

create policy "Restrict authenticated deletes on music and artwork buckets"
  on storage.objects
  as restrictive
  for delete
  to authenticated
  using (bucket_id not in ('music', 'artwork') or public.is_jtec_owner_aal2());

commit;
