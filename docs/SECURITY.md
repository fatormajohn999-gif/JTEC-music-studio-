# JTEC MUSIC — Security Architecture & Admin Access Control

This document describes the authentication, authorization, database Row Level Security (RLS), and client isolation model enforced across JTEC MUSIC.

---

## 1. Security Model Overview

| Surface | Project | Auth & Trust Boundary |
|---|---|---|
| Public Music Catalog & Web/Android Updates | `jtec_main` | Public read-only access to `public.songs`, `storage.objects` (`bucket_id = 'music'`), and `public.app_config` (`id = 1`). |
| Device Telemetry Ingestion | `jtec_main` | Anon/client telemetry uses `SECURITY DEFINER` RPCs (`ping_install` / `touch_install`) — direct `INSERT`/`SELECT`/`UPDATE`/`DELETE` on `public.app_installs` is blocked by RLS and privileges. |
| Developer Portal & Admin Mutations | `jtec_main` | Requires active row in `public.admin_users`, verified email, non-anonymous session, **mandatory TOTP MFA (`aal2`)**, and fail-closed `verify_admin_access()` verification. |
| JTEC Party Live Listening | `jtec-party` (`dihyzyqhppmqtkheqpbs`) | Strictly isolated Supabase client (`VITE_PARTY_SUPABASE_URL` / `VITE_PARTY_SUPABASE_ANON_KEY`). Uses anonymous auth for guests/hosts (`jtec_party_supabase_auth_token`). Never falls back to `jtec_main` and never grants admin access. |

---

## 2. Authoritative Admin Source (`public.admin_users`)

- `public.admin_users` is the **sole authoritative source** for administrator permissions:
  - `user_id` (`uuid`, PK referencing `auth.users`)
  - `email` (`text`, unique)
  - `role` (`'admin' | 'owner'`)
  - `is_active` (`boolean`)
- **Immediate Revocation**: Deactivating (`is_active = false`) or deleting an admin row in `public.admin_users` immediately blocks `is_jtec_admin()`, `is_jtec_admin_aal2()`, `verify_admin_access()`, and all admin RLS policies — even if an old JWT or `app_metadata` claim previously contained a role.
- Client roles (`anon`, `authenticated`) have no `INSERT`, `UPDATE`, `DELETE`, or `TRUNCATE` privileges on `public.admin_users`. Admins can only be added or deactivated through the Supabase SQL Editor or service-role administration.

---

## 3. Mandatory TOTP 2FA (`aal2`) & Fail-Closed Enforcement

Every administrator must authenticate with password (`aal1`) **and** hold a verified TOTP authenticator factor at `aal2` before accessing any Developer Portal telemetry, version controls, or database/storage mutations:

1. **Email + Password Sign-In (`signInAdminWithPassword`)**:
   - Validates credentials with `jtec_main` GoTrue Auth (`auth.signInWithPassword`).
   - Enforces a 5-attempt exponential login cooldown (`MAX_FAILED_ATTEMPTS = 5`, `BASE_LOCKOUT_MS = 30s`).
2. **Server Verification (`verifyAdminAuthorization`)**:
   - Re-validates the JWT server-side via `auth.getUser(access_token)`.
   - Inspects MFA state via `auth.mfa.getAuthenticatorAssuranceLevel()` and `auth.mfa.listFactors()`.
   - Strictly rejects anonymous sessions (`is_anonymous`, `provider === 'anonymous'`, or `amr` containing `'anonymous'`) and unconfirmed emails.
   - Calls `client.rpc('verify_admin_access')` on `jtec_main`.
   - **Fail-Closed Design**: Any missing RPC (`PGRST202` / `42883`), network timeout, permission error (`42501`), MFA API error/exception, deactivated flag, or unexpected response clears local admin tokens (`clearAdminAuthTokens('local')`) and denies access.
