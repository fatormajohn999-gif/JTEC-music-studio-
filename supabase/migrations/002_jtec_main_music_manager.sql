-- ==============================================================================
-- JTEC MUSIC (TARGET: jtec_main ONLY) — MUSIC MANAGEMENT SECURITY MIGRATION
-- ==============================================================================
-- Run this script in the `jtec_main` Supabase SQL Editor ONLY AFTER:
--   1. `supabase/migrations/001_secure_admin_auth.sql` has been applied.
--   2. `supabase/checks/jtec_main_pre_music_manager.sql` baseline has been saved.
--   3. At least one confirmed, non-anonymous owner (`role = 'owner'`, matching
--      `auth.users.email`) is active in `public.admin_users`.
--
-- Do NOT run this script on `nasheed`, `love_chill`, or `jtec-party`.
--
-- Security & Compatibility Guarantees:
-- 1. Verifies `001` prerequisites, admin table column compatibility, `songs.updated_at`
--    type compatibility, and an active confirmed owner before changing policies.
-- 2. Enforces strict owner-only AAL2 helpers (`public.is_jtec_owner()` and
--    `public.is_jtec_owner_aal2()`): `role = 'owner'`, `is_active = true`,
--    `admin_users.email = auth.users.email`, verified TOTP factor, JWT `aal = 'aal2'`,
--    AND TOTP `amr` verification.
-- 3. Non-destructively adds missing Music Management columns/indexes to `public.songs`.
-- 4. Protects `public.songs` + `'music'` & `'artwork'` buckets with `AS RESTRICTIVE`
--    storage guards while preserving public read/streaming/download access.
-- 5. Attaches `audit_song_mutations()` with NULLIF empty-string handling, resets
--    `app.jtec_audit_write` immediately after each insert, and exposes `log_music_action()`.
-- ==============================================================================

begin;

-- 1. Verify `001` prerequisites, admin table schemas, `updated_at` type, and active confirmed owner
do $$
declare
  v_updated_at_udt text;
  v_bad_cols integer := 0;
begin
  if pg_catalog.to_regclass('public.admin_users') is null
     or pg_catalog.to_regclass('public.admin_audit_logs') is null
     or pg_catalog.to_regclass('public.songs') is null
     or pg_catalog.to_regprocedure('public.is_jtec_admin_aal2()') is null
     or pg_catalog.to_regprocedure('public.log_admin_action(text, jsonb)') is null then
    raise exception 'Prerequisites missing on jtec_main. Apply supabase/migrations/001_secure_admin_auth.sql before 002_jtec_main_music_manager.sql.';
  end if;

  -- Reject incompatible admin_users / admin_audit_logs schemas
  select count(*) into v_bad_cols
  from (
    values
      ('admin_users', 'user_id', 'uuid'),
      ('admin_users', 'email', 'text'),
      ('admin_users', 'role', 'text'),
      ('admin_users', 'is_active', 'bool'),
      ('admin_audit_logs', 'admin_user_id', 'uuid'),
      ('admin_audit_logs', 'action', 'text'),
      ('admin_audit_logs', 'details', 'jsonb')
  ) as req(tbl, col, expected_udt)
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = req.tbl
      and c.column_name = req.col
      and (
        c.udt_name = req.expected_udt
        or (req.expected_udt = 'text' and c.udt_name in ('varchar', 'citext', 'bpchar'))
      )
  );

  if v_bad_cols > 0 then
    raise exception 'Incompatible public.admin_users or public.admin_audit_logs column schema on jtec_main.';
  end if;

  -- Ensure at least one active, email-confirmed owner with matching email exists before tightening access
  if not exists (
    select 1
    from public.admin_users a
    join auth.users u on u.id = a.user_id
    where a.is_active = true
      and a.role = 'owner'
      and u.email is not null
      and pg_catalog.lower(a.email) = pg_catalog.lower(u.email)
      and coalesce(u.is_anonymous, false) = false
      and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until <= pg_catalog.now())
  ) then
    raise exception 'Cannot tighten jtec_main Music Manager permissions: no active confirmed owner matching auth.users.email was found in public.admin_users.';
  end if;

  -- Validate existing public.songs.updated_at type (if column already exists) before attaching trigger
  select c.udt_name
  into v_updated_at_udt
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'songs'
    and c.column_name = 'updated_at';

  if v_updated_at_udt is not null and v_updated_at_udt not in ('timestamptz', 'timestamp') then
    raise exception 'Incompatible public.songs.updated_at type (%). Expected timestamptz/timestamp before attaching touch_songs_updated_at().', v_updated_at_udt;
  end if;
end
$$;

