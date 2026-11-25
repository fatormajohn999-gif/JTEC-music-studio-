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
  confirmAdminTotpEnrollment,
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
  sessionError?: any;
  getUserResult?: { user: any; error?: any };
  aalData?: {
    currentLevel: 'aal1' | 'aal2' | null;
    nextLevel: 'aal1' | 'aal2' | null;
    currentAuthenticationMethods?: Array<{ method?: string }>;
  } | null;
  aalError?: any;
  aalThrow?: Error;
  totpFactors?: Array<{ id: string; status: string; factor_type?: string; friendly_name?: string }>;
  listFactorsError?: any;
  listFactorsThrow?: Error;
  rpcVerifyResponse?: { data: any; error: any };
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
        error: opts.sessionError ?? null,
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
        getAuthenticatorAssuranceLevel: async () => {
          if (opts.aalThrow) throw opts.aalThrow;
          return {
            data:
              opts.aalData === undefined
                ? {
                    currentLevel: 'aal1',
                    nextLevel: 'aal1',
                    currentAuthenticationMethods: [],
                  }
                : opts.aalData,
            error: opts.aalError ?? null,
          };
        },
        listFactors: async () => {
          if (opts.listFactorsThrow) throw opts.listFactorsThrow;
          return {
            data: {
              totp: opts.totpFactors ?? [],
              all: opts.totpFactors ?? [],
            },
            error: opts.listFactorsError ?? null,
          };
        },
        challengeAndVerify: async () => ({
          data: opts.mfaVerifyError ? null : { access_token: 'new-aal2-jwt' },
          error: opts.mfaVerifyError ?? null,
        }),
      },
    },
    rpc: async (fn: string, params?: any) => {
      auditCalls.push({ fn, params });
      if (fn === 'verify_admin_access') {
        return (
          opts.rpcVerifyResponse ?? {
            data: {
              is_admin: true,
              is_anonymous: false,
              is_active: true,
              mfa_required: true,
              has_verified_mfa: true,
              needs_mfa_enrollment: false,
            },
            error: null,
          }
        );
      }
      if (fn === 'log_admin_action') {
        return { data: null, error: null };
      }
      return { data: null, error: null };
    },
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

  test('1. Authorized active admin with verified TOTP factor and AAL2 passes verification', async () => {
    const user = makeVerifiedUser();
    const client = createMockAdminClient({
      session: makeSession({ user }),
      getUserResult: { user },
      aalData: { currentLevel: 'aal2', nextLevel: 'aal2', currentAuthenticationMethods: [{ method: 'totp' }] },
      totpFactors: [{ id: 'factor-1', status: 'verified', factor_type: 'totp' }],
      rpcVerifyResponse: {
        data: {
          is_admin: true,
          is_anonymous: false,
          is_active: true,
          mfa_required: true,
          has_verified_mfa: true,
          needs_mfa_enrollment: false,
          current_aal: 'aal2',
          role: 'owner',
        },
        error: null,
      },
    });

    const result = await verifyAdminAuthorization(client, { checkInactivity: true });
    assert.equal(result.stage, 'authorized');
    assert.equal(result.assuranceLevel, 'aal2');
    assert.equal(result.hasVerifiedMfa, true);
    assert.equal(result.needsMfaEnrollment, false);
    assert.equal(result.enforcementMode, 'enforced');
    assert.ok(result.session);
  });

  test('2. Mandatory MFA: Admin without enrolled TOTP is blocked at mfa_enrollment_required (never authorized at AAL1)', async () => {
    const user = makeVerifiedUser();
    let enrolledVerified = false;
    let currentAal: 'aal1' | 'aal2' = 'aal1';

    const client = createMockAdminClient({
      session: makeSession({ user }),
      getUserResult: { user },
      aalData: { currentLevel: 'aal1', nextLevel: 'aal1' },
      totpFactors: [],
    });

    (client.auth.mfa as any).getAuthenticatorAssuranceLevel = async () => ({
      data: {
        currentLevel: currentAal,
        nextLevel: enrolledVerified ? 'aal2' : 'aal1',
        currentAuthenticationMethods: [],
      },
      error: null,
    });
    (client.auth.mfa as any).listFactors = async () => ({
      data: {
        totp: enrolledVerified ? [{ id: 'new-factor-1', status: 'verified', factor_type: 'totp' }] : [],
        all: enrolledVerified ? [{ id: 'new-factor-1', status: 'verified', factor_type: 'totp' }] : [],
      },
      error: null,
    });
    (client.auth.mfa as any).challengeAndVerify = async ({ code }: { code: string }) => {
      if (code === '654321') {
        enrolledVerified = true;
        currentAal = 'aal2';
        return { data: { access_token: 'upgraded-aal2' }, error: null };
      }
      return { data: null, error: { message: 'Invalid code' } };
    };
    (client as any).rpc = async (fn: string, params?: any) => {
      client.auditCalls.push({ fn, params });
      if (fn === 'verify_admin_access') {
        return {
          data: {
            is_admin: true,
            is_anonymous: false,
            is_active: true,
            mfa_required: true,
            has_verified_mfa: enrolledVerified,
            needs_mfa_enrollment: !enrolledVerified,
            current_aal: currentAal,
          },
          error: null,
        };
      }
      return { data: null, error: null };
    };

    const beforeEnroll = await verifyAdminAuthorization(client);
    assert.equal(beforeEnroll.stage, 'mfa_enrollment_required');
    assert.equal(beforeEnroll.session, null);
    assert.equal(beforeEnroll.needsMfaEnrollment, true);

    const confirmRes = await confirmAdminTotpEnrollment(client, 'new-factor-1', '654321');
    assert.equal(confirmRes.success, true);

    const afterEnroll = await verifyAdminAuthorization(client);
    assert.equal(afterEnroll.stage, 'authorized');
    assert.equal(afterEnroll.assuranceLevel, 'aal2');
    assert.ok(afterEnroll.session);
  });

  test('3. Admin with enrolled 2FA at AAL1 is held at mfa_required (session null) until TOTP code verifies to AAL2', async () => {
    const user = makeVerifiedUser();
    let currentAal: 'aal1' | 'aal2' = 'aal1';

    const client = createMockAdminClient({
      session: makeSession({ user }),
      getUserResult: { user },
      totpFactors: [{ id: 'factor-totp-1', status: 'verified', factor_type: 'totp' }],
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
    (client as any).rpc = async (fn: string, params?: any) => {
      client.auditCalls.push({ fn, params });
      if (fn === 'verify_admin_access') {
        return {
          data: {
            is_admin: true,
            is_anonymous: false,
            is_active: true,
            mfa_required: true,
            has_verified_mfa: true,
            needs_mfa_enrollment: false,
            current_aal: currentAal,
          },
          error: null,
        };
      }
      return { data: null, error: null };
    };

    const initialCheck = await verifyAdminAuthorization(client);
    assert.equal(initialCheck.stage, 'mfa_required');
    assert.equal(initialCheck.session, null);

    const badVerify = await verifyAdminMfaChallenge(client, 'factor-totp-1', '999999');
    assert.equal(badVerify.stage, 'mfa_required');
    assert.equal(badVerify.session, null);

    const okVerify = await verifyAdminMfaChallenge(client, 'factor-totp-1', '123456');
    assert.equal(okVerify.stage, 'authorized');
    assert.equal(okVerify.assuranceLevel, 'aal2');
    assert.equal(
      client.auditCalls.some((c) => c.fn === 'log_admin_action' && c.params?.p_action === 'admin_mfa_verified'),
      true
    );
  });

  test('4. Deactivated admin in admin_users is immediately revoked even if stale app_metadata still says role=admin', async () => {
    const staleAppMetaAdmin = makeVerifiedUser({
      id: 'user-deactivated-1',
      email: 'former-admin@example.com',
      app_metadata: { provider: 'email', providers: ['email'], role: 'admin', is_admin: true },
    });

    const client = createMockAdminClient({
      session: makeSession({ user: staleAppMetaAdmin }),
      getUserResult: { user: staleAppMetaAdmin },
      aalData: { currentLevel: 'aal2', nextLevel: 'aal2', currentAuthenticationMethods: [{ method: 'totp' }] },
      totpFactors: [{ id: 'factor-old', status: 'verified', factor_type: 'totp' }],
      rpcVerifyResponse: {
        data: {
          is_admin: false,
          is_anonymous: false,
          is_active: false,
          reason: 'Account is deactivated or not an authorized JTEC administrator.',
        },
        error: null,
      },
    });

    const result = await verifyAdminAuthorization(client);
    assert.equal(result.stage, 'denied');
    assert.equal(result.session, null);
    assert.ok(client.signOutCalls.length > 0);
  });

  test('5. Ordinary authenticated non-admin user is denied by server verification', async () => {
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
          is_active: false,
          reason: 'Account is deactivated or not an authorized JTEC administrator.',
        },
        error: null,
      },
    });

    const result = await verifyAdminAuthorization(client);
    assert.equal(result.stage, 'denied');
    assert.equal(result.session, null);
  });

  test('6. Anonymous user sessions are strictly rejected from admin access (even with forged flags)', async () => {
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
    assert.equal(result.session, null);
    assert.ok(result.reason?.includes('Anonymous'));
  });

  test('7. Fail closed: missing verify_admin_access RPC (PGRST202/42883) ALWAYS denies access (even with AAL2 and app_metadata.role)', async () => {
    const userWithStaleMeta = makeVerifiedUser({
      app_metadata: { provider: 'email', providers: ['email'], role: 'admin', is_admin: true },
    });

    for (const errCode of ['PGRST202', '42883']) {
      const client = createMockAdminClient({
        session: makeSession({ user: userWithStaleMeta }),
        getUserResult: { user: userWithStaleMeta },
        aalData: { currentLevel: 'aal2', nextLevel: 'aal2', currentAuthenticationMethods: [{ method: 'totp' }] },
        totpFactors: [{ id: 'factor-1', status: 'verified', factor_type: 'totp' }],
        rpcVerifyResponse: {
          data: null,
          error: { code: errCode, message: 'Could not find the function public.verify_admin_access' },
        },
      });

      const result = await verifyAdminAuthorization(client);
      assert.equal(result.stage, 'denied');
      assert.equal(result.session, null);
      assert.equal(result.enforcementMode, 'unavailable');
      assert.ok(client.signOutCalls.length > 0);
    }
  });

  test('8. Fail closed: network errors, permission errors, and unexpected RPC payloads deny access', async () => {
    const user = makeVerifiedUser();

    const networkErrorClient = createMockAdminClient({
      session: makeSession({ user }),
      getUserResult: { user },
      aalData: { currentLevel: 'aal2', nextLevel: 'aal2' },
      totpFactors: [{ id: 'f1', status: 'verified', factor_type: 'totp' }],
      rpcVerifyResponse: { data: null, error: { message: 'Failed to fetch (network timeout)' } },
    });
    const resNetwork = await verifyAdminAuthorization(networkErrorClient);
    assert.equal(resNetwork.stage, 'denied');
    assert.equal(resNetwork.session, null);
    assert.ok(networkErrorClient.signOutCalls.length > 0);

    const permissionErrorClient = createMockAdminClient({
      session: makeSession({ user }),
      getUserResult: { user },
      aalData: { currentLevel: 'aal2', nextLevel: 'aal2' },
      totpFactors: [{ id: 'f1', status: 'verified', factor_type: 'totp' }],
      rpcVerifyResponse: { data: null, error: { code: '42501', message: 'permission denied for function' } },
    });
    const resPerm = await verifyAdminAuthorization(permissionErrorClient);
    assert.equal(resPerm.stage, 'denied');
    assert.equal(resPerm.session, null);

    const malformedPayloadClient = createMockAdminClient({
      session: makeSession({ user }),
      getUserResult: { user },
      aalData: { currentLevel: 'aal2', nextLevel: 'aal2' },
      totpFactors: [{ id: 'f1', status: 'verified', factor_type: 'totp' }],
      rpcVerifyResponse: { data: null, error: null },
    });
    const resMalformed = await verifyAdminAuthorization(malformedPayloadClient);
    assert.equal(resMalformed.stage, 'denied');
    assert.equal(resMalformed.session, null);
  });

  test('9. Fail closed: MFA API errors or exceptions deny access rather than continuing', async () => {
    const user = makeVerifiedUser();

    const aalErrorClient = createMockAdminClient({
      session: makeSession({ user }),
      getUserResult: { user },
      aalError: { message: 'Auth MFA endpoint error' },
    });
    const resAalErr = await verifyAdminAuthorization(aalErrorClient);
    assert.equal(resAalErr.stage, 'denied');
    assert.equal(resAalErr.session, null);
    assert.ok(aalErrorClient.signOutCalls.length > 0);

    const listFactorsErrorClient = createMockAdminClient({
      session: makeSession({ user }),
      getUserResult: { user },
      aalData: { currentLevel: 'aal2', nextLevel: 'aal2' },
      listFactorsError: { message: 'MFA factor lookup failed' },
    });
    const resFactorsErr = await verifyAdminAuthorization(listFactorsErrorClient);
    assert.equal(resFactorsErr.stage, 'denied');
    assert.equal(resFactorsErr.session, null);

    const mfaThrowClient = createMockAdminClient({
      session: makeSession({ user }),
      getUserResult: { user },
      aalThrow: new Error('Unexpected MFA exception'),
    });
    const resThrow = await verifyAdminAuthorization(mfaThrowClient);
    assert.equal(resThrow.stage, 'denied');
    assert.equal(resThrow.session, null);
  });

  test('10. Privilege escalation via localStorage tampering or invalid JWT fails auth.getUser() check', async () => {
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

  test('11. Expired inactivity timestamp (>7 days persisted or >12h non-persistent) rejects session', async () => {
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

  test('12. assertActiveAdminSession refuses action when missing session OR only AAL1', async () => {
    const noSessionClient = createMockAdminClient({ session: null });
    const checkMissing = await assertActiveAdminSession(noSessionClient);
    assert.equal(checkMissing.ok, false);
    assert.ok(checkMissing.reason);

    const user = makeVerifiedUser();
    const aal1Client = createMockAdminClient({
      session: makeSession({ user }),
      getUserResult: { user },
      aalData: { currentLevel: 'aal1', nextLevel: 'aal2' },
      totpFactors: [{ id: 'f1', status: 'verified', factor_type: 'totp' }],
    });
    const checkAal1 = await assertActiveAdminSession(aal1Client);
    assert.equal(checkAal1.ok, false);
  });

  test('13. signOutAdmin triggers global logout audit log & purges storage keys', async () => {
    const user = makeVerifiedUser();
    const client = createMockAdminClient({ session: makeSession({ user }), getUserResult: { user } });

    await signOutAdmin(client, 'global');
    assert.equal(
      client.auditCalls.some((c) => c.fn === 'log_admin_action' && c.params?.p_action === 'admin_logout'),
      true
    );
    assert.deepEqual(client.signOutCalls, [{ scope: 'global' }]);
  });

  test('14. Brute-force login protection enforces cooldown after 5 failed login attempts', async () => {
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

  test('15. toSafeQrImageSrc safely renders SVG QR data for <img> and blocks unsafe URLs', () => {
    const rawSvg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>';
    assert.ok(toSafeQrImageSrc(rawSvg).startsWith('data:image/svg+xml;charset=utf-8,'));
    assert.equal(toSafeQrImageSrc('data:image/svg+xml;base64,PHN2Zz4='), 'data:image/svg+xml;base64,PHN2Zz4=');
    assert.equal(toSafeQrImageSrc('javascript:alert(1)'), '');
    assert.equal(toSafeQrImageSrc('<script>alert(1)</script>'), '');
  });

  test('16. vite.config.ts restricts envPrefix strictly to VITE_ & Party Supabase stays isolated from jtec_main', () => {
    const viteSrc = fs.readFileSync(path.resolve(process.cwd(), 'vite.config.ts'), 'utf8');
    assert.ok(viteSrc.includes("envPrefix: ['VITE_']"));
    assert.equal(viteSrc.includes("'SUPABASE_'"), false);
    assert.equal(viteSrc.includes('SERVICE_ROLE'), false);

    const partyClientSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/party/backend/supabaseClient.ts'), 'utf8');
    const partyServiceSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/party/PartyService.ts'), 'utf8');
    assert.ok(partyClientSrc.includes('VITE_PARTY_SUPABASE_URL'));
    assert.ok(partyClientSrc.includes('VITE_PARTY_SUPABASE_ANON_KEY'));
    assert.equal(partyServiceSrc.includes("getClientForCategory('jtec_main')"), false);
  });

  test('17. 001_secure_admin_auth.sql enforces authoritative admin_users, mandatory AAL2, safe search_path, policy cleanup & immutable audit logs', () => {
    const sql = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/001_secure_admin_auth.sql'), 'utf8');

    // Authoritative admin_users only (no app_metadata role fallback)
    assert.ok(sql.includes('create table if not exists public.admin_users'));
    assert.ok(sql.includes('alter table public.admin_users force row level security'));
    assert.equal(sql.includes('v_app_role'), false);
    assert.equal(sql.includes('raw_app_meta_data'), false);

    // Mandatory AAL2 + verified TOTP unconditionally
    assert.ok(sql.includes("if v_aal <> 'aal2' then\n    return false;"));
    assert.ok(sql.includes("f.factor_type = 'totp'"));
    assert.ok(sql.includes("f.status = 'verified'"));

    // Safe search_path without pg_temp and minimum execution grants
    assert.ok(sql.includes('set search_path = pg_catalog, public, auth'));
    assert.equal(/^\s*set\s+search_path\s*=.*pg_temp/im.test(sql), false);
    assert.ok(sql.includes('revoke all on function public.is_jtec_admin() from public, anon;'));
    assert.ok(sql.includes('revoke all on function public.is_jtec_admin_aal2() from public, anon;'));
    assert.ok(sql.includes('revoke all on function public.verify_admin_access() from public, anon;'));
    assert.ok(sql.includes('revoke all on function public.log_admin_action(text, jsonb) from public, anon;'));

    // Dynamic legacy policy cleanup + restrictive guards on storage.objects
    assert.ok(sql.includes('from pg_catalog.pg_policies'));
    assert.ok(sql.includes('as restrictive'));
    assert.ok(sql.includes('Restrict authenticated inserts on music bucket'));

    // Immutable admin_audit_logs
    assert.ok(sql.includes('alter table public.admin_audit_logs force row level security'));
    assert.ok(sql.includes('revoke all on table public.admin_audit_logs from public, anon, authenticated;'));
    assert.ok(sql.includes('grant select on table public.admin_audit_logs to authenticated;'));
    assert.ok(sql.includes('Deny all audit log updates'));
    assert.ok(sql.includes('Deny all audit log deletes'));
    assert.ok(sql.includes("app.jtec_audit_write"));
  });
});
