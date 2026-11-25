# JTEC MUSIC

JTEC MUSIC is a high-performance music player built with **React 18**, **TypeScript**, **Vite**, **Tailwind CSS**, and **Capacitor 7** for both the **Web (PWA)** and **native Android (`com.jtecmusic.app`)**.

---

## 1. What JTEC Music Does

- **Multi-Source Music Playback**: Plays local audio imports (MP3, WAV, M4A, AAC, OGG, FLAC, WebM) stored on-device as well as curated streaming libraries (**JTEC Music Main**, **Nasheed**, **Love & Chill**, and **Jamendo**).
- **Web Audio Engine & DSP Effects**: Real-time 10-band equalizer, bass/super-bass shaping, spatial/reverb effects, gapless-style transitions, and audio-reactive canvas visualizers.
- **Offline Caching & PWA Auto-Updates**: Service worker caching with automatic background updates on Web when no music is playing.
- **Native Android Integration**:
  - Background media notification & lock screen controls (`@jofr/capacitor-media-session`) with high-resolution square artwork (`src/services/mediaSession.ts`).
  - Native Android home screen music widget synced directly to the single audio engine (`src/services/widgetBridge.ts`).
  - Android-only minimum-version enforcement (`app_config.min_build`) and self-updating APK release checker (`src/services/nativeUpdate.ts`). Web/iOS builds are never blocked.
- **JTEC Party**: Live synchronized listening rooms where hosts broadcast track/playback state and guests listen in real time using anonymous Supabase sessions.
- **Developer Portal (`src/components/DeveloperPage.tsx`)**: Authenticated admin dashboard for device telemetry (`app_installs`), Android minimum build enforcement (`app_config`), Supabase health monitoring & device logs, cloud source connectivity checks, and live JTEC Party user/room activity.

---

## 2. Existing Architecture

```text
├── .github/workflows/
│   ├── deploy.yml              # GitHub Pages build + deploy (2 jobs: build -> deploy)
│   ├── android-build.yml       # Capacitor sync, Gradle release APK build & signing
│   └── release-apk.yml         # Publishes GitHub Release (JTEC-MUSIC.apk + latest.json)
├── android/                    # Native Capacitor Android project (compileSdk 35, AGP 8.7.2, Java)
├── public/                     # Static PWA manifest, service worker (sw.js), icons & images
├── scripts/                    # Android manifest verification script (ensure-android-manifest.cjs)
├── src/
│   ├── App.tsx                 # Main application shell, navigation & single audio controller
│   ├── components/             # Player UI, DeveloperPage, Party overlays, modals
│   ├── hooks/                  # React hooks for player/visualizer/storage state
│   ├── party/                  # JTEC Party service & isolated Party Supabase backend
│   ├── screens/                # Library, Explore, Equalizer, Settings, Party screens
│   └── services/               # audioEngine, supabase, adminAuth, appConfig, healthMonitor, mediaSession, widgetBridge
├── supabase/migrations/        # SQL migrations for jtec_main admin auth & RLS
├── vite.config.ts              # Vite config (base: './', envPrefix: ['VITE_'])
└── capacitor.config.ts         # Capacitor config (appId: com.jtecmusic.app, webDir: dist)
```

---

## 3. Supabase Project Responsibilities & Separation

JTEC MUSIC deliberately isolates workloads across dedicated Supabase projects so public media reads, real-time Party rooms, and admin controls remain cleanly separated:

| Logical Project | Purpose | Auth Model | Env Prefix / Config |
|---|---|---|---|
| **JTEC Main (`jtec_main`)** | Mainstream song catalog (`songs` + `music` bucket), `app_config` (Android `min_build` & update screen notes), `app_installs` device telemetry, Admin Auth & audit logs (`admin_users`, `admin_audit_logs`) | Public anon read for `songs` & `app_config (id=1)`; **strict authenticated Admin + TOTP MFA (`aal2`)** for telemetry, config updates, and song mutations | `VITE_SUPABASE_JTEC_*` / `VITE_SUPABASE_URL` |
| **Nasheed** | Dedicated Nasheed & spiritual vocal catalog (`songs` + `music` bucket) | Public anon read (`persistSession: false`) | `VITE_SUPABASE_NASHEED_*` |
| **Love & Chill** | Dedicated melodic & chill catalog (`songs` + `music` bucket) | Public anon read (`persistSession: false`) | `VITE_SUPABASE_LOVE_CHILL_*` |
| **JTEC Party (`jtec-party`, ID `dihyzyqhppmqtkheqpbs`)** | Isolated real-time Party rooms, broadcast playback sync, presence, and live listener stats | Anonymous Party user sign-in (`jtec_party_supabase_auth_token`). Never falls back to `jtec_main` and never receives admin privileges | `VITE_PARTY_SUPABASE_URL` & `VITE_PARTY_SUPABASE_ANON_KEY` |

