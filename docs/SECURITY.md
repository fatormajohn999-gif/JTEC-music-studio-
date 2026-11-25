# JTEC MUSIC — Security Architecture & Activation Guide

This document defines the security architecture for JTEC MUSIC and explicitly separates **protections already active in application code** from **database protections that remain unactivated until the SQL migration is executed on `jtec_main`**.

---

## 1. Current Security Status: Code vs. Remote Database

> **Important Pre-Migration Notice**: Automated unit/contract tests verify application code logic and SQL syntax locally, **not** against the live remote Supabase database. Because the database migration has **not yet been executed** on `jtec_main`, remote database RLS and RPC hardening are **not yet active** until you complete Section 5 below.

| Control | Layer | Status | Scope / Notes |
|---|---|---|---|
| `vite.config.ts` `envPrefix: ['VITE_']` | App Code / Build | **Active** | Prevents non-`VITE_` server credentials from entering JS/APK bundles |
| Isolated `jtec-party` Client (`VITE_PARTY_SUPABASE_*`, ID `dihyzyqhppmqtkheqpbs`) | App Code | **Active** | Dedicated client with anonymous auth; zero fallback to `jtec_main` |
| Fail-Closed Admin Verification (`src/services/adminAuth.ts`) | App Code | **Active** | Denies access on missing RPC, MFA API error, network/permission error, anonymous session, unconfirmed email, or inactive admin flag |
| Mandatory TOTP Gate (`mfa_enrollment_required` / `mfa_required` in `DeveloperPage.tsx`) | App Code | **Active** | Blocks Developer Portal tabs, telemetry reads, and config mutations unless verified at `aal2` |
| Session Timeouts, Global Sign-Out & HTTPS APK Validation | App Code | **Active** | 30m idle lock, 12h `sessionStorage` / 7d persisted max, 5-attempt cooldown, `assertActiveAdminSession()` before cloud writes |
| CI Security Gate (`.github/workflows/deploy.yml`, `android-build.yml`) | CI Pipeline | **Active** | Installs Bun `1.4.4`, runs `npm test` -> `npm run lint` -> `npm run build` |
| `public.admin_users` Allowlist & `public.admin_audit_logs` | Remote DB (`jtec_main`) | **Pending Manual SQL** | Not created/active until `001_secure_admin_auth.sql` runs in `jtec_main` |
| `is_jtec_admin()`, `is_jtec_admin_aal2()`, `verify_admin_access()`, `log_admin_action()` | Remote DB (`jtec_main`) | **Pending Manual SQL** | While unapplied, the app fails closed and locks the Developer Portal |
| Dynamic Legacy Policy Cleanup & Strict AAL2 RLS (`app_config`, `app_installs`, `songs`, `storage.objects`) | Remote DB (`jtec_main`) | **Pending Manual SQL** | Preserves all 102 existing songs & telemetry rows while locking writes/telemetry reads to AAL2 admins |
| `ping_install()` & `touch_install()` `SECURITY DEFINER` + `search_path` Hardening | Remote DB (`jtec_main`) | **Pending Manual SQL** | Verified/hardened dynamically inside `001_secure_admin_auth.sql` before `FORCE ROW LEVEL SECURITY` on `app_installs` |
| Native Supabase TOTP 2FA Provider | Remote Auth (`jtec_main`) | **Pending Dashboard Setting** | Must be enabled manually under `jtec_main` Auth -> Multi-Factor Auth |

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

## 4. JTEC Party & Public Catalog Isolation

- **Existing Songs (`public.songs` + `storage.objects` `music` bucket)**: All 102 existing songs remain publicly readable (`SELECT`) with zero schema/row deletion; mutations (`INSERT`/`UPDATE`/`DELETE`) require `is_jtec_admin_aal2()`, enforced on `storage.objects` via `AS RESTRICTIVE` policies for `anon` and `authenticated`.
- **JTEC Party (`jtec-party`, `dihyzyqhppmqtkheqpbs`)**: Uses its own Supabase project (`VITE_PARTY_SUPABASE_URL` / `VITE_PARTY_SUPABASE_ANON_KEY`) with anonymous guest/host authentication intact. Never run `jtec_main` admin migrations on `jtec-party`.

