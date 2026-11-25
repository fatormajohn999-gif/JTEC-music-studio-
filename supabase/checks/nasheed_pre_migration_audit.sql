-- ==============================================================================
-- JTEC NASHEED (TARGET: nasheed ONLY) — READ-ONLY PRE-MIGRATION AUDIT
-- ==============================================================================
-- Run this READ-ONLY script in the `nasheed` Supabase SQL Editor BEFORE
-- applying `supabase/migrations/nasheed/001_nasheed_music_security.sql`.
-- Do NOT run this script on `jtec_main`, `love_chill`, or `jtec-party`.
-- ==============================================================================

-- 1. Inspect exact existing tables in `public` schema (confirms table names & admin tables)
select
  table_name,
  table_type
from information_schema.tables
where table_schema = 'public'
order by table_name;

-- 2. Inspect exact existing `public.songs`, `admin_users`, and `admin_audit_logs` columns, types, nullability, and defaults
select
  table_name,
  ordinal_position,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('songs', 'admin_users', 'admin_audit_logs')
order by table_name, ordinal_position;

-- 3. Inspect existing storage buckets (`music`, `artwork`, or custom bucket names)
select
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types,
  created_at,
  updated_at
from storage.buckets
order by name;

-- 4. Inspect RLS state, policies, triggers, indexes, and functions
select
  n.nspname as schema_name,
  c.relname as table_name,
  r.rolname as table_owner,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
join pg_catalog.pg_roles r on r.oid = c.relowner
where (n.nspname = 'public' and c.relname in ('songs', 'admin_users', 'admin_audit_logs'))
   or (n.nspname = 'storage' and c.relname = 'objects')
order by n.nspname, c.relname;

select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_catalog.pg_policies
where (schemaname = 'public' and tablename in ('songs', 'admin_users', 'admin_audit_logs'))
   or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname;

select
  t.tgname as trigger_name,
  p.proname as trigger_function,
  t.tgenabled as trigger_enabled
from pg_catalog.pg_trigger t
join pg_catalog.pg_class c on c.oid = t.tgrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
join pg_catalog.pg_proc p on p.oid = t.tgfoid
where n.nspname = 'public'
  and c.relname = 'songs'
  and not t.tgisinternal
order by t.tgname;

select indexname, indexdef
from pg_catalog.pg_indexes
where schemaname = 'public'
  and tablename = 'songs'
order by indexname;

select
  p.proname as function_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as args,
  p.prosecdef as is_security_definer
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname, args;

-- 5. Verify owner readiness (`fatormajohn999@gmail.com` in auth.users & verified TOTP factor)
select
  u.id as user_id,
  lower(u.email) as auth_email,
  u.email_confirmed_at,
  coalesce(u.is_anonymous, false) as is_anonymous,
  (u.banned_until is null or u.banned_until <= now()) as not_banned,
  exists (
    select 1
    from auth.mfa_factors f
    where f.user_id = u.id
      and f.factor_type = 'totp'
      and f.status = 'verified'
  ) as has_verified_totp
from auth.users u
where lower(u.email) = 'fatormajohn999@gmail.com';

-- 6. Inspect existing Nasheed song count & cover/audio URL patterns (safe NULLIF fallback; requires public.songs)
select
  count(*) as baseline_songs_count,
  count(*) filter (
    where coalesce(nullif(to_jsonb(s) ->> 'storage_path', ''), nullif(to_jsonb(s) ->> 'file_path', '')) is not null
  ) as songs_with_file_path,
  count(*) filter (
    where coalesce(nullif(to_jsonb(s) ->> 'public_url', ''), nullif(to_jsonb(s) ->> 'audio_url', '')) is not null
  ) as songs_with_audio_url,
  count(*) filter (
    where coalesce(nullif(to_jsonb(s) ->> 'artwork_url', ''), nullif(to_jsonb(s) ->> 'cover_url', '')) is not null
  ) as songs_with_cover_url
from public.songs s;
