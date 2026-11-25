-- ==============================================================================
-- JTEC MUSIC (jtec_main ONLY) — READ-ONLY PRE-MIGRATION SAFETY INSPECTION
-- ==============================================================================
-- Run this read-only inspection script in the jtec_main Supabase SQL Editor
-- BEFORE executing `supabase/migrations/001_secure_admin_auth.sql`.
-- It makes zero changes and reports current telemetry RPCs, policies, and counts.
-- ==============================================================================

-- 1. Inspect existing ping_install() and touch_install() SECURITY DEFINER, search_path, owner & grants
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as args,
  p.prosecdef as is_security_definer,
  r.rolname as owner_role,
  r.rolbypassrls as owner_has_bypassrls,
  p.proconfig as function_config,
  p.proacl as execution_grants,
  pg_catalog.pg_get_functiondef(p.oid) as function_definition
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
join pg_catalog.pg_roles r on r.oid = p.proowner
where n.nspname = 'public'
  and p.proname in ('ping_install', 'touch_install')
order by p.proname, args;

-- 2. Inspect existing RLS & FORCE RLS status on protected tables
select
  n.nspname as schema_name,
  c.relname as table_name,
  r.rolname as table_owner,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
join pg_catalog.pg_roles r on r.oid = c.relowner
where (n.nspname = 'public' and c.relname in ('app_config', 'app_installs', 'songs', 'admin_users', 'admin_audit_logs'))
   or (n.nspname = 'storage' and c.relname = 'objects')
order by n.nspname, c.relname;

-- 3. Inspect all existing policies that will be replaced cleanly
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_catalog.pg_policies
where (schemaname = 'public' and tablename in ('app_config', 'app_installs', 'songs', 'admin_users', 'admin_audit_logs'))
   or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname;

-- 4. Confirm owner account exists in auth.users and record baseline counts (songs & app_installs)
select id, lower(email) as email, email_confirmed_at, coalesce(is_anonymous, false) as is_anonymous
from auth.users
where lower(email) = 'fatormajohn999@gmail.com';

select
  (select count(*) from public.songs) as baseline_songs_count,
  (select count(*) from public.app_installs) as baseline_installs_count,
  (select min_build from public.app_config where id = 1) as current_min_build;
