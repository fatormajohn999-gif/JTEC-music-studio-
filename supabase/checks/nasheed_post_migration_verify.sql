-- ==============================================================================
-- JTEC NASHEED (TARGET: nasheed ONLY) — READ-ONLY POST-MIGRATION VERIFICATION
-- ==============================================================================
-- Run this READ-ONLY verification script in the `nasheed` Supabase SQL Editor
-- AFTER executing `supabase/migrations/nasheed/001_nasheed_music_security.sql`.
-- ==============================================================================

-- 1. Verify owner-only & trigger functions, BYPASSRLS ownership, locked search_path, and minimum permissions
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
    'is_jtec_owner',
    'is_jtec_owner_aal2',
    'is_jtec_admin',
    'is_jtec_admin_aal2',
    'verify_admin_access',
    'log_admin_action',
    'log_music_action',
    'audit_song_mutations',
    'touch_songs_updated_at'
  )
order by p.proname, args;

-- 2. Verify FORCE ROW LEVEL SECURITY on all sensitive Nasheed tables and storage.objects
select
  n.nspname as schema_name,
  c.relname as table_name,
  r.rolname as table_owner,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
join pg_catalog.pg_roles r on r.oid = c.relowner
where (n.nspname = 'public' and c.relname in ('admin_users', 'admin_audit_logs', 'songs'))
   or (n.nspname = 'storage' and c.relname = 'objects')
order by n.nspname, c.relname;

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
  cmd,
  qual,
  with_check
from pg_catalog.pg_policies
where (schemaname = 'public' and tablename in ('admin_users', 'admin_audit_logs', 'songs'))
   or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname;

-- 4. Verify `public.songs` columns, triggers, and indexes
select
  ordinal_position,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'songs'
order by ordinal_position;

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

select
  exists (
    select 1 from pg_catalog.pg_trigger t
    join pg_catalog.pg_class c on c.oid = t.tgrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'songs' and t.tgname = 'trg_audit_song_mutations' and t.tgenabled = 'O'
  ) as has_trg_audit_song_mutations,
  exists (
    select 1 from pg_catalog.pg_trigger t
    join pg_catalog.pg_class c on c.oid = t.tgrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'songs' and t.tgname = 'trg_touch_songs_updated_at' and t.tgenabled = 'O'
  ) as has_trg_touch_songs_updated_at;

select indexname, indexdef
from pg_catalog.pg_indexes
where schemaname = 'public'
  and tablename = 'songs'
order by indexname;

-- 5. Confirm active owner readiness (`role = 'owner'`, matching email, confirmed, verified TOTP)
select
  a.user_id,
  lower(a.email) as admin_email,
  lower(u.email) as auth_email,
  (lower(a.email) = lower(u.email)) as emails_match,
  a.role,
  a.is_active,
  u.email_confirmed_at,
  coalesce(u.is_anonymous, false) as is_anonymous,
  (u.banned_until is null or u.banned_until <= now()) as not_banned,
  exists (
    select 1
    from auth.mfa_factors f
    where f.user_id = a.user_id
      and f.factor_type = 'totp'
      and f.status = 'verified'
  ) as has_verified_totp,
  a.created_at
from public.admin_users a
left join auth.users u on u.id = a.user_id
order by a.created_at asc;

-- 6. Confirm preserved Nasheed song count & audio/cover metadata
select
  count(*) as preserved_songs_count,
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
