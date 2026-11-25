-- ==============================================================================
-- JTEC MUSIC (MAIN PROJECT: jtec_main) — HARDENED ADMIN AUTH & RLS MIGRATION
-- ==============================================================================
-- Run this script in the Supabase Dashboard -> SQL Editor of your JTEC MUSIC
-- MAIN project ONLY (do NOT run this on the dedicated JTEC Party project).
--
-- Security guarantees enforced by this migration:
-- 1. `public.admin_users` is the SOLE authoritative source for admin access.
--    - Deactivating (`is_active = false`) or deleting an admin row immediately
--      revokes all admin RPC and RLS privileges, regardless of `app_metadata`.
--    - Client roles (`anon`, `authenticated`) have no INSERT/UPDATE/DELETE
--      privileges on `public.admin_users`.
-- 2. Mandatory TOTP MFA (`aal2`) for EVERY administrator:
--    - `public.is_jtec_admin_aal2()` unconditionally requires a verified TOTP
--      factor in `auth.mfa_factors` AND JWT `aal = 'aal2'`.
--    - There is NO AAL1 bypass when an admin has not yet enrolled TOTP; they
--      must complete TOTP enrollment before reading telemetry/audit logs or
--      performing any admin mutation.
-- 3. Safe SECURITY DEFINER functions:
--    - Locked `set search_path = pg_catalog, public, auth` (excludes `pg_temp`).
--    - Explicit schema-qualified table/function references.
--    - Execution revoked from `public` and `anon`; granted only to `authenticated`.
-- 4. Legacy policy neutralization:
--    - Dynamically drops ALL existing policies on `admin_users`,
--      `admin_audit_logs`, `app_config`, `app_installs`, and `songs` before
--      recreating least-privilege policies, plus drops `'music'` write policies
--      on `storage.objects` and adds `AS RESTRICTIVE` write guards.
-- 5. Immutable `public.admin_audit_logs`:
--    - Forced RLS; no client INSERT/UPDATE/DELETE/TRUNCATE grants; explicit
--      restrictive deny-all UPDATE/DELETE policies; writes allowed solely via
--      `public.log_admin_action()` using transaction-local GUC guard.
-- 6. Telemetry RPC (`ping_install` / `touch_install`) safety & RLS compatibility:
--    - Dynamically inspects existing `ping_install` and `touch_install` overloads
--      without altering their internal column mappings.
--    - Enforces `SECURITY DEFINER`, safe `set search_path = pg_catalog, public, extensions`,
--      `BYPASSRLS` owner verification (`postgres`), and minimal grants (`anon`, `authenticated`).
--    - Wrapped in an atomic `BEGIN; ... COMMIT;` transaction so any failure rolls back.
-- ==============================================================================

begin;

-- 1. Authorized Admins Table (authoritative source; zero client writes)
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role text not null default 'admin' check (role in ('admin', 'owner')),
  is_active boolean not null default true,
  created_at timestamptz not null default pg_catalog.timezone('utc', pg_catalog.now())
);

alter table public.admin_users enable row level security;
alter table public.admin_users force row level security;

revoke all on table public.admin_users from public, anon, authenticated;
grant select on table public.admin_users to authenticated;

-- 2. Seed initial owner account into `public.admin_users` (does not re-activate if disabled later)
insert into public.admin_users (user_id, email, role, is_active)
select u.id, pg_catalog.lower(u.email), 'owner', true
from auth.users u
where pg_catalog.lower(u.email) = 'fatormajohn999@gmail.com'
  and pg_catalog.coalesce(u.is_anonymous, false) = false
  and u.email_confirmed_at is not null
on conflict (user_id) do nothing;

-- 3. Immutable Admin Audit Log Table
create table if not exists public.admin_audit_logs (
  id bigint generated always as identity primary key,
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  admin_email text,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.timezone('utc', pg_catalog.now())
);

alter table public.admin_audit_logs enable row level security;
alter table public.admin_audit_logs force row level security;

-- Revoke all mutating table & sequence privileges from client roles (SELECT only for authenticated; RLS enforces AAL2)
revoke all on table public.admin_audit_logs from public, anon, authenticated;
grant select on table public.admin_audit_logs to authenticated;

