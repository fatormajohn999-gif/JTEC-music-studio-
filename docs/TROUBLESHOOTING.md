# JTEC MUSIC — Troubleshooting & Rollback Guide

---

## 1. Admin Authentication & Developer Portal Issues

### A. "Server admin verification RPC (verify_admin_access) is not installed on jtec_main"
- **Cause**: The Developer Portal fails closed when `public.verify_admin_access()` does not exist or is not executable by `authenticated`.
- **Fix**:
  1. Open the **`jtec_main`** project in the Supabase Dashboard (never run this on `jtec-party`).
  2. Go to **SQL Editor -> New Query**.
  3. Paste the full contents of `/supabase/migrations/001_secure_admin_auth.sql` and run it.
  4. Refresh the app and sign in again.

### B. Stuck at "Mandatory 2FA Setup Required" / TOTP Enrollment Fails
- **Cause 1 — TOTP MFA disabled in Supabase**: Supabase returns an error stating MFA/TOTP is disabled.
  - **Fix**: In `jtec_main` Dashboard -> **Authentication -> Multi-Factor Auth**, enable **Time-based One-Time Password (TOTP)**.
- **Cause 2 — Clock skew during 6-digit code entry**:
  - **Fix**: Ensure automatic network time sync is enabled on the phone/computer running Google Authenticator / Authy / 1Password, then wait for a fresh 30-second code window.

### C. "Account is deactivated or not an authorized JTEC administrator"
- **Cause**: Either the signed-in user does not have a row in `public.admin_users`, their `is_active` flag is `false`, their email is unconfirmed, or the session is anonymous.
- **Fix (in `jtec_main` SQL Editor)**:
  ```sql
  select user_id, email, role, is_active from public.admin_users;
  ```
  Insert or re-activate the verified admin account intentionally:
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
- **Fix**: Wait for the countdown timer to finish (or verify credentials in password manager) before retrying.

---

## 2. GitHub Pages Deployment Failures

### A. `No artifacts named "github-pages" were found for this workflow run` / `Found 0 artifact(s)`
- **Checklist**:
  1. Confirm `.github/workflows/deploy.yml` keeps separate `build` and `deploy` (`needs: build`) jobs using `actions/upload-pages-artifact@v4` and `actions/deploy-pages@v4`.
  2. In GitHub **Repository Settings -> Pages**, verify **Source** is set to **GitHub Actions**.
  3. Inspect the `Build Static Applet` and `Verify Build Output` steps to verify `./dist/index.html` was generated cleanly.

### B. `npm ci` Fails in CI
- **Cause**: The repository tracks dependencies with `bun.lock` rather than `package-lock.json`, and Capacitor plugins require `--legacy-peer-deps`.
- **Fix**: Keep `npm install --legacy-peer-deps` in workflow files.

---

## 3. JTEC Party Connection Issues

### A. Party Shows Configuration or Connection Error
- **Cause**: `VITE_PARTY_SUPABASE_URL` or `VITE_PARTY_SUPABASE_ANON_KEY` is missing in `.env` or GitHub Actions Secrets, or Anonymous Sign-Ins are disabled on the `jtec-party` project (`dihyzyqhppmqtkheqpbs`).
- **Fix**:
  1. Confirm both `VITE_PARTY_SUPABASE_URL` and `VITE_PARTY_SUPABASE_ANON_KEY` are configured (Party intentionally never falls back to `jtec_main`).
  2. Ensure **Anonymous Sign-Ins** is enabled in the **`jtec-party`** Supabase project under **Authentication -> Providers**.

---

## 4. Safe Rollback Procedures

1. **Application / Workflow Rollback (Git)**:
   ```bash
   git log --oneline -n 5
   git revert <commit-sha>
   git push origin main
   ```
   GitHub Actions will rebuild and redeploy the previous working commit automatically without affecting Supabase data or Secrets.

2. **Database Recovery (Without Re-Opening Public Access)**:
   - If locked out of the Developer Portal due to lost authenticator device, delete ONLY the lost factor for your user in `jtec_main` SQL Editor or Supabase **Authentication -> Users**:
     ```sql
     -- Check factors for a specific admin email first
     select f.id, f.factor_type, f.status
     from auth.mfa_factors f
     join auth.users u on u.id = f.user_id
     where lower(u.email) = '<admin-email>';
     ```
     Removing the lost factor forces the portal to present **Mandatory 2FA Setup** on next login rather than disabling RLS.
