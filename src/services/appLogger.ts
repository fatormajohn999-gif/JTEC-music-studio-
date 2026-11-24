export type LogSeverity = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';

export type LogProjectScope =
  | 'app'
  | 'jtec_main'
  | 'jtec_party'
  | 'nasheed'
  | 'love_chill';

export interface AppLogEntry {
  id: string;
  timestamp: number;
  isoTime: string;
  severity: LogSeverity;
  component: string;
  event: string;
  message: string;
  project: LogProjectScope;
  details?: Record<string, unknown>;
}

export interface LogFilterOptions {
  severity?: LogSeverity | 'ALL';
  component?: string | 'ALL';
  project?: LogProjectScope | 'ALL';
  dateKey?: string | 'ALL' | 'TODAY' | '24H' | '7D';
}

export interface AppLogStats {
  total: number;
  info: number;
  success: number;
  warning: number;
  error: number;
  latestError: AppLogEntry | null;
  lastLogAt: number | null;
}

const STORAGE_KEY = 'jtec_app_logs_v1';
const MAX_LOG_ENTRIES = 350;

const SENSITIVE_KEY_PATTERN =
  /(key|token|secret|password|passwd|auth|jwt|bearer|signature|credential|cookie|session)/i;

/**
 * Strips JWTs, Bearer tokens, query strings with credentials, and long opaque secrets.
 */
export function sanitizeLogText(input: unknown): string {
  if (input === null || input === undefined) return '';
  let text =
    input instanceof Error
      ? input.message || String(input)
      : typeof input === 'string'
      ? input
      : (() => {
          try {
            return JSON.stringify(input);
          } catch {
            return String(input);
          }
        })();

  // Strip JWT-like strings
  text = text.replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '[REDACTED_JWT]');
  // Strip Bearer tokens
  text = text.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]');
  // Strip apikey / token / key query params
  text = text.replace(/([?&](?:apikey|api_key|token|access_token|refresh_token|key|secret)=)[^&\s]+/gi, '$1[REDACTED]');
  // Strip Supabase sb_ keys
  text = text.replace(/\bsb_(?:publishable|secret)_[A-Za-z0-9_-]+/g, '[REDACTED_KEY]');
  // Strip data URLs if accidentally logged
  text = text.replace(/data:image\/[a-zA-Z+]+;base64,[A-Za-z0-9+/=]{32,}/g, '[IMAGE_DATA_URL]');

  if (text.length > 600) {
    text = text.slice(0, 597) + '...';
  }
  return text;
}

function sanitizeDetailValue(key: string, value: unknown, depth = 0): unknown {
  if (value === undefined || value === null) return value;
  if (SENSITIVE_KEY_PATTERN.test(key)) {
    return '[REDACTED]';
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return sanitizeLogText(value);
  }
  if (value instanceof Error) {
    return sanitizeLogText(value.message || value.name);
  }
  if (depth >= 2) {
    return '[Object]';
  }
  if (Array.isArray(value)) {
    return value.slice(0, 10).map((item, idx) => sanitizeDetailValue(String(idx), item, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 16);
    for (const [k, v] of entries) {
      out[k] = sanitizeDetailValue(k, v, depth + 1);
    }
    return out;
  }
  return String(value);
}

export function sanitizeDetails(details?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!details || typeof details !== 'object') return undefined;
  const cleaned: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(details).slice(0, 20)) {
    cleaned[key] = sanitizeDetailValue(key, val, 0);
  }
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

