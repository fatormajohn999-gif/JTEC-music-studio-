-- ==============================================================================
-- JTEC MUSIC (MAIN PROJECT: jtec_main) — SECURE ADMIN AUTH & RLS MIGRATION
-- ==============================================================================
-- Run this script in the Supabase Dashboard -> SQL Editor of your JTEC MUSIC
-- MAIN project ONLY (do NOT run this on the dedicated JTEC Party project).
--
-- What this migration does and why it is necessary:
-- 1. Creates `public.admin_users`: explicit server-side allowlist of authorized
--    administrators (locked against self-registration or privilege escalation).
-- 2. Creates `public.admin_audit_logs`: immutable audit trail of admin logins
--    and configuration changes.
-- 3. Creates `is_jtec_admin()`, `is_jtec_admin_aal2()`, `verify_admin_access()`,
--    and `log_admin_action()` SECURITY DEFINER functions with locked `search_path`.
--    - Explicitly rejects anonymous sessions (`is_anonymous` / `anonymous` provider).
--    - Requires verified email (`email_confirmed_at IS NOT NULL`).
--    - Requires MFA `aal2` automatically as soon as the admin has a verified TOTP
--      factor in `auth.mfa_factors`.
-- 4. Locks down `app_config`, `app_installs`, `songs`, and `storage.objects`
--    with strict Row Level Security so ordinary authenticated users or anonymous
--    users cannot modify `min_build`/`apk_url`, read device telemetry, or delete songs.
-- ==============================================================================

-- 1. Authorized Admins Table (non-privileged users cannot read others or write)
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role text not null default 'admin' check (role in ('admin', 'owner')),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.admin_users enable row level security;
alter table public.admin_users force row level security;

drop policy if exists "Admin users can view own row" on public.admin_users;
create policy "Admin users can view own row"
  on public.admin_users
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Block all client-side INSERT/UPDATE/DELETE on admin_users (only service_role / SQL Editor can manage)
revoke insert, update, delete on public.admin_users from anon, authenticated;

-- 2. Seed authorized owner/admin account(s) from existing auth.users by verified email
insert into public.admin_users (user_id, email, role, is_active)
select id, lower(email), 'owner', true
from auth.users
where lower(email) = 'fatormajohn999@gmail.com'
  and coalesce(is_anonymous, false) = false
on conflict (user_id) do update
set email = excluded.email,
    is_active = true;

-- Also tag app_metadata.role = 'admin' (non-editable by clients) for the seeded owner
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
where lower(email) = 'fatormajohn999@gmail.com'
  and coalesce(is_anonymous, false) = false;

-- 3. Admin Audit Log Table (append-only for verified admins)
create table if not exists public.admin_audit_logs (
  id bigint generated always as identity primary key,
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  admin_email text,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.admin_audit_logs enable row level security;
alter table public.admin_audit_logs force row level security;

-- 4. Core Admin Verification Helper (AAL1+ with verified identity; rejects anonymous)
create or replace function public.is_jtec_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_jwt jsonb := auth.jwt();
  v_is_anon boolean := coalesce((v_jwt ->> 'is_anonymous')::boolean, false);
  v_provider text := coalesce(v_jwt -> 'app_metadata' ->> 'provider', '');
  v_app_role text := coalesce(v_jwt -> 'app_metadata' ->> 'role', '');
  v_user_valid boolean := false;
  v_in_table boolean := false;
begin
  if v_uid is null or v_is_anon or v_provider = 'anonymous' then
    return false;
  end if;

  select exists (
    select 1
    from auth.users u
    where u.id = v_uid
      and coalesce(u.is_anonymous, false) = false
      and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until < now())
  ) into v_user_valid;

  if not v_user_valid then
    return false;
  end if;

  select exists (
    select 1
    from public.admin_users a
    where a.user_id = v_uid
      and a.is_active = true
  ) into v_in_table;

  return v_in_table or v_app_role in ('admin', 'owner');
end;
$$;

-- 5. Strict AAL2-Aware Admin Helper (enforces MFA whenever admin has a verified TOTP factor)
create or replace function public.is_jtec_admin_aal2()
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_jwt jsonb := auth.jwt();
  v_aal text := coalesce(v_jwt ->> 'aal', 'aal1');
  v_has_verified_mfa boolean := false;
begin
  if not public.is_jtec_admin() then
    return false;
  end if;

  select exists (
    select 1
    from auth.mfa_factors f
    where f.user_id = v_uid
      and f.status = 'verified'
  ) into v_has_verified_mfa;

  if v_has_verified_mfa and v_aal <> 'aal2' then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function public.is_jtec_admin() from public;
grant execute on function public.is_jtec_admin() to authenticated;

revoke all on function public.is_jtec_admin_aal2() from public;
grant execute on function public.is_jtec_admin_aal2() to authenticated;

-- 6. Client-Callable Server Verification RPC
create or replace function public.verify_admin_access()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_jwt jsonb := auth.jwt();
  v_is_anon boolean := coalesce((v_jwt ->> 'is_anonymous')::boolean, false);
  v_aal text := coalesce(v_jwt ->> 'aal', 'aal1');
  v_email text := v_jwt ->> 'email';
  v_is_admin boolean := public.is_jtec_admin();
  v_has_verified_mfa boolean := false;
  v_role text := null;
