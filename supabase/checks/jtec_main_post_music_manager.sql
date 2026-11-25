-- ==============================================================================
-- JTEC MUSIC (TARGET: jtec_main ONLY) — READ-ONLY POST-MIGRATION VERIFICATION
-- ==============================================================================
-- Run this READ-ONLY verification script in `jtec_main` AFTER executing
-- `supabase/migrations/002_jtec_main_music_manager.sql`.
-- ==============================================================================

-- 1. Verify owner-only & admin SECURITY DEFINER functions and locked search_path
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
    'is_jtec_admin',
    'is_jtec_admin_aal2',
    'is_jtec_owner',
    'is_jtec_owner_aal2',
    'verify_admin_access',
    'log_admin_action',
    'log_music_action',
    'audit_song_mutations',
    'ping_install',
    'touch_install'
  )
order by p.proname, args;

-- 2. Verify `music` and `artwork` storage buckets and MIME/size rules
select
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
from storage.buckets
where id in ('music', 'artwork')
order by id;

-- 3. Verify `public.songs` and `storage.objects` RLS policies
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

-- 4. Verify song audit & updated_at triggers are attached to `public.songs`
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

-- 5. Verify active owner row and preserved baseline counts
select user_id, email, role, is_active, created_at
from public.admin_users
order by created_at asc;

select
  (select count(*) from public.songs) as preserved_songs_count,
  (select count(*) from public.app_installs) as preserved_installs_count,
  (select min_build from public.app_config where id = 1) as preserved_min_build;
