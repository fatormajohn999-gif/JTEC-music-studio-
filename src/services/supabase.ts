import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CloudSong, Song } from '../types/music';

// Storage Bucket Names
export const BUCKET_MUSIC = 'music';
export const BUCKET_ARTWORK = 'artwork';

// Three Category Keys
export type CloudCategoryKey = 'nasheed' | 'love_chill' | 'jtec_main';

export interface CategoryMetadata {
  key: CloudCategoryKey;
  title: string;
  subtitle: string;
  description: string;
  badge: string;
  themeColor: string;
  accentBg: string;
  borderColor: string;
  glowColor: string;
  iconName: 'Moon' | 'Heart' | 'Zap';
}

export const CLOUD_CATEGORIES: CategoryMetadata[] = [
  {
    key: 'nasheed',
    title: 'NASHEED',
    subtitle: 'Nasheed & Spiritual Audio',
    description: 'Acoustic vocals, spiritual anthems, calming recitations and peaceful melodies.',
    badge: 'Spiritual & Vocals',
    themeColor: '#10b981', // emerald
    accentBg: 'from-emerald-950/60 via-slate-900/90 to-slate-950',
    borderColor: 'border-emerald-500/30 hover:border-emerald-400/60',
    glowColor: 'shadow-emerald-500/10 hover:shadow-emerald-500/25',
    iconName: 'Moon',
  },
  {
    key: 'love_chill',
    title: 'LOVE & CHILL',
    subtitle: 'Love Songs, Melodic & Chill Beats',
    description: 'Romantic acoustics, lofi vibes, warm melodic ballads and late-night relaxation.',
    badge: 'Melodic & Chill',
    themeColor: '#ec4899', // pink/rose
    accentBg: 'from-pink-950/60 via-slate-900/90 to-slate-950',
    borderColor: 'border-pink-500/30 hover:border-pink-400/60',
    glowColor: 'shadow-pink-500/10 hover:shadow-pink-500/25',
    iconName: 'Heart',
  },
  {
    key: 'jtec_main',
    title: 'JTEC MUSIC',
    subtitle: 'Mainstream Music, Super Bass & Other Genres',
    description: 'Deep super bass, electronic energy, hip-hop, club mixes and mainstream hits.',
    badge: 'Super Bass & Mainstream',
    accentBg: 'from-cyan-950/60 via-slate-900/90 to-slate-950',
    borderColor: 'border-cyan-500/30 hover:border-cyan-400/60',
    glowColor: 'shadow-cyan-500/10 hover:shadow-cyan-500/25',
    themeColor: '#00f0ff', // cyan
    iconName: 'Zap',
  },
];

export interface CategoryProjectConfig {
  url: string;
  anonKey: string;
  bucket: string;
  tableName: string;
  isConfigured: boolean;
}

// Storage keys per category
const LS_PREFIX = 'jtec_supabase_';

// Client singleton cache keyed by url+anonKey to avoid multiple GoTrueClient warnings
const clientCache = new Map<string, SupabaseClient>();

export type ConnectionErrorType =
  | 'configuration'
  | 'authentication'
  | 'permissions'
  | 'bucket'
  | 'database'
  | 'network'
  | 'unknown';

export interface CategoryConnectionDiagnostic {
  categoryKey: CloudCategoryKey;
  status: 'connected' | 'partial' | 'error' | 'not_configured';
  success: boolean;
  errorType?: ConnectionErrorType;
  message: string;
  tableExists: boolean;
  bucketsExist: boolean;
  maskedHost: string;
  tableName: string;
  bucketName: string;
  databaseStatus: 'ready' | 'missing_table' | 'permission_denied' | 'paused' | 'failed' | 'not_checked';
  storageStatus: 'ready' | 'missing_bucket' | 'permission_denied' | 'failed' | 'not_checked';
  suggestion?: string;
  timestamp: number;
}

/**
 * Strips secret keys, JWT tokens, and sensitive headers from error messages and text.
 */
export function sanitizeSecretText(input: unknown, knownSecrets: (string | undefined)[] = []): string {
  if (!input) return '';
  let str =
    typeof input === 'string'
      ? input
      : input instanceof Error
      ? input.message
      : typeof input === 'object'
      ? (input as any).message || JSON.stringify(input)
      : String(input);

  // Strip known keys/secrets
  for (const secret of knownSecrets) {
    if (secret && secret.trim().length > 5) {
      str = str.split(secret.trim()).join('[PROTECTED_KEY]');
    }
  }

  // Strip standard JWT tokens (three dot-separated base64 chunks)
  str = str.replace(/eyJ[a-zA-Z0-9_\-]{8,}\.[a-zA-Z0-9_\-]{8,}\.[a-zA-Z0-9_\-]*/g, '[PROTECTED_JWT]');

  // Strip Authorization / Bearer / apikey query strings
  str = str.replace(/apikey=([^&\s]+)/gi, 'apikey=[PROTECTED_KEY]');
  str = str.replace(/Bearer\s+([a-zA-Z0-9_\-.]+)/gi, 'Bearer [PROTECTED_TOKEN]');

  return str;
}

