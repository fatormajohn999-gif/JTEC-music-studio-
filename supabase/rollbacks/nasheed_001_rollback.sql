-- ==============================================================================
-- JTEC NASHEED (TARGET: nasheed ONLY) — SAFE FAIL-CLOSED ROLLBACK FOR 001
-- ==============================================================================
-- Removes `001_nasheed_music_security.sql` triggers, owner write policies, and
-- RPC helpers while placing Nasheed into a SAFE PUBLIC-READ / ZERO-CLIENT-WRITE
-- state (prevents leaving `songs` or `'music'`/`'artwork'` open to anonymous writes).
--
-- DATA & STORAGE PRESERVATION GUARANTEE:
--   * Never drops `public.songs`, `public.admin_users`, or `public.admin_audit_logs`.
--   * Never deletes rows from `public.songs` or `public.admin_audit_logs`.
--   * Never deletes files or buckets from `storage.objects` or `storage.buckets`.
--   * Keeps public listener streaming/cover reads active (`SELECT`).
-- ==============================================================================

begin;

-- 1. Remove song triggers added by 001
drop trigger if exists trg_audit_song_mutations on public.songs;
drop trigger if exists trg_touch_songs_updated_at on public.songs;

-- 2. Lock `public.songs` to safe public read-only (preserves all songs & streaming)
alter table public.songs enable row level security;
alter table public.songs force row level security;

revoke all on table public.songs from public, anon, authenticated;
grant select on table public.songs to anon, authenticated;

drop policy if exists "Allow public read on songs" on public.songs;
drop policy if exists "Owner insert songs" on public.songs;
drop policy if exists "Owner update songs" on public.songs;
drop policy if exists "Owner delete songs" on public.songs;

create policy "Allow public read on songs"
  on public.songs
  for select
  to anon, authenticated
  using (true);

-- 3. Keep `'music'` and `'artwork'` publicly readable while blocking all client writes
drop policy if exists "Public Access music" on storage.objects;
drop policy if exists "Public Access artwork" on storage.objects;
drop policy if exists "Owner manage music and artwork buckets" on storage.objects;

drop policy if exists "Restrict anon writes on music and artwork buckets" on storage.objects;
drop policy if exists "Restrict anon updates on music and artwork buckets" on storage.objects;
drop policy if exists "Restrict anon deletes on music and artwork buckets" on storage.objects;
drop policy if exists "Restrict authenticated inserts on music and artwork buckets" on storage.objects;
drop policy if exists "Restrict authenticated updates on music and artwork buckets" on storage.objects;
drop policy if exists "Restrict authenticated deletes on music and artwork buckets" on storage.objects;

create policy "Public Access music"
  on storage.objects
  for select
  to public
  using (bucket_id = 'music');

create policy "Public Access artwork"
  on storage.objects
  for select
  to public
  using (bucket_id = 'artwork');

create policy "Restrict anon writes on music and artwork buckets"
  on storage.objects
  as restrictive
  for insert
  to anon
  with check (bucket_id not in ('music', 'artwork'));

create policy "Restrict anon updates on music and artwork buckets"
  on storage.objects
  as restrictive
  for update
  to anon
  using (bucket_id not in ('music', 'artwork'))
  with check (bucket_id not in ('music', 'artwork'));

create policy "Restrict anon deletes on music and artwork buckets"
  on storage.objects
  as restrictive
  for delete
  to anon
  using (bucket_id not in ('music', 'artwork'));

create policy "Restrict authenticated inserts on music and artwork buckets"
  on storage.objects
  as restrictive
  for insert
  to authenticated
  with check (bucket_id not in ('music', 'artwork'));

create policy "Restrict authenticated updates on music and artwork buckets"
  on storage.objects
  as restrictive
  for update
  to authenticated
  using (bucket_id not in ('music', 'artwork'))
  with check (bucket_id not in ('music', 'artwork'));

create policy "Restrict authenticated deletes on music and artwork buckets"
  on storage.objects
  as restrictive
  for delete
  to authenticated
  using (bucket_id not in ('music', 'artwork'));

-- 4. Remove 001 audit/admin policies and functions cleanly (tables & historical rows remain intact)
drop policy if exists "Owner can view own admin row" on public.admin_users;
drop policy if exists "Owner read audit logs" on public.admin_audit_logs;
drop policy if exists "Insert audit logs via RPC or trigger only" on public.admin_audit_logs;

drop function if exists public.log_music_action(text, jsonb);
drop function if exists public.log_admin_action(text, jsonb);
drop function if exists public.audit_song_mutations();
drop function if exists public.touch_songs_updated_at();
drop function if exists public.verify_admin_access();
drop function if exists public.is_jtec_admin_aal2();
drop function if exists public.is_jtec_owner_aal2();
drop function if exists public.is_jtec_admin();
drop function if exists public.is_jtec_owner();

commit;
