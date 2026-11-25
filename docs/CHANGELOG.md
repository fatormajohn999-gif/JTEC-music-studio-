# JTEC MUSIC — Changelog

All notable security, build, and deployment changes are recorded in this file chronologically.

---

## 2026-11-25 — Admin Authentication Hardening & Security Documentation Review

### Summary
Reviewed the newly implemented admin authentication layer and fixed fail-open edge cases, optional-MFA gaps, `app_metadata` privilege retention, legacy RLS policy risks, `SECURITY DEFINER` search paths, and audit log immutability.

### Files Modified / Created
- **`supabase/migrations/001_secure_admin_auth.sql`**:
  - Made `public.admin_users` (`is_active = true`, `role in ('admin', 'owner')`) the **sole** authoritative admin check in `is_jtec_admin()` and `verify_admin_access()`; removed `app_metadata.role` fallback and stopped modifying `auth.users.raw_app_meta_data`.
  - Updated `is_jtec_admin_aal2()` to **unconditionally** enforce both a verified `'totp'` factor in `auth.mfa_factors` and JWT `aal = 'aal2'` (removed the bypass when no TOTP factor existed).
  - Updated `verify_admin_access()` to return `is_active`, `mfa_required: true`, and `needs_mfa_enrollment` cleanly.
  - Replaced hardcoded two-name `DROP POLICY` statements with dynamic `pg_catalog.pg_policies` cleanup loops across `admin_users`, `admin_audit_logs`, `app_config`, `app_installs`, `songs`, and `'music'` policies on `storage.objects`.
  - Added `AS RESTRICTIVE` write guards on `storage.objects` (`INSERT`/`UPDATE`/`DELETE` for `anon` and `authenticated`) protecting `bucket_id = 'music'`.
  - Locked `set search_path = pg_catalog, public, auth` (excluding `pg_temp`), schema-qualified references, and revoked `EXECUTE` from `public` and `anon` on all `SECURITY DEFINER` functions.
  - Hardened `public.admin_audit_logs` against modification/deletion: revoked mutating grants from `public`/`anon`/`authenticated`, added restrictive `UPDATE`/`DELETE` `USING (false)` policies, and restricted `INSERT` via transaction-local GUC `app.jtec_audit_write = 'on'` inside `log_admin_action()`.
- **`src/services/adminAuth.ts`**:
  - Added `'mfa_enrollment_required'` to `AdminAuthStage` and `needsMfaEnrollment` to `AdminAuthResult` so admins without a verified TOTP factor are gated until enrollment + verification complete.
  - Returned `session: null` during `'mfa_required'` and `'mfa_enrollment_required'`.
  - Removed `transition_missing_sql` fail-open bypass and `app_metadata.role` fallback; all missing RPC (`PGRST202`/`42883`), network, permission, MFA API (`getAuthenticatorAssuranceLevel` / `listFactors`), and unexpected errors now fail closed (`stage: 'denied'`, tokens cleared).
  - Enforced `result.is_active !== false` check so deactivated admins lose access immediately.
- **`src/components/DeveloperPage.tsx`**:
  - Added the inline **Mandatory 2FA Setup Required** (`mfa_enrollment_required`) screen with QR setup, secret copy, 6-digit verification, and Cancel & Sign Out.
  - Removed obsolete `transition_missing_sql` warning banners and updated Security Modal status text.
- **`package.json`**:
  - Added `"test": "bun test src/services/__tests__/adminAuth.test.ts"`.
- **`src/services/__tests__/adminAuth.test.ts`**:
  - Expanded security test suite to 17 tests covering mandatory TOTP enrollment, `admin_users` deactivation overriding stale `app_metadata`, fail-closed handling on missing RPC / network errors / permission errors / MFA API failures, legacy policy cleanup assertions, `SECURITY DEFINER` search paths, audit log immutability, brute-force protection, and Party isolation.
- **`README.md`, `docs/SECURITY.md`, `docs/CHANGELOG.md`, `docs/TROUBLESHOOTING.md`**:
  - Added structured security, changelog, and troubleshooting documentation and synced root `README.md`.

---

## 2026-11-25 — GitHub Pages Deployment Workflow Fix

### Root Cause
`.github/workflows/deploy.yml` uploaded and deployed the `github-pages` artifact inside a single job using `actions/upload-pages-artifact@v3` paired with `actions/deploy-pages@v4` and `cancel-in-progress: true`, causing `Found 0 artifact(s)` / `No artifacts named "github-pages" were found`.

### Changes
- Split `.github/workflows/deploy.yml` into `build` -> `deploy` (`needs: build` + `artifact_id` guard).
- Upgraded `actions/upload-pages-artifact` to `@v4`, added `./dist` and `./dist/index.html` verification, set `cancel-in-progress: false`, and preserved all `VITE_*` secrets/env mappings and Pages permissions.

---

## 2026-11-25 — Step 2: Initial Admin Auth, MFA, Session & RLS Implementation

### Changes
- Created `src/services/adminAuth.ts` and `supabase/migrations/001_secure_admin_auth.sql`.
- Narrowed `vite.config.ts` `envPrefix` to `['VITE_']`.
- Updated `src/services/supabase.ts` for session-scoped admin token storage, global server logout, and pre-flight `deleteSongFromCloud()` checks.
- Integrated MFA challenge, Security & 2FA modal, idle timeout, and `https://` APK URL validation into `src/components/DeveloperPage.tsx`.
- Added unit/contract tests in `src/services/__tests__/adminAuth.test.ts`.

---

## 2026-11-25 — Step 1: Read-Only Security Audit & Prior Platform Updates

- Completed read-only audit of authentication, RLS, env vars, `SECURITY DEFINER` functions, and Party isolation.
- Previously upgraded Developer Portal responsive UI & real Party activity panel, isolated JTEC Party to project `dihyzyqhppmqtkheqpbs` (`VITE_PARTY_SUPABASE_*`), and restricted minimum-version blocking strictly to native Android.
