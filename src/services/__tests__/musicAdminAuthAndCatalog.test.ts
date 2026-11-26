import { describe, test, beforeEach, afterEach } from 'node:test';
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
import {
  ALLOWED_MANAGED_MUSIC_PROJECTS,
  isAllowedMusicProject,
  buildSafeStoragePath,
  validateStorageObjectPath,
  extractStoragePathFromPublicUrl,
  isMissingCreatedAtError,
  executeAdaptiveMutation,
  normalizeCloudSongRow,
} from '../musicAdminCore';

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

const supabaseModule = await import('../supabase');
const { SupabaseService, clearAdminAuthTokens, getJtecAdminClient } = supabaseModule;
const musicAdminApi = await import('../musicAdminApi');
const {
  MusicAdminError,
  checkMusicAdminServerStatus,
  listProjectSongsAdmin,
  updateSongMetadataAdmin,
  deleteSongAdmin,
} = musicAdminApi;

function makeOwnerUser(overrides: Partial<User> = {}): User {
  return {
    id: 'owner-user-1',
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

function makeAuthorizedAdminClient(opts: {
  initialAccessToken?: string;
  refreshedAccessToken?: string;
  expiresAt?: number;
  getUserTokensReject?: string[];
  aalLevel?: 'aal1' | 'aal2';
  onUpdate?: (table: string, payload: any, id: string) => { error: any };
  onDelete?: (table: string, id: string) => { error: any };
  onStorageRemove?: (bucket: string, paths: string[]) => void;
} = {}) {
  let currentToken = opts.initialAccessToken ?? 'valid-aal2-jwt';
  let currentExpiresAt = opts.expiresAt ?? Math.floor(Date.now() / 1000) + 3600;
  let refreshCount = 0;
  let challengeCalls = 0;
  const auditCalls: Array<{ fn: string; params?: any }> = [];
  const owner = makeOwnerUser();
  const aal = opts.aalLevel ?? 'aal2';

  const client = {
    get refreshCount() {
      return refreshCount;
    },
    get challengeCalls() {
      return challengeCalls;
    },
    auditCalls,
    auth: {
      getSession: async () => ({
        data: {
          session: {
            access_token: currentToken,
            refresh_token: 'owner-refresh-token',
            expires_at: currentExpiresAt,
            user: owner,
          },
        },
        error: null,
      }),
      refreshSession: async () => {
        refreshCount += 1;
        currentToken = opts.refreshedAccessToken ?? 'refreshed-aal2-jwt';
        currentExpiresAt = Math.floor(Date.now() / 1000) + 3600;
        return {
          data: {
            session: {
              access_token: currentToken,
              refresh_token: 'owner-refresh-token-next',
              expires_at: currentExpiresAt,
              user: owner,
            },
          },
          error: null,
        };
      },
      getUser: async (jwt?: string) => {
        if (jwt && opts.getUserTokensReject?.includes(jwt)) {
          return { data: { user: null }, error: { message: 'JWT expired', status: 401 } };
        }
        return { data: { user: owner }, error: null };
      },
      signOut: async () => ({ error: null }),
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({
          data: {
            currentLevel: aal,
            nextLevel: 'aal2',
            currentAuthenticationMethods: aal === 'aal2' ? [{ method: 'totp' }] : [],
          },
          error: null,
        }),
        listFactors: async () => ({
          data: {
            totp: [{ id: 'totp-1', status: 'verified', factor_type: 'totp' }],
            all: [{ id: 'totp-1', status: 'verified', factor_type: 'totp' }],
          },
          error: null,
        }),
        challengeAndVerify: async () => {
          challengeCalls += 1;
          return { data: { access_token: 're-challenged' }, error: null };
        },
      },
    },
    rpc: async (fn: string, params?: any) => {
      auditCalls.push({ fn, params });
      if (fn === 'verify_admin_access') {
        return {
          data: {
            is_admin: true,
            is_anonymous: false,
            is_active: true,
            role: 'owner',
            mfa_required: true,
            has_verified_mfa: true,
            needs_mfa_enrollment: false,
            current_aal: aal,
          },
          error: null,
        };
      }
      return { data: null, error: null };
    },
    from: (table: string) => ({
      update: (payload: any) => ({
        eq: (_col: string, id: string) =>
          Promise.resolve(opts.onUpdate ? opts.onUpdate(table, payload, id) : { error: null }),
      }),
      delete: () => ({
        eq: (_col: string, id: string) =>
          Promise.resolve(opts.onDelete ? opts.onDelete(table, id) : { error: null }),
      }),
    }),
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          opts.onStorageRemove?.(bucket, paths);
          return { data: [], error: null };
        },
        getPublicUrl: (p: string) => ({
          data: { publicUrl: `https://jtecmain.supabase.co/storage/v1/object/public/${bucket}/${p}` },
        }),
      }),
    },
  };

  return client as unknown as SupabaseClient & {
    refreshCount: number;
    challengeCalls: number;
    auditCalls: Array<{ fn: string; params?: any }>;
  };
}