---

## 5. Exact Manual Migration Order, TOTP Setup & Verification (`jtec_main` ONLY)

Do **not** execute any step below on `jtec-party`. Run SQL scripts inside **`jtec_main` -> SQL Editor -> New Query**:

1. **Step 1 — Run Read-Only Pre-Migration Audit (`supabase/checks/000_pre_migration_audit.sql`)**:
   - Inspect current `ping_install()` / `touch_install()` signatures, `prosecdef`, owner (`rolbypassrls`), `search_path`, and current `pg_policies`.
   - Record your baseline counts (`baseline_songs_count`, `baseline_installs_count`, `current_min_build`).
   - Confirm `fatormajohn999@gmail.com` appears with `email_confirmed_at IS NOT NULL` and `is_anonymous = false`.
2. **Step 2 — Configure Supabase Auth & TOTP in `jtec_main` Dashboard**:
   - Go to **Authentication -> Multi-Factor Auth** and enable **Time-based One-Time Password (TOTP)** (require verified TOTP enrollment).
   - Go to **Authentication -> Providers -> Email**: confirm email verification is enabled and disable public user sign-ups on `jtec_main` if only administrators should have accounts on `jtec_main`.
3. **Step 3 — Execute Atomic Migration (`supabase/migrations/001_secure_admin_auth.sql`)**:
   - Paste and run the full contents of `supabase/migrations/001_secure_admin_auth.sql` (`BEGIN; ... COMMIT;`).
   - If any `ping_install` / `touch_install` compatibility check fails, the entire transaction rolls back cleanly with zero partial changes.
4. **Step 4 — Run Read-Only Post-Migration Verification (`supabase/checks/002_post_migration_verify.sql`)**:
   - Confirm `is_security_definer = true` and locked `function_config` (`search_path`) for `ping_install`, `touch_install`, `is_jtec_admin`, `is_jtec_admin_aal2`, `verify_admin_access`, and `log_admin_action`.
   - Confirm `rls_enabled = true` and `rls_forced = true` on `admin_users`, `admin_audit_logs`, `app_config`, `app_installs`, and `songs`.
   - Confirm `preserved_songs_count` and `preserved_installs_count` match Step 1 baselines.
5. **Step 5 — Live Functional Verification**:
   - **Anonymous Catalog & Telemetry**: Load the app without signing in as admin; verify all songs play, `ping_install` / `touch_install` succeed in Network tab without `42501` errors, and direct REST queries to `/rest/v1/app_installs` or `/rest/v1/admin_audit_logs` are rejected.
   - **Developer Portal Login & Mandatory TOTP**: Sign in as `fatormajohn999@gmail.com`; confirm the portal stops at **Mandatory 2FA Setup Required** (or **Two-Factor Verification** once enrolled), then verify a 6-digit TOTP code unlocks `aal2`, device telemetry, and `app_config` edits (logged in `public.admin_audit_logs`).
   - **JTEC Party**: Join/host a Party session and confirm anonymous Party auth continues working on `jtec-party`.

---

## 6. Safe Rollback Procedure

1. **Rollback Application / Workflow Changes (Git)**:
   ```bash
   git log --oneline -n 5
   git revert <commit-sha>
   git push origin main
   ```
2. **Recover Admin Lockout Without Disabling RLS**:
   - **Account deactivated or missing**: Insert/re-activate only the verified admin email in `public.admin_users` (never re-open public writes).
   - **Lost authenticator device**: Remove only that admin's lost factor from `auth.mfa_factors` in `jtec_main` SQL Editor (or Auth -> Users), forcing **Mandatory 2FA Setup** on next login.
3. **Database Rollback If Telemetry RPC Behavior Differs Unexpectedly**:
   - Check Postgres logs / `ping_install` status in Developer Portal (`Connection Test` / `Update Status`), verify `owner_has_bypassrls = true` and `search_path = pg_catalog, public, extensions` via `002_post_migration_verify.sql`. Only if an application regression occurs while preserving data, restore the previous policy snapshot recorded in Step 1 (`000_pre_migration_audit.sql`) without dropping `songs` or `app_installs` data.