-- 4. Drop ALL existing policies on protected public tables so no legacy permissive policy survives
do $$
declare
  v_pol record;
begin
  for v_pol in
    select schemaname, tablename, policyname
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename in ('admin_users', 'admin_audit_logs', 'app_config', 'app_installs', 'songs')
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

-- Drop any legacy policies on storage.objects referencing the 'music' bucket so we rebuild cleanly
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
        or policyname ilike '%music%'
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

-- Policy on admin_users: own active row select only
create policy "Admin users can view own row"
  on public.admin_users
  for select
  to authenticated
  using (auth.uid() = user_id);

-- 5. Core Authoritative Admin Helper (`public.admin_users` ONLY; rejects anonymous/banned/unconfirmed)
create or replace function public.is_jtec_admin()
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
  v_active_admin boolean := false;
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
      and a.role in ('admin', 'owner')
  ) into v_active_admin;

  return pg_catalog.coalesce(v_active_admin, false);
end;
$$;

-- 6. Strict Mandatory-MFA Admin Helper (ALWAYS requires verified TOTP factor + JWT AAL2)
create or replace function public.is_jtec_admin_aal2()
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
  if not public.is_jtec_admin() then
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

revoke all on function public.is_jtec_admin() from public, anon;
grant execute on function public.is_jtec_admin() to authenticated;

revoke all on function public.is_jtec_admin_aal2() from public, anon;
grant execute on function public.is_jtec_admin_aal2() to authenticated;

-- 7. Client-Callable Server Verification RPC
create or replace function public.verify_admin_access()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_jwt jsonb := auth.jwt();
  v_is_anon boolean := pg_catalog.coalesce((v_jwt ->> 'is_anonymous')::boolean, false);
  v_aal text := pg_catalog.coalesce(v_jwt ->> 'aal', 'aal1');
  v_email text := v_jwt ->> 'email';
  v_is_admin boolean := public.is_jtec_admin();
  v_has_verified_mfa boolean := false;
  v_role text := null;
begin
  if v_uid is null or v_jwt is null or v_is_anon then
    return pg_catalog.jsonb_build_object(
      'is_admin', false,
      'is_anonymous', true,
      'is_active', false,
      'mfa_required', true,
      'has_verified_mfa', false,
      'needs_mfa_enrollment', false,
      'current_aal', v_aal,
      'aal_enforced', false,
      'reason', 'Anonymous or unauthenticated sessions are not allowed.'
    );
  end if;

  if not v_is_admin then
    return pg_catalog.jsonb_build_object(
      'is_admin', false,
      'is_anonymous', false,
      'is_active', false,
      'mfa_required', true,
      'has_verified_mfa', false,
      'needs_mfa_enrollment', false,
      'current_aal', v_aal,
      'aal_enforced', false,
      'reason', 'Account is deactivated or not an authorized JTEC administrator.'
    );
  end if;

  select a.role into v_role
  from public.admin_users a
  where a.user_id = v_uid
    and a.is_active = true
    and a.role in ('admin', 'owner');

  if v_role is null then
    return pg_catalog.jsonb_build_object(
      'is_admin', false,
      'is_anonymous', false,
      'is_active', false,
      'mfa_required', true,
      'has_verified_mfa', false,
      'needs_mfa_enrollment', false,
      'current_aal', v_aal,
      'aal_enforced', false,
      'reason', 'Account is deactivated or not an authorized JTEC administrator.'
    );
  end if;

  select exists (
    select 1
    from auth.mfa_factors f
    where f.user_id = v_uid
      and f.factor_type = 'totp'
      and f.status = 'verified'
  ) into v_has_verified_mfa;

  return pg_catalog.jsonb_build_object(
    'is_admin', true,
    'is_anonymous', false,
    'is_active', true,
    'role', v_role,
    'mfa_required', true,
    'has_verified_mfa', v_has_verified_mfa,
    'needs_mfa_enrollment', (not v_has_verified_mfa),
    'current_aal', v_aal,
    'aal_enforced', (v_has_verified_mfa and v_aal = 'aal2'),
    'user_id', v_uid,
    'email', v_email
  );
end;
$$;

revoke all on function public.verify_admin_access() from public, anon;
grant execute on function public.verify_admin_access() to authenticated;