-- 2. Non-destructive schema alignment for `public.songs` (never drops or modifies existing rows)
alter table public.songs add column if not exists title text;
alter table public.songs add column if not exists artist text default 'Unknown Artist';
alter table public.songs add column if not exists album text default 'Single';
alter table public.songs add column if not exists genre text default 'Music';
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

-- Keep updated_at current on metadata or asset replacements
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

revoke all on function public.touch_songs_updated_at() from public, anon, authenticated;

drop trigger if exists trg_touch_songs_updated_at on public.songs;
create trigger trg_touch_songs_updated_at
  before update on public.songs
  for each row
  execute function public.touch_songs_updated_at();

-- 3. Strict Owner-Only Helpers (`role = 'owner'`, matching email, `is_active = true`, TOTP factor + AAL2 + TOTP amr)
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
  v_is_anon boolean := coalesce((v_jwt ->> 'is_anonymous')::boolean, false);
  v_provider text := coalesce(v_jwt -> 'app_metadata' ->> 'provider', '');
  v_amr jsonb := coalesce(v_jwt -> 'amr', '[]'::jsonb);
  v_amr_anon boolean := false;
  v_active_owner boolean := false;
begin
  if v_uid is null or v_jwt is null or v_is_anon or v_provider = 'anonymous' then
    return false;
  end if;

  select exists (
    select 1
    from pg_catalog.jsonb_array_elements(v_amr) as elem
    where (
      case
        when pg_catalog.jsonb_typeof(elem) = 'object' then elem ->> 'method'
        else elem #>> '{}'
      end
    ) = 'anonymous'
  ) into v_amr_anon;

  if v_amr_anon then
    return false;
  end if;

  select exists (
    select 1
    from public.admin_users a
    join auth.users u on u.id = a.user_id
    where a.user_id = v_uid
      and a.is_active = true
      and a.role = 'owner'
      and coalesce(u.is_anonymous, false) = false
      and u.email is not null
      and u.email_confirmed_at is not null
      and pg_catalog.lower(a.email) = pg_catalog.lower(u.email)
      and (u.banned_until is null or u.banned_until <= pg_catalog.now())
  ) into v_active_owner;

  return coalesce(v_active_owner, false);
end;
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
  v_aal text := coalesce(v_jwt ->> 'aal', 'aal1');
  v_amr jsonb := coalesce(v_jwt -> 'amr', '[]'::jsonb);
  v_has_totp_amr boolean := false;
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
    from pg_catalog.jsonb_array_elements(v_amr) as elem
    where (
      case
        when pg_catalog.jsonb_typeof(elem) = 'object' then elem ->> 'method'
        else elem #>> '{}'
      end
    ) = 'totp'
  ) into v_has_totp_amr;

  if not coalesce(v_has_totp_amr, false) then
    return false;
  end if;

  select exists (
    select 1
    from auth.mfa_factors f
    where f.user_id = v_uid
      and f.factor_type = 'totp'
      and f.status = 'verified'
  ) into v_has_verified_totp;

  return coalesce(v_has_verified_totp, false);
end;
$$;

revoke all on function public.is_jtec_owner() from public, anon;
grant execute on function public.is_jtec_owner() to authenticated;

revoke all on function public.is_jtec_owner_aal2() from public, anon;
grant execute on function public.is_jtec_owner_aal2() to authenticated;

-- 4. Provision & harden `'music'` and `'artwork'` storage buckets cleanly
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

-- 5. Cleanly rebuild `public.songs` policies for public read + owner-only AAL2 writes
alter table public.songs enable row level security;
alter table public.songs force row level security;

revoke all on table public.songs from public, anon;
grant select on table public.songs to anon, authenticated;
grant insert, update, delete on table public.songs to authenticated;

do $$
declare
  v_pol record;
begin
  for v_pol in
    select schemaname, tablename, policyname
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'songs'
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

-- 6. Rebuild ONLY `'music'` & `'artwork'` `storage.objects` policies (never affects unrelated buckets)
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
        coalesce(qual, '') ~ $$(^|[^[:alnum:]_'])'(music|artwork)'([^[:alnum:]_']|$)$$
        or coalesce(with_check, '') ~ $$(^|[^[:alnum:]_'])'(music|artwork)'([^[:alnum:]_']|$)$$
        or policyname in (
          'Public Access music',
          'Public Access artwork',
          'Admin manage music bucket',
          'Owner manage music and artwork buckets',
          'Restrict anon writes on music bucket',
          'Restrict anon updates on music bucket',
          'Restrict anon deletes on music bucket',
          'Restrict authenticated inserts on music bucket',
          'Restrict authenticated updates on music bucket',
          'Restrict authenticated deletes on music bucket',
          'Restrict anon writes on music and artwork buckets',
          'Restrict anon updates on music and artwork buckets',
          'Restrict anon deletes on music and artwork buckets',
          'Restrict authenticated inserts on music and artwork buckets',
          'Restrict authenticated updates on music and artwork buckets',
          'Restrict authenticated deletes on music and artwork buckets'
        )
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