---

## 4. Required Environment Variable Names

> **Security Rule**: Never commit secret values, service-role keys, or raw JWTs to the repository or documentation. Configure values exclusively in local `.env` (gitignored) or **GitHub Repository Settings -> Secrets and variables -> Actions**.

### Frontend / Build Environment Variables (`VITE_` only)

Vite (`vite.config.ts`) enforces `envPrefix: ['VITE_']` so non-`VITE_` server credentials are never bundled into browser JS or Android APKs.

| Variable Name | Purpose |
|---|---|
| `VITE_SUPABASE_JTEC_URL` / `VITE_SUPABASE_JTEC_MAIN_URL` / `VITE_SUPABASE_URL` | JTEC Main Supabase project URL |
| `VITE_SUPABASE_JTEC_ANON_KEY` / `VITE_SUPABASE_JTEC_MAIN_ANON_KEY` / `VITE_SUPABASE_ANON_KEY` | JTEC Main public anon key |
| `VITE_SUPABASE_JTEC_BUCKET` / `VITE_SUPABASE_JTEC_TABLE` | Optional overrides (`music` / `songs`) |
| `VITE_SUPABASE_NASHEED_URL` / `VITE_SUPABASE_NASHEED_ANON_KEY` | Nasheed Supabase URL and anon key |
| `VITE_SUPABASE_NASHEED_BUCKET` / `VITE_SUPABASE_NASHEED_TABLE` | Optional overrides (`music` / `songs`) |
| `VITE_SUPABASE_LOVE_CHILL_URL` / `VITE_SUPABASE_LOVE_CHILL_ANON_KEY` | Love & Chill Supabase URL and anon key |
| `VITE_SUPABASE_LOVE_CHILL_BUCKET` / `VITE_SUPABASE_LOVE_CHILL_TABLE` | Optional overrides (`music` / `songs`) |
| `VITE_JAMENDO_CLIENT_ID` | Jamendo API client ID |
| `VITE_PARTY_SUPABASE_URL` | Dedicated JTEC Party Supabase URL |
| `VITE_PARTY_SUPABASE_ANON_KEY` | Dedicated JTEC Party public anon key |
| `VITE_ADMIN_ALLOWED_EMAILS` | Optional comma-separated build-time admin email allowlist |

### Android Build & Release Signing Secrets (CI Only)

| Secret / Variable Name | Purpose |
|---|---|
| `KEYSTORE_BASE64` (or `RELEASE_KEYSTORE_BASE64` / `SIGNING_KEY` / `ANDROID_KEYSTORE_BASE64`) | Base64-encoded Android release keystore |
| `KEYSTORE_PASSWORD` (or `STORE_PASSWORD` / `ANDROID_STORE_PASSWORD`) | Keystore password |
| `KEY_PASSWORD` (or `ANDROID_KEY_PASSWORD`) | Key alias password |
| `CAPACITOR_APP_ID` / `APP_VERSION_NAME` | Optional Capacitor application ID (`com.jtecmusic.app`) & version prefix |
| `GEMINI_API_KEY` | Optional release notes formatter in `release-apk.yml` |

---

## 5. GitHub Pages Build & Deployment Workflow

Defined in `.github/workflows/deploy.yml` (triggers on push to `main` and manual `workflow_dispatch`):

1. **Top-Level Permissions & Concurrency**:
   - `permissions`: `contents: read`, `pages: write`, `id-token: write`.
   - `concurrency`: `group: 'pages'`, `cancel-in-progress: false` (prevents mid-flight deployment cancellation).
2. **Job 1 (`build`)**:
   - Checks out repository (`actions/checkout@v4`) and sets up Node.js 22 (`actions/setup-node@v4`).
   - Installs packages via `npm install --legacy-peer-deps`.
   - Configures Pages (`actions/configure-pages@v5`).
   - Builds the static bundle (`npm run build` -> `./dist`) with all `VITE_*` Supabase/Jamendo/Party environment mappings.
   - Verifies `./dist` exists, is non-empty, and contains a non-empty `./dist/index.html`.
   - Uploads `./dist` using `actions/upload-pages-artifact@v4` with `name: github-pages` and verifies `steps.upload.outputs.artifact_id` is non-empty, exposing `outputs.artifact_id`.
