-- ==============================================================================
-- JTEC NASHEED (TARGET: nasheed ONLY) — READ-ONLY PRE-MIGRATION AUDIT
-- ==============================================================================
-- Run this READ-ONLY script in the `nasheed` Supabase SQL Editor BEFORE
-- applying `supabase/migrations/nasheed/001_nasheed_music_security.sql`.
-- Do NOT run this script on `jtec_main`, `love_chill`, or `jtec-party`.
-- ==============================================================================

-- 1. Inspect exact existing tables in `public` schema (confirms table names & whether telemetry tables exist)
select
  table_name,
  table_type
from information_schema.tables
where table_schema = 'public'
order by table_name;

-- 2. Inspect exact existing `public.songs` columns, types, nullability, and defaults
select
  ordinal_position,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'songs'
order by ordinal_position;

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

-- 4. Inspect RLS state on `public.songs` & `storage.objects` and all existing policies
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

-- 5. Check whether owner account (`fatormajohn999@gmail.com`) exists, is confirmed, and has TOTP enrolled
select
  u.id as user_id,
  lower(u.email) as email,
  u.email_confirmed_at,
  coalesce(u.is_anonymous, false) as is_anonymous,
  exists (
    select 1
    from auth.mfa_factors f
    where f.user_id = u.id
      and f.factor_type = 'totp'
      and f.status = 'verified'
  ) as has_verified_totp
from auth.users u
where lower(u.email) = 'fatormajohn999@gmail.com';

-- 6. Inspect existing Nasheed song count & cover/audio URL patterns (non-destructive; requires public.songs)
select
  count(*) as baseline_songs_count,
  count(*) filter (where coalesce(to_jsonb(s) ->> 'storage_path', to_jsonb(s) ->> 'file_path', '') <> '') as songs_with_file_path,
  count(*) filter (where coalesce(to_jsonb(s) ->> 'public_url', to_jsonb(s) ->> 'audio_url', '') <> '') as songs_with_audio_url,
  count(*) filter (where coalesce(to_jsonb(s) ->> 'artwork_url', to_jsonb(s) ->> 'cover_url', '') <> '') as songs_with_cover_url
from public.songs s;
