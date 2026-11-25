# JTEC MUSIC — Security Architecture & Activation Guide

This document defines the security architecture for JTEC MUSIC and explicitly separates **protections already active in application code** from **database protections that remain unactivated until the SQL migrations are executed manually on `jtec_main`, `nasheed`, and `love_chill`**.

---

## 1. Current Security Status: Code vs. Remote Databases

> **Important Pre-Migration Notice**: Automated unit/contract tests verify application code logic and SQL contracts locally, **not** against live remote Supabase databases. Because the database migrations have **not yet been executed**, remote database RLS, owner-only TOTP AAL2 storage guards, and song audit triggers remain **inactive** until you complete Section 5 below.

| Control | Layer | Status | Scope / Notes |
|---|---|---|---|
| `vite.config.ts` `envPrefix: ['VITE_']` | App Code / Build | **Active** | Prevents non-`VITE_` server credentials from entering JS/APK bundles |
| Isolated `jtec-party` Client (`VITE_PARTY_SUPABASE_*`, ID `dihyzyqhppmqtkheqpbs`) | App Code | **Active** | Dedicated client with anonymous auth; zero fallback to `jtec_main`, `nasheed`, or `love_chill` |
| Fail-Closed Admin Verification (`src/services/adminAuth.ts`) | App Code | **Active** | Denies access on missing RPC, MFA API error, network/permission error, anonymous session, unconfirmed email, or inactive admin flag |
| Mandatory TOTP Gate (`mfa_enrollment_required` / `mfa_required` in `DeveloperPage.tsx`) | App Code | **Active** | Blocks Developer Portal tabs, telemetry reads, and config mutations unless verified at `aal2` |
| Session Timeouts, Global Sign-Out & HTTPS APK Validation | App Code | **Active** | 30m idle lock, 12h `sessionStorage` / 7d persisted max, 5-attempt cooldown, `assertActiveAdminSession()` before cloud writes |
| CI Security Gate (`.github/workflows/deploy.yml`, `android-build.yml`) | CI Pipeline | **Active** | Installs Bun `1.4.4`, runs `npm test` -> `npm run lint` -> `npm run build` |
| `jtec_main` Foundation (`001_secure_admin_auth.sql`) | Remote DB (`jtec_main`) | **Pending Manual SQL** | `admin_users`, `admin_audit_logs`, `verify_admin_access()`, forced RLS on `app_installs` + hardened `ping_install()`/`touch_install()`, `app_config` lock |
| `jtec_main` Music Manager (`002_jtec_main_music_manager.sql`) | Remote DB (`jtec_main`) | **Pending Manual SQL** | Adds `is_jtec_owner()` / `is_jtec_owner_aal2()`, locks `songs` + `'music'` & `'artwork'` buckets to owner AAL2, adds `trg_audit_song_mutations` & `log_music_action()` |
| `nasheed` Music Security (`nasheed/001_nasheed_music_security.sql`) | Remote DB (`nasheed`) | **Pending Manual SQL** | Isolated owner-only `admin_users` (`role = 'owner'`), `admin_audit_logs`, `verify_admin_access()`, `songs` + `'music'` & `'artwork'` AAL2 RLS, `trg_audit_song_mutations` |
| `love_chill` Music Security (`love_chill/001_love_chill_music_security.sql`) | Remote DB (`love_chill`) | **Pending Manual SQL** | Isolated owner-only `admin_users` (`role = 'owner'`), `admin_audit_logs`, `verify_admin_access()`, `songs` + `'music'` & `'artwork'` AAL2 RLS, `trg_audit_song_mutations` |
| Native Supabase TOTP 2FA & Owner Email Setup | Remote Auth (`jtec_main`, `nasheed`, `love_chill`) | **Pending Dashboard Settings** | Must be configured manually in each target project's Auth -> Multi-Factor Auth & Auth -> Users |

---

## 2. Authoritative Admin Source & Mandatory TOTP (`aal2`)

