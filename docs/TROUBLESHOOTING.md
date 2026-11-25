# JTEC MUSIC — Troubleshooting & Rollback Guide

---

## 1. Admin Authentication & Developer Portal Issues

### A. "Server admin verification RPC (verify_admin_access) is not installed on jtec_main"
- **Cause**: The Developer Portal fails closed when `public.verify_admin_access()` does not exist on `jtec_main` because the SQL migration has not been applied yet.
- **Fix**: Follow Section 5 of `docs/SECURITY.md`:
  1. Run `supabase/checks/000_pre_migration_audit.sql` (read-only) in **`jtec_main`** SQL Editor.
  2. Enable **TOTP** under **Authentication -> Multi-Factor Auth**.
  3. Run `supabase/migrations/001_secure_admin_auth.sql`.
  4. Verify with `supabase/checks/002_post_migration_verify.sql`.

### B. Stuck at "Mandatory 2FA Setup Required" / TOTP Enrollment Fails
- **Cause 1 — TOTP MFA disabled in Supabase**: Supabase returns an error stating MFA/TOTP is disabled.
  - **Fix**: In `jtec_main` Dashboard -> **Authentication -> Multi-Factor Auth**, enable **Time-based One-Time Password (TOTP)**.
- **Cause 2 — Clock skew during 6-digit code entry**:
  - **Fix**: Ensure automatic network time sync is enabled on the authenticator device, then wait for a fresh 30-second code window.

### C. "Account is deactivated or not an authorized JTEC administrator"
- **Cause**: Signed-in user has no row in `public.admin_users`, has `is_active = false`, unconfirmed email, or is an anonymous session.
- **Fix (in `jtec_main` SQL Editor)**:
  ```sql
  select user_id, email, role, is_active from public.admin_users;
  ```
  Insert or re-activate only the verified admin email intentionally:
  ```sql
  insert into public.admin_users (user_id, email, role, is_active)
  select id, lower(email), 'admin', true
  from auth.users
  where lower(email) = '<admin-email>'
    and coalesce(is_anonymous, false) = false
    and email_confirmed_at is not null
  on conflict (user_id) do update
  set is_active = true;
  ```

### D. "Too many failed sign-in attempts" Cooldown
- **Cause**: 5 consecutive failed password or MFA attempts trigger an exponential in-memory cooldown (starting at 30 seconds).
- **Fix**: Wait for the cooldown timer to expire before retrying.

---

## 2. Telemetry (`ping_install` / `touch_install`) & Migration Errors

### A. Migration Aborts with `Missing telemetry RPC(s)` or `owner lacks BYPASSRLS`
- **Cause**: `001_secure_admin_auth.sql` runs inside `BEGIN; ... COMMIT;` and aborts automatically before locking `public.app_installs` if `ping_install` or `touch_install` is missing or cannot run safely under `FORCE ROW LEVEL SECURITY`.
- **Fix**: Run `supabase/checks/000_pre_migration_audit.sql` to verify `ping_install` and `touch_install` exist in schema `public` and that `postgres` holds `rolbypassrls = true`. Because the migration is atomic, nothing is partially committed on abort.

### B. Device Telemetry `last_seen` or `opens` Stops Updating After Migration
- **Check**: Run `supabase/checks/002_post_migration_verify.sql` in `jtec_main` SQL Editor and verify for both `ping_install` and `touch_install`:
  - `is_security_definer = true`
  - `owner_has_bypassrls = true` (`postgres`)
  - `function_config` shows `search_path=pg_catalog, public, extensions`
  - `execution_grants` includes `anon` and `authenticated`
- **Note**: Direct REST requests to `/rest/v1/app_installs` from `anon` are intentionally blocked (`42501`); client telemetry uses `/rest/v1/rpc/ping_install` and `/rest/v1/rpc/touch_install`.

---

## 3. GitHub Actions & GitHub Pages Failures

### A. `npm test` Fails in CI ("bun: command not found" or Test Failure)
- **Cause**: Automated security and telemetry tests run via Bun (`bun test src/services/__tests__`).
- **Fix**: Confirm `.github/workflows/deploy.yml` and `.github/workflows/android-build.yml` include `oven-sh/setup-bun@v2` with `bun-version: "1.4.4"` before `npm test`. Locally, ensure Bun `1.4.4+` is installed before running `npm test`.

### B. `No artifacts named "github-pages" were found` / `Found 0 artifact(s)`
- **Checklist**:
  1. Confirm `.github/workflows/deploy.yml` keeps separate `build` and `deploy` (`needs: build`) jobs using `actions/upload-pages-artifact@v4` and `actions/deploy-pages@v4`.
  2. In GitHub **Repository Settings -> Pages**, confirm **Source** is set to **GitHub Actions**.

### C. `npm ci` Fails in CI
- **Cause**: The repository tracks dependencies with `bun.lock` rather than `package-lock.json`, and Capacitor plugins require `--legacy-peer-deps`.
- **Fix**: Keep `npm install --legacy-peer-deps` in workflows.

---

## 4. JTEC Party Connection Issues

- Confirm both `VITE_PARTY_SUPABASE_URL` and `VITE_PARTY_SUPABASE_ANON_KEY` are configured (Party never falls back to `jtec_main`) and **Anonymous Sign-Ins** is enabled on `jtec-party` (`dihyzyqhppmqtkheqpbs`) under **Authentication -> Providers**.

---

## 5. Safe Rollback Procedures

1. **Application / Workflow Rollback (Git)**:
   ```bash
   git log --oneline -n 5
   git revert <commit-sha>
   git push origin main
   ```
2. **Recover Admin Lockout Without Disabling RLS**:
   - Inspect `auth.mfa_factors` for the admin account in `jtec_main` SQL Editor and delete only the lost factor so **Mandatory 2FA Setup** runs again on next login.
3. **Database Policy Rollback**:
   - Never run destructive `DROP TABLE`, `TRUNCATE`, or `DELETE` commands on `public.songs` or `public.app_installs`. If temporary policy adjustments are ever needed on `jtec_main`, reference the pre-migration policy snapshot saved from `supabase/checks/000_pre_migration_audit.sql`.
