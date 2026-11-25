-- ==============================================================================
-- JTEC MUSIC (jtec_main ONLY) — READ-ONLY POST-MIGRATION VERIFICATION
-- ==============================================================================
-- Run this read-only script in the jtec_main Supabase SQL Editor AFTER
-- executing `supabase/migrations/001_secure_admin_auth.sql`.
-- ==============================================================================

-- 1. Verify ping_install, touch_install, and admin SECURITY DEFINER functions
select
  p.proname as function_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as args,
  p.prosecdef as is_security_definer,
  r.rolname as owner_role,
  r.rolbypassrls as owner_has_bypassrls,
  p.proconfig as function_config,
  p.proacl as execution_grants
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
join pg_catalog.pg_roles r on r.oid = p.proowner
where n.nspname = 'public'
  and p.proname in (
    'ping_install',
    'touch_install',
    'is_jtec_admin',
    'is_jtec_admin_aal2',
    'verify_admin_access',
    'log_admin_action'
  )
order by p.proname, args;

-- 2. Verify FORCE ROW LEVEL SECURITY is active on all sensitive public tables
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('admin_users', 'admin_audit_logs', 'app_config', 'app_installs', 'songs')
order by c.relname;

-- 3. Verify active admin_users seed and zero unauthorized admins
select user_id, email, role, is_active, created_at
from public.admin_users
order by created_at asc;

-- 4. Verify existing songs and device telemetry were completely preserved
select
  (select count(*) from public.songs) as preserved_songs_count,
  (select count(*) from public.app_installs) as preserved_installs_count,
  (select min_build from public.app_config where id = 1) as preserved_min_build;