1. **`public.admin_users` Is the Sole Authority**:
   - Contains `user_id`, `email`, `role` (`'admin' | 'owner'`), and `is_active`.
   - Deactivating (`is_active = false`) or deleting an admin row immediately revokes `is_jtec_admin()`, `is_jtec_admin_aal2()`, `verify_admin_access()`, and all admin RLS policies — regardless of stale `app_metadata` claims.
   - `anon` and `authenticated` have zero `INSERT`, `UPDATE`, `DELETE`, or `TRUNCATE` privileges on `public.admin_users`.
2. **Mandatory TOTP MFA (`aal2`)**:
   - `public.is_jtec_admin_aal2()` unconditionally requires a verified `'totp'` factor in `auth.mfa_factors` **and** JWT `aal = 'aal2'`. There is no AAL1 bypass.
   - Admins without an enrolled factor are stopped at the **Mandatory 2FA Setup Required** screen until QR setup + 6-digit verification completes.
3. **Immutable `public.admin_audit_logs`**:
   - Enforces `force row level security`; revokes `INSERT`, `UPDATE`, `DELETE`, and `TRUNCATE` from `public`, `anon`, and `authenticated`.
   - Restrictive `UPDATE` (`USING (false) WITH CHECK (false)`) and `DELETE` (`USING (false)`) policies prevent audit tampering even by admins.
   - Inserts occur only via `log_admin_action()`, which validates `is_jtec_admin_aal2()` and sets transaction-local GUC `app.jtec_audit_write = 'on'`.

---

## 3. Telemetry Compatibility (`ping_install` & `touch_install`) Under Forced RLS

App telemetry (`src/services/appConfig.ts`) calls `ping_install()` (8-argument signature with 4-argument fallback) and `touch_install(p_id)` using the unauthenticated (`anon`) `jtec_main` client and **never** writes directly to `public.app_installs`.

When `001_secure_admin_auth.sql` runs in `jtec_main`, Section 10 inspects every overload of `public.ping_install` and `public.touch_install` in `pg_catalog.pg_proc` **before** forcing RLS on `public.app_installs`:
- Ensures `SECURITY DEFINER` (`prosecdef = true`) without altering column names or parameter signatures.
- Verifies ownership by a `BYPASSRLS` / superuser role (assigning `OWNER TO postgres` if needed so `FORCE ROW LEVEL SECURITY` on `public.app_installs` does not block telemetry upserts; aborts atomically if no `BYPASSRLS` owner exists).
- Locks `set search_path = pg_catalog, public, extensions` (excluding `pg_temp`).
- Revokes default `PUBLIC` execution and grants `EXECUTE` strictly to `anon, authenticated`.

---

## 4. Music Catalog, Storage Security & JTEC Party Isolation

- **Three Music Targets Only (`jtec_main`, `nasheed`, `love_chill`)**:
  - Public listeners (`anon`, `authenticated`) preserve full read/stream/download `SELECT` access on `public.songs` and both `'music'` and `'artwork'` storage buckets, with zero destructive operations on existing songs, metadata, or storage objects.
  - All `INSERT`, `UPDATE`, and `DELETE` mutations on `public.songs` and `storage.objects` (`bucket_id in ('music', 'artwork')`) are restricted via `public.is_jtec_owner_aal2()` (requires `public.admin_users.role = 'owner'`, `is_active = true`, verified TOTP factor, and JWT `aal = 'aal2'`) plus `AS RESTRICTIVE` policies for both `anon` and `authenticated`.
  - `'artwork'` bucket allows manual or embedded cover uploads (`image/jpeg`, `image/png`, `image/webp`, 5 MB max) with owner-AAL2-only writes.
  - `public.audit_song_mutations()` automatically logs `song_uploaded`, `song_edited`, `song_replaced` (audio or cover path/URL change), and `song_deleted` into `public.admin_audit_logs`; `public.log_music_action()` handles explicit storage audit events.
- **JTEC Party (`jtec-party`, `dihyzyqhppmqtkheqpbs`)**: Uses its own Supabase project (`VITE_PARTY_SUPABASE_URL` / `VITE_PARTY_SUPABASE_ANON_KEY`) with anonymous guest/host authentication intact. **Never run any music or admin migration on `jtec-party`.**

---

## 5. Exact Manual Migration Order, Dashboard Settings & Verification

