import { SupabaseService, CloudCategoryKey, getMaskedHost, sanitizeSecretText } from './supabase';
import {
  getPartySupabaseClient,
  getPartySupabaseConfigStatus,
  getPartySupabaseConfig,
} from '../party/backend/supabaseClient';
import { AppLogger } from './appLogger';

export type HealthStatus =
  | 'HEALTHY'
  | 'DEGRADED'
  | 'ERROR'
  | 'NOT CONFIGURED'
  | 'NOT TESTED';

export type OverallHealthStatus =
  | 'HEALTHY'
  | 'DEGRADED'
  | 'ERROR'
  | 'OFFLINE'
  | 'NOT TESTED';

export type MonitoredProjectId =
  | 'jtec_main'
  | 'jtec_party'
  | 'nasheed'
  | 'love_chill';

export interface ProjectHealthSnapshot {
  id: MonitoredProjectId;
  name: string;
  subtitle: string;
  maskedHost: string;
  configStatus: 'CONFIGURED' | 'NOT CONFIGURED';
  healthStatus: HealthStatus;
  lastSuccessfulCheck: number | null;
  lastFailedCheck: number | null;
  dbReadResult: string;
  storageTestResult: string;
  realtimeStatus: string;
  lastErrorMessage: string | null;
  lastSuccessfulOperation: string | null;
  lastEventTimestamp: number | null;
  isTesting: boolean;
  latencyMs: number | null;
}

export interface OverallHealthSnapshot {
  status: OverallHealthStatus;
  isOnline: boolean;
  lastHealthCheckAt: number | null;
  isRefreshingAll: boolean;
}

const PROJECT_META: Record<MonitoredProjectId, { name: string; subtitle: string }> = {
  jtec_main: {
    name: 'JTEC Music Main',
    subtitle: 'Main catalog, app_config & telemetry',
  },
  jtec_party: {
    name: 'JTEC Party',
    subtitle: 'Dedicated room sync, Realtime & profiles (dihyzyqhppmqtkheqpbs)',
  },
  nasheed: {
    name: 'Nasheed',
    subtitle: 'Nasheed catalog & audio bucket',
  },
  love_chill: {
    name: 'Love & Chill',
    subtitle: 'Love & Chill catalog & audio bucket',
  },
};

const TEST_TIMEOUT_MS = 10000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function createInitialProjectSnapshot(id: MonitoredProjectId): ProjectHealthSnapshot {
  const meta = PROJECT_META[id];
  if (id === 'jtec_party') {
    const partyCfg = getPartySupabaseConfigStatus();
    return {
      id,
      name: meta.name,
      subtitle: meta.subtitle,
      maskedHost: partyCfg.maskedHost,
      configStatus: partyCfg.isConfigured ? 'CONFIGURED' : 'NOT CONFIGURED',
      healthStatus: partyCfg.isConfigured ? 'NOT TESTED' : 'NOT CONFIGURED',
      lastSuccessfulCheck: null,
      lastFailedCheck: null,
      dbReadResult: partyCfg.isConfigured ? 'Not tested' : 'Not configured',
      storageTestResult: 'N/A (Party Social & Realtime)',
      realtimeStatus: partyCfg.isConfigured ? 'Not tested' : 'Not configured',
      lastErrorMessage: partyCfg.isConfigured ? null : partyCfg.reason,
      lastSuccessfulOperation: null,
      lastEventTimestamp: null,
      isTesting: false,
      latencyMs: null,
    };
  }

  const cfg = SupabaseService.getCategoryConfig(id as CloudCategoryKey);
  const maskedHost = getMaskedHost(cfg.url);
  return {
    id,
    name: meta.name,
    subtitle: meta.subtitle,
    maskedHost,
    configStatus: cfg.isConfigured ? 'CONFIGURED' : 'NOT CONFIGURED',
    healthStatus: cfg.isConfigured ? 'NOT TESTED' : 'NOT CONFIGURED',
    lastSuccessfulCheck: null,
    lastFailedCheck: null,
    dbReadResult: cfg.isConfigured ? 'Not tested' : 'Not configured',
    storageTestResult: cfg.isConfigured ? 'Not tested' : 'Not configured',
    realtimeStatus: 'N/A (Catalog)',
    lastErrorMessage: cfg.isConfigured ? null : 'Missing build-time Supabase credentials',
    lastSuccessfulOperation: null,
    lastEventTimestamp: null,
    isTesting: false,
    latencyMs: null,
  };
}