/**
 * Extracts a safe display hostname from a Supabase URL without credentials or query params.
 */
export function getMaskedHost(url: string): string {
  if (!url) return 'Not Configured';
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname;
  } catch {
    return 'Invalid URL';
  }
}

export function logSupabaseError(context: string, details: {
  errorMessage: string;
  errorCode?: string | number;
  bucket?: string;
  fileName?: string;
  httpStatus?: number;
  raw?: unknown;
}) {
  const sanitizedMessage = sanitizeSecretText(details.errorMessage);
  console.error(`🚨 [JTEC MUSIC - SUPABASE ERROR in ${context}]`, {
    'error message': sanitizedMessage,
    'error code': details.errorCode || 'UNKNOWN',
    'bucket': details.bucket || 'N/A',
    'file name': details.fileName || 'N/A',
    'HTTP status': details.httpStatus || 'N/A',
  });
}

export const SupabaseService = {
  /**
   * Retrieves configuration for a specific cloud category.
   * Priority:
   * 1. Category-specific LocalStorage
   * 2. Category-specific Vite environment variables (supports standard and alternate prefixes)
   * 3. Fallback to general Supabase credentials (for jtec_main or initial setup)
   */
  getCategoryConfig(categoryKey: CloudCategoryKey): CategoryProjectConfig {
    if (typeof localStorage === 'undefined') {
      return { url: '', anonKey: '', bucket: BUCKET_MUSIC, tableName: 'songs', isConfigured: false };
    }

    const lsUrl = (localStorage.getItem(`${LS_PREFIX}${categoryKey}_url`) || '').trim();
    const lsKey = (localStorage.getItem(`${LS_PREFIX}${categoryKey}_anon_key`) || '').trim();
    const lsBucket = (localStorage.getItem(`${LS_PREFIX}${categoryKey}_bucket`) || '').trim();
    const lsTable = (localStorage.getItem(`${LS_PREFIX}${categoryKey}_table`) || '').trim();

    // Check category-specific env vars with flexible naming support
    let envUrl = '';
    let envKey = '';
    let envBucket = '';
    let envTable = '';

    if (categoryKey === 'nasheed') {
      envUrl = (import.meta.env.VITE_SUPABASE_NASHEED_URL as string) ||
               (import.meta.env.VITE_NASHEED_SUPABASE_URL as string) || '';
      envKey = (import.meta.env.VITE_SUPABASE_NASHEED_ANON_KEY as string) ||
               (import.meta.env.VITE_NASHEED_SUPABASE_ANON_KEY as string) || '';
      envBucket = (import.meta.env.VITE_SUPABASE_NASHEED_BUCKET as string) ||
                  (import.meta.env.VITE_NASHEED_SUPABASE_BUCKET as string) || '';
      envTable = (import.meta.env.VITE_SUPABASE_NASHEED_TABLE as string) ||
                 (import.meta.env.VITE_NASHEED_SUPABASE_TABLE as string) || '';
    } else if (categoryKey === 'love_chill') {
      envUrl = (import.meta.env.VITE_SUPABASE_LOVE_CHILL_URL as string) ||
               (import.meta.env.VITE_LOVE_CHILL_SUPABASE_URL as string) || '';
      envKey = (import.meta.env.VITE_SUPABASE_LOVE_CHILL_ANON_KEY as string) ||
               (import.meta.env.VITE_LOVE_CHILL_SUPABASE_ANON_KEY as string) || '';
      envBucket = (import.meta.env.VITE_SUPABASE_LOVE_CHILL_BUCKET as string) ||
                  (import.meta.env.VITE_LOVE_CHILL_SUPABASE_BUCKET as string) || '';
      envTable = (import.meta.env.VITE_SUPABASE_LOVE_CHILL_TABLE as string) ||
                 (import.meta.env.VITE_LOVE_CHILL_SUPABASE_TABLE as string) || '';
    } else if (categoryKey === 'jtec_main') {
      envUrl = (import.meta.env.VITE_SUPABASE_JTEC_URL as string) ||
               (import.meta.env.VITE_JTEC_SUPABASE_URL as string) ||
               (import.meta.env.VITE_SUPABASE_URL as string) || '';
      envKey = (import.meta.env.VITE_SUPABASE_JTEC_ANON_KEY as string) ||
               (import.meta.env.VITE_JTEC_SUPABASE_ANON_KEY as string) ||
               (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || '';
      envBucket = (import.meta.env.VITE_SUPABASE_JTEC_BUCKET as string) ||
                  (import.meta.env.VITE_JTEC_SUPABASE_BUCKET as string) ||
                  (import.meta.env.VITE_SUPABASE_BUCKET as string) || '';
      envTable = (import.meta.env.VITE_SUPABASE_JTEC_TABLE as string) ||
                 (import.meta.env.VITE_JTEC_SUPABASE_TABLE as string) ||
                 (import.meta.env.VITE_SUPABASE_TABLE as string) || '';
    }

    // Fallback to legacy single project credentials for jtec_main if not specifically configured
    const legacyLsUrl = (localStorage.getItem('jtec_supabase_url') || '').trim();
    const legacyLsKey = (localStorage.getItem('jtec_supabase_anon_key') || '').trim();

    const finalUrl = lsUrl || envUrl || (categoryKey === 'jtec_main' ? legacyLsUrl : '');
    const finalKey = lsKey || envKey || (categoryKey === 'jtec_main' ? legacyLsKey : '');
    const finalBucket = lsBucket || envBucket || BUCKET_MUSIC;
    const finalTable = lsTable || envTable || 'songs';

    return {
      url: finalUrl,
      anonKey: finalKey,
      bucket: finalBucket || BUCKET_MUSIC,
      tableName: finalTable || 'songs',
      isConfigured: Boolean(finalUrl && finalKey),
    };
  },

  /**
   * Saves custom configuration for a specific cloud category.
   */
  saveCategoryConfig(
    categoryKey: CloudCategoryKey,
    config: { url: string; anonKey: string; bucket?: string; tableName?: string }
  ) {
    if (typeof localStorage === 'undefined') return;

    localStorage.setItem(`${LS_PREFIX}${categoryKey}_url`, config.url.trim());
    localStorage.setItem(`${LS_PREFIX}${categoryKey}_anon_key`, config.anonKey.trim());
    if (config.bucket) {
      localStorage.setItem(`${LS_PREFIX}${categoryKey}_bucket`, config.bucket.trim());
    }
    if (config.tableName) {
      localStorage.setItem(`${LS_PREFIX}${categoryKey}_table`, config.tableName.trim());
    }

    // Clear client cache for this category so new client is initialized
    clientCache.delete(`${categoryKey}`);
  },

  /**
   * Clears saved configuration for a specific cloud category.
   */
  clearCategoryConfig(categoryKey: CloudCategoryKey) {
    if (typeof localStorage === 'undefined') return;

    localStorage.removeItem(`${LS_PREFIX}${categoryKey}_url`);
    localStorage.removeItem(`${LS_PREFIX}${categoryKey}_anon_key`);
    localStorage.removeItem(`${LS_PREFIX}${categoryKey}_bucket`);
    localStorage.removeItem(`${LS_PREFIX}${categoryKey}_table`);

    clientCache.delete(`${categoryKey}`);
  },

  /**
   * Returns a singleton SupabaseClient for the given category.
   */
  getClientForCategory(categoryKey: CloudCategoryKey): SupabaseClient | null {
    const config = this.getCategoryConfig(categoryKey);
    if (!config.isConfigured) return null;

    const cacheKey = `${config.url}_${config.anonKey}`;
    const existing = clientCache.get(cacheKey);
    if (existing) return existing;

    try {
      const client = createClient(config.url, config.anonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });
      clientCache.set(cacheKey, client);
      return client;
    } catch (err) {
      console.warn(`Failed to initialize Supabase client for ${categoryKey}:`, err);
      return null;
    }
  },

  /**
   * Performs an in-depth connection diagnostic on a specific Supabase project & bucket.
   * Accurately identifies configuration, authentication, permissions, bucket, database,
   * and network failures without exposing secret values.
   */
  async testCategoryConnection(
    categoryKey: CloudCategoryKey,
    customConfig?: Partial<CategoryProjectConfig>
  ): Promise<CategoryConnectionDiagnostic> {
    const stored = this.getCategoryConfig(categoryKey);
    const testUrl = (customConfig?.url ?? stored.url).trim();
    const testKey = (customConfig?.anonKey ?? stored.anonKey).trim();
    const testBucket = (customConfig?.bucket ?? stored.bucket) || BUCKET_MUSIC;
    const testTable = (customConfig?.tableName ?? stored.tableName) || 'songs';
    const maskedHost = getMaskedHost(testUrl);

    // 1. Configuration checks
    if (!testUrl || !testKey) {
      return {
        categoryKey,
        status: 'not_configured',
        success: false,
        errorType: 'configuration',
        message: 'Project URL or Public Anon Key is missing.',
        tableExists: false,
        bucketsExist: false,
        maskedHost,
        tableName: testTable,
        bucketName: testBucket,
        databaseStatus: 'not_checked',
        storageStatus: 'not_checked',
        suggestion: 'Set the GitHub Secrets (VITE_SUPABASE_<CATEGORY>_URL & VITE_SUPABASE_<CATEGORY>_ANON_KEY) or enter them in Project Settings.',
        timestamp: Date.now(),
      };
    }

    try {
      const parsedUrl = new URL(testUrl.startsWith('http') ? testUrl : `https://${testUrl}`);
      if (!parsedUrl.hostname || !parsedUrl.protocol.startsWith('http')) {
        throw new Error('Invalid URL format');
      }
    } catch {
      return {
        categoryKey,
        status: 'error',
        success: false,
        errorType: 'configuration',
        message: `Invalid Project URL format: "${sanitizeSecretText(testUrl, [testKey])}". Must be a valid HTTPS URL (e.g. https://your-project.supabase.co).`,
        tableExists: false,
        bucketsExist: false,
        maskedHost: 'Invalid URL',
        tableName: testTable,
        bucketName: testBucket,
        databaseStatus: 'not_checked',
        storageStatus: 'not_checked',
        suggestion: 'Double-check your Supabase project URL format in project settings.',
        timestamp: Date.now(),
      };
    }

    // 2. Client-side network status check
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return {
        categoryKey,
        status: 'error',
        success: false,
        errorType: 'network',
        message: 'Device is offline. Please check your internet or Wi-Fi connection.',
        tableExists: false,
        bucketsExist: false,
        maskedHost,
        tableName: testTable,
        bucketName: testBucket,
        databaseStatus: 'not_checked',
        storageStatus: 'not_checked',
        suggestion: 'Reconnect to the internet and re-test connection.',
        timestamp: Date.now(),
      };
    }

    try {
      const client = createClient(testUrl, testKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });

      // 3. Test Database Query
      let tableExists = false;
      let databaseStatus: CategoryConnectionDiagnostic['databaseStatus'] = 'not_checked';
      let dbErrorType: ConnectionErrorType | undefined;
      let dbErrorMessage = '';

      const { error: tableError, status: tableHttpStatus } = await client
        .from(testTable)
        .select('id')
        .limit(1);

      if (!tableError) {
        tableExists = true;
        databaseStatus = 'ready';
      } else {
        const rawMsg = (tableError.message || '').toLowerCase();
        const rawCode = tableError.code || '';

        if (tableHttpStatus === 401 || rawMsg.includes('invalid api key') || rawMsg.includes('jwt') || rawMsg.includes('unauthorized') || rawCode === 'PGRST301') {
          dbErrorType = 'authentication';
          databaseStatus = 'failed';
          dbErrorMessage = 'Authentication failed (HTTP 401): The provided Anon Key is invalid, expired, or belongs to another project.';
        } else if (tableHttpStatus === 403 || rawCode === '42501' || rawMsg.includes('permission denied') || rawMsg.includes('row-level security')) {
          dbErrorType = 'permissions';
          databaseStatus = 'permission_denied';
          dbErrorMessage = `Permissions denied (HTTP 403 / RLS): Public read access is blocked on table "${testTable}".`;
        } else if (rawCode === '42P01' || rawMsg.includes('does not exist') || rawMsg.includes('relation')) {
          dbErrorType = 'database';
          databaseStatus = 'missing_table';
          dbErrorMessage = `Database connected, but table "${testTable}" does not exist yet (PostgreSQL 42P01).`;
        } else if (tableHttpStatus === 503 || tableHttpStatus === 500 || rawMsg.includes('paused') || rawMsg.includes('unavailable')) {
          dbErrorType = 'database';
          databaseStatus = 'paused';
          dbErrorMessage = `Database service unavailable (HTTP ${tableHttpStatus}): Project may be paused or starting up.`;
        } else if (rawMsg.includes('fetch') || rawMsg.includes('network') || rawMsg.includes('econnrefused')) {
          dbErrorType = 'network';
          databaseStatus = 'failed';
          dbErrorMessage = `Network unreachable: Failed to contact host "${maskedHost}".`;
        } else {
          dbErrorType = 'database';
          databaseStatus = 'failed';
          dbErrorMessage = `Database query error: ${sanitizeSecretText(tableError.message, [testKey])}`;
        }
      }

      // If authentication failed on DB query, fail early with clear auth error
      if (dbErrorType === 'authentication') {
        return {
          categoryKey,
          status: 'error',
          success: false,
          errorType: 'authentication',
          message: dbErrorMessage,
          tableExists: false,
          bucketsExist: false,
          maskedHost,
          tableName: testTable,
          bucketName: testBucket,
          databaseStatus,
          storageStatus: 'not_checked',
          suggestion: 'Ensure you copied the public "anon" key from Supabase Dashboard > Project Settings > API. Never use the service_role key.',
          timestamp: Date.now(),
        };
      }

      // If network unreachable on DB query, fail with clear network error
      if (dbErrorType === 'network') {
        return {
          categoryKey,
          status: 'error',
          success: false,
          errorType: 'network',
          message: dbErrorMessage,
          tableExists: false,
          bucketsExist: false,
          maskedHost,
          tableName: testTable,
          bucketName: testBucket,
          databaseStatus,
          storageStatus: 'not_checked',
          suggestion: 'Check your internet connection and verify that your Supabase URL is correct.',
          timestamp: Date.now(),
        };
      }

      // 4. Test Storage Bucket (first list from bucket, then listBuckets as fallback)
      let bucketExists = false;
      let storageStatus: CategoryConnectionDiagnostic['storageStatus'] = 'not_checked';
      let storageErrorType: ConnectionErrorType | undefined;
      let storageErrorMessage = '';

      const { data: bucketObjects, error: bucketError } = await client.storage
        .from(testBucket)
        .list('', { limit: 1 });

      if (!bucketError && bucketObjects !== null) {
        bucketExists = true;
        storageStatus = 'ready';
      } else {
        // Fallback: test listBuckets
        const { data: buckets, error: listBucketsError } = await client.storage.listBuckets();
        if (!listBucketsError && buckets?.some((b) => b.name === testBucket)) {
          bucketExists = true;
          storageStatus = 'ready';
        } else {
          const errObj = bucketError || listBucketsError;
          const msg = (errObj?.message || '').toLowerCase();
          const errStatus = (errObj as any)?.status || (errObj as any)?.statusCode;

          if (errStatus === 401 || msg.includes('jwt') || msg.includes('unauthorized') || msg.includes('invalid api key')) {
            storageErrorType = 'authentication';
            storageStatus = 'failed';
            storageErrorMessage = 'Storage authentication failed: Anon key is unauthorized for storage.';
          } else if (errStatus === 403 || msg.includes('access denied') || msg.includes('forbidden') || msg.includes('policy')) {
            storageErrorType = 'permissions';
            storageStatus = 'permission_denied';
            storageErrorMessage = `Storage bucket "${testBucket}" access denied (HTTP 403 / RLS policy).`;
          } else if (msg.includes('not found') || msg.includes('nosuchbucket') || errStatus === 404) {
            storageErrorType = 'bucket';
            storageStatus = 'missing_bucket';
            storageErrorMessage = `Storage bucket "${testBucket}" was not found in this project.`;
          } else {
            storageErrorType = 'bucket';
            storageStatus = 'failed';
            storageErrorMessage = `Storage error: ${sanitizeSecretText(errObj?.message || 'Cannot access bucket', [testKey])}`;
          }
        }
      }

      // 5. Synthesize Overall Diagnostic Status
      if (tableExists && bucketExists) {
        return {
          categoryKey,
          status: 'connected',
          success: true,
          message: `Connected! Database table "${testTable}" and storage bucket "${testBucket}" are both active and ready.`,
          tableExists: true,
          bucketsExist: true,
          maskedHost,
          tableName: testTable,
          bucketName: testBucket,
          databaseStatus: 'ready',
          storageStatus: 'ready',
          suggestion: 'Catalog is fully functional for streaming and downloads.',
          timestamp: Date.now(),
        };
      }

      // Partial status: Connected to Supabase, but schema or bucket needs setup
      if (databaseStatus === 'missing_table' && bucketExists) {
        return {
          categoryKey,
          status: 'partial',
          success: true,
          errorType: 'database',
          message: `Connected to Supabase! The "${testTable}" table does not exist yet.`,
          tableExists: false,
          bucketsExist: true,
          maskedHost,
          tableName: testTable,
          bucketName: testBucket,
          databaseStatus: 'missing_table',
          storageStatus: 'ready',
          suggestion: 'Open SQL Editor in Supabase and run the provided SQL setup schema to create the "songs" table.',
          timestamp: Date.now(),
        };
      }

      if (tableExists && storageStatus === 'missing_bucket') {
        return {
          categoryKey,
          status: 'partial',
          success: true,
          errorType: 'bucket',
          message: `Database table "${testTable}" is ready, but storage bucket "${testBucket}" does not exist.`,
          tableExists: true,
          bucketsExist: false,
          maskedHost,
          tableName: testTable,
          bucketName: testBucket,
          databaseStatus: 'ready',
          storageStatus: 'missing_bucket',
          suggestion: `Go to Supabase Dashboard > Storage and create a public bucket named "${testBucket}".`,
          timestamp: Date.now(),
        };
      }

      if (databaseStatus === 'missing_table' && storageStatus === 'missing_bucket') {
        return {
          categoryKey,
          status: 'partial',
          success: true,
          errorType: 'database',
          message: `Connected to Supabase! Both "${testTable}" table and "${testBucket}" storage bucket need initialization.`,
          tableExists: false,
          bucketsExist: false,
          maskedHost,
          tableName: testTable,
          bucketName: testBucket,
          databaseStatus: 'missing_table',
          storageStatus: 'missing_bucket',
          suggestion: 'Run the full SQL initialization script in Supabase SQL editor to create both the table and storage bucket.',
          timestamp: Date.now(),
        };
      }

      // Permissions failure
      if (databaseStatus === 'permission_denied' || storageStatus === 'permission_denied') {
        return {
          categoryKey,
          status: 'error',
          success: false,
          errorType: 'permissions',
          message: dbErrorMessage || storageErrorMessage || 'Row Level Security policy blocked public read access.',
          tableExists,
          bucketsExist: bucketExists,
          maskedHost,
          tableName: testTable,
          bucketName: testBucket,
          databaseStatus,
          storageStatus,
          suggestion: 'Add public read policies for the "songs" table and storage bucket in Supabase Dashboard.',
          timestamp: Date.now(),
        };
      }

      // General error
      const primaryErrorType = dbErrorType || storageErrorType || 'unknown';
      const primaryMessage = dbErrorMessage || storageErrorMessage || 'Unable to establish connection to Supabase.';

      return {
        categoryKey,
        status: 'error',
        success: false,
        errorType: primaryErrorType,
        message: primaryMessage,
        tableExists,
        bucketsExist: bucketExists,
        maskedHost,
        tableName: testTable,
        bucketName: testBucket,
        databaseStatus,
        storageStatus,
        suggestion: 'Verify your Supabase project configuration in Project Settings.',
        timestamp: Date.now(),
      };
    } catch (err: unknown) {
      const sanitized = sanitizeSecretText(err, [testKey]);
      const lower = sanitized.toLowerCase();
      let detectedType: ConnectionErrorType = 'unknown';
      let suggestion = 'Check your Supabase URL and settings in Project Settings.';

      if (lower.includes('fetch') || lower.includes('network') || lower.includes('failed to fetch') || lower.includes('econnrefused')) {
        detectedType = 'network';
        suggestion = 'Check your internet connection and verify that the Supabase URL host is reachable.';
      } else if (lower.includes('jwt') || lower.includes('unauthorized') || lower.includes('invalid api key')) {
        detectedType = 'authentication';
        suggestion = 'Verify that you copied the correct public "anon" key from Supabase.';
      }

      return {
        categoryKey,
        status: 'error',
        success: false,
        errorType: detectedType,
        message: `Connection failed: ${sanitized}`,
        tableExists: false,
        bucketsExist: false,
        maskedHost,
        tableName: testTable,
        bucketName: testBucket,
        databaseStatus: 'failed',
        storageStatus: 'failed',
        suggestion,
        timestamp: Date.now(),
      };
    }
  },

  /**
   * Fetches real songs from the specified category's Supabase project.
   */
  async fetchSongsForCategory(categoryKey: CloudCategoryKey): Promise<CloudSong[]> {
    const config = this.getCategoryConfig(categoryKey);
    if (!config.isConfigured) {
      return [];
    }

    const client = this.getClientForCategory(categoryKey);
    if (!client) {
      return [];
    }

    try {
      const { data, error, status } = await client
        .from(config.tableName || 'songs')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        logSupabaseError(`fetchSongsForCategory.${categoryKey}`, {
          errorMessage: error.message,
          errorCode: error.code,
          httpStatus: status,
        });

        // Translate to clean user-facing error classification without secrets
        const msg = (error.message || '').toLowerCase();
        let userMessage = error.message;

        if (status === 401 || msg.includes('jwt') || msg.includes('invalid api key')) {
          userMessage = 'Authentication failed: Invalid or expired public anon key. Verify project settings.';
        } else if (status === 403 || error.code === '42501' || msg.includes('permission denied')) {
          userMessage = 'Permissions denied: Row Level Security policy blocks public read on "songs" table.';
        } else if (error.code === '42P01' || msg.includes('does not exist')) {
          userMessage = `Database table "${config.tableName || 'songs'}" does not exist yet. Run SQL setup in Supabase SQL editor.`;
        } else if (status === 503 || msg.includes('paused')) {
          userMessage = 'Supabase project is currently paused or waking up. Please check your Supabase dashboard.';
        }

        throw new Error(userMessage);
      }

      const songs: CloudSong[] = (data || []).map((row) => {
        const filePath = row.storage_path || row.file_path || '';
        let audioUrl = row.public_url || row.audio_url || '';

        // If audio_url is missing from the database row, construct it from the configured bucket
        if (!audioUrl && filePath) {
          const { data: publicUrlData } = client.storage
            .from(config.bucket || BUCKET_MUSIC)
            .getPublicUrl(filePath);
          audioUrl = publicUrlData?.publicUrl || '';
        }

        const coverUrl = row.artwork_url || row.cover_url || '';

        return {
          id: String(row.id),
          title: row.title || 'Untitled',
          artist: row.artist || 'Unknown Artist',
          album: row.album || 'Single',
          genre: row.genre || 'Music',
          duration: Number(row.duration) || 0,
          file_name: row.file_name || 'track.mp3',
          file_path: filePath,
          file_size: Number(row.file_size) || 0,
          audio_url: audioUrl,
          cover_url: coverUrl,
          file_hash: row.file_hash || '',
          created_at: row.created_at || new Date().toISOString(),
          updated_at: row.updated_at,
        };
      });

      return songs;
    } catch (err) {
      logSupabaseError(`fetchSongsForCategory.exception.${categoryKey}`, {
        errorMessage: err instanceof Error ? err.message : 'Unknown exception',
        raw: err,
      });
      throw err;
    }
  },

  /**
   * Downloads an audio file from a Supabase cloud track to local persistent storage.
   * Tracks real download progress chunks (0% to 100%).
   * Never marks as downloaded until the binary file is fully downloaded and ready to be saved.
   */
  async downloadForOffline(
    cloudSong: CloudSong,
    onProgress?: (percent: number) => void
  ): Promise<{ song: Song; blob: Blob }> {
    if (!cloudSong.audio_url) {
      throw new Error('Audio file URL is missing for this cloud track.');
    }

    if (onProgress) onProgress(5);

    const response = await fetch(cloudSong.audio_url);
    if (!response.ok) {
      throw new Error(`Download failed from cloud (HTTP ${response.status})`);
    }

    const contentLength = response.headers.get('content-length');
    const totalBytes = contentLength ? parseInt(contentLength, 10) : (cloudSong.file_size || 0);

    let audioBlob: Blob;

    if (response.body && totalBytes > 0) {
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let receivedBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          receivedBytes += value.length;
          if (onProgress) {
            const pct = Math.min(95, Math.round((receivedBytes / totalBytes) * 90) + 5);
            onProgress(pct);
          }
        }
      }

      audioBlob = new Blob(chunks as any, { type: getAudioMimeType(cloudSong.file_name) });
    } else {
      if (onProgress) onProgress(40);
      audioBlob = await response.blob();
      if (onProgress) onProgress(90);
    }

    if (!audioBlob || audioBlob.size === 0) {
      throw new Error('Downloaded audio file was empty (0 bytes).');
    }

    const localSong: Song = {
      id: `cloud_${cloudSong.id}`,
      title: cloudSong.title,
      artist: cloudSong.artist,
      album: cloudSong.album,
      duration: cloudSong.duration,
      genre: cloudSong.genre,
      artworkUrl: cloudSong.cover_url,
      format: (cloudSong.file_name.split('.').pop() || 'mp3').toLowerCase(),
      size: cloudSong.file_size || audioBlob.size,
      dateAdded: Date.now(),
      hasStoredBlob: true,
      cloudId: cloudSong.id,
      isCloud: true,
      audioUrl: cloudSong.audio_url,
      fileHash: cloudSong.file_hash,
    };

    if (onProgress) onProgress(100);
    return { song: localSong, blob: audioBlob };
  },

  // Backward compatibility alias for single project checks if needed
  getConfig(): { url: string; anonKey: string; isConfigured: boolean } {
    return this.getCategoryConfig('jtec_main');
  },
  saveConfig(url: string, anonKey: string) {
    this.saveCategoryConfig('jtec_main', { url, anonKey });
  },
  clearConfig() {
    this.clearCategoryConfig('jtec_main');
  },
  getClient(): SupabaseClient | null {
    return this.getClientForCategory('jtec_main');
  },
  async testConnection(url?: string, anonKey?: string) {
    return this.testCategoryConnection('jtec_main', { url, anonKey });
  },
  async fetchCloudSongs(): Promise<CloudSong[]> {
    return this.fetchSongsForCategory('jtec_main');
  },
  getCloudSettings(): CloudSettings {
    if (typeof localStorage === 'undefined') return DEFAULT_CLOUD_SETTINGS;
    try {
      const stored = localStorage.getItem('jtec_cloud_settings');
      if (stored) return { ...DEFAULT_CLOUD_SETTINGS, ...JSON.parse(stored) };
    } catch {
      // fallback
    }
    return DEFAULT_CLOUD_SETTINGS;
  },
  saveCloudSettings(settings: Partial<CloudSettings>): CloudSettings {
    const current = this.getCloudSettings();
    const updated = { ...current, ...settings };
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('jtec_cloud_settings', JSON.stringify(updated));
      } catch {
        // ignore
      }
    }
    return updated;
  },
  async deleteSongFromCloud(song: CloudSong): Promise<void> {
    const client = this.getClientForCategory('jtec_main');
    if (!client) throw new Error('Supabase is not configured.');
    if (song.file_path) {
      try {
        await client.storage.from(BUCKET_MUSIC).remove([song.file_path]);
      } catch {
        // ignore
      }
    }
    await client.from('songs').delete().eq('id', song.id);
  },
  async checkDuplicate(..._args: any[]): Promise<CloudSong | null> {
    return null;
  },
  async uploadMusicFile(file: File, metadata: Record<string, unknown>, onProgress?: (p: number) => void): Promise<CloudSong> {
    const client = this.getClientForCategory('jtec_main');
    if (!client) throw new Error('Supabase is not configured.');
    if (onProgress) onProgress(50);
    const path = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    await client.storage.from(BUCKET_MUSIC).upload(path, file, { contentType: file.type || 'audio/mpeg' });
    const { data } = client.storage.from(BUCKET_MUSIC).getPublicUrl(path);
    const publicUrl = data?.publicUrl || '';
    if (onProgress) onProgress(90);
    const payload = {
      title: (metadata.title as string) || file.name,
      artist: (metadata.artist as string) || 'Unknown Artist',
      album: (metadata.album as string) || 'Single',
      genre: (metadata.genre as string) || 'Music',
      duration: (metadata.duration as number) || 0,
      file_name: file.name,
      storage_path: path,
      file_size: file.size,
      audio_url: publicUrl,
      public_url: publicUrl,
    };
    const res = await client.from('songs').insert(payload).select().single();
    if (onProgress) onProgress(100);
    return {
      id: String(res.data?.id || Date.now()),
      title: payload.title,
      artist: payload.artist,
      album: payload.album,
      genre: payload.genre,
      duration: payload.duration,
      file_name: payload.file_name,
      file_path: payload.storage_path,
      file_size: payload.file_size,
      audio_url: payload.audio_url,
      created_at: new Date().toISOString(),
    };
  },
};