> **Before Running Any Migration**: Review schema & configuration assumptions below:
> - All scripts assume default table `public.songs` and default buckets `'music'` and `'artwork'`. If any live project uses custom overrides via `VITE_SUPABASE_*_TABLE` or `VITE_SUPABASE_*_BUCKET`, inspect the pre-migration audit output first and update table/bucket identifiers before running writes.
> - All scripts assume the owner account (`fatormajohn999@gmail.com`) already exists in **Authentication -> Users** on **each** target project with `email_confirmed_at IS NOT NULL` (`is_anonymous = false`). If not yet created on `nasheed` or `love_chill`, invite/create it in the Dashboard first so `INSERT INTO public.admin_users` seeds cleanly.
> - Legacy `public.songs` tables with custom pre-existing `NOT NULL` columns lacking defaults are preserved on existing rows and checked by the pre-migration audits; inspect Query #2 of each pre-check before future upload UI writes.

### A. JTEC Main (`jtec_main`) — SQL Editor

1. **Pre-Check (Foundation)**: Run `supabase/checks/000_pre_migration_audit.sql` and record `baseline_songs_count`, `baseline_installs_count`, `current_min_build`, and current policy snapshot.
2. **Dashboard Settings (`jtec_main`)**:
   - **Authentication -> Multi-Factor Auth**: Enable **TOTP**.
   - **Authentication -> Providers -> Email**: Ensure email confirmation is enabled and public sign-ups are disabled (if admin-only).
   - **Authentication -> Users**: Verify `fatormajohn999@gmail.com` is confirmed.
3. **Foundation Migration**: Execute `supabase/migrations/001_secure_admin_auth.sql` (`BEGIN; ... COMMIT;`).
4. **Post-Verify (Foundation)**: Run `supabase/checks/002_post_migration_verify.sql` and confirm `ping_install`/`touch_install` hardening + preserved baselines.
5. **Pre-Check (Music Manager)**: Run `supabase/checks/jtec_main_pre_music_manager.sql` to inspect live `songs` columns, cover URL patterns, and buckets.
6. **Music Manager Migration**: Execute `supabase/migrations/002_jtec_main_music_manager.sql` (`BEGIN; ... COMMIT;`).
7. **Post-Verify (Music Manager)**: Run `supabase/checks/jtec_main_post_music_manager.sql` and confirm `is_jtec_owner_aal2`, `'music'` + `'artwork'` buckets, `AS RESTRICTIVE` storage policies, `trg_audit_song_mutations`, and preserved song/install counts.

### B. JTEC Nasheed (`nasheed`) — SQL Editor

1. **Pre-Check**: Run `supabase/checks/nasheed_pre_migration_audit.sql` and record existing tables, `songs` columns/defaults, bucket names, policy snapshot, owner user status, and `baseline_songs_count`.
2. **Dashboard Settings (`nasheed`)**:
   - **Authentication -> Users**: Ensure `fatormajohn999@gmail.com` exists with a confirmed email (`email_confirmed_at IS NOT NULL`).
   - **Authentication -> Multi-Factor Auth**: Enable **TOTP**.
   - **Authentication -> Providers -> Email**: Enable Email Auth and disable public user sign-ups so ordinary listeners cannot create accounts on `nasheed`.
   - **Storage -> Configuration / CORS**: Confirm your production GitHub Pages origin (`https://<user>.github.io`) and `http://localhost:3000` are allowed for uploads.
3. **Migration**: Execute `supabase/migrations/nasheed/001_nasheed_music_security.sql` (`BEGIN; ... COMMIT;`).
4. **Post-Verify**: Run `supabase/checks/nasheed_post_migration_verify.sql` and verify `owner_role`, `FORCE RLS`, `'music'` & `'artwork'` buckets, `AS RESTRICTIVE` policies, `trg_audit_song_mutations`, active `owner` row, and `preserved_songs_count`.

### C. JTEC Love & Chill (`love_chill`) — SQL Editor

