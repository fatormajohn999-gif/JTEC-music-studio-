-- ==============================================================================
-- JTEC MUSIC (TARGET: jtec_main ONLY) — MUSIC MANAGEMENT SECURITY MIGRATION
-- ==============================================================================
-- Run this script in the `jtec_main` Supabase SQL Editor ONLY AFTER:
--   1. `supabase/migrations/001_secure_admin_auth.sql` has been applied.
--   2. `supabase/checks/jtec_main_pre_music_manager.sql` baseline has been saved.
--
-- Do NOT run this script on `nasheed`, `love_chill`, or `jtec-party`.
--
-- What this migration adds on top of `001_secure_admin_auth.sql`:
-- 1. Non-destructively ensures all Music Management columns exist on `public.songs`
--    plus an `updated_at` maintenance trigger (zero existing data touched).
-- 2. Adds strict owner-only AAL2 helpers (`public.is_jtec_owner()` and
--    `public.is_jtec_owner_aal2()`, requiring `role = 'owner'`, `is_active = true`,
--    verified TOTP factor, and JWT `aal = 'aal2'`).
-- 3. Restricts `public.songs` INSERT/UPDATE/DELETE and `storage.objects` writes
--    on BOTH `'music'` and `'artwork'` buckets strictly to `is_jtec_owner_aal2()`
--    while keeping public anonymous `SELECT` streaming/cover access intact.
-- 4. Provisions/hardens the `'artwork'` bucket (5 MB limit, JPEG/PNG/WebP MIME
--    allowlist) alongside `'music'` so embedded and manual cover uploads work safely.
-- 5. Attaches an immutable `AFTER INSERT OR UPDATE OR DELETE` audit trigger on
--    `public.songs` + owner-only `public.log_music_action()` RPC for storage events.
-- ==============================================================================

begin;

-- 1. Verify prerequisite security foundation from 001_secure_admin_auth.sql
do $$
begin
  if pg_catalog.to_regclass('public.admin_users') is null
     or pg_catalog.to_regclass('public.admin_audit_logs') is null
     or pg_catalog.to_regclass('public.songs') is null
     or pg_catalog.to_regprocedure('public.is_jtec_admin_aal2()') is null
     or pg_catalog.to_regprocedure('public.log_admin_action(text, jsonb)') is null then
    raise exception 'Prerequisites missing on jtec_main. Apply supabase/migrations/001_secure_admin_auth.sql before 002_jtec_main_music_manager.sql.';
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

drop trigger if exists trg_touch_songs_updated_at on public.songs;
create trigger trg_touch_songs_updated_at
  before update on public.songs
  for each row
  execute function public.touch_songs_updated_at();

-- 3. Strict Owner-Only Helpers (`role = 'owner'`, `is_active = true`, verified TOTP + AAL2)
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

-- 6. Cleanly rebuild `storage.objects` policies for `'music'` and `'artwork'` buckets
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
  v_old_audio text;
  v_new_audio text;
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
      'project', 'jtec_main',
      'song_id', v_new ->> 'id',
      'title', v_new ->> 'title',
      'audio_changed', (v_old_audio is distinct from v_new_audio),
      'cover_changed', (v_old_cover is distinct from v_new_cover),
      'file_path', coalesce(v_new ->> 'storage_path', v_new ->> 'file_path', '')
    );
  else
    v_action := 'song_deleted';
    v_details := pg_catalog.jsonb_build_object(
      'project', 'jtec_main',
      'song_id', v_old ->> 'id',
      'title', v_old ->> 'title',
      'file_path', coalesce(v_old ->> 'storage_path', v_old ->> 'file_path', '')
    );
  end if;

  perform pg_catalog.set_config('app.jtec_audit_write', 'on', true);

  insert into public.admin_audit_logs (admin_user_id, admin_email, action, details)
  values (v_uid, v_email, v_action, v_details);

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
    pg_catalog.left(pg_catalog.coalesce(p_action, 'music_action'), 80),
    pg_catalog.coalesce(p_details, '{}'::jsonb) || pg_catalog.jsonb_build_object('project', 'jtec_main')
  );
end;
$$;

revoke all on function public.log_music_action(text, jsonb) from public, anon;
grant execute on function public.log_music_action(text, jsonb) to authenticated;

commit;
