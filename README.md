# JTEC MUSIC

JTEC MUSIC is a high-performance music player built with **React 18**, **TypeScript**, **Vite**, **Tailwind CSS**, and **Capacitor 7** for both the **Web (PWA)** and **native Android (`com.jtecmusic.app`)**.

---

## 1. Documentation Index

- **[`docs/SECURITY.md`](docs/SECURITY.md)** — Admin authentication, `public.admin_users` authority, mandatory TOTP 2FA (`aal2`), fail-closed guarantees, RLS & `SECURITY DEFINER` design, immutable audit trail, and JTEC Party isolation.
- **[`docs/CHANGELOG.md`](docs/CHANGELOG.md)** — Chronological record of security fixes, build/workflow fixes, and modified files.
- **[`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md)** — Common error resolution (missing RPCs, 2FA setup/recovery, deactivated admin, GitHub Pages artifacts, Party connectivity) and safe rollback steps.

---

## 2. What JTEC Music Does

- **Multi-Source Music Playback**: Plays local audio imports (MP3, WAV, M4A, AAC, OGG, FLAC, WebM) stored on-device as well as curated streaming libraries (**JTEC Music Main**, **Nasheed**, **Love & Chill**, and **Jamendo**).
- **Web Audio Engine & DSP Effects**: Real-time 10-band equalizer, bass/super-bass shaping, spatial/reverb effects, gapless-style transitions, and audio-reactive canvas visualizers.
- **Offline Caching & PWA Auto-Updates**: Service worker caching with automatic background updates on Web when no music is playing.
- **Native Android Integration**:
  - Background media notification & lock screen controls (`@jofr/capacitor-media-session`) with square artwork (`src/services/mediaSession.ts`).
  - Native Android home screen music widget synced directly to the single audio engine (`src/services/widgetBridge.ts`).
  - Android-only minimum-version enforcement (`app_config.min_build`) and self-updating APK release checker (`src/services/nativeUpdate.ts`). Web/iOS builds are never blocked.
- **JTEC Party**: Live synchronized listening rooms where hosts broadcast track/playback state and guests listen in real time using isolated anonymous Supabase sessions.
- **Developer Portal (`src/components/DeveloperPage.tsx`)**: Fail-closed, mandatory-2FA (`aal2`) admin dashboard for device telemetry (`app_installs`), Android minimum build enforcement (`app_config`), Supabase health monitoring & device logs, cloud source connectivity checks, and live JTEC Party activity.

---

## 3. Repository Architecture

```text
├── .github/workflows/
│   ├── deploy.yml              # GitHub Pages build + deploy (2 jobs: build -> deploy)
│   ├── android-build.yml       # Capacitor sync, Gradle release APK build & signing
│   └── release-apk.yml         # Publishes GitHub Release (JTEC-MUSIC.apk + latest.json)
├── android/                    # Native Capacitor Android project (compileSdk 35, AGP 8.7.2, Java)
├── docs/
│   ├── SECURITY.md             # Security architecture & Supabase setup guide
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
├── supabase/migrations/        # 001_secure_admin_auth.sql for jtec_main admin auth & RLS
├── vite.config.ts              # Vite config (base: './', envPrefix: ['VITE_'])
└── capacitor.config.ts         # Capacitor config (appId: com.jtecmusic.app, webDir: dist)
```

---

## 4. Supabase Project Separation

| Logical Project | Purpose | Auth Model | Env Prefix / Config |
|---|---|---|---|
| **JTEC Main (`jtec_main`)** | Mainstream song catalog (`songs` + `music` bucket), `app_config` (`id=1`), `app_installs` telemetry, Admin Auth & immutable audit logs (`admin_users`, `admin_audit_logs`) | Public anon read for `songs` & `app_config (id=1)`; **authoritative `admin_users` + mandatory TOTP MFA (`aal2`)** for telemetry, config mutations, and song deletes | `VITE_SUPABASE_JTEC_*` / `VITE_SUPABASE_URL` |
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

## 6. Local Commands

```bash
npm install --legacy-peer-deps   # Install workspace dependencies
npm test                         # Run automated admin security tests
npm run lint                     # Run TypeScript type check (tsc --noEmit)
npm run build                    # Build static production bundle into ./dist
npm run dev                      # Start Vite dev server on port 3000
```
