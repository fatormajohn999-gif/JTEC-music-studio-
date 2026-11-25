# JTEC MUSIC — Changelog

All notable security, telemetry, build, and deployment changes are recorded in this file chronologically.

---

## 2026-11-25 — Final Pre-Migration Safety Review (Telemetry Compatibility & CI Security Gates)

### Summary
Reviewed `ping_install()` and `touch_install()` compatibility ahead of forcing RLS on `public.app_installs`, added automated telemetry compatibility tests, integrated Bun `1.4.4` + test/lint gates into GitHub Actions, and clearly documented active code protections vs. pending remote database activation.

### Files Modified / Created
- **`supabase/migrations/001_secure_admin_auth.sql`**:
  - Wrapped the migration in an atomic `begin; ... commit;` transaction so any compatibility error rolls back cleanly.
  - Added Section 10 inspecting all existing overloads of `public.ping_install` and `public.touch_install` in `pg_catalog.pg_proc` before forcing RLS on `public.app_installs`: verifies `BYPASSRLS` / superuser ownership (`postgres`), enforces `SECURITY DEFINER` and locked `set search_path = pg_catalog, public, extensions` (excluding `pg_temp`), and restricts execution permissions (`revoke all ... from public; grant execute ... to anon, authenticated;`) without rewriting live column mappings.
- **`supabase/checks/000_pre_migration_audit.sql`** *(new)* & **`supabase/checks/002_post_migration_verify.sql`** *(new)*:
  - Read-only SQL inspection and verification scripts for `jtec_main` to audit existing telemetry RPCs, policies, RLS/forced-RLS state, active `admin_users`, and baseline row counts (`songs` and `app_installs`).
- **`src/services/__tests__/telemetryRls.test.ts`** *(new)*:
  - Added 5 tests verifying `sendAnonymousPing()` (both 8-arg and 4-arg fallback) and `touchInstall()` continue working via `SECURITY DEFINER` RPCs without direct `app_installs` table access even when `FORCE ROW LEVEL SECURITY` blocks direct `42501` writes, plus static checks on `001_secure_admin_auth.sql` and read-only SQL audit scripts.
- **`package.json`**:
  - Updated `"test"` to `"bun test src/services/__tests__"` to execute both the 17 admin security tests and the 5 telemetry RLS compatibility tests.
- **`.github/workflows/deploy.yml` & `.github/workflows/android-build.yml`**:
  - Added `oven-sh/setup-bun@v2` (`bun-version: "1.4.4"`), `npm test`, and `npm run lint` strictly before `npm run build`.
- **`README.md`, `docs/SECURITY.md`, `docs/CHANGELOG.md`, `docs/TROUBLESHOOTING.md`**:
  - Explicitly separated active application/CI protections from unactivated remote `jtec_main` database controls, and documented the exact migration order, Supabase TOTP setup, verification steps, and rollback procedure.

---

## 2026-11-25 — Admin Authentication Hardening & Security Documentation Review

### Summary
Reviewed the admin authentication layer and fixed fail-open edge cases, optional-MFA gaps, `app_metadata` privilege retention, legacy RLS policy risks, `SECURITY DEFINER` search paths, and audit log immutability.

### Files Modified / Created
- **`supabase/migrations/001_secure_admin_auth.sql`**:
  - Made `public.admin_users` (`is_active = true`, `role in ('admin', 'owner')`) the sole authoritative admin check in `is_jtec_admin()` and `verify_admin_access()`.
  - Updated `is_jtec_admin_aal2()` to unconditionally enforce a verified `'totp'` factor in `auth.mfa_factors` and JWT `aal = 'aal2'`.
  - Replaced hardcoded two-name `DROP POLICY` statements with dynamic `pg_catalog.pg_policies` cleanup loops and added `AS RESTRICTIVE` write guards on `storage.objects` (`bucket_id = 'music'`).
  - Locked `set search_path = pg_catalog, public, auth` and revoked `EXECUTE` from `public` and `anon` on admin `SECURITY DEFINER` functions.
  - Hardened `public.admin_audit_logs` against updates/deletes and gated inserts via `log_admin_action()` + `app.jtec_audit_write`.
- **`src/services/adminAuth.ts` & `src/services/supabase.ts`**:
  - Added `'mfa_enrollment_required'` stage, returned `session: null` prior to `aal2`, removed `transition_missing_sql` fallback, failed closed on missing RPC / network / permission / MFA errors, passed active client into `clearAdminAuthTokens()`, and enforced `is_active !== false`.
- **`src/components/DeveloperPage.tsx`**:
  - Added the inline **Mandatory 2FA Setup Required** screen and removed `transition_missing_sql` bypass banners.
- **`src/services/__tests__/adminAuth.test.ts`**:
  - Expanded admin security test suite to 17 tests covering mandatory TOTP, `admin_users` deactivation, fail-closed errors, policy cleanup, `search_path`, audit immutability, brute-force protection, and Party isolation.

---

## 2026-11-25 — GitHub Pages Deployment Workflow Fix

- Split `.github/workflows/deploy.yml` into `build` -> `deploy` (`needs: build` + `artifact_id` guard), upgraded `actions/upload-pages-artifact` to `@v4`, added `./dist` and `./dist/index.html` checks, and set `cancel-in-progress: false`.

---

## 2026-11-25 — Step 1 & Step 2: Security Audit & Initial Admin Auth

- Completed read-only audit of auth, RLS, env vars, `SECURITY DEFINER` functions, and Party project isolation.
- Created initial `adminAuth.ts`, `001_secure_admin_auth.sql`, narrowed `vite.config.ts` `envPrefix` to `['VITE_']`, and hardened `DeveloperPage.tsx` and `deleteSongFromCloud()`.