class HealthMonitor {
  private projects: Record<MonitoredProjectId, ProjectHealthSnapshot>;
  private isOnline: boolean = typeof navigator !== 'undefined' ? navigator.onLine !== false : true;
  private lastHealthCheckAt: number | null = null;
  private isRefreshingAll = false;
  private listeners: Set<() => void> = new Set();
  private networkListenersAttached = false;

  constructor() {
    this.projects = {
      jtec_main: createInitialProjectSnapshot('jtec_main'),
      jtec_party: createInitialProjectSnapshot('jtec_party'),
      nasheed: createInitialProjectSnapshot('nasheed'),
      love_chill: createInitialProjectSnapshot('love_chill'),
    };
    this.attachNetworkListeners();
  }

  private attachNetworkListeners(): void {
    if (this.networkListenersAttached || typeof window === 'undefined') return;
    this.networkListenersAttached = true;

    window.addEventListener('online', () => {
      this.isOnline = true;
      this.notify();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.notify();
    });
  }

  private notify(): void {
    this.listeners.forEach((cb) => {
      try {
        cb();
      } catch {
        // ignore listener failure
      }
    });
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public isLoveChillConfigured(): boolean {
    return SupabaseService.getCategoryConfig('love_chill').isConfigured;
  }

  public getVisibleProjectIds(): MonitoredProjectId[] {
    const ids: MonitoredProjectId[] = ['jtec_main', 'jtec_party', 'nasheed'];
    if (this.isLoveChillConfigured()) {
      ids.push('love_chill');
    }
    return ids;
  }

  public getProjectSnapshots(): ProjectHealthSnapshot[] {
    return this.getVisibleProjectIds().map((id) => ({ ...this.projects[id] }));
  }

  public getProjectSnapshot(id: MonitoredProjectId): ProjectHealthSnapshot {
    return { ...this.projects[id] };
  }

  public getOverallHealth(): OverallHealthSnapshot {
    const online =
      typeof navigator !== 'undefined' && navigator.onLine === false ? false : this.isOnline;

    if (!online) {
      return {
        status: 'OFFLINE',
        isOnline: false,
        lastHealthCheckAt: this.lastHealthCheckAt,
        isRefreshingAll: this.isRefreshingAll,
      };
    }

    const visible = this.getProjectSnapshots();
    const configured = visible.filter((p) => p.configStatus === 'CONFIGURED');

    let status: OverallHealthStatus = 'NOT TESTED';
    if (configured.length === 0) {
      status = 'NOT TESTED';
    } else if (configured.some((p) => p.healthStatus === 'ERROR')) {
      status = 'ERROR';
    } else if (configured.some((p) => p.healthStatus === 'DEGRADED')) {
      status = 'DEGRADED';
    } else if (configured.every((p) => p.healthStatus === 'HEALTHY')) {
      status = 'HEALTHY';
    } else if (configured.some((p) => p.healthStatus === 'HEALTHY')) {
      // Some configured projects passed, others are still NOT TESTED
      status = 'DEGRADED';
    } else {
      status = 'NOT TESTED';
    }

    return {
      status,
      isOnline: online,
      lastHealthCheckAt: this.lastHealthCheckAt,
      isRefreshingAll: this.isRefreshingAll,
    };
  }

  public async testProjectHealth(id: MonitoredProjectId): Promise<ProjectHealthSnapshot> {
    if (this.projects[id].isTesting) {
      return this.getProjectSnapshot(id);
    }

    this.projects[id] = {
      ...this.projects[id],
      isTesting: true,
    };
    this.notify();

    try {
      if (id === 'jtec_party') {
        await this.runPartyHealthCheck();
      } else {
        await this.runMusicCatalogHealthCheck(id);
      }
    } finally {
      this.projects[id] = {
        ...this.projects[id],
        isTesting: false,
      };
      this.notify();
    }

    return this.getProjectSnapshot(id);
  }

  public async testPartyConnection(): Promise<ProjectHealthSnapshot> {
    return this.testProjectHealth('jtec_party');
  }

  public async refreshAllHealthChecks(): Promise<void> {
    if (this.isRefreshingAll) return;
    this.isRefreshingAll = true;
    this.notify();

    try {
      const visibleIds = this.getVisibleProjectIds();
      await Promise.allSettled(visibleIds.map((id) => this.testProjectHealth(id)));
      this.lastHealthCheckAt = Date.now();
      this.notify();
    } finally {
      this.isRefreshingAll = false;
      this.notify();
    }
  }

  private async runMusicCatalogHealthCheck(id: CloudCategoryKey): Promise<void> {
    const cfg = SupabaseService.getCategoryConfig(id);
    const maskedHost = getMaskedHost(cfg.url);
    const now = Date.now();

    if (!cfg.isConfigured) {
      this.projects[id] = {
        ...this.projects[id],
        maskedHost: 'Not Configured',
        configStatus: 'NOT CONFIGURED',
        healthStatus: 'NOT CONFIGURED',
        dbReadResult: 'Not configured',
        storageTestResult: 'Not configured',
        realtimeStatus: 'N/A (Catalog)',
        lastErrorMessage: 'Missing build-time Supabase URL or anon key.',
        lastEventTimestamp: now,
      };
      return;
    }

    const startTime = Date.now();
    try {
      const diag = await withTimeout(
        SupabaseService.testCategoryConnection(id),
        TEST_TIMEOUT_MS,
        `${PROJECT_META[id].name} health check`
      );
      const latencyMs = Math.max(1, Date.now() - startTime);
      const ts = Date.now();

      const dbSummary =
        diag.databaseStatus === 'ready'
          ? `Ready (${diag.tableName})`
          : diag.databaseStatus === 'missing_table'
          ? `Missing table (${diag.tableName})`
          : diag.databaseStatus === 'permission_denied'
          ? 'Permission denied (RLS)'
          : diag.databaseStatus === 'paused'
          ? 'Project paused'
          : diag.databaseStatus === 'failed'
          ? 'Failed'
          : 'Not checked';

      const storageSummary =
        diag.storageStatus === 'ready'
          ? `Ready (${diag.bucketName})`
          : diag.storageStatus === 'missing_bucket'
          ? `Missing bucket (${diag.bucketName})`
          : diag.storageStatus === 'permission_denied'
          ? 'Permission denied'
          : diag.storageStatus === 'failed'
          ? 'Failed'
          : 'Not checked';

      if (diag.status === 'connected') {
        this.projects[id] = {
          ...this.projects[id],
          maskedHost: diag.maskedHost || maskedHost,
          configStatus: 'CONFIGURED',
          healthStatus: 'HEALTHY',
          lastSuccessfulCheck: ts,
          dbReadResult: dbSummary,
          storageTestResult: storageSummary,
          realtimeStatus: 'N/A (Catalog)',
          lastErrorMessage: null,
          lastSuccessfulOperation: `Health check passed (${diag.tableName} + ${diag.bucketName})`,
          lastEventTimestamp: ts,
          latencyMs,
        };
        AppLogger.success(
          'HealthMonitor',
          'project_health_check_passed',
          `${PROJECT_META[id].name} health check passed (${latencyMs}ms)`,
          { host: diag.maskedHost, db: dbSummary, storage: storageSummary, latencyMs },
          id
        );
      } else if (diag.status === 'partial') {
        const cleanMsg = sanitizeSecretText(diag.message, [cfg.anonKey]);
        this.projects[id] = {
          ...this.projects[id],
          maskedHost: diag.maskedHost || maskedHost,
          configStatus: 'CONFIGURED',
          healthStatus: 'DEGRADED',
          lastFailedCheck: ts,
          dbReadResult: dbSummary,
          storageTestResult: storageSummary,
          realtimeStatus: 'N/A (Catalog)',
          lastErrorMessage: cleanMsg,
          lastEventTimestamp: ts,
          latencyMs,
        };
        AppLogger.warning(
          'HealthMonitor',
          'project_health_check_degraded',
          `${PROJECT_META[id].name} partially ready: ${cleanMsg}`,
          { host: diag.maskedHost, db: dbSummary, storage: storageSummary },
          id
        );
      } else {
        const cleanMsg = sanitizeSecretText(diag.message, [cfg.anonKey]);
        this.projects[id] = {
          ...this.projects[id],
          maskedHost: diag.maskedHost || maskedHost,
          configStatus: diag.status === 'not_configured' ? 'NOT CONFIGURED' : 'CONFIGURED',
          healthStatus: diag.status === 'not_configured' ? 'NOT CONFIGURED' : 'ERROR',
          lastFailedCheck: ts,
          dbReadResult: dbSummary,
          storageTestResult: storageSummary,
          realtimeStatus: 'N/A (Catalog)',
          lastErrorMessage: cleanMsg,
          lastEventTimestamp: ts,
          latencyMs,
        };
        AppLogger.error(
          'HealthMonitor',
          'project_health_check_failed',
          `${PROJECT_META[id].name} health check failed: ${cleanMsg}`,
          { host: diag.maskedHost, errorType: diag.errorType, db: dbSummary, storage: storageSummary },
          id
        );
      }
    } catch (err) {
      const ts = Date.now();
      const cleanErr = sanitizeSecretText(err, [cfg.anonKey]) || 'Health check timed out';
      this.projects[id] = {
        ...this.projects[id],
        maskedHost,
        configStatus: 'CONFIGURED',
        healthStatus: 'ERROR',
        lastFailedCheck: ts,
        dbReadResult: 'Check timed out / failed',
        storageTestResult: 'Not completed',
        realtimeStatus: 'N/A (Catalog)',
        lastErrorMessage: cleanErr,
        lastEventTimestamp: ts,
        latencyMs: null,
      };
      AppLogger.error(
        'HealthMonitor',
        'project_health_check_exception',
        `${PROJECT_META[id].name} health check error: ${cleanErr}`,
        { host: maskedHost },
        id
      );
    }
  }

  private async runPartyHealthCheck(): Promise<void> {
    const partyStatus = getPartySupabaseConfigStatus();
    const { anonKey } = getPartySupabaseConfig();
    const maskedHost = partyStatus.maskedHost;
    const now = Date.now();

    if (!partyStatus.isConfigured) {
      this.projects.jtec_party = {
        ...this.projects.jtec_party,
        maskedHost,
        configStatus: 'NOT CONFIGURED',
        healthStatus: 'NOT CONFIGURED',
        dbReadResult: 'Not configured',
        storageTestResult: 'N/A (Party Social & Realtime)',
        realtimeStatus: 'Not configured',
        lastErrorMessage: partyStatus.reason || 'Missing VITE_PARTY_SUPABASE_URL or VITE_PARTY_SUPABASE_ANON_KEY.',
        lastEventTimestamp: now,
        latencyMs: null,
      };
      AppLogger.error(
        'HealthMonitor',
        'party_not_configured',
        partyStatus.reason || 'JTEC Party Supabase is not configured.',
        { host: maskedHost },
        'jtec_party'
      );
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.projects.jtec_party = {
        ...this.projects.jtec_party,
        maskedHost,
        configStatus: 'CONFIGURED',
        healthStatus: 'ERROR',
        lastFailedCheck: now,
        dbReadResult: 'Offline',
        realtimeStatus: 'Offline',
        lastErrorMessage: 'Device is offline.',
        lastEventTimestamp: now,
        latencyMs: null,
      };
      AppLogger.error(
        'HealthMonitor',
        'party_health_check_offline',
        'JTEC Party health check skipped: device is offline.',
        undefined,
        'jtec_party'
      );
      return;
    }

    const client = getPartySupabaseClient();
    if (!client) {
      this.projects.jtec_party = {
        ...this.projects.jtec_party,
        maskedHost,
        configStatus: 'CONFIGURED',
        healthStatus: 'ERROR',
        lastFailedCheck: now,
        dbReadResult: 'Client unavailable',
        realtimeStatus: 'Error',
        lastErrorMessage: 'Could not initialize JTEC Party Supabase client.',
        lastEventTimestamp: now,
        latencyMs: null,
      };
      return;
    }

    const startTime = Date.now();
    let dbOk = false;
    let dbAuthBlocked = false;
    let dbResultLabel = 'Not checked';
    let dbErrorMsg: string | null = null;

    // 1. Non-destructive DB / RPC & Auth reachability check
    try {
      const [{ error: sessionError }, rpcRes] = await withTimeout(
        Promise.all([
          client.auth.getSession(),
          client.rpc('find_profile', { p_party_id: '00000000' }),
        ]),
        TEST_TIMEOUT_MS,
        'Party DB check'
      );

      if (sessionError) {
        const clean = sanitizeSecretText(sessionError.message, [anonKey]);
        dbResultLabel = `Auth error: ${clean}`;
        dbErrorMsg = clean;
      } else if (!rpcRes.error) {
        dbOk = true;
        dbResultLabel = 'Ready (RPC find_profile + Auth)';
      } else {
        const msg = String(rpcRes.error.message || '');
        const lower = msg.toLowerCase();
        const status = (rpcRes as any).status;
        if (status === 401 || lower.includes('invalid api key') || lower.includes('jwt')) {
          dbResultLabel = 'Auth failed (HTTP 401: invalid anon key)';
          dbErrorMsg = dbResultLabel;
        } else if (status === 403 || rpcRes.error.code === '42501' || lower.includes('permission denied')) {
          // Database reachable; RPC requires signed-in anonymous session
          dbAuthBlocked = true;
          dbResultLabel = 'Reachable (requires active Party session)';
        } else if (lower.includes('fetch') || lower.includes('network')) {
          dbResultLabel = `Network unreachable (${maskedHost})`;
          dbErrorMsg = dbResultLabel;
        } else {
          dbResultLabel = `RPC error: ${sanitizeSecretText(msg, [anonKey])}`;
          dbErrorMsg = dbResultLabel;
        }
      }
    } catch (err) {
      const clean = sanitizeSecretText(err, [anonKey]) || 'DB check failed';
      dbResultLabel = `Failed: ${clean}`;
      dbErrorMsg = clean;
    }

    // 2. Non-destructive Realtime WebSocket health check (ephemeral channel)
    let realtimeOk = false;
    let realtimeLabel = 'Not checked';
    let realtimeErrMsg: string | null = null;
    const channelName = `healthcheck_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const rtChannel = client.channel(channelName, {
      config: { broadcast: { self: false } },
    });

    try {
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          realtimeLabel = 'TIMED_OUT';
          reject(new Error('Party Realtime channel timed out after 8s'));
        }, 8000);

        rtChannel.subscribe((status: string, err?: any) => {
          if (settled) return;
          if (status === 'SUBSCRIBED') {
            settled = true;
            clearTimeout(timer);
            realtimeOk = true;
            realtimeLabel = 'SUBSCRIBED';
            resolve();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            settled = true;
            clearTimeout(timer);
            const reason = sanitizeSecretText(err, [anonKey]);
            realtimeLabel = status;
            reject(new Error(reason ? `${status}: ${reason}` : `Realtime status: ${status}`));
          } else if (status === 'CLOSED') {
            settled = true;
            clearTimeout(timer);
            realtimeLabel = 'CLOSED';
            reject(new Error('Realtime channel closed unexpectedly during health check'));
          }
        });
      });
    } catch (err) {
      realtimeErrMsg = sanitizeSecretText(err, [anonKey]) || 'Realtime connection failed';
    } finally {
      try {
        await rtChannel.unsubscribe();
        client.removeChannel(rtChannel);
      } catch {
        // ignore cleanup error
      }
    }

    const totalLatency = Math.max(1, Date.now() - startTime);
    const doneAt = Date.now();

    let finalStatus: HealthStatus = 'ERROR';
    let combinedError: string | null = null;
    let successOp: string | null = this.projects.jtec_party.lastSuccessfulOperation;

    if (dbOk && realtimeOk) {
      finalStatus = 'HEALTHY';
      successOp = `DB + Realtime SUBSCRIBED (${totalLatency}ms)`;
    } else if ((dbOk || dbAuthBlocked) && realtimeOk) {
      finalStatus = 'DEGRADED';
      combinedError = dbErrorMsg || 'Database RPC requires active anonymous Party session.';
      successOp = `Realtime SUBSCRIBED (${totalLatency}ms)`;
    } else if (dbOk && !realtimeOk) {
      finalStatus = 'DEGRADED';
      combinedError = realtimeErrMsg || 'Realtime channel failed.';
      successOp = 'Database RPC reachable';
    } else {
      finalStatus = 'ERROR';
      combinedError = dbErrorMsg || realtimeErrMsg || 'Party DB & Realtime checks failed.';
    }

    this.projects.jtec_party = {
      ...this.projects.jtec_party,
      maskedHost,
      configStatus: 'CONFIGURED',
      healthStatus: finalStatus,
      lastSuccessfulCheck: finalStatus === 'HEALTHY' ? doneAt : this.projects.jtec_party.lastSuccessfulCheck,
      lastFailedCheck: finalStatus !== 'HEALTHY' ? doneAt : this.projects.jtec_party.lastFailedCheck,
      dbReadResult: dbResultLabel,
      storageTestResult: 'N/A (Party Social & Realtime)',
      realtimeStatus: realtimeLabel,
      lastErrorMessage: combinedError,
      lastSuccessfulOperation: successOp,
      lastEventTimestamp: doneAt,
      latencyMs: totalLatency,
    };

    if (finalStatus === 'HEALTHY') {
      AppLogger.success(
        'HealthMonitor',
        'party_health_check_passed',
        `JTEC Party health check passed (${totalLatency}ms)`,
        { host: maskedHost, db: dbResultLabel, realtime: realtimeLabel, latencyMs: totalLatency },
        'jtec_party'
      );
    } else if (finalStatus === 'DEGRADED') {
      AppLogger.warning(
        'HealthMonitor',
        'party_health_check_degraded',
        `JTEC Party degraded: ${combinedError}`,
        { host: maskedHost, db: dbResultLabel, realtime: realtimeLabel, latencyMs: totalLatency },
        'jtec_party'
      );
    } else {
      AppLogger.error(
        'HealthMonitor',
        'party_health_check_failed',
        `JTEC Party health check failed: ${combinedError}`,
        { host: maskedHost, db: dbResultLabel, realtime: realtimeLabel },
        'jtec_party'
      );
    }
  }
}

export const HealthMonitorService = new HealthMonitor();
