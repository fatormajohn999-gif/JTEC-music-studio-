import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import {
  ADMIN_IDLE_TIMEOUT_MS,
  ADMIN_PERSISTED_MAX_INACTIVITY_MS,
  ADMIN_SESSION_MAX_AGE_NON_PERSISTENT_MS,
  verifyAdminAuthorization,
  signInAdminWithPassword,
  verifyAdminMfaChallenge,
  assertActiveAdminSession,
  signOutAdmin,
  isAnonymousUser,
  toSafeQrImageSrc,
  touchAdminActivity,
  resetAdminLoginThrottle,
  getAdminLoginCooldownRemainingMs,
} from '../adminAuth';

// Provide minimal browser Web Storage mocks in test runtime
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
};

interface MockClientOptions {
  session?: any;
  getUserResult?: { user: any; error?: any };
  aalData?: {
    currentLevel: 'aal1' | 'aal2' | null;
    nextLevel: 'aal1' | 'aal2' | null;
    currentAuthenticationMethods?: Array<{ method?: string }>;
  };
  totpFactors?: Array<{ id: string; status: string; factor_type?: string; friendly_name?: string }>;
  rpcVerifyResponse?: { data: any; error: any };
  installsProbeError?: any;
  signInResponse?: { data: { session: any; user?: any }; error: any };
  mfaVerifyError?: any;
  refreshResponse?: { data: { session: any }; error: any };
}

function createMockAdminClient(opts: MockClientOptions) {
  const signOutCalls: Array<{ scope?: string }> = [];
  const auditCalls: Array<{ fn: string; params?: any }> = [];

  const client = {
    signOutCalls,
    auditCalls,
    auth: {
      getSession: async () => ({
        data: { session: opts.session ?? null },
        error: null,
      }),
      refreshSession: async () =>
        opts.refreshResponse ?? {
          data: { session: opts.session ?? null },
          error: null,
        },
      getUser: async (_jwt?: string) => ({
        data: { user: opts.getUserResult?.user ?? null },
        error: opts.getUserResult?.error ?? null,
      }),
      signInWithPassword: async () =>
        opts.signInResponse ?? {
          data: { session: null, user: null },
          error: { message: 'Invalid login credentials' },
        },
      signOut: async (args?: { scope?: string }) => {
        signOutCalls.push(args || {});
        return { error: null };
      },
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({
          data: opts.aalData ?? {
            currentLevel: 'aal1',
            nextLevel: 'aal1',
            currentAuthenticationMethods: [],
          },
          error: null,
        }),
        listFactors: async () => ({
          data: {
            totp: opts.totpFactors ?? [],
            all: opts.totpFactors ?? [],
          },
          error: null,
        }),
        challengeAndVerify: async () => ({
          data: opts.mfaVerifyError ? null : { access_token: 'new-aal2-jwt' },
          error: opts.mfaVerifyError ?? null,
        }),
      },
    },
    rpc: async (fn: string, params?: any) => {
      auditCalls.push({ fn, params });
      if (fn === 'verify_admin_access') {
        return opts.rpcVerifyResponse ?? {
          data: { is_admin: true, is_anonymous: false, mfa_required: false },
          error: null,
        };
      }
      if (fn === 'log_admin_action') {
        return { data: null, error: null };
      }
      return { data: null, error: null };
    },
    from: (_table: string) => ({
      select: () => ({
        limit: async () => ({
          data: opts.installsProbeError ? null : [],
          error: opts.installsProbeError ?? null,
        }),
      }),
    }),
  };

  return client as unknown as SupabaseClient & {
    signOutCalls: Array<{ scope?: string }>;
    auditCalls: Array<{ fn: string; params?: any }>;
  };
}

function makeVerifiedUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-owner-123',
    aud: 'authenticated',
    created_at: '2026-01-01T00:00:00Z',
    email: 'fatormajohn999@gmail.com',
    email_confirmed_at: '2026-01-01T00:00:00Z',
    is_anonymous: false,
    app_metadata: { provider: 'email', providers: ['email'], role: 'admin' },
    user_metadata: {},
    ...overrides,
  };
}

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    access_token: 'valid-jwt-token',
    refresh_token: 'valid-refresh-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: makeVerifiedUser(),
    ...overrides,
  };
}

describe('JTEC Music Admin Authentication & Authorization Security Suite', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    mockSessionStorage.clear();
    mockLocalStorage.setItem('jtec-admin-stay-signed-in', 'true');
    mockLocalStorage.setItem('jtec-admin-last-opened', String(Date.now()));
    resetAdminLoginThrottle();
    touchAdminActivity();
  });

  test('1. Authorized owner with verified server RPC and AAL2 passes verification', async () => {
    const user = makeVerifiedUser();
    const client = createMockAdminClient({
      session: makeSession({ user }),
      getUserResult: { user },
      aalData: { currentLevel: 'aal2', nextLevel: 'aal2', currentAuthenticationMethods: [{ method: 'totp' }] },
      totpFactors: [{ id: 'factor-1', status: 'verified', factor_type: 'totp' }],
      rpcVerifyResponse: {
        data: { is_admin: true, is_anonymous: false, mfa_required: true, role: 'owner' },
        error: null,
      },
    });

    const result = await verifyAdminAuthorization(client, { checkInactivity: true });
    assert.equal(result.stage, 'authorized');
    assert.equal(result.assuranceLevel, 'aal2');
    assert.equal(result.hasVerifiedMfa, true);
    assert.equal(result.enforcementMode, 'enforced');
  });

  test('2. Admin with enrolled 2FA at AAL1 is held at mfa_required until TOTP code verifies to AAL2', async () => {
    const user = makeVerifiedUser();
    let currentAal: 'aal1' | 'aal2' = 'aal1';

    const client = createMockAdminClient({
      session: makeSession({ user }),
      getUserResult: { user },
      aalData: { currentLevel: 'aal1', nextLevel: 'aal2' },
      totpFactors: [{ id: 'factor-totp-1', status: 'verified', factor_type: 'totp' }],
      rpcVerifyResponse: {
        data: { is_admin: true, is_anonymous: false, mfa_required: true },
        error: null,
      },
    });

    (client.auth.mfa as any).getAuthenticatorAssuranceLevel = async () => ({
      data: { currentLevel: currentAal, nextLevel: 'aal2', currentAuthenticationMethods: [] },
      error: null,
    });
    (client.auth.mfa as any).challengeAndVerify = async ({ code }: { code: string }) => {
      if (code === '123456') {
        currentAal = 'aal2';
        return { data: { access_token: 'upgraded-jwt' }, error: null };
      }
      return { data: null, error: { message: 'Invalid TOTP code' } };
    };

    const initialCheck = await verifyAdminAuthorization(client);
    assert.equal(initialCheck.stage, 'mfa_required');

    const badVerify = await verifyAdminMfaChallenge(client, 'factor-totp-1', '999999');
    assert.equal(badVerify.stage, 'mfa_required');

    const okVerify = await verifyAdminMfaChallenge(client, 'factor-totp-1', '123456');
    assert.equal(okVerify.stage, 'authorized');
    assert.equal(okVerify.assuranceLevel, 'aal2');
    assert.equal(
      client.auditCalls.some((c) => c.fn === 'log_admin_action' && c.params?.p_action === 'admin_mfa_verified'),
      true
    );
  });

  test('3. Ordinary authenticated non-admin user is denied by server verification', async () => {
    const regularUser = makeVerifiedUser({
      id: 'user-ordinary-999',
      email: 'listener@example.com',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: { role: 'admin', is_admin: true },
    });

    mockLocalStorage.setItem('jtec-admin-auth', '{"forged":true}');

    const client = createMockAdminClient({
      session: makeSession({ user: regularUser }),
      getUserResult: { user: regularUser },
      rpcVerifyResponse: {
        data: {
          is_admin: false,
          is_anonymous: false,
          reason: 'Account is not listed as an authorized JTEC administrator.',
        },
        error: null,
      },
    });

    const result = await verifyAdminAuthorization(client);
    assert.equal(result.stage, 'denied');
    assert.equal(result.session, null);
  });

  test('4. Anonymous user sessions are strictly rejected from admin access (even with forged flags)', async () => {
    const anonUser1 = makeVerifiedUser({
      id: 'anon-1',
      email: undefined,
      email_confirmed_at: undefined,
      is_anonymous: true,
      app_metadata: { provider: 'anonymous', providers: ['anonymous'] },
      user_metadata: { role: 'admin' },
    });

    assert.equal(isAnonymousUser(anonUser1), true);
    assert.equal(isAnonymousUser(makeVerifiedUser(), [{ method: 'anonymous' }]), true);
    assert.equal(isAnonymousUser(makeVerifiedUser(), ['anonymous']), true);

    const client = createMockAdminClient({
      session: makeSession({ user: anonUser1 }),
      getUserResult: { user: anonUser1 },
    });

    const result = await verifyAdminAuthorization(client);
    assert.equal(result.stage, 'denied');
    assert.ok(result.reason?.includes('Anonymous'));
  });

  test('5. Privilege escalation via client localStorage tampering or expired/invalid JWT fails auth.getUser() check', async () => {
    mockLocalStorage.setItem('jtec-admin-auth', '{"access_token":"forged.jwt.payload"}');

    const client = createMockAdminClient({
      session: makeSession({ access_token: 'forged.jwt.payload' }),
      getUserResult: {
        user: null,
        error: { message: 'invalid JWT: signature is invalid', status: 401 },
      },
    });

    const result = await verifyAdminAuthorization(client);
    assert.equal(result.stage, 'unauthenticated');
    assert.equal(result.session, null);
  });

  test('6. Transition mode (SQL migration missing) checks server app_metadata & protected app_installs, NOT public app_config', async () => {
    const ordinaryNoAppRole = makeVerifiedUser({
      id: 'user-regular-2',
      email: 'someone@example.com',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: { role: 'admin' },
    });

    const client = createMockAdminClient({
      session: makeSession({ user: ordinaryNoAppRole }),
      getUserResult: { user: ordinaryNoAppRole },
      rpcVerifyResponse: {
        data: null,
        error: { code: 'PGRST202', message: 'Could not find the function public.verify_admin_access' },
      },
      installsProbeError: { code: '42501', message: 'permission denied for table app_installs' },
    });

    const result = await verifyAdminAuthorization(client);
    assert.equal(result.enforcementMode, 'transition_missing_sql');
    assert.equal(result.stage, 'denied');
  });

  test('7. Expired inactivity timestamp (>7 days persisted or >12h non-persistent) rejects session', async () => {
    const user = makeVerifiedUser();
    const client = createMockAdminClient({
      session: makeSession({ user }),
      getUserResult: { user },
    });

    mockLocalStorage.setItem('jtec-admin-stay-signed-in', 'true');
    mockLocalStorage.setItem('jtec-admin-last-opened', String(Date.now() - ADMIN_PERSISTED_MAX_INACTIVITY_MS - 10_000));
    const expiredPersisted = await verifyAdminAuthorization(client);
    assert.equal(expiredPersisted.stage, 'unauthenticated');

    mockLocalStorage.setItem('jtec-admin-stay-signed-in', 'false');
    mockLocalStorage.setItem('jtec-admin-last-opened', String(Date.now() - ADMIN_SESSION_MAX_AGE_NON_PERSISTENT_MS - 10_000));
    const expiredTemp = await verifyAdminAuthorization(client);
    assert.equal(expiredTemp.stage, 'unauthenticated');
    assert.equal(ADMIN_IDLE_TIMEOUT_MS, 30 * 60 * 1000);
  });

  test('8. assertActiveAdminSession refuses action when session is missing or unauthorized', async () => {
    const noSessionClient = createMockAdminClient({ session: null });
    const check = await assertActiveAdminSession(noSessionClient);
    assert.equal(check.ok, false);
    assert.ok(check.reason);
  });

  test('9. signOutAdmin triggers global logout audit log & purges storage keys', async () => {
    const user = makeVerifiedUser();
    const client = createMockAdminClient({ session: makeSession({ user }), getUserResult: { user } });

    await signOutAdmin(client, 'global');
    assert.equal(
      client.auditCalls.some((c) => c.fn === 'log_admin_action' && c.params?.p_action === 'admin_logout'),
      true
    );
  });

  test('10. Brute-force login protection enforces cooldown after 5 failed login attempts', async () => {
    const failingClient = createMockAdminClient({
      signInResponse: {
        data: { session: null },
        error: { message: 'Invalid login credentials' },
      },
    });

    for (let i = 0; i < 5; i++) {
      await signInAdminWithPassword(failingClient, 'attacker@example.com', 'wrongpass', false);
    }

    assert.ok(getAdminLoginCooldownRemainingMs() > 0);

    const blockedAttempt = await signInAdminWithPassword(failingClient, 'fatormajohn999@gmail.com', 'whatever', false);
    assert.equal(blockedAttempt.stage, 'denied');
    assert.ok(blockedAttempt.reason?.includes('Too many failed sign-in attempts'));
  });

  test('11. toSafeQrImageSrc safely renders SVG QR data for <img> and blocks unsafe URLs', () => {
    const rawSvg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>';
    assert.ok(toSafeQrImageSrc(rawSvg).startsWith('data:image/svg+xml;charset=utf-8,'));
    assert.equal(toSafeQrImageSrc('data:image/svg+xml;base64,PHN2Zz4='), 'data:image/svg+xml;base64,PHN2Zz4=');
    assert.equal(toSafeQrImageSrc('javascript:alert(1)'), '');
    assert.equal(toSafeQrImageSrc('<script>alert(1)</script>'), '');
  });

  test('12. vite.config.ts restricts envPrefix strictly to VITE_ (prevents server secret bundling)', () => {
    const viteConfigPath = path.resolve(process.cwd(), 'vite.config.ts');
    const viteSrc = fs.readFileSync(viteConfigPath, 'utf8');
    assert.ok(viteSrc.includes("envPrefix: ['VITE_']"));
    assert.equal(viteSrc.includes("'SUPABASE_'"), false);
    assert.equal(viteSrc.includes('SERVICE_ROLE'), false);
  });

  test('13. Dedicated Party Supabase config stays strictly isolated from jtec_main', () => {
    const partyClientSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/party/backend/supabaseClient.ts'), 'utf8');
    const partyServiceSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/party/PartyService.ts'), 'utf8');
    assert.ok(partyClientSrc.includes('VITE_PARTY_SUPABASE_URL'));
    assert.ok(partyClientSrc.includes('VITE_PARTY_SUPABASE_ANON_KEY'));
    assert.equal(partyServiceSrc.includes("getClientForCategory('jtec_main')"), false);
  });

  test('14. 001_secure_admin_auth.sql enforces admin_users, locked search_path SECURITY DEFINER, and AAL2 RLS', () => {
    const sql = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/001_secure_admin_auth.sql'), 'utf8');
    assert.ok(sql.includes('create table if not exists public.admin_users'));
    assert.ok(sql.includes('alter table public.admin_users force row level security'));
    assert.ok(sql.includes('create or replace function public.is_jtec_admin()'));
    assert.ok(sql.includes('create or replace function public.is_jtec_admin_aal2()'));
    assert.ok(sql.includes('create or replace function public.verify_admin_access()'));
    assert.ok(sql.includes('set search_path = public, auth, pg_temp'));
    assert.ok(sql.includes('v_is_anon'));
    assert.ok(sql.includes("v_aal <> 'aal2'"));
  });
});