export interface CloudSettings {
  cloudSync: boolean;
  autoDownloadFavorites: boolean;
  wifiOnly: boolean;
  autoSyncPlaylists: boolean;
  storageWarnings: boolean;
  warningThreshold: 75 | 90;
  maxCloudQuotaBytes: number;
}

export const DEFAULT_CLOUD_SETTINGS: CloudSettings = {
  cloudSync: true,
  autoDownloadFavorites: false,
  wifiOnly: false,
  autoSyncPlaylists: true,
  storageWarnings: true,
  warningThreshold: 75,
  maxCloudQuotaBytes: 1073741824,
};

export async function computeFileHash(file: File | Blob): Promise<string> {
  return `${file.size}-${(file as File).name || 'audio'}`;
}

export const SUPABASE_STORAGE_FIX_SQL = `
insert into storage.buckets (id, name, public) values ('music', 'music', true) on conflict (id) do update set public = true;
drop policy if exists "Public Access music" on storage.objects;
create policy "Public Access music" on storage.objects for select to public using (bucket_id = 'music');
`;

export const SUPABASE_STORAGE_SIZE_FIX_SQL = `
update storage.buckets set file_size_limit = null where id = 'music';
`;

/**
 * Formats byte counts accurately into Bytes, KB, MB, and GB.
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const idx = Math.min(sizes.length - 1, Math.max(0, i));
  return `${parseFloat((bytes / Math.pow(k, idx)).toFixed(dm))} ${sizes[idx]}`;
}

/**
 * Returns accurate audio MIME type based on file extension and browser detection.
 */
