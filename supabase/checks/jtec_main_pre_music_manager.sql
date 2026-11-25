-- ==============================================================================
-- JTEC MUSIC (TARGET: jtec_main ONLY) — READ-ONLY PRE-MIGRATION AUDIT
-- ==============================================================================
-- Run this READ-ONLY inspection script in the `jtec_main` Supabase SQL Editor
-- BEFORE running `supabase/migrations/002_jtec_main_music_manager.sql`.
-- Do NOT run this script on `nasheed`, `love_chill`, or `jtec-party`.
-- ==============================================================================

-- 1. Inspect exact existing `public.songs` columns, types, nullability, and defaults
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

-- 2. Inspect baseline song counts & cover/audio column population (non-destructive)
select
  count(*) as total_songs,
  count(*) filter (where coalesce(to_jsonb(s) ->> 'storage_path', to_jsonb(s) ->> 'file_path', '') <> '') as songs_with_file_path,
  count(*) filter (where coalesce(to_jsonb(s) ->> 'public_url', to_jsonb(s) ->> 'audio_url', '') <> '') as songs_with_audio_url,
  count(*) filter (where coalesce(to_jsonb(s) ->> 'artwork_url', to_jsonb(s) ->> 'cover_url', '') <> '') as songs_with_cover_url
from public.songs s;

-- 3. Inspect existing storage buckets (`music`, `artwork`, or others)
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

-- 4. Inspect existing RLS & FORCE RLS status on admin, music, and telemetry tables
select
  n.nspname as schema_name,
  c.relname as table_name,
  r.rolname as table_owner,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
join pg_catalog.pg_roles r on r.oid = c.relowner
where (n.nspname = 'public' and c.relname in ('admin_users', 'admin_audit_logs', 'app_config', 'app_installs', 'songs'))
   or (n.nspname = 'storage' and c.relname = 'objects')
order by n.nspname, c.relname;

-- 5. Inspect all current policies on `public.songs`, admin tables, and `storage.objects`
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
where (schemaname = 'public' and tablename in ('admin_users', 'admin_audit_logs', 'app_config', 'app_installs', 'songs'))
   or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname;

-- 6. Verify `001_secure_admin_auth.sql` functions, `admin_users` roles, and owner TOTP enrollment
select
  p.proname as function_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as args,
  p.prosecdef as is_security_definer,
  p.proconfig as function_config,
  p.proacl as execution_grants
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'is_jtec_admin',
    'is_jtec_admin_aal2',
    'is_jtec_owner',
    'is_jtec_owner_aal2',
    'verify_admin_access',
    'log_admin_action',
    'ping_install',
    'touch_install'
  )
order by p.proname;

select
  u.id as user_id,
  lower(u.email) as email,
  u.email_confirmed_at,
  coalesce(u.is_anonymous, false) as is_anonymous,
  a.role as admin_role,
  a.is_active as admin_is_active,
  exists (
    select 1
    from auth.mfa_factors f
    where f.user_id = u.id
      and f.factor_type = 'totp'
      and f.status = 'verified'
  ) as has_verified_totp
from auth.users u
left join public.admin_users a on a.user_id = u.id
where lower(u.email) = 'fatormajohn999@gmail.com'
   or a.user_id is not null
order by u.created_at asc;
