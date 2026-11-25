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
| **`jtec_main` Auth & Telemetry DB Controls** (`supabase/migrations/001_secure_admin_auth.sql`) | **Pending Manual Activation on `jtec_main`** | `public.admin_users`, `public.admin_audit_logs`, `verify_admin_access()`, `is_jtec_admin_aal2()`, forced RLS on `app_installs` with hardened `ping_install()`/`touch_install()`, `storage.objects` (`music`) restrictive guards, and Supabase Dashboard TOTP settings are **not yet executed on the live `jtec_main` database**. |
| **Unified Music Management DB & Storage Security** (`002_jtec_main_music_manager.sql`, `nasheed/001_nasheed_music_security.sql`, `love_chill/001_love_chill_music_security.sql`) | **Ready in Repo — Pending Manual Activation on Each Target** | Separate owner-only (`role = 'owner'`, mandatory TOTP `aal2`) migrations, `'music'` + `'artwork'` storage `AS RESTRICTIVE` guards, public read preservation, and `audit_song_mutations` triggers for **JTEC Main**, **Nasheed**, and **Love & Chill** (**not yet executed** on live databases; `jtec-party` untouched; Upload UI not implemented yet). |

> Because the frontend fails closed when `verify_admin_access()` is missing, the Developer Portal stays locked until an authorized owner executes the SQL migrations and enables TOTP in each target Supabase Dashboard (see [`docs/SECURITY.md`](docs/SECURITY.md)).

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
│   │   ├── 000_pre_migration_audit.sql       # Read-only pre-flight check for jtec_main (001)
│   │   ├── 002_post_migration_verify.sql     # Read-only post-migration verify for jtec_main (001)
│   │   ├── jtec_main_pre_music_manager.sql   # Read-only Music Manager baseline check (jtec_main)
│   │   ├── jtec_main_post_music_manager.sql  # Read-only Music Manager verify (jtec_main)
│   │   ├── nasheed_pre_migration_audit.sql   # Read-only pre-flight check for nasheed
│   │   ├── nasheed_post_migration_verify.sql # Read-only post-migration verify for nasheed
│   │   ├── love_chill_pre_migration_audit.sql  # Read-only pre-flight check for love_chill
│   │   └── love_chill_post_migration_verify.sql # Read-only post-migration verify for love_chill
│   └── migrations/
│       ├── 001_secure_admin_auth.sql         # Atomic admin auth, mandatory AAL2 & telemetry hardening (jtec_main)
│       ├── 002_jtec_main_music_manager.sql   # Owner-only AAL2 songs/music/artwork & audit triggers (jtec_main)
│       ├── nasheed/
│       │   └── 001_nasheed_music_security.sql # Owner-only AAL2 auth, songs, storage & audit (nasheed)
│       └── love_chill/
│           └── 001_love_chill_music_security.sql # Owner-only AAL2 auth, songs, storage & audit (love_chill)
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

---

## 7. Unified Music Management Database & Storage Security Layer

> **Status**: SQL migrations and verification scripts are prepared in-repo for **JTEC Main**, **JTEC Nasheed**, and **JTEC Love & Chill** (**not yet executed against live databases**). Upload UI is not implemented yet, and **JTEC Party** (`jtec-party`, ID `dihyzyqhppmqtkheqpbs`) remains completely untouched.

### Prepared Target Migrations

1. **JTEC Main (`jtec_main`)**:
   - Pre-check: `supabase/checks/jtec_main_pre_music_manager.sql`
   - Migration: `supabase/migrations/002_jtec_main_music_manager.sql` *(requires `001_secure_admin_auth.sql` first)*
   - Post-verify: `supabase/checks/jtec_main_post_music_manager.sql`
2. **JTEC Nasheed (`nasheed`)**:
   - Pre-check: `supabase/checks/nasheed_pre_migration_audit.sql`
   - Migration: `supabase/migrations/nasheed/001_nasheed_music_security.sql`
   - Post-verify: `supabase/checks/nasheed_post_migration_verify.sql`
3. **JTEC Love & Chill (`love_chill`)**:
   - Pre-check: `supabase/checks/love_chill_pre_migration_audit.sql`
   - Migration: `supabase/migrations/love_chill/001_love_chill_music_security.sql`
   - Post-verify: `supabase/checks/love_chill_post_migration_verify.sql`

### Key Security Guarantees & Manual Prerequisites

- **Owner-Only Authorization + Mandatory TOTP (`aal2`)**: Every target restricts `songs` and `'music'` / `'artwork'` bucket writes exclusively to `public.is_jtec_owner_aal2()` (`public.admin_users.role = 'owner'`, `is_active = true`, verified TOTP factor, JWT `aal = 'aal2'`). Public listeners keep `SELECT` streaming/cover/download access.
- **No `service_role` Keys in Frontend**: Admin/owner authentication relies solely on per-project Supabase Auth + TOTP MFA + Postgres RLS (`AS RESTRICTIVE` storage policies), never embedding `service_role` credentials in Vite, Capacitor, or GitHub Actions.
- **Immutable Audit Trail**: All three projects include `public.admin_audit_logs` (`FORCE RLS`, `UPDATE`/`DELETE` denied) plus `trg_audit_song_mutations` (`song_uploaded`, `song_edited`, `song_replaced`, `song_deleted`) and `log_music_action()`.
- **Pre-Flight Schema Check Required**: Each target assumes default `public.songs` + `'music'` and `'artwork'` buckets; run each target's pre-check SQL first and see [`docs/SECURITY.md`](docs/SECURITY.md) Section 5–6 for exact execution order, dashboard settings, schema assumptions, and rollback procedures.
