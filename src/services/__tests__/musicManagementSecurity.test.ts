import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import {
  verifyAdminAuthorization,
  assertActiveAdminSession,
  resetAdminLoginThrottle,
  touchAdminActivity,
} from '../adminAuth';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
}

const mockLocalStorage = new MemoryStorage();
const mockSessionStorage = new MemoryStorage();

(globalThis as any).localStorage = mockLocalStorage;
(globalThis as any).sessionStorage = mockSessionStorage;
(globalThis as any).window = {
  localStorage: mockLocalStorage,
  sessionStorage: mockSessionStorage,
  addEventListener: () => {},
  removeEventListener: () => {},
};
if (typeof (globalThis as any).navigator === 'undefined') {
  (globalThis as any).navigator = { userAgent: 'Mozilla/5.0 Chrome/130.0 Linux', onLine: true };
}

const { SupabaseService, BUCKET_MUSIC, BUCKET_ARTWORK } = await import('../supabase');

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

function makeMockAuthClient(opts: {
  user: User;
  aal: 'aal1' | 'aal2';
  totpVerified?: boolean;
  verifyRpcData: Record<string, unknown>;
}) {
  const signOutCalls: Array<{ scope?: string }> = [];
  const client = {
    signOutCalls,
    auth: {
      getSession: async () => ({
        data: {
          session: {
            access_token: 'mock-jwt',
            refresh_token: 'mock-refresh',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: opts.user,
          },
        },
        error: null,
      }),
      refreshSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => ({ data: { user: opts.user }, error: null }),
      signOut: async (args?: { scope?: string }) => {
        signOutCalls.push(args || {});
        return { error: null };
      },
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({
          data: {
            currentLevel: opts.aal,
            nextLevel: 'aal2',
            currentAuthenticationMethods: opts.aal === 'aal2' ? [{ method: 'totp' }] : [],
          },
          error: null,
        }),
        listFactors: async () => ({
          data: {
            totp: opts.totpVerified ? [{ id: 'f-totp-1', status: 'verified', factor_type: 'totp' }] : [],
            all: opts.totpVerified ? [{ id: 'f-totp-1', status: 'verified', factor_type: 'totp' }] : [],
          },
          error: null,
        }),
      },
    },
    rpc: async (fn: string) => {
      if (fn === 'verify_admin_access') {
        return { data: opts.verifyRpcData, error: null };
      }
      return { data: null, error: null };
    },
  };

  return client as unknown as SupabaseClient & { signOutCalls: Array<{ scope?: string }> };
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'owner-user-uuid',
    aud: 'authenticated',
    created_at: '2026-01-01T00:00:00Z',
    email: 'fatormajohn999@gmail.com',
    email_confirmed_at: '2026-01-01T00:00:00Z',
    is_anonymous: false,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    ...overrides,
  };
}

const TARGET_MIGRATIONS = [
  {
    name: 'jtec_main',
    migrationPath: 'supabase/migrations/002_jtec_main_music_manager.sql',
    preCheckPath: 'supabase/checks/jtec_main_pre_music_manager.sql',
    postCheckPath: 'supabase/checks/jtec_main_post_music_manager.sql',
  },
  {
    name: 'nasheed',
    migrationPath: 'supabase/migrations/nasheed/001_nasheed_music_security.sql',
    preCheckPath: 'supabase/checks/nasheed_pre_migration_audit.sql',
    postCheckPath: 'supabase/checks/nasheed_post_migration_verify.sql',
  },
  {
    name: 'love_chill',
    migrationPath: 'supabase/migrations/love_chill/001_love_chill_music_security.sql',
    preCheckPath: 'supabase/checks/love_chill_pre_migration_audit.sql',
    postCheckPath: 'supabase/checks/love_chill_post_migration_verify.sql',
  },
];