function toLocalDateKey(ts: number): string {
  try {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch {
    return '';
  }
}

class AppLoggerService {
  private entries: AppLogEntry[] = [];
  private listeners: Set<() => void> = new Set();
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private globalHandlersInstalled = false;

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.entries = parsed
          .filter(
            (e): e is AppLogEntry =>
              Boolean(e && typeof e === 'object' && typeof e.timestamp === 'number' && typeof e.message === 'string')
          )
          .slice(0, MAX_LOG_ENTRIES);
      }
    } catch {
      this.entries = [];
    }
  }

  private schedulePersist(): void {
    if (typeof localStorage === 'undefined') return;
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.persistNow();
    }, 150);
  }

  public persistNow(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.entries.slice(0, MAX_LOG_ENTRIES)));
    } catch {
      // Retry with smaller slice if storage is tight
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.entries.slice(0, 100)));
      } catch {
        // Ignore storage quota errors cleanly
      }
    }
  }

  private notify(): void {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch {
        // Never allow a broken listener to break logging
      }
    });
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public log(input: {
    severity: LogSeverity;
    component: string;
    event: string;
    message: string;
    project?: LogProjectScope;
    details?: Record<string, unknown>;
  }): AppLogEntry {
    const now = Date.now();
    const entry: AppLogEntry = {
      id: `log_${now}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: now,
      isoTime: new Date(now).toISOString(),
      severity: input.severity,
      component: sanitizeLogText(input.component || 'App') || 'App',
      event: sanitizeLogText(input.event || 'event') || 'event',
      message: sanitizeLogText(input.message || ''),
      project: input.project || 'app',
      details: sanitizeDetails(input.details),
    };

    this.entries = [entry, ...this.entries].slice(0, MAX_LOG_ENTRIES);
    this.schedulePersist();
    this.notify();
    return entry;
  }

  public info(
    component: string,
    event: string,
    message: string,
    details?: Record<string, unknown>,
    project: LogProjectScope = 'app'
  ): AppLogEntry {
    return this.log({ severity: 'INFO', component, event, message, details, project });
  }

  public success(
    component: string,
    event: string,
    message: string,
    details?: Record<string, unknown>,
    project: LogProjectScope = 'app'
  ): AppLogEntry {
    return this.log({ severity: 'SUCCESS', component, event, message, details, project });
  }

  public warning(
    component: string,
    event: string,
    message: string,
    details?: Record<string, unknown>,
    project: LogProjectScope = 'app'
  ): AppLogEntry {
    return this.log({ severity: 'WARNING', component, event, message, details, project });
  }

  public error(
    component: string,
    event: string,
    message: string,
    details?: Record<string, unknown>,
    project: LogProjectScope = 'app'
  ): AppLogEntry {
    return this.log({ severity: 'ERROR', component, event, message, details, project });
  }

  public getLogs(filter?: LogFilterOptions): AppLogEntry[] {
    let list = [...this.entries];
    if (!filter) return list;

    if (filter.severity && filter.severity !== 'ALL') {
      list = list.filter((e) => e.severity === filter.severity);
    }

    if (filter.project && filter.project !== 'ALL') {
      list = list.filter((e) => e.project === filter.project);
    }

    if (filter.component && filter.component !== 'ALL') {
      list = list.filter((e) => e.component === filter.component);
    }

    if (filter.dateKey && filter.dateKey !== 'ALL') {
      const now = Date.now();
      if (filter.dateKey === 'TODAY') {
        const todayKey = toLocalDateKey(now);
        list = list.filter((e) => toLocalDateKey(e.timestamp) === todayKey);
      } else if (filter.dateKey === '24H') {
        list = list.filter((e) => now - e.timestamp <= 24 * 60 * 60 * 1000);
      } else if (filter.dateKey === '7D') {
        list = list.filter((e) => now - e.timestamp <= 7 * 24 * 60 * 60 * 1000);
      } else {
        list = list.filter((e) => toLocalDateKey(e.timestamp) === filter.dateKey);
      }
    }

    return list;
  }

  public getDistinctComponents(): string[] {
    const set = new Set<string>();
    for (const entry of this.entries) {
      if (entry.component) set.add(entry.component);
    }
    return Array.from(set).sort();
  }

  public getDistinctDates(): string[] {
    const set = new Set<string>();
    for (const entry of this.entries) {
      const dk = toLocalDateKey(entry.timestamp);
      if (dk) set.add(dk);
    }
    return Array.from(set).sort().reverse();
  }

  public getStats(): AppLogStats {
    let info = 0;
    let success = 0;
    let warning = 0;
    let error = 0;
    let latestError: AppLogEntry | null = null;

    for (const e of this.entries) {
      if (e.severity === 'INFO') info++;
      else if (e.severity === 'SUCCESS') success++;
      else if (e.severity === 'WARNING') warning++;
      else if (e.severity === 'ERROR') {
        error++;
        if (!latestError) latestError = e;
      }
    }

    return {
      total: this.entries.length,
      info,
      success,
      warning,
      error,
      latestError,
      lastLogAt: this.entries[0]?.timestamp ?? null,
    };
  }

  public clearLogs(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    this.entries = [];
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
    }
    this.notify();
  }

  public installGlobalErrorHandlers(): void {
    if (this.globalHandlersInstalled || typeof window === 'undefined') return;
    this.globalHandlersInstalled = true;

    window.addEventListener('error', (event) => {
      this.error('Runtime', 'window_error', event.message || 'Unhandled window error', {
        filename: event.filename ? event.filename.split('/').pop() : undefined,
        lineno: event.lineno,
        colno: event.colno,
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      const msg = reason instanceof Error ? reason.message : sanitizeLogText(reason);
      this.error('Runtime', 'unhandled_rejection', msg || 'Unhandled promise rejection');
    });
  }
}

export const AppLogger = new AppLoggerService();