3. **Job 2 (`deploy`)**:
   - Depends strictly on `build` (`needs: build` and `if: ${{ needs.build.result == 'success' && needs.build.outputs.artifact_id != '' }}`).
   - Targets the `github-pages` environment and publishes the uploaded `github-pages` artifact via `actions/deploy-pages@v4`.

---

## 6. Admin Authentication & Security Architecture

Admin controls in `DeveloperPage.tsx` are protected by layered verification in `src/services/adminAuth.ts` and `supabase/migrations/001_secure_admin_auth.sql`:

1. **Server-Side JWT & Identity Verification**:
   - Every session check and sensitive mutation calls `client.auth.getUser(access_token)` against Supabase Auth instead of trusting `localStorage` alone.
   - Anonymous accounts (`is_anonymous`, `provider === 'anonymous'`, or `amr` containing `'anonymous'`) and unconfirmed emails are strictly rejected.
   - Client-editable `user_metadata` is ignored; authorization uses `public.admin_users` and server-managed `app_metadata.role`.
2. **Database Layer Enforcement (`001_secure_admin_auth.sql`)**:
   - `public.admin_users`: Forced RLS (`force row level security`), read-own-row only, all client write grants revoked.
   - `is_jtec_admin()`, `is_jtec_admin_aal2()`, `verify_admin_access()`, `log_admin_action()`: `SECURITY DEFINER` RPCs with `set search_path = public, auth, pg_temp`.
   - Locks `app_config` mutations, `app_installs` reads/updates/deletes, `songs` mutations, `storage.objects` (`music`), and `admin_audit_logs` to `is_jtec_admin_aal2()`.
3. **Native Supabase TOTP 2FA (`auth.mfa`)**:
   - Enrolled admins authenticate via password (`aal1`) and must complete a 6-digit TOTP challenge (`aal2`) before Developer Portal tabs or data queries mount.
   - Admins can enroll or remove TOTP authenticators in the **Admin Security & 2FA** modal (QR SVG normalized safely for `<img src>` via `toSafeQrImageSrc()`).
4. **Session Expiration & Global Logout**:
   - 30-minute active portal idle lock (`ADMIN_IDLE_TIMEOUT_MS`), 12-hour max age for non-persistent sessions (stored in Web `sessionStorage` when "Stay signed in" is unchecked), and 7-day max persisted inactivity (`ADMIN_PERSISTED_MAX_INACTIVITY_MS`).
   - 5-attempt exponential login cooldown.
   - **Sign Out** / **Sign Out All Devices** calls `auth.signOut({ scope: 'global' })`, logs `admin_logout`, wipes Web/Capacitor storage keys, and clears in-memory portal state.

---

## 7. Security & Deployment Change History

### 2026-11-25 — GitHub Pages Deployment Fix (`Found 0 artifact(s)`) & Project Documentation
- **Root Cause Identified**: `.github/workflows/deploy.yml` ran `actions/upload-pages-artifact@v3` and `actions/deploy-pages@v4` inside the **same** single job (`jobs.deploy`). On GitHub Actions' v4 artifact backend, querying for `github-pages` immediately in the same job can hit a metadata indexing visibility race (`Found 0 artifact(s)` / `No artifacts named 'github-pages' were found for this workflow run`), compounded by mixing `upload-pages-artifact@v3` with `deploy-pages@v4` and `cancel-in-progress: true`.
- **Changes Made**:
  - Updated `.github/workflows/deploy.yml`: split into `build` and `deploy` (`needs: build`) jobs, upgraded `actions/upload-pages-artifact@v3` to `@v4` (explicit `name: github-pages`, `path: ./dist`), set `cancel-in-progress: false`, preserved all permissions (`contents: read`, `pages: write`, `id-token: write`) and all Supabase/Jamendo/JTEC Party environment variable mappings.
  - Created `README.md` with architecture, deployment, environment variables, security design, troubleshooting, and rollback documentation.

