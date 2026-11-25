import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';

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

const { SupabaseService } = await import('../supabase');
const {
  sendAnonymousPing,
  touchInstall,
  getLastPingDiagnosticInfo,
} = await import('../appConfig');

interface TelemetryMockOptions {
  fallbackOn8Arg?: boolean;
  rpcFailureMessage?: string;
}

function createPostMigrationAnonClient(opts: TelemetryMockOptions = {}) {
  const rpcCalls: Array<{ fn: string; params: any }> = [];
  const directTableAttempts: string[] = [];

  const rlsDenied = {
    data: null,
    error: {
      code: '42501',
      message: 'new row violates row-level security policy for table "app_installs"',
    },
  };

  const client = {
    rpcCalls,
    directTableAttempts,
    from: (table: string) => {
      directTableAttempts.push(table);
      return {
        select: () => ({
          eq: async () => rlsDenied,
          limit: async () => rlsDenied,
          order: async () => rlsDenied,
        }),
        insert: async () => rlsDenied,
        update: () => ({ eq: async () => rlsDenied }),
        delete: () => ({ eq: async () => rlsDenied }),
      };
    },
    rpc: async (fn: string, params?: any) => {
      rpcCalls.push({ fn, params });
      if (opts.rpcFailureMessage) {
        return { data: null, error: { code: '42501', message: opts.rpcFailureMessage } };
      }
      if (fn === 'ping_install') {
        if (opts.fallbackOn8Arg && params && 'p_name' in params) {
          return {
            data: null,
            error: {
              code: 'PGRST202',
              message: 'Could not find the function public.ping_install with parameters (p_name)',
            },
          };
        }
        // Simulate SECURITY DEFINER RPC owned by postgres (BYPASSRLS) updating app_installs under FORCE RLS
        return { data: null, error: null };
      }
      if (fn === 'touch_install') {
        return { data: null, error: null };
      }
      return { data: null, error: { code: 'PGRST202', message: `Unknown RPC ${fn}` } };
    },
  };

  return client as unknown as SupabaseClient & {
    rpcCalls: Array<{ fn: string; params: any }>;
    directTableAttempts: string[];
  };
}