-- 7. Automatic immutable audit logging on `public.songs` (upload / edit / replace / delete)
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
  v_old_path text;
  v_new_path text;
  v_old_url text;
  v_new_url text;
  v_old_cover text;
  v_new_cover text;
  v_details jsonb;
begin
  -- Skip only if executed via trusted SQL Editor maintenance with no auth.uid()
  if v_uid is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    v_action := 'song_uploaded';
    v_details := pg_catalog.jsonb_build_object(
      'project', 'jtec_main',
      'song_id', v_new ->> 'id',
      'title', v_new ->> 'title',
      'artist', v_new ->> 'artist',
      'file_path', coalesce(nullif(v_new ->> 'storage_path', ''), nullif(v_new ->> 'file_path', ''), ''),
      'audio_url', coalesce(nullif(v_new ->> 'public_url', ''), nullif(v_new ->> 'audio_url', ''), ''),
      'has_cover', coalesce(nullif(v_new ->> 'artwork_url', ''), nullif(v_new ->> 'cover_url', ''), '') <> ''
    );
  elsif tg_op = 'UPDATE' then
    v_old_path := coalesce(nullif(v_old ->> 'storage_path', ''), nullif(v_old ->> 'file_path', ''), '');
    v_new_path := coalesce(nullif(v_new ->> 'storage_path', ''), nullif(v_new ->> 'file_path', ''), '');
    v_old_url := coalesce(nullif(v_old ->> 'public_url', ''), nullif(v_old ->> 'audio_url', ''), '');
    v_new_url := coalesce(nullif(v_new ->> 'public_url', ''), nullif(v_new ->> 'audio_url', ''), '');
    v_old_cover := coalesce(nullif(v_old ->> 'artwork_url', ''), nullif(v_old ->> 'cover_url', ''), '');
    v_new_cover := coalesce(nullif(v_new ->> 'artwork_url', ''), nullif(v_new ->> 'cover_url', ''), '');

    if v_old_path is distinct from v_new_path
       or v_old_url is distinct from v_new_url
       or v_old_cover is distinct from v_new_cover then
      v_action := 'song_replaced';
    else
      v_action := 'song_edited';
    end if;

    v_details := pg_catalog.jsonb_build_object(
      'project', 'jtec_main',
      'song_id', v_new ->> 'id',
      'title', v_new ->> 'title',
      'audio_changed', ((v_old_path is distinct from v_new_path) or (v_old_url is distinct from v_new_url)),
      'cover_changed', (v_old_cover is distinct from v_new_cover),
      'file_path', v_new_path
    );
  else
    v_action := 'song_deleted';
    v_details := pg_catalog.jsonb_build_object(
      'project', 'jtec_main',
      'song_id', v_old ->> 'id',
      'title', v_old ->> 'title',
      'file_path', coalesce(nullif(v_old ->> 'storage_path', ''), nullif(v_old ->> 'file_path', ''), '')
    );
  end if;

  perform pg_catalog.set_config('app.jtec_audit_write', 'on', true);

  insert into public.admin_audit_logs (admin_user_id, admin_email, action, details)
  values (v_uid, v_email, v_action, v_details);

  perform pg_catalog.set_config('app.jtec_audit_write', '', true);

  return coalesce(new, old);
end;
$$;

revoke all on function public.audit_song_mutations() from public, anon, authenticated;

drop trigger if exists trg_audit_song_mutations on public.songs;
create trigger trg_audit_song_mutations
  after insert or update or delete on public.songs
  for each row
  execute function public.audit_song_mutations();

-- Explicit owner-only RPC for storage-level Music Management audit events
create or replace function public.log_music_action(p_action text, p_details jsonb default '{}'::jsonb)
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
    raise exception 'Unauthorized music management audit attempt' using errcode = '42501';
  end if;

  perform pg_catalog.set_config('app.jtec_audit_write', 'on', true);

  insert into public.admin_audit_logs (admin_user_id, admin_email, action, details)
  values (
    v_uid,
    v_email,
    pg_catalog.left(coalesce(nullif(btrim(p_action), ''), 'music_action'), 80),
    coalesce(p_details, '{}'::jsonb) || pg_catalog.jsonb_build_object('project', 'jtec_main')
  );

  perform pg_catalog.set_config('app.jtec_audit_write', '', true);
end;
$$;

revoke all on function public.log_music_action(text, jsonb) from public, anon;
grant execute on function public.log_music_action(text, jsonb) to authenticated;

commit;
