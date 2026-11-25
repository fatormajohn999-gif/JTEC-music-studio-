# JTEC MUSIC

JTEC MUSIC is a high-performance music player built with **React 18**, **TypeScript**, **Vite**, **Tailwind CSS**, and **Capacitor 7** for both the **Web (PWA)** and **native Android (`com.jtecmusic.app`)**.

---

## 1. Documentation Index

- **[`docs/SECURITY.md`](docs/SECURITY.md)** — Security status (active code controls vs. unactivated DB migration), `admin_users` authority, mandatory TOTP 2FA (`aal2`), `ping_install`/`touch_install` RLS compatibility, exact SQL migration order, verification, and rollback.
- **[`docs/CHANGELOG.md`](docs/CHANGELOG.md)** — Chronological record of security, telemetry, CI workflow, and documentation changes.
- **[`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md)** — Diagnostics for missing RPCs, mandatory 2FA, telemetry RLS compatibility, GitHub Actions/Pages builds, Party connectivity, and rollback steps.

---

## 2. Security Status: Active Code Controls vs. Pending Database Activation

| Protection Layer | Current Status | Details |
|---|---|---|
| **Application & CI Controls** (`src/services/adminAuth.ts`, `DeveloperPage.tsx`, `vite.config.ts`, `.github/workflows/*`) | **Active in Code** | Fail-closed RPC & MFA verification, mandatory TOTP UI gate (`aal2` required), anonymous user rejection, session inactivity locks, `VITE_`-only env bundling, isolated `jtec-party` client, and CI gates (`bun 1.4.4` -> `npm test` -> `npm run lint` -> `npm run build`). |
| **Database & Supabase Auth Controls** (`supabase/migrations/001_secure_admin_auth.sql`) | **Pending Manual Activation on `jtec_main`** | `public.admin_users`, `public.admin_audit_logs`, `verify_admin_access()`, `is_jtec_admin_aal2()`, forced RLS on `app_installs` with hardened `ping_install()`/`touch_install()`, `storage.objects` (`music`) restrictive guards, and Supabase Dashboard TOTP settings are **not yet executed on the live `jtec_main` database**. |

> Because the frontend fails closed when `verify_admin_access()` is missing, the Developer Portal stays locked until an authorized owner executes the SQL migration and enables TOTP in the `jtec_main` Supabase Dashboard (see [`docs/SECURITY.md`](docs/SECURITY.md)).

---

## 3. Repository Architecture

```text
├── .github/workflows/
│   ├── deploy.yml              # CI gate (Bun 1.4.4 -> tests -> lint -> Vite build) + GitHub Pages deploy
│   ├── android-build.yml       # CI gate (Bun 1.4.4 -> tests -> lint -> build) + Capacitor Android release APK
│   └── release-apk.yml         # Publishes GitHub Release (JTEC-MUSIC.apk + latest.json)
├── android/                    # Native Capacitor Android project (compileSdk 35, AGP 8.7.2, Java)
├── docs/
│   ├── SECURITY.md             # Code vs. DB status, migration order, TOTP setup, verification & rollback
│   ├── CHANGELOG.md            # Chronological change log
│   └── TROUBLESHOOTING.md      # Diagnostics, recovery & rollback runbook
├── public/                     # Static PWA manifest, service worker (sw.js), icons & images
├── scripts/                    # Android manifest verification script (ensure-android-manifest.cjs)
├── src/
│   ├── App.tsx                 # Main application shell, navigation & single audio controller
│   ├── components/             # Player UI, DeveloperPage, Party overlays, modals
│   ├── hooks/                  # React hooks for player/visualizer/storage state
│   ├── party/                  # JTEC Party service & isolated Party Supabase backend
│   ├── screens/                # Library, Explore, Equalizer, Settings, Party screens
│   └── services/               # audioEngine, supabase, adminAuth, appConfig, healthMonitor, mediaSession, widgetBridge
├── supabase/
│   ├── checks/
│   │   ├── 000_pre_migration_audit.sql   # Read-only pre-flight check for jtec_main
│   │   └── 002_post_migration_verify.sql # Read-only post-migration verification for jtec_main
│   └── migrations/
│       └── 001_secure_admin_auth.sql     # Atomic admin auth, mandatory AAL2, RLS & telemetry hardening
├── vite.config.ts              # Vite config (base: './', envPrefix: ['VITE_'])
└── capacitor.config.ts         # Capacitor config (appId: com.jtecmusic.app, webDir: dist)
```

---

## 4. Supabase Project Separation

| Logical Project | Purpose | Auth Model | Env Prefix / Config |
|---|---|---|---|
| **JTEC Main (`jtec_main`)** | Mainstream song catalog (`songs` + `music` bucket), `app_config` (`id=1`), `app_installs` telemetry, Admin Auth & immutable audit logs | Public anon read for `songs` & `app_config (id=1)`; anon/auth device pings solely via hardened `ping_install`/`touch_install` RPCs; **authoritative `admin_users` + mandatory TOTP MFA (`aal2`)** for admin portal & mutations | `VITE_SUPABASE_JTEC_*` / `VITE_SUPABASE_URL` |
| **Nasheed** | Dedicated Nasheed & spiritual vocal catalog (`songs` + `music` bucket) | Public anon read (`persistSession: false`) | `VITE_SUPABASE_NASHEED_*` |
| **Love & Chill** | Dedicated melodic & chill catalog (`songs` + `music` bucket) | Public anon read (`persistSession: false`) | `VITE_SUPABASE_LOVE_CHILL_*` |
| **JTEC Party (`jtec-party`, ID `dihyzyqhppmqtkheqpbs`)** | Isolated real-time Party rooms, broadcast playback sync, presence, and live listener stats | Anonymous Party user sign-in (`jtec_party_supabase_auth_token`). Never falls back to `jtec_main` and never receives admin privileges | `VITE_PARTY_SUPABASE_URL` & `VITE_PARTY_SUPABASE_ANON_KEY` |

---

## 5. Required Environment Variable Names

> **Security Rule**: Never commit secret values, service-role keys, or raw tokens to Git or documentation. Configure values exclusively in local `.env` (gitignored) or **GitHub Repository Settings -> Secrets and variables -> Actions**.

- **Frontend (`VITE_` prefix enforced by `vite.config.ts`)**:
  - `VITE_SUPABASE_JTEC_URL` / `VITE_SUPABASE_JTEC_MAIN_URL` / `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_JTEC_ANON_KEY` / `VITE_SUPABASE_JTEC_MAIN_ANON_KEY` / `VITE_SUPABASE_ANON_KEY`
  - `VITE_SUPABASE_NASHEED_URL` / `VITE_SUPABASE_NASHEED_ANON_KEY`
  - `VITE_SUPABASE_LOVE_CHILL_URL` / `VITE_SUPABASE_LOVE_CHILL_ANON_KEY`
  - `VITE_PARTY_SUPABASE_URL` / `VITE_PARTY_SUPABASE_ANON_KEY`
  - `VITE_JAMENDO_CLIENT_ID`
  - `VITE_ADMIN_ALLOWED_EMAILS` *(optional build-time email allowlist)*
- **CI Release Signing Only**:
  - `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_PASSWORD`, `CAPACITOR_APP_ID`, `APP_VERSION_NAME`, `GEMINI_API_KEY`

---

## 6. Local & CI Commands

```bash
npm install --legacy-peer-deps   # Install workspace dependencies
npm test                         # Run admin security + telemetry compatibility tests (requires Bun 1.4.4)
npm run lint                     # Run TypeScript type check (tsc --noEmit)
npm run build                    # Build static production bundle into ./dist
npm run dev                      # Start Vite dev server on port 3000
```
