-- ==============================================================================
-- JTEC LOVE & CHILL (TARGET: love_chill ONLY) — POST-MIGRATION VERIFICATION
-- ==============================================================================
-- Run this READ-ONLY verification script in the `love_chill` Supabase SQL Editor
-- AFTER executing `supabase/migrations/love_chill/001_love_chill_music_security.sql`.
-- ==============================================================================

-- 1. Verify owner-only SECURITY DEFINER RPCs, locked search_path, and minimum grants
select
  p.proname as function_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as args,
  p.prosecdef as is_security_definer,
  r.rolname as owner_role,
  p.proconfig as function_config,
  p.proacl as execution_grants
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
join pg_catalog.pg_roles r on r.oid = p.proowner
where n.nspname = 'public'
  and p.proname in (
    'is_jtec_owner',
    'is_jtec_owner_aal2',
    'is_jtec_admin',
    'is_jtec_admin_aal2',
    'verify_admin_access',
    'log_admin_action',
    'log_music_action',
    'audit_song_mutations'
  )
order by p.proname, args;

-- 2. Verify FORCE ROW LEVEL SECURITY on all sensitive Love & Chill tables
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('admin_users', 'admin_audit_logs', 'songs')
order by c.relname;

-- 3. Verify `'music'` and `'artwork'` buckets and restrictive policies
select
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
from storage.buckets
where id in ('music', 'artwork')
order by id;

select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
from pg_catalog.pg_policies
where (schemaname = 'public' and tablename in ('admin_users', 'admin_audit_logs', 'songs'))
   or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname;

-- 4. Verify song audit & updated_at triggers
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

-- 5. Confirm active owner row (`role = 'owner'`) and preserved Love & Chill song count
select user_id, email, role, is_active, created_at
from public.admin_users
order by created_at asc;

select count(*) as preserved_songs_count
from public.songs;