describe('Unified Music Management — Authorization & Multi-Database Security Isolation', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    mockSessionStorage.clear();
    mockLocalStorage.setItem('jtec-admin-stay-signed-in', 'true');
    mockLocalStorage.setItem('jtec-admin-last-opened', String(Date.now()));
    resetAdminLoginThrottle();
    touchAdminActivity();
  });

  test('1. All three music migrations enforce owner-only permissions, mandatory TOTP (aal2), safe search_path, and storage isolation', () => {
    for (const target of TARGET_MIGRATIONS) {
      const sql = readRepoFile(target.migrationPath);

      // Atomic transaction wrapper
      assert.ok(sql.includes('\nbegin;\n'), `${target.name} migration missing begin;`);
      assert.ok(sql.trimEnd().endsWith('commit;'), `${target.name} migration missing commit;`);

      // Owner-only helper & check (`role = 'owner'` required; never trusts app_metadata role)
      assert.ok(sql.includes('function public.is_jtec_owner()'), `${target.name} missing is_jtec_owner()`);
      assert.ok(sql.includes('function public.is_jtec_owner_aal2()'), `${target.name} missing is_jtec_owner_aal2()`);
      assert.ok(sql.includes("a.role = 'owner'"), `${target.name} must enforce owner-only role`);
      assert.equal(sql.includes('raw_app_meta_data'), false, `${target.name} must not trust raw_app_meta_data`);

      // Mandatory TOTP MFA (AAL2)
      assert.ok(sql.includes("if v_aal <> 'aal2' then\n    return false;"), `${target.name} must block AAL1`);
      assert.ok(sql.includes("f.factor_type = 'totp'"), `${target.name} must require TOTP factor`);
      assert.ok(sql.includes("f.status = 'verified'"), `${target.name} must require verified factor`);

      // Locked search_path without pg_temp and minimum execution grants
      assert.ok(sql.includes('set search_path = pg_catalog, public, auth'), `${target.name} missing safe search_path`);
      assert.equal(/set\s+search_path\s*=.*pg_temp/im.test(sql), false, `${target.name} must exclude pg_temp`);
      assert.ok(sql.includes('revoke all on function public.is_jtec_owner() from public, anon;'));
      assert.ok(sql.includes('revoke all on function public.is_jtec_owner_aal2() from public, anon;'));
      assert.ok(sql.includes('grant execute on function public.is_jtec_owner_aal2() to authenticated;'));
      assert.ok(sql.includes('revoke all on function public.log_music_action(text, jsonb) from public, anon;'));

      // Dynamic policy cleanup + FORCE RLS on songs + public read + owner-only AAL2 writes
      assert.ok(sql.includes('from pg_catalog.pg_policies'));
      assert.ok(sql.includes('alter table public.songs force row level security;'));
      assert.ok(sql.includes('create policy "Allow public read on songs"'));
      assert.ok(sql.includes('create policy "Owner insert songs"'));
      assert.ok(sql.includes('create policy "Owner update songs"'));
      assert.ok(sql.includes('create policy "Owner delete songs"'));

      // Both `'music'` and `'artwork'` buckets protected with AS RESTRICTIVE storage write guards
      assert.ok(sql.includes('create policy "Public Access music"'));
      assert.ok(sql.includes('create policy "Public Access artwork"'));
      assert.ok(sql.includes("bucket_id in ('music', 'artwork') and public.is_jtec_owner_aal2()"));
      assert.ok(sql.includes('as restrictive'));
      assert.ok(sql.includes('Restrict anon writes on music and artwork buckets'));
      assert.ok(sql.includes('Restrict authenticated inserts on music and artwork buckets'));
      assert.ok(sql.includes('Restrict authenticated updates on music and artwork buckets'));
      assert.ok(sql.includes('Restrict authenticated deletes on music and artwork buckets'));

      // Audit trigger & RPC for upload, edit, replacement, and deletion operations
      assert.ok(sql.includes('function public.audit_song_mutations()'));
      assert.ok(sql.includes('create trigger trg_audit_song_mutations'));
      assert.ok(sql.includes("'song_uploaded'"));
      assert.ok(sql.includes("'song_replaced'"));
      assert.ok(sql.includes("'song_edited'"));
      assert.ok(sql.includes("'song_deleted'"));

      // Non-destructive preservation of existing songs & storage files
      assert.equal(/\btruncate\s+table\b/i.test(sql), false, `${target.name} must never truncate`);
      assert.equal(/\bdrop\s+table\b/i.test(sql), false, `${target.name} must never drop tables`);
      assert.equal(/delete\s+from\s+public\.songs/i.test(sql), false, `${target.name} must never delete songs`);
      assert.equal(/delete\s+from\s+storage\./i.test(sql), false, `${target.name} must never delete storage objects`);
    }
  });

  test('2. Pre-migration and post-migration verification SQL files are strictly read-only for all three targets', () => {
    for (const target of TARGET_MIGRATIONS) {
      const preSql = readRepoFile(target.preCheckPath);
      const postSql = readRepoFile(target.postCheckPath);

      assert.equal(
        /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke)\b/i.test(preSql),
        false,
        `${target.preCheckPath} must remain strictly read-only`
      );
      assert.equal(
        /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke)\b/i.test(postSql),
        false,
        `${target.postCheckPath} must remain strictly read-only`
      );

      assert.ok(preSql.includes('information_schema.columns'), `${target.preCheckPath} should inspect songs columns`);
      assert.ok(preSql.includes('from storage.buckets'), `${target.preCheckPath} should inspect storage buckets`);
      assert.ok(postSql.includes('trg_audit_song_mutations') || postSql.includes('audit_song_mutations'));
      assert.ok(postSql.includes('preserved_songs_count'));
    }
  });

  test('3. Database boundaries are isolated: Nasheed and Love & Chill exclude jtec_main telemetry and JTEC Party stays untouched', () => {
    const jtecMain002 = readRepoFile('supabase/migrations/002_jtec_main_music_manager.sql');
    const nasheedSql = readRepoFile('supabase/migrations/nasheed/001_nasheed_music_security.sql');
    const loveChillSql = readRepoFile('supabase/migrations/love_chill/001_love_chill_music_security.sql');

    // Prerequisites guard on jtec_main 002
    assert.ok(jtecMain002.includes('001_secure_admin_auth.sql'));
    assert.ok(jtecMain002.includes("'jtec_main'"));

    // Nasheed & Love & Chill are strictly owner-only in admin_users schema check too
    assert.ok(nasheedSql.includes("check (role = 'owner')"));
    assert.ok(nasheedSql.includes("project_scope text not null default 'nasheed'"));
    assert.equal(nasheedSql.includes('app_installs'), false);
    assert.equal(nasheedSql.includes('ping_install'), false);
    assert.equal(nasheedSql.includes("'love_chill'"), false);

    assert.ok(loveChillSql.includes("check (role = 'owner')"));
    assert.ok(loveChillSql.includes("project_scope text not null default 'love_chill'"));
    assert.equal(loveChillSql.includes('app_installs'), false);
    assert.equal(loveChillSql.includes('ping_install'), false);
    assert.equal(loveChillSql.includes("'nasheed'"), false);

    // Zero JTEC Party leakage across any music migration
    for (const sql of [jtecMain002, nasheedSql, loveChillSql]) {
      assert.equal(sql.includes('dihyzyqhppmqtkheqpbs'), false);
      assert.equal(sql.includes('party_rooms'), false);
      assert.equal(sql.includes('party_profiles'), false);
      assert.equal(sql.includes('jtec_party'), false);
    }

    // JTEC Party backend client remains isolated to VITE_PARTY_SUPABASE_*
    const partyClient = readRepoFile('src/party/backend/supabaseClient.ts');
    const partyService = readRepoFile('src/party/PartyService.ts');
    assert.ok(partyClient.includes('VITE_PARTY_SUPABASE_URL'));
    assert.ok(partyClient.includes('VITE_PARTY_SUPABASE_ANON_KEY'));
    assert.equal(partyService.includes("getClientForCategory('jtec_main')"), false);
  });

  test('4. Non-owner, ordinary authenticated, and anonymous users are denied owner-only admin authorization', async () => {
    // Active owner with verified TOTP + AAL2 succeeds
    const ownerUser = makeUser();
    const ownerClient = makeMockAuthClient({
      user: ownerUser,
      aal: 'aal2',
      totpVerified: true,
      verifyRpcData: {
        is_admin: true,
        is_anonymous: false,
        is_active: true,
        role: 'owner',
        mfa_required: true,
        has_verified_mfa: true,
        needs_mfa_enrollment: false,
        current_aal: 'aal2',
        aal_enforced: true,
      },
    });
    const ownerCheck = await assertActiveAdminSession(ownerClient);
    assert.equal(ownerCheck.ok, true);

    // Authenticated non-owner (e.g. listener or revoked admin rejected by owner-only verify_admin_access RPC)
    const ordinaryUser = makeUser({ id: 'ordinary-user-2', email: 'other@example.com' });
    const deniedClient = makeMockAuthClient({
      user: ordinaryUser,
      aal: 'aal2',
      totpVerified: true,
      verifyRpcData: {
        is_admin: false,
        is_anonymous: false,
        is_active: false,
        reason: 'Account is deactivated or not an authorized JTEC Nasheed owner.',
      },
    });
    const ordinaryRes = await verifyAdminAuthorization(deniedClient);
    assert.equal(ordinaryRes.stage, 'denied');
    assert.equal(ordinaryRes.session, null);
    assert.ok(deniedClient.signOutCalls.length > 0);

    // Anonymous Party / listener account is strictly rejected
    const anonUser = makeUser({
      id: 'anon-party-guest',
      email: undefined,
      email_confirmed_at: undefined,
      is_anonymous: true,
      app_metadata: { provider: 'anonymous', providers: ['anonymous'] },
    });
    const anonClient = makeMockAuthClient({
      user: anonUser,
      aal: 'aal1',
      verifyRpcData: { is_admin: true },
    });
    const anonRes = await verifyAdminAuthorization(anonClient);
    assert.equal(anonRes.stage, 'denied');
    assert.equal(anonRes.session, null);
  });

  test('5. Each music category resolves isolated configuration without cross-project fallback or exposed service-role secrets', () => {
    assert.equal(BUCKET_MUSIC, 'music');
    assert.equal(BUCKET_ARTWORK, 'artwork');

    const mainCfg = SupabaseService.getCategoryConfig('jtec_main');
    const nasheedCfg = SupabaseService.getCategoryConfig('nasheed');
    const loveCfg = SupabaseService.getCategoryConfig('love_chill');

    // When unconfigured in test environment, projects never fall back to one another
    if (!mainCfg.isConfigured) assert.equal(SupabaseService.getClientForCategory('jtec_main'), null);
    if (!nasheedCfg.isConfigured) assert.equal(SupabaseService.getClientForCategory('nasheed'), null);
    if (!loveCfg.isConfigured) assert.equal(SupabaseService.getClientForCategory('love_chill'), null);

    // No service_role keys anywhere in frontend, workflows, .env.example, or SQL migrations
    const filesToScan = [
      'src/services/supabase.ts',
      'src/services/adminAuth.ts',
      'vite.config.ts',
      '.env.example',
      '.github/workflows/deploy.yml',
      '.github/workflows/android-build.yml',
      'supabase/migrations/002_jtec_main_music_manager.sql',
      'supabase/migrations/nasheed/001_nasheed_music_security.sql',
      'supabase/migrations/love_chill/001_love_chill_music_security.sql',
    ];
    for (const rel of filesToScan) {
      const content = readRepoFile(rel);
      assert.equal(/SUPABASE_SERVICE_ROLE_KEY/i.test(content), false, `${rel} must not contain SUPABASE_SERVICE_ROLE_KEY`);
      assert.equal(/VITE_.*SERVICE_ROLE/i.test(content), false, `${rel} must not expose service role via VITE_`);
    }
  });
});
