// ==============================================================================
// JTEC MUSIC — PRIVILEGED MULTI-PROJECT MUSIC MANAGER EDGE FUNCTION
// ==============================================================================
// Deploy to `jtec_main` ONLY (`supabase functions deploy music-admin`).
//
// Security guarantees:
// 1. Verifies caller JWT against `jtec_main` Auth on every request.
// 2. Rejects anonymous, unconfirmed, or banned users.
// 3. Strictly enforces AAL2 + TOTP (`aal === 'aal2'`, `'totp'` in `amr`,
//    verified TOTP factor in `auth.mfa_factors`).
// 4. Strictly enforces active `role = 'owner'` in `public.admin_users` matching
//    verified `auth.users.email` AND `verify_admin_access()` RPC.
// 5. Never accepts or accesses JTEC Party (`jtec_party`).
// 6. Uses server-only Deno secrets for `jtec_main`, `nasheed`, and `love_chill`
//    (never exposed to frontend code, Vite env vars, or APK).
// ==============================================================================

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

type TargetProject = 'jtec_main' | 'nasheed' | 'love_chill';

interface ProjectServerConfig {
  key: TargetProject;
  label: string;
  url: string;
  adminKey: string;
  musicBucket: string;
  artworkBucket: string;
  tableName: string;
  isConfigured: boolean;
}

interface VerifiedOwnerContext {
  userId: string;
  email: string;
  role: 'owner';
}

const ALLOWED_PROJECTS = new Set<TargetProject>(['jtec_main', 'nasheed', 'love_chill']);

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  const extra = (Deno.env.get('MUSIC_ADMIN_ALLOWED_ORIGINS') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (extra.includes(origin)) return true;

  return (
    origin === 'http://localhost' ||
    origin === 'https://localhost' ||
    origin === 'capacitor://localhost' ||
    /^http:\/\/localhost:\d+$/.test(origin) ||
    /^http:\/\/127\.0\.0\.1:\d+$/.test(origin) ||
    /^https:\/\/[a-z0-9-]+\.github\.io$/i.test(origin) ||
    /^https:\/\/[a-z0-9-]+\.aistudio\.google\.com$/i.test(origin) ||
    /^https:\/\/[a-z0-9-]+\.usercontent\.goog$/i.test(origin)
  );
}

function buildCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = isOriginAllowed(origin) ? origin! : 'https://localhost';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
  corsHeaders: Record<string, string>
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function getMainServerAuthConfig(): { url: string; anonKey: string; adminKey: string } {
  const url = (Deno.env.get('MUSIC_ADMIN_MAIN_URL') || Deno.env.get('SUPABASE_URL') || '').trim().replace(/\/+$/, '');
  const anonKey = (Deno.env.get('MUSIC_ADMIN_MAIN_ANON_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || '').trim();
  const adminKey = (Deno.env.get('MUSIC_ADMIN_MAIN_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
  return { url, anonKey, adminKey };
}

function getTargetProjectConfig(project: TargetProject): ProjectServerConfig {
  if (project === 'jtec_main') {
    const main = getMainServerAuthConfig();
    const musicBucket = (Deno.env.get('MUSIC_ADMIN_MAIN_BUCKET') || 'music').trim();
    const tableName = (Deno.env.get('MUSIC_ADMIN_MAIN_TABLE') || 'songs').trim();
    return {
      key: 'jtec_main',
      label: 'JTEC MUSIC',
      url: main.url,
      adminKey: main.adminKey,
      musicBucket,
      artworkBucket: 'artwork',
      tableName,
      isConfigured: Boolean(main.url && main.adminKey),
    };
  }

  if (project === 'nasheed') {
    const url = (
      Deno.env.get('MUSIC_ADMIN_NASHEED_URL') ||
      Deno.env.get('NASHEED_SUPABASE_URL') ||
      ''
    ).trim().replace(/\/+$/, '');
    const adminKey = (
      Deno.env.get('MUSIC_ADMIN_NASHEED_KEY') ||
      Deno.env.get('NASHEED_ADMIN_KEY') ||
      Deno.env.get('NASHEED_SERVICE_ROLE_KEY') ||
      ''
    ).trim();
    const musicBucket = (Deno.env.get('MUSIC_ADMIN_NASHEED_BUCKET') || 'music').trim();
    const tableName = (Deno.env.get('MUSIC_ADMIN_NASHEED_TABLE') || 'songs').trim();
    return {
      key: 'nasheed',
      label: 'NASHEED',
      url,
      adminKey,
      musicBucket,
      artworkBucket: 'artwork',
      tableName,
      isConfigured: Boolean(url && adminKey),
    };
  }

  const url = (
    Deno.env.get('MUSIC_ADMIN_LOVE_CHILL_URL') ||
    Deno.env.get('LOVE_CHILL_SUPABASE_URL') ||
    ''
  ).trim().replace(/\/+$/, '');
  const adminKey = (
    Deno.env.get('MUSIC_ADMIN_LOVE_CHILL_KEY') ||
    Deno.env.get('LOVE_CHILL_ADMIN_KEY') ||
    Deno.env.get('LOVE_CHILL_SERVICE_ROLE_KEY') ||
    ''
  ).trim();
  const musicBucket = (Deno.env.get('MUSIC_ADMIN_LOVE_CHILL_BUCKET') || 'music').trim();
  const tableName = (Deno.env.get('MUSIC_ADMIN_LOVE_CHILL_TABLE') || 'songs').trim();
  return {
    key: 'love_chill',
    label: 'LOVE & CHILL',
    url,
    adminKey,
    musicBucket,
    artworkBucket: 'artwork',
    tableName,
    isConfigured: Boolean(url && adminKey),
  };
}

function decodeJwtPayload(jwt: string): Record<string, any> | null {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const jsonStr = atob(b64 + pad);
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

function hasTotpAmr(amr: unknown): boolean {
  if (!Array.isArray(amr)) return false;
  return amr.some((item) => {
    if (typeof item === 'string') return item === 'totp';
    if (item && typeof item === 'object') return (item as Record<string, unknown>).method === 'totp';
    return false;
  });
}

function hasAnonymousAmr(amr: unknown): boolean {
  if (!Array.isArray(amr)) return false;
  return amr.some((item) => {
    if (typeof item === 'string') return item === 'anonymous';
    if (item && typeof item === 'object') return (item as Record<string, unknown>).method === 'anonymous';
    return false;
  });
}

async function verifyMainOwnerAal2(authHeader: string | null): Promise<{
  ok: true;
  owner: VerifiedOwnerContext;
  mainAdminClient: SupabaseClient;
  mainUserClient: SupabaseClient;
} | {
  ok: false;
  status: number;
  code: string;
  error: string;
}> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { ok: false, status: 401, code: 'UNAUTHORIZED', error: 'Missing Authorization Bearer token.' };
  }

  const jwt = authHeader.slice('Bearer '.length).trim();
  if (!jwt) {
    return { ok: false, status: 401, code: 'UNAUTHORIZED', error: 'Empty Authorization Bearer token.' };
  }

  const mainCfg = getMainServerAuthConfig();
  if (!mainCfg.url || !mainCfg.adminKey) {
    return {
      ok: false,
      status: 503,
      code: 'SERVER_MISCONFIGURED',
      error: 'Edge Function missing JTEC Main server credentials.',
    };
  }

  const mainAdminClient = createClient(mainCfg.url, mainCfg.adminKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Cryptographically verify JWT via JTEC Main Auth API
  const { data: userData, error: userErr } = await mainAdminClient.auth.getUser(jwt);
  const user = userData?.user;
  if (userErr || !user) {
    return { ok: false, status: 401, code: 'UNAUTHORIZED', error: 'Invalid or expired JTEC Main session.' };
  }

  if ((user as any).is_anonymous === true || user.app_metadata?.provider === 'anonymous') {
    return { ok: false, status: 403, code: 'FORBIDDEN', error: 'Anonymous sessions are rejected.' };
  }

  if (!user.email || !user.email_confirmed_at) {
    return { ok: false, status: 403, code: 'FORBIDDEN', error: 'Owner email must be verified.' };
  }

  const bannedUntil = (user as any).banned_until ? new Date((user as any).banned_until).getTime() : 0;
  if (bannedUntil > Date.now()) {
    return { ok: false, status: 403, code: 'FORBIDDEN', error: 'Account is suspended.' };
  }

  const claims = decodeJwtPayload(jwt);
  if (!claims || claims.sub !== user.id) {
    return { ok: false, status: 401, code: 'UNAUTHORIZED', error: 'JWT subject mismatch.' };
  }
  if (claims.is_anonymous === true || hasAnonymousAmr(claims.amr)) {
    return { ok: false, status: 403, code: 'FORBIDDEN', error: 'Anonymous authentication method rejected.' };
  }
  if (claims.aal !== 'aal2' || !hasTotpAmr(claims.amr)) {
    return {
      ok: false,
      status: 403,
      code: 'MFA_AAL2_REQUIRED',
      error: 'Verified TOTP AAL2 session is required on JTEC Main.',
    };
  }

  // Verify authoritative owner row in public.admin_users
  const { data: adminRow, error: adminRowErr } = await mainAdminClient
    .from('admin_users')
    .select('user_id, email, role, is_active')
    .eq('user_id', user.id)
    .maybeSingle();

  if (
    adminRowErr ||
    !adminRow ||
    adminRow.is_active !== true ||
    adminRow.role !== 'owner' ||
    String(adminRow.email || '').toLowerCase() !== user.email.toLowerCase()
  ) {
    return {
      ok: false,
      status: 403,
      code: 'OWNER_REQUIRED',
      error: 'Account is not an active authorized JTEC owner.',
    };
  }

  // Verify user-scoped verify_admin_access() RPC when anon key is available
  const userScopedKey = mainCfg.anonKey || mainCfg.adminKey;
  const mainUserClient = createClient(mainCfg.url, userScopedKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: verifyRpc, error: verifyRpcErr } = await mainUserClient.rpc('verify_admin_access');
  if (
    verifyRpcErr ||
    !verifyRpc ||
    verifyRpc.is_admin !== true ||
    verifyRpc.is_active === false ||
    verifyRpc.role !== 'owner' ||
    verifyRpc.has_verified_mfa !== true ||
    verifyRpc.current_aal !== 'aal2'
  ) {
    return {
      ok: false,
      status: 403,
      code: 'AAL2_VERIFICATION_FAILED',
      error: verifyRpc?.reason || 'Server owner AAL2 verification failed.',
    };
  }

  // Verify at least one verified TOTP factor on the Auth user record
  const { data: factorUser } = await mainAdminClient.auth.admin.getUserById(user.id);
  const factors = Array.isArray((factorUser?.user as any)?.factors) ? (factorUser?.user as any).factors : [];
  const hasVerifiedTotp = factors.some(
    (f: any) => f?.factor_type === 'totp' && f?.status === 'verified'
  );
  if (factors.length > 0 && !hasVerifiedTotp) {
    return {
      ok: false,
      status: 403,
      code: 'MFA_FACTOR_REQUIRED',
      error: 'Verified TOTP factor is required.',
    };
  }

  return {
    ok: true,
    owner: {
      userId: user.id,
      email: user.email,
      role: 'owner',
    },
    mainAdminClient,
    mainUserClient,
  };
}

function makeTargetClient(cfg: ProjectServerConfig): SupabaseClient {
  return createClient(cfg.url, cfg.adminKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function validateSafeObjectPath(rawPath: string, bucket: 'music' | 'artwork'): string {
  const clean = String(rawPath || '').trim().replace(/^\/+/, '');
  if (!clean || clean.includes('..') || clean.includes('\\')) {
    throw new Error('Invalid storage path.');
  }
  if (bucket === 'artwork' && !clean.startsWith('covers/')) {
    throw new Error('Artwork path must reside inside covers/.');
  }
  if (bucket === 'music' && !clean.startsWith('tracks/')) {
    throw new Error('Audio uploads must reside inside tracks/.');
  }
  return clean;
}

function extractMissingColumn(error: { message?: string; details?: string } | null | undefined): string | null {
  if (!error) return null;
  const text = `${error.message || ''} ${error.details || ''}`;
  const m1 = text.match(/Could not find the '([a-zA-Z0-9_]+)' column/i);
  if (m1?.[1]) return m1[1];
  const m2 = text.match(/column\s+"?([a-zA-Z0-9_]+)"?(?:\s+of\s+relation\s+"?[a-zA-Z0-9_]+"?)?\s+does not exist/i);
  if (m2?.[1]) return m2[1];
  return null;
}

async function executeAdaptiveDbOp<T extends { error: any }>(
  payload: Record<string, unknown>,
  op: (candidate: Record<string, unknown>) => Promise<T>
): Promise<T> {
  const working: Record<string, unknown> = { ...payload };
  for (let i = 0; i < 8; i++) {
    const res = await op(working);
    if (!res.error) return res;
    const missing = extractMissingColumn(res.error);
    if (missing && Object.prototype.hasOwnProperty.call(working, missing)) {
      delete working[missing];
      continue;
    }
    return res;
  }
  return op(working);
}

async function measureBucketRecursive(
  client: SupabaseClient,
  bucketName: string
): Promise<{ count: number; bytes: number; error?: string }> {
  let fileCount = 0;
  let totalBytes = 0;
  const limit = 1000;
  const foldersToExplore: string[] = [''];
  const visited = new Set<string>();

  try {
    while (foldersToExplore.length > 0) {
      const currentFolder = foldersToExplore.pop()!;
      if (visited.has(currentFolder)) continue;
      visited.add(currentFolder);

      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await client.storage.from(bucketName).list(currentFolder, {
          limit,
          offset,
          sortBy: { column: 'name', order: 'asc' },
        });

        if (error) {
          return { count: fileCount, bytes: totalBytes, error: error.message };
        }
        if (!data || data.length === 0) {
          hasMore = false;
          break;
        }

        for (const item of data) {
          const size = item.metadata?.size ?? (item as any).size ?? 0;
          if (!item.id && !item.metadata) {
            const sub = currentFolder ? `${currentFolder}/${item.name}` : item.name;
            if (!visited.has(sub)) foldersToExplore.push(sub);
          } else {
            fileCount += 1;
            totalBytes += Number(size) || 0;
          }
        }

        if (data.length < limit) {
          hasMore = false;
        } else {
          offset += limit;
        }
      }
    }
    return { count: fileCount, bytes: totalBytes };
  } catch (err: any) {
    return { count: fileCount, bytes: totalBytes, error: err?.message || 'Storage measurement error' };
  }
}

async function listAllSongs(client: SupabaseClient, tableName: string) {
  const pageSize = 1000;
  const allRows: any[] = [];
  let offset = 0;
  let useCreatedAtOrder = true;

  while (true) {
    const query = client.from(tableName).select('*');
    const ordered = useCreatedAtOrder ? query.order('created_at', { ascending: false }) : query;
    const { data, error } = await ordered.range(offset, offset + pageSize - 1);

    if (error) {
      const code = String(error.code || '').toUpperCase();
      const msg = String(error.message || '').toLowerCase();
      if (useCreatedAtOrder && offset === 0 && (code === '42703' || msg.includes('created_at'))) {
        useCreatedAtOrder = false;
        continue;
      }
      throw new Error(error.message);
    }

    const batch = data || [];
    allRows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  return allRows;
}

function extractArtworkPath(url: string | null | undefined, artworkBucket: string): string | null {
  const raw = String(url || '').trim();
  if (!raw || raw.startsWith('data:')) return null;
  try {
    const u = new URL(raw);
    const marker = `/storage/v1/object/public/${artworkBucket}/`;
    const idx = u.pathname.indexOf(marker);
    if (idx >= 0) {
      const rel = decodeURIComponent(u.pathname.slice(idx + marker.length)).replace(/^\/+/, '');
      return rel && !rel.includes('..') ? rel : null;
    }
  } catch {
    return null;
  }
  return null;
}

async function writeAuditLogBestEffort(
  mainUserClient: SupabaseClient,
  action: string,
  details: Record<string, unknown>
): Promise<void> {
  try {
    await mainUserClient.rpc('log_admin_action', {
      p_action: action,
      p_details: details,
    });
  } catch {
    // Non-blocking audit log on main project
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin');
  const corsHeaders = buildCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' }, corsHeaders);
  }

  const auth = await verifyMainOwnerAal2(req.headers.get('Authorization'));
  if (!auth.ok) {
    return jsonResponse(auth.status, { error: auth.error, code: auth.code }, corsHeaders);
  }

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON request body.' }, corsHeaders);
  }

  const action = String(body?.action || '').trim();
  if (!action) {
    return jsonResponse(400, { error: 'Missing action.' }, corsHeaders);
  }

  // 1. Server status across the 3 music projects (never touches JTEC Party)
  if (action === 'status') {
    const projects: Record<TargetProject, Record<string, unknown>> = {
      jtec_main: (() => {
        const c = getTargetProjectConfig('jtec_main');
        return { configured: c.isConfigured, label: c.label, musicBucket: c.musicBucket, artworkBucket: c.artworkBucket, tableName: c.tableName };
      })(),
      nasheed: (() => {
        const c = getTargetProjectConfig('nasheed');
        return { configured: c.isConfigured, label: c.label, musicBucket: c.musicBucket, artworkBucket: c.artworkBucket, tableName: c.tableName };
      })(),
      love_chill: (() => {
        const c = getTargetProjectConfig('love_chill');
        return { configured: c.isConfigured, label: c.label, musicBucket: c.musicBucket, artworkBucket: c.artworkBucket, tableName: c.tableName };
      })(),
    };
    return jsonResponse(200, { ok: true, ownerEmail: auth.owner.email, projects }, corsHeaders);
  }

  // 2. Privileged recursive Storage Monitor stats across the 3 music projects
  if (action === 'storage-stats') {
    const results: Record<string, unknown> = {};
    for (const key of ['jtec_main', 'nasheed', 'love_chill'] as TargetProject[]) {
      const cfg = getTargetProjectConfig(key);
      if (!cfg.isConfigured) {
        results[key] = {
          categoryKey: key,
          projectName: cfg.label,
          isConfigured: false,
          musicFilesCount: 0,
          musicBytes: 0,
          artworkFilesCount: 0,
          artworkBytes: 0,
          totalBytes: 0,
          recentUploads: [],
          error: `Server credentials missing for ${cfg.label}.`,
        };
        continue;
      }

      try {
        const targetClient = makeTargetClient(cfg);
        const musicRes = await measureBucketRecursive(targetClient, cfg.musicBucket);
        if (musicRes.error) {
          throw new Error(`Music bucket error: ${musicRes.error}`);
        }
        const artworkRes = await measureBucketRecursive(targetClient, cfg.artworkBucket);
        if (artworkRes.error) {
          throw new Error(`Artwork bucket error: ${artworkRes.error}`);
        }

        let recentUploads: Array<{ title: string; artist: string; date: string; size: number }> = [];
        const { data: recentRows, error: recentErr } = await targetClient
          .from(cfg.tableName)
          .select('title, artist, created_at, file_size')
          .order('created_at', { ascending: false })
          .limit(5);

        if (recentErr) {
          throw new Error(`Database query failed: ${recentErr.message}`);
        }

        recentUploads = (recentRows || []).map((r: any) => ({
          title: r.title || 'Untitled',
          artist: r.artist || 'Unknown Artist',
          date: r.created_at ? new Date(r.created_at).toLocaleDateString() : 'Recent',
          size: Number(r.file_size) || 0,
        }));

        results[key] = {
          categoryKey: key,
          projectName: cfg.label,
          isConfigured: true,
          musicFilesCount: musicRes.count,
          musicBytes: musicRes.bytes,
          artworkFilesCount: artworkRes.count,
          artworkBytes: artworkRes.bytes,
          totalBytes: musicRes.bytes + artworkRes.bytes,
          recentUploads,
        };
      } catch (err: any) {
        results[key] = {
          categoryKey: key,
          projectName: cfg.label,
          isConfigured: true,
          musicFilesCount: 0,
          musicBytes: 0,
          artworkFilesCount: 0,
          artworkBytes: 0,
          totalBytes: 0,
          recentUploads: [],
          error: err?.message || 'Failed to measure storage',
        };
      }
    }

    return jsonResponse(200, { ok: true, stats: results }, corsHeaders);
  }

  // All remaining actions require explicit valid targetProject (never JTEC Party)
  const targetProject = body?.targetProject as TargetProject;
  if (!ALLOWED_PROJECTS.has(targetProject)) {
    return jsonResponse(
      403,
      { error: 'Invalid or protected target project. Only jtec_main, nasheed, and love_chill are permitted.', code: 'INVALID_PROJECT' },
      corsHeaders
    );
  }

  const cfg = getTargetProjectConfig(targetProject);
  if (!cfg.isConfigured) {
    return jsonResponse(
      503,
      {
        error: `Server credentials for ${cfg.label} (${targetProject}) are not configured in Edge Function secrets.`,
        code: 'PROJECT_NOT_CONFIGURED',
      },
      corsHeaders
    );
  }

  const targetClient = makeTargetClient(cfg);

  try {
    if (action === 'list-songs') {
      const rows = await listAllSongs(targetClient, cfg.tableName);
      const storageAudit = await measureBucketRecursive(targetClient, cfg.musicBucket);
      return jsonResponse(
        200,
        {
          ok: true,
          rows,
          storageAudioCount: storageAudit.error ? null : storageAudit.count,
          storageAuditError: storageAudit.error || null,
        },
        corsHeaders
      );
    }

    if (action === 'create-upload-url') {
      const bucketKind = body?.bucket === 'artwork' ? 'artwork' : 'music';
      const bucketName = bucketKind === 'artwork' ? cfg.artworkBucket : cfg.musicBucket;
      const safePath = validateSafeObjectPath(String(body?.path || ''), bucketKind);

      const { data, error } = await targetClient.storage.from(bucketName).createSignedUploadUrl(safePath);
      if (error || !data?.signedUrl || !data?.token) {
        return jsonResponse(400, { error: error?.message || 'Could not create signed upload URL.' }, corsHeaders);
      }

      const { data: pubData } = targetClient.storage.from(bucketName).getPublicUrl(safePath);
      return jsonResponse(
        200,
        {
          ok: true,
          signedUrl: data.signedUrl,
          token: data.token,
          path: safePath,
          bucket: bucketName,
          publicUrl: pubData?.publicUrl || '',
        },
        corsHeaders
      );
    }

    if (action === 'insert-song') {
      const song = body?.song;
      if (!song || typeof song.title !== 'string' || !song.title.trim()) {
        return jsonResponse(400, { error: 'Song title is required.' }, corsHeaders);
      }

      const filePath = String(song.storage_path || song.file_path || '').trim();
      const audioUrl = String(song.public_url || song.audio_url || '').trim();
      const coverUrl = String(song.artwork_url || song.cover_url || '').trim();

      const insertPayload = {
        title: song.title.trim().slice(0, 250),
        artist: String(song.artist || 'Unknown Artist').trim().slice(0, 250) || 'Unknown Artist',
        album: String(song.album || 'Single').trim().slice(0, 250) || 'Single',
        genre: String(song.genre || 'Music').trim().slice(0, 120) || 'Music',
        duration: Number(song.duration) || 0,
        file_name: String(song.file_name || 'track.mp3').trim().slice(0, 250) || 'track.mp3',
        file_path: filePath,
        storage_path: filePath,
        file_size: Number(song.file_size) || 0,
        file_type: String(song.file_type || 'audio/mpeg').trim().slice(0, 120) || 'audio/mpeg',
        audio_url: audioUrl,
        public_url: audioUrl,
        cover_url: coverUrl,
        artwork_url: coverUrl,
        file_hash: String(song.file_hash || `sha256_${Date.now()}`),
      };

      const { data: inserted, error: insertErr } = await executeAdaptiveDbOp(insertPayload, (candidate) =>
        targetClient.from(cfg.tableName).insert(candidate).select('*').maybeSingle()
      );

      if (insertErr) {
        // Safe cleanup of newly uploaded objects if database insert failed
        if (filePath) {
          await targetClient.storage.from(cfg.musicBucket).remove([filePath]).catch(() => {});
        }
        const uploadedCoverPath = body?.uploadedCoverPath ? String(body.uploadedCoverPath) : null;
        if (uploadedCoverPath) {
          await targetClient.storage.from(cfg.artworkBucket).remove([uploadedCoverPath]).catch(() => {});
        }
        return jsonResponse(400, { error: `Database insert failed: ${insertErr.message}` }, corsHeaders);
      }

      await writeAuditLogBestEffort(auth.mainUserClient, 'song_uploaded', {
        project: targetProject,
        song_id: inserted?.id || null,
        title: insertPayload.title,
        file_path: filePath,
      });

      return jsonResponse(200, { ok: true, row: inserted }, corsHeaders);
    }

    if (action === 'update-song') {
      const songId = String(body?.songId || '').trim();
      const meta = body?.metadata || {};
      if (!songId || typeof meta.title !== 'string' || !meta.title.trim()) {
        return jsonResponse(400, { error: 'Song ID and title are required.' }, corsHeaders);
      }

      const updatePayload = {
        title: meta.title.trim().slice(0, 250),
        artist: String(meta.artist || 'Unknown Artist').trim().slice(0, 250) || 'Unknown Artist',
        album: String(meta.album || 'Single').trim().slice(0, 250) || 'Single',
        genre: String(meta.genre || 'Music').trim().slice(0, 120) || 'Music',
        updated_at: new Date().toISOString(),
      };

      const { data: updated, error: updateErr } = await executeAdaptiveDbOp(updatePayload, (candidate) =>
        targetClient.from(cfg.tableName).update(candidate).eq('id', songId).select('*').maybeSingle()
      );

      if (updateErr) {
        return jsonResponse(400, { error: updateErr.message }, corsHeaders);
      }

      await writeAuditLogBestEffort(auth.mainUserClient, 'song_edited', {
        project: targetProject,
        song_id: songId,
        title: updatePayload.title,
      });

      return jsonResponse(200, { ok: true, row: updated }, corsHeaders);
    }

    if (action === 'replace-song-audio') {
      const songId = String(body?.songId || '').trim();
      const newPath = validateSafeObjectPath(String(body?.newPath || ''), 'music');
      const newPublicUrl = String(body?.publicUrl || '').trim();
      const oldPath = body?.oldPath ? String(body.oldPath).trim() : '';

      if (!songId || !newPublicUrl) {
        return jsonResponse(400, { error: 'Song ID and new audio URL are required.' }, corsHeaders);
      }

      const updatePayload = {
        file_path: newPath,
        storage_path: newPath,
        audio_url: newPublicUrl,
        public_url: newPublicUrl,
        file_name: String(body?.fileName || 'track.mp3').trim().slice(0, 250),
        file_size: Number(body?.fileSize) || 0,
        file_type: String(body?.fileType || 'audio/mpeg').trim().slice(0, 120),
        duration: Number(body?.duration) || 0,
        updated_at: new Date().toISOString(),
      };

      const { data: updated, error: updateErr } = await executeAdaptiveDbOp(updatePayload, (candidate) =>
        targetClient.from(cfg.tableName).update(candidate).eq('id', songId).select('*').maybeSingle()
      );

      if (updateErr) {
        await targetClient.storage.from(cfg.musicBucket).remove([newPath]).catch(() => {});
        return jsonResponse(400, { error: updateErr.message }, corsHeaders);
      }

      if (oldPath && oldPath !== newPath) {
        await targetClient.storage.from(cfg.musicBucket).remove([oldPath]).catch(() => {});
      }

      await writeAuditLogBestEffort(auth.mainUserClient, 'song_replaced', {
        project: targetProject,
        song_id: songId,
        audio_changed: true,
        file_path: newPath,
      });

      return jsonResponse(200, { ok: true, row: updated }, corsHeaders);
    }

    if (action === 'replace-song-cover') {
      const songId = String(body?.songId || '').trim();
      const newCoverUrl = String(body?.newCoverUrl || '').trim();
      const oldCoverUrl = body?.oldCoverUrl ? String(body.oldCoverUrl).trim() : '';

      if (!songId || !newCoverUrl) {
        return jsonResponse(400, { error: 'Song ID and new cover URL are required.' }, corsHeaders);
      }

      const updatePayload = {
        cover_url: newCoverUrl,
        artwork_url: newCoverUrl,
        updated_at: new Date().toISOString(),
      };

      const { data: updated, error: updateErr } = await executeAdaptiveDbOp(updatePayload, (candidate) =>
        targetClient.from(cfg.tableName).update(candidate).eq('id', songId).select('*').maybeSingle()
      );

      if (updateErr) {
        const uploadedCoverPath = extractArtworkPath(newCoverUrl, cfg.artworkBucket);
        if (uploadedCoverPath) {
          await targetClient.storage.from(cfg.artworkBucket).remove([uploadedCoverPath]).catch(() => {});
        }
        return jsonResponse(400, { error: updateErr.message }, corsHeaders);
      }

      const oldArtworkPath = extractArtworkPath(oldCoverUrl, cfg.artworkBucket);
      const newArtworkPath = extractArtworkPath(newCoverUrl, cfg.artworkBucket);
      if (oldArtworkPath && oldArtworkPath !== newArtworkPath) {
        await targetClient.storage.from(cfg.artworkBucket).remove([oldArtworkPath]).catch(() => {});
      }

      await writeAuditLogBestEffort(auth.mainUserClient, 'song_replaced', {
        project: targetProject,
        song_id: songId,
        cover_changed: true,
      });

      return jsonResponse(200, { ok: true, row: updated }, corsHeaders);
    }

    if (action === 'delete-song') {
      const songId = String(body?.songId || '').trim();
      if (!songId) {
        return jsonResponse(400, { error: 'Song ID is required.' }, corsHeaders);
      }

      const { data: existingRow } = await targetClient
        .from(cfg.tableName)
        .select('*')
        .eq('id', songId)
        .maybeSingle();

      const { error: deleteErr } = await targetClient
        .from(cfg.tableName)
        .delete()
        .eq('id', songId);

      if (deleteErr) {
        return jsonResponse(400, { error: deleteErr.message }, corsHeaders);
      }

      const audioPath =
        (typeof existingRow?.storage_path === 'string' && existingRow.storage_path.trim()) ||
        (typeof existingRow?.file_path === 'string' && existingRow.file_path.trim()) ||
        (typeof body?.filePath === 'string' ? body.filePath.trim() : '');

      if (audioPath) {
        await targetClient.storage.from(cfg.musicBucket).remove([audioPath]).catch(() => {});
      }

      const coverUrl =
        (typeof existingRow?.artwork_url === 'string' && existingRow.artwork_url.trim()) ||
        (typeof existingRow?.cover_url === 'string' && existingRow.cover_url.trim()) ||
        (typeof body?.coverUrl === 'string' ? body.coverUrl.trim() : '');
      const coverPath = extractArtworkPath(coverUrl, cfg.artworkBucket);
      if (coverPath) {
        await targetClient.storage.from(cfg.artworkBucket).remove([coverPath]).catch(() => {});
      }

      await writeAuditLogBestEffort(auth.mainUserClient, 'song_deleted', {
        project: targetProject,
        song_id: songId,
        file_path: audioPath || null,
      });

      return jsonResponse(200, { ok: true }, corsHeaders);
    }

    return jsonResponse(400, { error: `Unknown action "${action}".` }, corsHeaders);
  } catch (err: any) {
    return jsonResponse(500, { error: err?.message || 'Internal server error.' }, corsHeaders);
  }
});