3. **Mandatory MFA Gate**:
   - If the active admin has **0 verified TOTP factors**, `verifyAdminAuthorization()` returns `stage: 'mfa_enrollment_required'` with `session: null`. `DeveloperPage.tsx` holds the user at the inline TOTP enrollment screen (QR SVG normalized safely via `toSafeQrImageSrc()` + 6-digit confirmation) and refuses to mount telemetry, config forms, or mutations until `aal2` is reached.
   - If the active admin already has a verified TOTP factor and JWT assurance is `aal1`, `verifyAdminAuthorization()` returns `stage: 'mfa_required'` with `session: null` until a valid 6-digit TOTP code elevates the session to `aal2`.
4. **Pre-Flight Check Before Every Write (`assertActiveAdminSession`)**:
   - Triggered immediately prior to saving `app_config.min_build`, update notes/message/`apk_url`, device `owner_label`, or deleting cloud songs in `SupabaseService.deleteSongFromCloud()`.

---

## 4. Database Hardening (`supabase/migrations/001_secure_admin_auth.sql`)

1. **Legacy Policy Neutralization**:
   - A `DO $$` block iterates `pg_catalog.pg_policies` across `admin_users`, `admin_audit_logs`, `app_config`, `app_installs`, and `songs` to drop all prior permissive policies before creating strict least-privilege policies.
   - Drops prior `'music'` policies on `storage.objects` and adds **`AS RESTRICTIVE`** policies for `INSERT`, `UPDATE`, and `DELETE` (`anon` and `authenticated`) so no permissive storage policy can allow unauthorized writes to the `music` bucket.
2. **`SECURITY DEFINER` Function Hardening**:
   - All functions (`is_jtec_admin()`, `is_jtec_admin_aal2()`, `verify_admin_access()`, `log_admin_action(text, jsonb)`) lock `set search_path = pg_catalog, public, auth` (excluding `pg_temp`) and schema-qualify all references.
   - `EXECUTE` is revoked from `public` and `anon`, and granted solely to `authenticated`.
3. **Immutable Admin Audit Trail (`public.admin_audit_logs`)**:
   - Enforces `force row level security` and revokes `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE` from `public`, `anon`, and `authenticated`.
   - Grants `SELECT` only to `authenticated` (gated by `is_jtec_admin_aal2()`).
   - Restrictive `UPDATE` (`USING (false) WITH CHECK (false)`) and `DELETE` (`USING (false)`) policies block all modifications and deletions.
   - Inserts occur solely via `public.log_admin_action()`, which validates `is_jtec_admin_aal2()` and sets a transaction-local GUC (`app.jtec_audit_write = 'on'`).

---

## 5. Session Storage, Expiration, and Bundle Protection

- **Token Storage**:
  - When **"Stay signed in"** is enabled on Web, tokens are stored in `localStorage` under `jtec-admin-auth` (native Android uses Capacitor `Preferences`) with a **7-day max inactivity window** (`ADMIN_PERSISTED_MAX_INACTIVITY_MS`).
  - When **"Stay signed in"** is disabled on Web, tokens are routed to `sessionStorage` and capped at **12 hours** (`ADMIN_SESSION_MAX_AGE_NON_PERSISTENT_MS`), clearing immediately when the portal closes or tab exits.
  - While open, the Developer Portal enforces a **30-minute idle lock** (`ADMIN_IDLE_TIMEOUT_MS`).
- **Build & Secret Hygiene**:
  - `vite.config.ts` sets `envPrefix: ['VITE_']` so private/server variables (e.g., service-role keys, signing keystores) are never exposed to client JS or Android APKs.
  - All error logs and UI messages pass through `sanitizeSecretText()` before display.
- **APK Update Integrity**:
  - `DeveloperPage.tsx` enforces strict `https://` validation for manual `app_config.apk_url` entries.

---

## 6. Manual Supabase Setup Checklist (`jtec_main` Only)

Before using the Developer Portal in production, an authorized project owner must perform these steps manually in the **`jtec_main`** Supabase Dashboard (never on `jtec-party`):

1. Run `/supabase/migrations/001_secure_admin_auth.sql` in **SQL Editor**.
2. Enable **Time-based One-Time Password (TOTP)** under **Authentication -> Multi-Factor Auth**.
3. Under **Authentication -> Providers -> Email**, verify email confirmations are required (and disable public self-signups on `jtec_main` if only admins hold accounts there).
4. Verify your owner record exists in `public.admin_users` (`is_active = true`).