export function getAudioMimeType(fileName: string, detectedType?: string): string {
  if (detectedType && detectedType.startsWith('audio/')) return detectedType;
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'mp3': return 'audio/mpeg';
    case 'wav': return 'audio/wav';
    case 'm4a': return 'audio/mp4';
    case 'mp4': return 'audio/mp4';
    case 'aac': return 'audio/aac';
    case 'ogg': return 'audio/ogg';
    case 'oga': return 'audio/ogg';
    case 'flac': return 'audio/flac';
    case 'webm': return 'audio/webm';
    default: return detectedType || 'audio/mpeg';
  }
}

/**
 * Supabase SQL setup script for user's Supabase projects.
 */
export const SUPABASE_SQL_SETUP = `-- ==============================================================================
-- JTEC MUSIC — SUPABASE DATABASE & STORAGE INITIALIZATION SCRIPT
-- ==============================================================================
-- Run this script in your Supabase SQL Editor (Dashboard -> SQL Editor -> New Query).
-- It creates the 'songs' table with all required fields, performance indexes,
-- public Storage buckets ('music'), and Row Level Security policies.
-- ==============================================================================

create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist text default 'Unknown Artist',
  album text default 'Single',
  genre text default 'Music',
  duration numeric default 0,
  file_name text not null,
  storage_path text not null default '',
  file_path text not null default '',
  file_size bigint not null default 0,
  file_type text default 'audio/mpeg',
  public_url text not null default '',
  audio_url text not null default '',
  artwork_url text,
  cover_url text,
  file_hash text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_songs_created_at on public.songs (created_at desc);
create index if not exists idx_songs_title on public.songs (title);
create index if not exists idx_songs_artist on public.songs (artist);

alter table public.songs enable row level security;

drop policy if exists "Allow public read on songs" on public.songs;
create policy "Allow public read on songs" on public.songs for select using (true);

insert into storage.buckets (id, name, public, file_size_limit)
values ('music', 'music', true, null)
on conflict (id) do update set public = true, file_size_limit = null;

drop policy if exists "Public Access music" on storage.objects;
create policy "Public Access music" on storage.objects for select to public using (bucket_id = 'music');
`;