### 2026-11-25 — Step 2: Secure Admin Authentication, Authorization & TOTP 2FA
- **Files Changed**:
  - `vite.config.ts`: Narrowed `envPrefix` to `['VITE_']`.
  - `src/services/adminAuth.ts` *(new)*: Server-verified authorization, Supabase TOTP MFA (`aal1` -> `aal2`), idle/session timeouts, login throttling, audit logging, and safe QR SVG normalization.
  - `src/services/supabase.ts`: Removed non-`VITE_` env fallbacks, routed non-persistent Web admin tokens to `sessionStorage`, added `scope: 'global' | 'local'` server revocation to `clearAdminAuthTokens`, and guarded `deleteSongFromCloud()` with `assertActiveAdminSession`.
  - `src/components/DeveloperPage.tsx`: Added 2FA challenge screen, Security & 2FA enrollment modal, transition banner when SQL migration is pending, 30m activity idle lock, pre-flight session assertions + audit logging on mutations, `https://` APK URL validation, and full in-memory cleanup on sign-out/lock.
  - `supabase/migrations/001_secure_admin_auth.sql` *(new)*: Schema, `SECURITY DEFINER` RPCs, and strict RLS policies for `jtec_main`.
  - `src/services/__tests__/adminAuth.test.ts` *(new)*: 14 unit and security contract tests.

### 2026-11-25 — Step 1: Read-Only Security Audit
- Audited authentication flows, Supabase RLS, client bundle env exposure, `SECURITY DEFINER` functions, and Party project isolation without modifying source files or database state.

---

## 8. Tests Performed & Results (2026-11-25)

| Check / Command | Scope | Result | Notes |
|---|---|---|---|
| `npm install --legacy-peer-deps` | Package installation | **Verified** | Runs in local workspace & matches CI workflow |
| `npm run build` (`vite build`) | Production static bundle (`./dist`) | **Passed** | Built cleanly into `./dist` containing non-empty `index.html` and `assets/` |
| `npm run lint` (`tsc --noEmit`) | TypeScript type check | **Passed (0 errors)** | Includes all app code and tests |
| `bun test src/services/__tests__/adminAuth.test.ts` | Admin Auth, MFA, Isolation & Config suite | **14 Passed, 0 Failed** | Uses mocked Supabase Auth/RPC responses for client/contract behavior; does not hit live remote DB |
| YAML syntax validation (`deploy.yml`) | `.github/workflows/deploy.yml` | **Passed** | Verified valid YAML structure and job dependency graph |

---

## 9. Troubleshooting Common Deployment Failures

1. **`Error: No artifacts named "github-pages" were found for this workflow run` / `Found 0 artifact(s)`**:
   - Confirm `.github/workflows/deploy.yml` uses the two-job structure (`build` uploading `name: github-pages` from `path: ./dist` with `actions/upload-pages-artifact@v4`, and `deploy` using `needs: build` with `actions/deploy-pages@v4`).
   - Confirm in **Repository Settings -> Pages** that **Source** is set to **GitHub Actions** (not "Deploy from a branch").
   - Check the **Build Static Applet** and **Verify Build Output** logs in the `build` job to make sure `npm run build` succeeded and `./dist/index.html` is present.
2. **`npm ci` fails or peer dependency errors**:
   - Keep `npm install --legacy-peer-deps` in `.github/workflows/deploy.yml` (the repository uses `bun.lock` rather than `package-lock.json` and Capacitor plugins require `--legacy-peer-deps`).
3. **Deployed site loads blank or missing Supabase/Party data**:
   - Verify all required `VITE_*` secrets/variables are present in **GitHub Repository Settings -> Secrets and variables -> Actions** and re-run the `Deploy GitHub Pages` workflow.
4. **Developer Portal shows "Transition Mode (Run SQL Migration)"**:
   - Run `/supabase/migrations/001_secure_admin_auth.sql` inside the **`jtec_main`** Supabase SQL Editor, then enable TOTP MFA under **Authentication -> Multi-Factor Auth**.

---

## 10. How to Safely Roll Back Changes

1. **Roll back a workflow or frontend change via Git**:
   ```bash
   git log --oneline -n 5
   git revert <commit-sha>
   git push origin main
   ```
   GitHub Actions will automatically rebuild and redeploy the previous working commit to GitHub Pages without deleting any Supabase data or GitHub Secrets.
2. **Roll back `001_secure_admin_auth.sql` (if ever needed in `jtec_main`)**:
   - Only revert individual RLS policies via Supabase SQL Editor if locking yourself out was caused by an unseeded admin account—prefer adding your `user_id` + email into `public.admin_users` (`is_active = true`) rather than re-opening public write access.