describe('Telemetry Compatibility Under Forced app_installs RLS', () => {
  const originalGetClientForCategory = SupabaseService.getClientForCategory.bind(SupabaseService);

  beforeEach(() => {
    mockLocalStorage.clear();
    mockSessionStorage.clear();
  });

  afterEach(() => {
    SupabaseService.getClientForCategory = originalGetClientForCategory;
  });

  test('1. sendAnonymousPing succeeds via SECURITY DEFINER ping_install RPC even when direct app_installs access is blocked by forced RLS', async () => {
    const anonClient = createPostMigrationAnonClient();
    SupabaseService.getClientForCategory = () => anonClient;

    // Prove direct client access to app_installs fails under forced RLS
    const directInsert = await anonClient.from('app_installs').insert({ install_id: 'forged' } as any);
    assert.equal((directInsert as any).error?.code, '42501');

    anonClient.directTableAttempts.length = 0;

    await sendAnonymousPing(true);

    assert.equal(anonClient.directTableAttempts.length, 0);
    assert.equal(anonClient.rpcCalls.length, 1);
    assert.equal(anonClient.rpcCalls[0].fn, 'ping_install');
    assert.ok(anonClient.rpcCalls[0].params.p_id);
    assert.ok(anonClient.rpcCalls[0].params.p_name);

    const diag = getLastPingDiagnosticInfo();
    assert.equal(diag.succeeded, true);
    assert.equal(diag.error, null);
  });

  test('2. sendAnonymousPing falls back cleanly to 4-parameter ping_install overload if present', async () => {
    const anonClient = createPostMigrationAnonClient({ fallbackOn8Arg: true });
    SupabaseService.getClientForCategory = () => anonClient;

    await sendAnonymousPing(true);

    assert.equal(anonClient.directTableAttempts.length, 0);
    assert.equal(anonClient.rpcCalls.length, 2);
    assert.equal(anonClient.rpcCalls[0].fn, 'ping_install');
    assert.equal('p_name' in anonClient.rpcCalls[0].params, true);
    assert.equal(anonClient.rpcCalls[1].fn, 'ping_install');
    assert.equal('p_name' in anonClient.rpcCalls[1].params, false);
    assert.ok(anonClient.rpcCalls[1].params.p_id);

    const diag = getLastPingDiagnosticInfo();
    assert.equal(diag.succeeded, true);
  });

  test('3. touchInstall succeeds via SECURITY DEFINER touch_install RPC without querying app_installs directly', async () => {
    const anonClient = createPostMigrationAnonClient();
    SupabaseService.getClientForCategory = () => anonClient;

    await touchInstall();

    assert.equal(anonClient.directTableAttempts.length, 0);
    assert.equal(anonClient.rpcCalls.length, 1);
    assert.equal(anonClient.rpcCalls[0].fn, 'touch_install');
    assert.ok(anonClient.rpcCalls[0].params.p_id);
  });

  test('4. Telemetry RPC failure never throws or blocks playback initialization', async () => {
    const failingClient = createPostMigrationAnonClient({
      rpcFailureMessage: 'permission denied for function ping_install',
    });
    SupabaseService.getClientForCategory = () => failingClient;

    await assert.doesNotReject(async () => {
      await sendAnonymousPing(true);
      await touchInstall();
    });

    const diag = getLastPingDiagnosticInfo();
    assert.equal(diag.succeeded, false);
    assert.ok(diag.error?.includes('permission denied'));
  });

  test('5. SQL migration hardens ping_install & touch_install for FORCE RLS compatibility without altering songs or telemetry rows', () => {
    const migrationSql = fs.readFileSync(
      path.resolve(process.cwd(), 'supabase/migrations/001_secure_admin_auth.sql'),
      'utf8'
    );

    // Atomic transaction wrapper
    assert.ok(migrationSql.includes('\nbegin;\n'));
    assert.ok(migrationSql.trimEnd().endsWith('commit;'));

    // Hardens existing ping_install & touch_install overloads dynamically without rewriting bodies
    assert.ok(migrationSql.includes("p.proname in ('ping_install', 'touch_install')"));
    assert.ok(migrationSql.includes('v_fn.rolbypassrls or v_fn.rolsuper'));
    assert.ok(migrationSql.includes('security definer set search_path = pg_catalog, public, extensions'));
    assert.ok(migrationSql.includes('revoke all on function public.%I(%s) from public'));
    assert.ok(migrationSql.includes('grant execute on function public.%I(%s) to anon, authenticated'));

    // App installs forced RLS + zero direct anon/public access
    assert.ok(migrationSql.includes('alter table public.app_installs enable row level security;'));
    assert.ok(migrationSql.includes('alter table public.app_installs force row level security;'));
    assert.ok(migrationSql.includes('revoke all on table public.app_installs from public, anon;'));

    // Zero destructive data operations on songs or app_installs
    assert.equal(/truncate\s+table/i.test(migrationSql), false);
    assert.equal(/delete\s+from\s+public\.(songs|app_installs)/i.test(migrationSql), false);

    // Read-only pre/post inspection scripts exist and perform SELECTs only
    const preAudit = fs.readFileSync(
      path.resolve(process.cwd(), 'supabase/checks/000_pre_migration_audit.sql'),
      'utf8'
    );
    const postVerify = fs.readFileSync(
      path.resolve(process.cwd(), 'supabase/checks/002_post_migration_verify.sql'),
      'utf8'
    );
    assert.ok(preAudit.includes("p.proname in ('ping_install', 'touch_install')"));
    assert.ok(postVerify.includes('relforcerowsecurity as rls_forced'));
    assert.equal(/\b(insert|update|delete|drop|alter|create|truncate)\b/i.test(preAudit), false);
    assert.equal(/\b(insert|update|delete|drop|alter|create|truncate)\b/i.test(postVerify), false);
  });
});
