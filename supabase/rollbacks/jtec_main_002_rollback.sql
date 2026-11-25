-- ==============================================================================
-- JTEC MUSIC (TARGET: jtec_main ONLY) — SAFE ROLLBACK FOR 002_jtec_main_music_manager.sql
-- ==============================================================================
-- Reverts ONLY the triggers, owner-only helpers, and policies added by
-- `002_jtec_main_music_manager.sql` back to `001_secure_admin_auth.sql` protections.
--
-- DATA & STORAGE PRESERVATION GUARANTEE:
--   * Never drops `public.songs`, `public.admin_users`, or `public.admin_audit_logs`.
--   * Never truncates or deletes rows from `public.songs` or `public.admin_audit_logs`.
--   * Never deletes any files from `storage.objects` or `storage.buckets`.
--   * Preserves public streaming (`SELECT`) and `AS RESTRICTIVE` guards on BOTH
--     `'music'` and `'artwork'` buckets using `public.is_jtec_admin_aal2()`.
-- ==============================================================================

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.is_jtec_admin_aal2()') is null then
    raise exception 'Cannot safely roll back 002 on jtec_main: public.is_jtec_admin_aal2() from 001_secure_admin_auth.sql is missing.';
  end if;
end
$$;

-- 1. Remove triggers added by 002 without touching `public.songs` rows or columns
drop trigger if exists trg_audit_song_mutations on public.songs;
drop trigger if exists trg_touch_songs_updated_at on public.songs;

-- 2. Restore `001_secure_admin_auth.sql` policies on `public.songs` (public SELECT + AAL2 Admin writes)
drop policy if exists "Allow public read on songs" on public.songs;
drop policy if exists "Owner insert songs" on public.songs;
drop policy if exists "Owner update songs" on public.songs;
drop policy if exists "Owner delete songs" on public.songs;
drop policy if exists "Admin manage songs" on public.songs;

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

-- 3. Restore `001` storage policies on `'music'` and keep `'artwork'` safely read-only for public + AAL2 admin writes
drop policy if exists "Public Access music" on storage.objects;
drop policy if exists "Public Access artwork" on storage.objects;
drop policy if exists "Owner manage music and artwork buckets" on storage.objects;
drop policy if exists "Admin manage music bucket" on storage.objects;
drop policy if exists "Admin manage artwork bucket" on storage.objects;

drop policy if exists "Restrict anon writes on music and artwork buckets" on storage.objects;
drop policy if exists "Restrict anon updates on music and artwork buckets" on storage.objects;
drop policy if exists "Restrict anon deletes on music and artwork buckets" on storage.objects;
drop policy if exists "Restrict authenticated inserts on music and artwork buckets" on storage.objects;
drop policy if exists "Restrict authenticated updates on music and artwork buckets" on storage.objects;
drop policy if exists "Restrict authenticated deletes on music and artwork buckets" on storage.objects;

drop policy if exists "Restrict anon writes on music bucket" on storage.objects;
drop policy if exists "Restrict anon updates on music bucket" on storage.objects;
drop policy if exists "Restrict anon deletes on music bucket" on storage.objects;
drop policy if exists "Restrict authenticated inserts on music bucket" on storage.objects;
drop policy if exists "Restrict authenticated updates on music bucket" on storage.objects;
drop policy if exists "Restrict authenticated deletes on music bucket" on storage.objects;

drop policy if exists "Restrict anon writes on artwork bucket" on storage.objects;
drop policy if exists "Restrict anon updates on artwork bucket" on storage.objects;
drop policy if exists "Restrict anon deletes on artwork bucket" on storage.objects;
drop policy if exists "Restrict authenticated inserts on artwork bucket" on storage.objects;
drop policy if exists "Restrict authenticated updates on artwork bucket" on storage.objects;
drop policy if exists "Restrict authenticated deletes on artwork bucket" on storage.objects;

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

create policy "Admin manage music bucket"
  on storage.objects
  for all
  to authenticated
  using (bucket_id in ('music', 'artwork') and public.is_jtec_admin_aal2())
  with check (bucket_id in ('music', 'artwork') and public.is_jtec_admin_aal2());

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
  with check (bucket_id not in ('music', 'artwork') or public.is_jtec_admin_aal2());

create policy "Restrict authenticated updates on music and artwork buckets"
  on storage.objects
  as restrictive
  for update
  to authenticated
  using (bucket_id not in ('music', 'artwork') or public.is_jtec_admin_aal2())
  with check (bucket_id not in ('music', 'artwork') or public.is_jtec_admin_aal2());

create policy "Restrict authenticated deletes on music and artwork buckets"
  on storage.objects
  as restrictive
  for delete
  to authenticated
  using (bucket_id not in ('music', 'artwork') or public.is_jtec_admin_aal2());

-- 4. Drop 002-only helper functions after dependent policies have been replaced
drop function if exists public.log_music_action(text, jsonb);
drop function if exists public.audit_song_mutations();
drop function if exists public.touch_songs_updated_at();
drop function if exists public.is_jtec_owner_aal2();
drop function if exists public.is_jtec_owner();

commit;