describe('Music Admin Session Persistence, Multi-Project Isolation & Catalogue Resilience', () => {
  const originalGetCategoryConfig = SupabaseService.getCategoryConfig;
  const originalGetClientForCategory = SupabaseService.getClientForCategory;

  beforeEach(() => {
    mockLocalStorage.clear();
    mockSessionStorage.clear();
    mockLocalStorage.setItem('jtec-admin-stay-signed-in', 'true');
    mockLocalStorage.setItem('jtec-admin-last-opened', String(Date.now()));
    resetAdminLoginThrottle();
    touchAdminActivity();
  });

  afterEach(() => {
    SupabaseService.getCategoryConfig = originalGetCategoryConfig;
    SupabaseService.getClientForCategory = originalGetClientForCategory;
  });

  test('1. clearAdminAuthTokens does not erase persisted jtec_main admin tokens when called for an unrelated category client', async () => {
    SupabaseService.getCategoryConfig = (cat) => {
      if (cat === 'jtec_main') {
        return {
          url: 'https://main-test.supabase.co',
          anonKey: 'anon-main-test-key',
          bucket: 'music',
          tableName: 'songs',
          isConfigured: true,
        };
      }
      return {
        url: 'https://nasheed-test.supabase.co',
        anonKey: 'anon-nasheed-test-key',
        bucket: 'music',
        tableName: 'songs',
        isConfigured: true,
      };
    };

    const mainAdmin = getJtecAdminClient();
    assert.ok(mainAdmin, 'jtecAdminClient should initialize when jtec_main config is present');

    mockLocalStorage.setItem('jtec-admin-auth', '{"access_token":"owner-aal2-session"}');
    mockLocalStorage.setItem('jtec-admin-last-opened', '1700000000000');

    let unrelatedSignOutCount = 0;
    const unrelatedCategoryClient = {
      auth: {
        signOut: async () => {
          unrelatedSignOutCount += 1;
          return { error: null };
        },
      },
    } as unknown as SupabaseClient;

    await clearAdminAuthTokens('local', unrelatedCategoryClient);
    assert.equal(unrelatedSignOutCount, 1);
    assert.equal(
      mockLocalStorage.getItem('jtec-admin-auth'),
      '{"access_token":"owner-aal2-session"}',
      'Unrelated client cleanup must NEVER wipe jtec-admin-auth'
    );
    assert.equal(
      mockLocalStorage.getItem('jtec-admin-last-opened'),
      '1700000000000',
      'Unrelated client cleanup must NEVER wipe jtec-admin-last-opened'
    );
  });

  test('2. Persisted AAL2 session auto-refreshes an expired JWT once and reuses session across multiple operations without TOTP re-prompt', async () => {
    const client = makeAuthorizedAdminClient({
      initialAccessToken: 'stale-jwt-token',
      refreshedAccessToken: 'fresh-aal2-jwt',
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      getUserTokensReject: ['stale-jwt-token'],
      aalLevel: 'aal2',
    });

    const firstVerify = await verifyAdminAuthorization(client, { checkInactivity: true });
    assert.equal(firstVerify.stage, 'authorized');
    assert.equal(firstVerify.session?.access_token, 'fresh-aal2-jwt');
    assert.equal(client.refreshCount, 1);

    // Subsequent admin actions reuse the verified AAL2 session without refreshing again or prompting TOTP
    for (let i = 0; i < 4; i++) {
      const check = await assertActiveAdminSession(client);
      assert.equal(check.ok, true);
    }
    assert.equal(client.refreshCount, 1);
    assert.equal(client.challengeCalls, 0);
  });

  test('3. musicAdminCore validates allowed projects, blocks path traversal, extracts artwork paths, adapts missing columns, and normalizes legacy/dual song schemas', async () => {
    assert.deepEqual([...ALLOWED_MANAGED_MUSIC_PROJECTS], ['jtec_main', 'nasheed', 'love_chill']);
    assert.equal(isAllowedMusicProject('jtec_main'), true);
    assert.equal(isAllowedMusicProject('nasheed'), true);
    assert.equal(isAllowedMusicProject('love_chill'), true);
    assert.equal(isAllowedMusicProject('jtec_party'), false);
    assert.equal(isAllowedMusicProject('party'), false);

    assert.equal(buildSafeStoragePath('tracks', '../evil/song name?.mp3'), 'tracks/song_name_.mp3');
    assert.throws(() => validateStorageObjectPath('../secret.mp3', 'music'));
    assert.throws(() => validateStorageObjectPath('tracks/wrong-bucket.jpg', 'artwork'));
    assert.equal(validateStorageObjectPath('/covers/art_1.jpg', 'artwork'), 'covers/art_1.jpg');

    assert.equal(
      extractStoragePathFromPublicUrl(
        'https://abc.supabase.co/storage/v1/object/public/artwork/covers/track%201.jpg',
        'artwork'
      ),
      'covers/track 1.jpg'
    );
    assert.equal(extractStoragePathFromPublicUrl('data:image/jpeg;base64,/9j/4AAQ', 'artwork'), null);

    // Adaptive schema stripping on PGRST204 missing optional dual columns
    const attemptedPayloads: Array<Record<string, unknown>> = [];
    const adaptiveRes = await executeAdaptiveMutation(
      {
        title: 'Test Track',
        file_path: 'tracks/a.mp3',
        storage_path: 'tracks/a.mp3',
        public_url: 'https://cdn.example/a.mp3',
        audio_url: 'https://cdn.example/a.mp3',
      },
      async (candidate) => {
        attemptedPayloads.push({ ...candidate });
        if ('storage_path' in candidate) {
          return {
            error: {
              code: 'PGRST204',
              message: "Could not find the 'storage_path' column of 'songs' in the schema cache",
            },
          };
        }
        if ('public_url' in candidate) {
          return {
            error: {
              code: '42703',
              message: 'column "public_url" of relation "songs" does not exist',
            },
          };
        }
        return { error: null };
      }
    );
    assert.equal(adaptiveRes.error, null);
    assert.equal(attemptedPayloads.length, 3);
    assert.equal('file_path' in attemptedPayloads[2], true);
    assert.equal('audio_url' in attemptedPayloads[2], true);
    assert.equal('storage_path' in attemptedPayloads[2], false);

    // Normalize both legacy (`file_path`, `audio_url`, `cover_url`) and dual (`storage_path`, `public_url`, `artwork_url`) rows
    const dualRow = normalizeCloudSongRow({
      id: 'id-1',
      title: 'Dual Track',
      storage_path: 'tracks/dual.mp3',
      public_url: 'https://example.com/dual.mp3',
      artwork_url: 'https://example.com/dual.jpg',
    });
    assert.equal(dualRow.file_path, 'tracks/dual.mp3');
    assert.equal(dualRow.audio_url, 'https://example.com/dual.mp3');
    assert.equal(dualRow.cover_url, 'https://example.com/dual.jpg');

    const legacyResolved = normalizeCloudSongRow(
      {
        id: 'id-2',
        title: 'Legacy Track',
        file_path: 'tracks/legacy.mp3',
      },
      (fp) => `https://resolved.example/${fp}`
    );
    assert.equal(legacyResolved.audio_url, 'https://resolved.example/tracks/legacy.mp3');
  });

  test('4. fetchSongsForCategory falls back when created_at is absent and preserves pagination past 1000 rows', async () => {
    assert.equal(
      isMissingCreatedAtError({ code: '42703', message: 'column songs.created_at does not exist' }),
      true
    );
    assert.equal(isMissingCreatedAtError({ code: '42501', message: 'permission denied' }), false);

    SupabaseService.getCategoryConfig = () => ({
      url: 'https://nasheed-test.supabase.co',
      anonKey: 'nasheed-anon-key',
      bucket: 'music',
      tableName: 'songs',
      isConfigured: true,
    });

    const page1 = Array.from({ length: 1000 }, (_, i) => ({
      id: `n-${i}`,
      title: `Track ${i}`,
      file_path: `tracks/${i}.mp3`,
      updated_at: `2026-01-01T00:00:${String(i % 60).padStart(2, '0')}Z`,
    }));
    const page2 = [
      {
        id: 'n-newest',
        title: 'Newest Track',
        file_path: 'tracks/newest.mp3',
        updated_at: '2026-02-01T00:00:00Z',
      },
    ];

    const queryOrders: boolean[] = [];
    const mockPublicClient = {
      from: () => {
        let usedCreatedAtOrder = false;
        const builder: any = {
          select: () => builder,
          order: (col: string) => {
            if (col === 'created_at') usedCreatedAtOrder = true;
            return builder;
          },
          range: async (from: number) => {
            queryOrders.push(usedCreatedAtOrder);
            if (usedCreatedAtOrder) {
              return {
                data: null,
                error: { code: '42703', message: 'column songs.created_at does not exist' },
                status: 400,
              };
            }
            return {
              data: from === 0 ? page1 : page2,
              error: null,
              status: 200,
            };
          },
        };
        return builder;
      },
      storage: {
        from: (bucket: string) => ({
          getPublicUrl: (fp: string) => ({
            data: { publicUrl: `https://nasheed-test.supabase.co/storage/v1/object/public/${bucket}/${fp}` },
          }),
        }),
      },
    } as unknown as SupabaseClient;

    SupabaseService.getClientForCategory = () => mockPublicClient;

    const songs = await SupabaseService.fetchSongsForCategory('nasheed');
    assert.equal(songs.length, 1001);
    assert.equal(songs[0].id, 'n-newest');
    assert.equal(songs[0].audio_url, 'https://nasheed-test.supabase.co/storage/v1/object/public/music/tracks/newest.mp3');
    assert.deepEqual(queryOrders, [true, false, false]);
  });

  test('5. musicAdminApi enforces owner AAL2, isolates nasheed/love_chill through music-admin Edge Function, and never logs out on 404/503', async () => {
    SupabaseService.getCategoryConfig = (cat) => ({
      url: `https://${cat}-test.supabase.co`,
      anonKey: `${cat}-anon-key`,
      bucket: 'music',
      tableName: 'songs',
      isConfigured: true,
    });

    // Rejects JTEC Party cleanly
    await assert.rejects(
      () => listProjectSongsAdmin(makeAuthorizedAdminClient(), 'jtec_party' as any),
      (err: any) => err instanceof MusicAdminError && err.code === 'request_failed'
    );

    // Fails closed with 'unauthorized' if session is missing or AAL1
    await assert.rejects(
      () => listProjectSongsAdmin(null, 'nasheed'),
      (err: any) => err instanceof MusicAdminError && err.code === 'unauthorized'
    );
    await assert.rejects(
      () => listProjectSongsAdmin(makeAuthorizedAdminClient({ aalLevel: 'aal1' }), 'nasheed'),
      (err: any) => err instanceof MusicAdminError && err.code === 'unauthorized'
    );

    const aal2Owner = makeAuthorizedAdminClient({ initialAccessToken: 'owner-aal2-jwt' });

    // Edge Function 404 for checkMusicAdminServerStatus does NOT throw 'unauthorized'
    const undeployedStatus = await checkMusicAdminServerStatus(aal2Owner, {
      fetchImpl: async () => new Response('Not Found', { status: 404 }),
    });
    assert.equal(undeployedStatus.available, false);

    // Cross-project mutation (`nasheed`) with 404 / 503 throws non-logout error and NEVER calls nasheed client with jtec_main token
    await assert.rejects(
      () =>
        updateSongMetadataAdmin(
          aal2Owner,
          'nasheed',
          'song-1',
          { title: 'X', artist: 'Y', album: 'Z', genre: 'Nasheed' },
          {
            fetchImpl: async () =>
              new Response(JSON.stringify({ error: 'Not configured', code: 'PROJECT_NOT_CONFIGURED' }), {
                status: 503,
                headers: { 'Content-Type': 'application/json' },
              }),
          }
        ),
      (err: any) => err instanceof MusicAdminError && err.code === 'project_unconfigured'
    );

    // Server-authorized Nasheed edit sends jtec_main AAL2 Bearer token to jtec_main Edge Function endpoint
    let capturedUrl = '';
    let capturedAuth = '';
    let capturedBody: any = null;
    await updateSongMetadataAdmin(
      aal2Owner,
      'nasheed',
      'song-42',
      { title: 'Updated Nasheed', artist: 'Vocalist', album: 'Single', genre: 'Nasheed' },
      {
        fetchImpl: async (input, init) => {
          capturedUrl = String(input);
          capturedAuth = String((init?.headers as Record<string, string>)?.Authorization || '');
          capturedBody = JSON.parse(String(init?.body || '{}'));
          return new Response(JSON.stringify({ ok: true, row: { id: 'song-42' } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        },
      }
    );
    assert.equal(capturedUrl, 'https://jtec_main-test.supabase.co/functions/v1/music-admin');
    assert.equal(capturedAuth, 'Bearer owner-aal2-jwt');
    assert.equal(capturedBody.action, 'update-song');
    assert.equal(capturedBody.targetProject, 'nasheed');

    // jtec_main direct adminClient fallback on 404 cleans DB, audio, artwork, and writes audit log
    const removedAssets: Array<{ bucket: string; paths: string[] }> = [];
    const mainFallbackClient = makeAuthorizedAdminClient({
      onStorageRemove: (bucket, paths) => removedAssets.push({ bucket, paths }),
    });
    await deleteSongAdmin(
      mainFallbackClient,
      'jtec_main',
      {
        id: 'main-song-7',
        title: 'Main Track',
        artist: 'Artist',
        album: 'Single',
        genre: 'Super Bass',
        duration: 180,
        file_name: 'main.mp3',
        file_path: 'tracks/main.mp3',
        file_size: 1024,
        audio_url: 'https://jtec_main-test.supabase.co/storage/v1/object/public/music/tracks/main.mp3',
        cover_url: 'https://jtec_main-test.supabase.co/storage/v1/object/public/artwork/covers/main_cover.jpg',
        file_hash: 'hash',
        created_at: '2026-01-01T00:00:00Z',
      },
      { fetchImpl: async () => new Response('Not found', { status: 404 }) }
    );
    assert.deepEqual(removedAssets, [
      { bucket: 'music', paths: ['tracks/main.mp3'] },
      { bucket: 'artwork', paths: ['covers/main_cover.jpg'] },
    ]);
    assert.equal(
      mainFallbackClient.auditCalls.some(
        (c) => c.fn === 'log_admin_action' && c.params?.p_action === 'song_deleted'
      ),
      true
    );
  });

  test('6. music-admin Edge Function enforces AAL2+TOTP+owner DB checks, isolates JTEC Party, and avoids wildcard CORS or frontend secret leakage', () => {
    const edgeSrc = fs.readFileSync(path.resolve(process.cwd(), 'supabase/functions/music-admin/index.ts'), 'utf8');

    assert.ok(edgeSrc.includes("new Set<TargetProject>(['jtec_main', 'nasheed', 'love_chill'])"));
    assert.ok(edgeSrc.includes("claims.aal !== 'aal2' || !hasTotpAmr(claims.amr)"));
    assert.ok(edgeSrc.includes("adminRow.role !== 'owner'"));
    assert.ok(edgeSrc.includes("verify_admin_access"));
    assert.ok(edgeSrc.includes("f?.factor_type === 'totp' && f?.status === 'verified'"));
    assert.equal(edgeSrc.includes('dihyzyqhppmqtkheqpbs'), false);
    assert.equal(edgeSrc.includes('PARTY_SUPABASE'), false);
    assert.equal(edgeSrc.includes('party_rooms'), false);
    assert.equal(edgeSrc.includes("'Access-Control-Allow-Origin': '*'"), false);

    // Ensure frontend files & workflow configs never expose server admin credentials
    const clientFiles = [
      'src/services/musicAdminCore.ts',
      'src/services/musicAdminApi.ts',
      'src/components/developer/MusicManagerPanel.tsx',
      'src/components/DeveloperPage.tsx',
    ];
    for (const rel of clientFiles) {
      const content = fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');
      assert.equal(/SERVICE_ROLE/i.test(content), false, `${rel} must never reference SERVICE_ROLE keys`);
    }
  });
});