-- 8. Immutable Audit Logging RPC (Admin AAL2 Only)
create or replace function public.log_admin_action(p_action text, p_details jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := auth.jwt() ->> 'email';
begin
  if not public.is_jtec_admin_aal2() then
    raise exception 'Unauthorized admin audit log attempt' using errcode = '42501';
  end if;

  -- Transaction-local guard honored by admin_audit_logs INSERT policy
  perform pg_catalog.set_config('app.jtec_audit_write', 'on', true);

  insert into public.admin_audit_logs (admin_user_id, admin_email, action, details)
  values (
    v_uid,
    v_email,
    pg_catalog.left(pg_catalog.coalesce(p_action, 'unknown'), 80),
    pg_catalog.coalesce(p_details, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.log_admin_action(text, jsonb) from public, anon;
grant execute on function public.log_admin_action(text, jsonb) to authenticated;

-- Admin audit log policies: read-only for AAL2 admins; inserts strictly gated via log_admin_action; zero update/delete
create policy "Admins read audit logs"
  on public.admin_audit_logs
  for select
  to authenticated
  using (public.is_jtec_admin_aal2());

create policy "Insert audit logs via RPC only"
  on public.admin_audit_logs
  for insert
  to authenticated
  with check (
    public.is_jtec_admin_aal2()
    and pg_catalog.current_setting('app.jtec_audit_write', true) = 'on'
  );

create policy "Deny all audit log updates"
  on public.admin_audit_logs
  as restrictive
  for update
  to public
  using (false)
  with check (false);

create policy "Deny all audit log deletes"
  on public.admin_audit_logs
  as restrictive
  for delete
  to public
  using (false);

-- 9. Lock down `public.app_config` (public SELECT for id=1, strict Admin AAL2 for mutations)
alter table public.app_config enable row level security;
alter table public.app_config force row level security;

revoke all on table public.app_config from public, anon;
grant select on table public.app_config to anon, authenticated;
grant insert, update, delete on table public.app_config to authenticated;

create policy "Allow public read on app_config"
  on public.app_config
  for select
  to anon, authenticated
  using (id = 1);

create policy "Admin update app_config"
  on public.app_config
  for update
  to authenticated
  using (public.is_jtec_admin_aal2())
  with check (public.is_jtec_admin_aal2());

create policy "Admin insert app_config"
  on public.app_config
  for insert
  to authenticated
  with check (public.is_jtec_admin_aal2());

create policy "Admin delete app_config"
  on public.app_config
  for delete
  to authenticated
  using (public.is_jtec_admin_aal2());

-- 10. Harden existing telemetry RPCs (`ping_install`, `touch_install`) BEFORE forcing RLS
--     on `public.app_installs` so device telemetry keeps working without direct table writes.
do $$
declare
  v_fn record;
  v_ping_count integer := 0;
  v_touch_count integer := 0;
begin
  for v_fn in
    select p.oid,
           p.proname,
           pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_args,
           p.prosecdef,
           r.rolname as owner_name,
           r.rolsuper,
           r.rolbypassrls
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    join pg_catalog.pg_roles r on r.oid = p.proowner
    where n.nspname = 'public'
      and p.proname in ('ping_install', 'touch_install')
  loop
    if v_fn.proname = 'ping_install' then
      v_ping_count := v_ping_count + 1;
    elsif v_fn.proname = 'touch_install' then
      v_touch_count := v_touch_count + 1;
    end if;

    -- Under FORCE ROW LEVEL SECURITY, telemetry RPCs must run under a BYPASSRLS owner (e.g., postgres)
    if not (v_fn.rolbypassrls or v_fn.rolsuper) then
      if exists (
        select 1 from pg_catalog.pg_roles where rolname = 'postgres' and (rolbypassrls or rolsuper)
      ) then
        execute pg_catalog.format(
          'alter function public.%I(%s) owner to postgres',
          v_fn.proname,
          v_fn.identity_args
        );
      else
        raise exception 'Telemetry RPC %.%(%) owner (%) lacks BYPASSRLS; cannot safely force RLS on public.app_installs',
          'public', v_fn.proname, v_fn.identity_args, v_fn.owner_name;
      end if;
    end if;

    -- Enforce SECURITY DEFINER and locked search_path (excluding pg_temp) while preserving signature/body
    execute pg_catalog.format(
      'alter function public.%I(%s) security definer set search_path = pg_catalog, public, extensions',
      v_fn.proname,
      v_fn.identity_args
    );

    -- Revoke PUBLIC default and grant only minimum required EXECUTE to anon and authenticated
    execute pg_catalog.format(
      'revoke all on function public.%I(%s) from public',
      v_fn.proname,
      v_fn.identity_args
    );
    execute pg_catalog.format(
      'grant execute on function public.%I(%s) to anon, authenticated',
      v_fn.proname,
      v_fn.identity_args
    );
  end loop;

  if pg_catalog.to_regclass('public.app_installs') is not null and (v_ping_count = 0 or v_touch_count = 0) then
    raise exception 'Missing telemetry RPC(s) in public schema (ping_install count=%, touch_install count=%). Aborting before locking public.app_installs.',
      v_ping_count, v_touch_count;
  end if;
end
$$;

-- 11. Lock down `public.app_installs` (Admin AAL2 ONLY for SELECT/UPDATE/DELETE;
--     client telemetry writes happen solely via hardened SECURITY DEFINER ping_install / touch_install RPCs)
alter table public.app_installs enable row level security;
alter table public.app_installs force row level security;

revoke all on table public.app_installs from public, anon;
revoke insert on table public.app_installs from authenticated;
grant select, update, delete on table public.app_installs to authenticated;

create policy "Admin read app_installs"
  on public.app_installs
  for select
  to authenticated
  using (public.is_jtec_admin_aal2());

create policy "Admin update app_installs"
  on public.app_installs
  for update
  to authenticated
  using (public.is_jtec_admin_aal2())
  with check (public.is_jtec_admin_aal2());

create policy "Admin delete app_installs"
  on public.app_installs
  for delete
  to authenticated
  using (public.is_jtec_admin_aal2());

-- 11. Lock down `public.songs` and `storage.objects` ('music' bucket) mutations to Admin AAL2 only
alter table public.songs enable row level security;
alter table public.songs force row level security;

revoke all on table public.songs from public, anon;
grant select on table public.songs to anon, authenticated;
grant insert, update, delete on table public.songs to authenticated;

create policy "Allow public read on songs"
  on public.songs
  for select
  to anon, authenticated
  using (true);

create policy "Admin manage songs"
  on public.songs
  for all
  to authenticated
  using (public.is_jtec_admin_aal2())
  with check (public.is_jtec_admin_aal2());

create policy "Public Access music"
  on storage.objects
  for select
  to public
  using (bucket_id = 'music');

create policy "Admin manage music bucket"
  on storage.objects
  for all
  to authenticated
  using (bucket_id = 'music' and public.is_jtec_admin_aal2())
  with check (bucket_id = 'music' and public.is_jtec_admin_aal2());

-- Restrictive storage guards ensure no other policy on storage.objects can allow 'music' writes
create policy "Restrict anon writes on music bucket"
  on storage.objects
  as restrictive
  for insert
  to anon
  with check (bucket_id <> 'music');

create policy "Restrict anon updates on music bucket"
  on storage.objects
  as restrictive
  for update
  to anon
  using (bucket_id <> 'music')
  with check (bucket_id <> 'music');

create policy "Restrict anon deletes on music bucket"
  on storage.objects
  as restrictive
  for delete
  to anon
  using (bucket_id <> 'music');

create policy "Restrict authenticated inserts on music bucket"
  on storage.objects
  as restrictive
  for insert
  to authenticated
  with check (bucket_id <> 'music' or public.is_jtec_admin_aal2());

create policy "Restrict authenticated updates on music bucket"
  on storage.objects
  as restrictive
  for update
  to authenticated
  using (bucket_id <> 'music' or public.is_jtec_admin_aal2())
  with check (bucket_id <> 'music' or public.is_jtec_admin_aal2());

create policy "Restrict authenticated deletes on music bucket"
  on storage.objects
  as restrictive
  for delete
  to authenticated
  using (bucket_id <> 'music' or public.is_jtec_admin_aal2());

commit;