begin
  if v_uid is null or v_is_anon then
    return jsonb_build_object(
      'is_admin', false,
      'is_anonymous', true,
      'mfa_required', false,
      'current_aal', v_aal,
      'reason', 'Anonymous or unauthenticated sessions are not allowed.'
    );
  end if;

  if not v_is_admin then
    return jsonb_build_object(
      'is_admin', false,
      'is_anonymous', false,
      'mfa_required', false,
      'current_aal', v_aal,
      'reason', 'Account is not listed as an authorized JTEC administrator.'
    );
  end if;

  select role into v_role
  from public.admin_users
  where user_id = v_uid and is_active = true;

  select exists (
    select 1
    from auth.mfa_factors f
    where f.user_id = v_uid
      and f.status = 'verified'
  ) into v_has_verified_mfa;

  return jsonb_build_object(
    'is_admin', true,
    'is_anonymous', false,
    'role', coalesce(v_role, v_jwt -> 'app_metadata' ->> 'role', 'admin'),
    'mfa_required', v_has_verified_mfa,
    'has_verified_mfa', v_has_verified_mfa,
    'current_aal', v_aal,
    'aal_enforced', (not v_has_verified_mfa) or (v_aal = 'aal2'),
    'user_id', v_uid,
    'email', v_email
  );
end;
$$;

revoke all on function public.verify_admin_access() from public;
grant execute on function public.verify_admin_access() to authenticated;

-- 7. Audit Logging RPC (Admin Only)
create or replace function public.log_admin_action(p_action text, p_details jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := auth.jwt() ->> 'email';
begin
  if not public.is_jtec_admin_aal2() then
    raise exception 'Unauthorized admin audit log attempt' using errcode = '42501';
  end if;

  insert into public.admin_audit_logs (admin_user_id, admin_email, action, details)
  values (v_uid, v_email, left(coalesce(p_action, 'unknown'), 80), coalesce(p_details, '{}'::jsonb));
end;
$$;

revoke all on function public.log_admin_action(text, jsonb) from public;
grant execute on function public.log_admin_action(text, jsonb) to authenticated;

drop policy if exists "Admins read audit logs" on public.admin_audit_logs;
create policy "Admins read audit logs"
  on public.admin_audit_logs
  for select
  to authenticated
  using (public.is_jtec_admin_aal2());

revoke insert, update, delete on public.admin_audit_logs from anon, authenticated;

-- 8. Lock down `public.app_config` (public SELECT for id=1, strict Admin AAL2 for mutations)
alter table public.app_config enable row level security;

drop policy if exists "Public read app_config" on public.app_config;
drop policy if exists "Allow public read on app_config" on public.app_config;
create policy "Allow public read on app_config"
  on public.app_config
  for select
  to anon, authenticated
  using (id = 1);

drop policy if exists "Admin update app_config" on public.app_config;
drop policy if exists "Allow authenticated update on app_config" on public.app_config;
create policy "Admin update app_config"
  on public.app_config
  for update
  to authenticated
  using (public.is_jtec_admin_aal2())
  with check (public.is_jtec_admin_aal2());

drop policy if exists "Admin insert app_config" on public.app_config;
create policy "Admin insert app_config"
  on public.app_config
  for insert
  to authenticated
  with check (public.is_jtec_admin_aal2());

drop policy if exists "Admin delete app_config" on public.app_config;
create policy "Admin delete app_config"
  on public.app_config
  for delete
  to authenticated
  using (public.is_jtec_admin_aal2());

-- 9. Lock down `public.app_installs` (Admin AAL2 ONLY for SELECT/UPDATE/DELETE;
--    client apps write telemetry solely via SECURITY DEFINER ping_install / touch_install RPCs)
alter table public.app_installs enable row level security;

drop policy if exists "Allow public read on app_installs" on public.app_installs;
drop policy if exists "Allow authenticated read on app_installs" on public.app_installs;
drop policy if exists "Admin read app_installs" on public.app_installs;
create policy "Admin read app_installs"
  on public.app_installs
  for select
  to authenticated
  using (public.is_jtec_admin_aal2());

drop policy if exists "Allow authenticated update on app_installs" on public.app_installs;
drop policy if exists "Admin update app_installs" on public.app_installs;
create policy "Admin update app_installs"
  on public.app_installs
  for update
  to authenticated
  using (public.is_jtec_admin_aal2())
  with check (public.is_jtec_admin_aal2());

drop policy if exists "Admin delete app_installs" on public.app_installs;
create policy "Admin delete app_installs"
  on public.app_installs
  for delete
  to authenticated
  using (public.is_jtec_admin_aal2());

-- 10. Lock down `public.songs` and `storage.objects` mutations to Admin AAL2 only
alter table public.songs enable row level security;

drop policy if exists "Allow public read on songs" on public.songs;
create policy "Allow public read on songs"
  on public.songs
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Admin manage songs" on public.songs;
create policy "Admin manage songs"
  on public.songs
  for all
  to authenticated
  using (public.is_jtec_admin_aal2())
  with check (public.is_jtec_admin_aal2());

drop policy if exists "Admin manage music bucket" on storage.objects;
create policy "Admin manage music bucket"
  on storage.objects
  for all
  to authenticated
  using (bucket_id = 'music' and public.is_jtec_admin_aal2())
  with check (bucket_id = 'music' and public.is_jtec_admin_aal2());