1. **Pre-Check**: Run `supabase/checks/love_chill_pre_migration_audit.sql` and record existing tables, `songs` columns/defaults, bucket names, policy snapshot, owner user status, and `baseline_songs_count`.
2. **Dashboard Settings (`love_chill`)**:
   - **Authentication -> Users**: Ensure `fatormajohn999@gmail.com` exists with a confirmed email (`email_confirmed_at IS NOT NULL`).
   - **Authentication -> Multi-Factor Auth**: Enable **TOTP**.
   - **Authentication -> Providers -> Email**: Enable Email Auth and disable public user sign-ups.
   - **Storage -> Configuration / CORS**: Confirm production Web origin and `http://localhost:3000` are allowed for uploads.
3. **Migration**: Execute `supabase/migrations/love_chill/001_love_chill_music_security.sql` (`BEGIN; ... COMMIT;`).
4. **Post-Verify**: Run `supabase/checks/love_chill_post_migration_verify.sql` and verify `owner_role`, `FORCE RLS`, `'music'` & `'artwork'` buckets, `AS RESTRICTIVE` policies, `trg_audit_song_mutations`, active `owner` row, and `preserved_songs_count`.

### D. Live Functional Verification Checklist (All 3 Music Targets + Party)

- **Public Listeners (`anon`)**: Verify existing songs stream and cover images load without signing in; verify direct REST `POST`/`PATCH`/`DELETE` to `/rest/v1/songs` and `/storage/v1/object/music/...` or `/artwork/...` fail with `401`/`403`/`42501`.
- **Non-Owner / AAL1 Rejection**: Confirm anonymous users, ordinary authenticated emails, deactivated rows (`is_active = false`), and `aal1` sessions before TOTP verification are rejected by `is_jtec_owner_aal2()`, `songs` writes, and `storage.objects` writes.
- **Owner AAL2 Operations (`jtec_main`, `nasheed`, `love_chill`)**: Once signed in with verified TOTP (`aal2`), confirm uploading audio/artwork, editing metadata, replacing audio/cover URLs, and deleting test items succeed and record `song_uploaded`, `song_edited`, `song_replaced`, or `song_deleted` in `public.admin_audit_logs`.
- **JTEC Main Telemetry & JTEC Party**: Confirm `ping_install`/`touch_install` succeed without `42501` errors on `jtec_main`, and Party join/host/playback sync continues working normally on `jtec-party`.

---

## 6. Safe Rollback Procedure

1. **Application / Workflow Rollback (Git)**:
   ```bash
   git log --oneline -n 5
   git revert <commit-sha>
   git push origin main
   ```
2. **Recover Owner Lockout Without Disabling RLS**:
   - **Missing or inactive owner row**: Confirm `fatormajohn999@gmail.com` exists and is email-confirmed in the target project's `auth.users`, then insert/re-activate `role = 'owner'`, `is_active = true` in that project's `public.admin_users`. Never grant public write policies.
   - **Lost authenticator device**: Delete only the lost row in `auth.mfa_factors` in that project's SQL Editor (or Auth -> Users), forcing **Mandatory 2FA Setup** on next sign-in.
3. **Rollback Music Management Triggers / Policies Safely (Zero Data Loss)**:
   - Every migration runs inside `BEGIN; ... COMMIT;`, so any SQL execution error automatically rolls back with zero partial state.
   - To pause only automatic song audit triggers on any target without losing songs or historical logs:
     `DROP TRIGGER IF EXISTS trg_audit_song_mutations ON public.songs;`
   - On `jtec_main`, if reverting `002_jtec_main_music_manager.sql` back to `001_secure_admin_auth.sql` policies while preserving all songs and `artwork` files: drop the `Owner * songs` / `'artwork'` storage policies and re-apply only the `songs` & `'music'` policy section of `001_secure_admin_auth.sql` (never drop `public.songs` or `public.app_installs`).
   - On `nasheed` or `love_chill`, restore the exact pre-migration `pg_policies` snapshot saved during Step 1 (`nasheed_pre_migration_audit.sql` / `love_chill_pre_migration_audit.sql`) without dropping `public.songs` or deleting any files in `storage.objects`.
   - On `jtec_main` telemetry, if `ping_install` / `touch_install` behaves unexpectedly, inspect `owner_has_bypassrls = true` and `search_path` in `002_post_migration_verify.sql` before altering any policies.
