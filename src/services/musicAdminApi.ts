import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  SupabaseService,
  CloudCategoryKey,
  CLOUD_CATEGORIES,
  BUCKET_MUSIC,
  BUCKET_ARTWORK,
  getMaskedHost,
  sanitizeSecretText,
} from './supabase';
import {
  verifyAdminAuthorization,
  touchAdminActivity,
  recordAdminAuditEvent,
} from './adminAuth';
import {
  isAllowedMusicProject,
  ManagedMusicCategory,
  buildSafeStoragePath,
  buildSongInsertPayload,
  buildAudioUpdatePayload,
  buildCoverUpdatePayload,
  executeAdaptiveMutation,
  extractStoragePathFromPublicUrl,
  isMissingCreatedAtError,
  normalizeCloudSongRow,
} from './musicAdminCore';
import { CloudSong } from '../types/music';

export type MusicAdminErrorCode =
  | 'unauthorized'
  | 'edge_unavailable'
  | 'project_unconfigured'
  | 'request_failed';

export class MusicAdminError extends Error {
  readonly code: MusicAdminErrorCode;
  readonly status?: number;

  constructor(code: MusicAdminErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'MusicAdminError';
    this.code = code;
    this.status = status;
  }
}

export interface ProjectStorageStatsResult {
  categoryKey: CloudCategoryKey;
  projectName: string;
  isConfigured: boolean;
  musicFilesCount: number;
  musicBytes: number;
  artworkFilesCount: number;
  artworkBytes: number;
  totalBytes: number;
  recentUploads: { title: string; artist: string; date: string; size: number }[];
  error?: string;
}

export interface ServerProjectStatus {
  configured: boolean;
  label: string;
  musicBucket: string;
  artworkBucket: string;
  tableName: string;
}

export interface AdminCatalogListResult {
  songs: CloudSong[];
  storageAudioCount: number | null;
  storageAuditError: string | null;
  source: 'server' | 'direct_admin' | 'direct_public';
}

export interface MusicAdminApiOptions {
  fetchImpl?: typeof fetch;
}

function makeUnauthenticatedClient(category: ManagedMusicCategory): SupabaseClient {
  const cfg = SupabaseService.getCategoryConfig(category);
  if (!cfg.isConfigured || !cfg.url || !cfg.anonKey) {
    throw new MusicAdminError('project_unconfigured', `${category} project URL or anon key is not configured.`);
  }
  return (
    SupabaseService.getClientForCategory(category) ||
    createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  );
}

/**
 * Ensures we have a valid, active, AAL2-verified JTEC Main owner session.
 * Reuses the persisted and refreshable session; never demands a fresh TOTP code per operation.
 */
async function requireOwnerAal2AccessToken(adminClient: SupabaseClient | null): Promise<{
  accessToken: string;
  client: SupabaseClient;
}> {
  if (!adminClient) {
    throw new MusicAdminError('unauthorized', 'Developer admin client is not configured.');
  }

  const authRes = await verifyAdminAuthorization(adminClient, { checkInactivity: true });
  if (authRes.stage !== 'authorized' || !authRes.session?.access_token) {
    if (authRes.enforcementMode === 'unavailable') {
      throw new MusicAdminError(
        'request_failed',
        authRes.reason || 'Authentication server is temporarily unreachable. Your session was kept intact.'
      );
    }
    throw new MusicAdminError(
      'unauthorized',
      authRes.reason || 'Admin session expired or missing TOTP verification (AAL2).'
    );
  }

  touchAdminActivity();
  return { accessToken: authRes.session.access_token, client: adminClient };
}

async function invokeMusicAdminEdge<T = any>(
  adminClient: SupabaseClient | null,
  body: Record<string, unknown>,
  options: MusicAdminApiOptions = {}
): Promise<T> {
  const { accessToken } = await requireOwnerAal2AccessToken(adminClient);
  const mainCfg = SupabaseService.getCategoryConfig('jtec_main');
  if (!mainCfg.isConfigured || !mainCfg.url || !mainCfg.anonKey) {
    throw new MusicAdminError(
      'edge_unavailable',
      'JTEC Main Supabase URL/Key is not configured.'
    );
  }

  const endpoint = `${mainCfg.url}/functions/v1/music-admin`;
  const fetchFn = options.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await fetchFn(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': mainCfg.anonKey,
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err: any) {
    throw new MusicAdminError(
      'edge_unavailable',
      sanitizeSecretText(err?.message || 'Could not reach server authorization endpoint.', [mainCfg.anonKey])
    );
  }

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.status === 404) {
    throw new MusicAdminError(
      'edge_unavailable',
      'Server authorization function (music-admin) is not deployed on jtec_main yet.',
      404
    );
  }

  if (response.status === 401 || response.status === 403) {
    const errCode = String(payload?.code || '').toUpperCase();
    if (errCode === 'INVALID_PROJECT') {
      throw new MusicAdminError('request_failed', payload?.error || 'Target project is protected.', response.status);
    }
    if (
      errCode === 'UNAUTHORIZED' ||
      errCode === 'MFA_AAL2_REQUIRED' ||
      errCode === 'OWNER_REQUIRED' ||
      errCode === 'AAL2_VERIFICATION_FAILED' ||
      errCode === 'MFA_FACTOR_REQUIRED' ||
      errCode === 'FORBIDDEN'
    ) {
      throw new MusicAdminError(
        'unauthorized',
        payload?.error || 'Server rejected owner AAL2 authorization.',
        response.status
      );
    }
  }

  if (response.status === 503 && String(payload?.code || '').toUpperCase() === 'PROJECT_NOT_CONFIGURED') {
    throw new MusicAdminError(
      'project_unconfigured',
      payload?.error || 'Target project credentials are not configured on the server.',
      503
    );
  }

  if (!response.ok || !payload?.ok) {
    throw new MusicAdminError(
      'request_failed',
      sanitizeSecretText(payload?.error || `Server request failed (HTTP ${response.status}).`, [mainCfg.anonKey]),
      response.status
    );
  }

  return payload as T;
}

/**
 * Recursively measures storage objects and bytes in a Supabase storage bucket
 * with full pagination (1000 items/page) and explicit error reporting.
 */
export async function measureBucketStorageRecursive(
  client: SupabaseClient,
  bucketName: string,
  folderPath = ''
): Promise<{ count: number; bytes: number; error?: string }> {
  let fileCount = 0;
  let totalBytes = 0;
  const limit = 1000;
  const foldersToExplore: string[] = [folderPath];
  const visitedFolders = new Set<string>();

  try {
    while (foldersToExplore.length > 0) {
      const currentFolder = foldersToExplore.pop()!;
      if (visitedFolders.has(currentFolder)) continue;
      visitedFolders.add(currentFolder);

      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await client.storage
          .from(bucketName)
          .list(currentFolder, {
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
          const size = item.metadata?.size || (item as any).size || 0;
          if (!item.id && !item.metadata) {
            const subFolder = currentFolder ? `${currentFolder}/${item.name}` : item.name;
            if (!visitedFolders.has(subFolder)) {
              foldersToExplore.push(subFolder);
            }
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
    return { count: fileCount, bytes: totalBytes, error: err?.message || 'Unknown storage measurement error' };
  }
}

function dataUrlToBlob(dataUrl: string): Blob {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) {
    throw new Error('Invalid image data URL.');
  }
  const meta = dataUrl.slice(0, commaIdx);
  const b64 = dataUrl.slice(commaIdx + 1);
  const mimeMatch = meta.match(/data:([^;]+);base64/i);
  const mimeType = mimeMatch?.[1] || 'image/jpeg';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

async function listAllSongsWithClient(
  client: SupabaseClient,
  tableName: string,
  bucketName: string
): Promise<CloudSong[]> {
  const pageSize = 1000;
  const allRows: any[] = [];
  let offset = 0;
  let orderByCreatedAt = true;

  while (true) {
    const baseQuery = client.from(tableName).select('*');
    const orderedQuery = orderByCreatedAt
      ? baseQuery.order('created_at', { ascending: false })
      : baseQuery;
    const { data, error } = await orderedQuery.range(offset, offset + pageSize - 1);

    if (error) {
      if (orderByCreatedAt && offset === 0 && isMissingCreatedAtError(error)) {
        orderByCreatedAt = false;
        continue;
      }
      throw new Error(error.message);
    }

    const batch = data || [];
    allRows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  if (!orderByCreatedAt) {
    allRows.sort((a, b) => {
      const ta = Date.parse(a?.created_at || a?.updated_at || '') || 0;
      const tb = Date.parse(b?.created_at || b?.updated_at || '') || 0;
      return tb - ta;
    });
  }

  return allRows.map((row) =>
    normalizeCloudSongRow(row, (filePath) => {
      const { data: pub } = client.storage.from(bucketName).getPublicUrl(filePath);
      return pub?.publicUrl || '';
    })
  );
}

/**
 * Checks whether the server-side `music-admin` Edge Function is deployed and which
 * music projects have server credentials configured. Never triggers logout on 404/503.
 */
export async function checkMusicAdminServerStatus(
  adminClient: SupabaseClient | null,
  options: MusicAdminApiOptions = {}
): Promise<{
  available: boolean;
  projects: Partial<Record<ManagedMusicCategory, ServerProjectStatus>>;
  message?: string;
}> {
  try {
    const res = await invokeMusicAdminEdge<{
      ok: true;
      projects: Record<ManagedMusicCategory, ServerProjectStatus>;
    }>(adminClient, { action: 'status' }, options);
    return { available: true, projects: res.projects };
  } catch (err) {
    if (err instanceof MusicAdminError && err.code === 'unauthorized') {
      throw err;
    }
    return {
      available: false,
      projects: {},
      message: err instanceof Error ? err.message : 'Server endpoint unavailable.',
    };
  }
}

/**
 * Lists all songs in a music category for the Music Manager.
 * Uses privileged `music-admin` server endpoint first, falling back cleanly
 * to `adminClient` (for `jtec_main` only) or public read if Edge Function is not deployed yet.
 */
export async function listProjectSongsAdmin(
  adminClient: SupabaseClient | null,
  category: CloudCategoryKey,
  options: MusicAdminApiOptions = {}
): Promise<AdminCatalogListResult> {
  if (!isAllowedMusicProject(category)) {
    throw new MusicAdminError('request_failed', 'Unsupported music project.');
  }

  const cfg = SupabaseService.getCategoryConfig(category);

  try {
    const res = await invokeMusicAdminEdge<{
      ok: true;
      rows: any[];
      storageAudioCount: number | null;
      storageAuditError: string | null;
    }>(adminClient, { action: 'list-songs', targetProject: category }, options);

    const songs = (res.rows || []).map((row) =>
      normalizeCloudSongRow(row, (filePath) => {
        if (!cfg.url) return '';
        return `${cfg.url}/storage/v1/object/public/${cfg.bucket || BUCKET_MUSIC}/${filePath}`;
      })
    );

    return {
      songs,
      storageAudioCount: typeof res.storageAudioCount === 'number' ? res.storageAudioCount : null,
      storageAuditError: res.storageAuditError || null,
      source: 'server',
    };
  } catch (err) {
    if (err instanceof MusicAdminError && err.code === 'unauthorized') {
      throw err;
    }

    // Fallback when `music-admin` Edge Function is not deployed or target project server secret is absent
    if (category === 'jtec_main' && adminClient) {
      const { client } = await requireOwnerAal2AccessToken(adminClient);
      const songs = await listAllSongsWithClient(
        client,
        cfg.tableName || 'songs',
        cfg.bucket || BUCKET_MUSIC
      );
      const bucketAudit = await measureBucketStorageRecursive(client, cfg.bucket || BUCKET_MUSIC);
      return {
        songs,
        storageAudioCount: bucketAudit.error ? null : bucketAudit.count,
        storageAuditError: bucketAudit.error || null,
        source: 'direct_admin',
      };
    }

    const songs = await SupabaseService.fetchSongsForCategory(category);
    const pubClient = SupabaseService.getClientForCategory(category);
    const bucketAudit = pubClient
      ? await measureBucketStorageRecursive(pubClient, cfg.bucket || BUCKET_MUSIC)
      : { count: 0, bytes: 0, error: 'Project client not configured' };

    return {
      songs,
      storageAudioCount: bucketAudit.error ? null : bucketAudit.count,
      storageAuditError: bucketAudit.error || null,
      source: 'direct_public',
    };
  }
}

/**
 * Fetches recursive measured storage statistics across all 3 projects.
 * Uses server-side `music-admin` when deployed; falls back to `adminClient` (`jtec_main`)
 * and public read clients without ever converting errors to zero.
 */
export async function fetchAllStorageStatsAdmin(
  adminClient: SupabaseClient | null,
  options: MusicAdminApiOptions = {}
): Promise<{
  stats: Record<CloudCategoryKey, ProjectStorageStatsResult>;
  source: 'server' | 'direct_fallback';
  warning?: string;
}> {
  try {
    const res = await invokeMusicAdminEdge<{
      ok: true;
      stats: Record<CloudCategoryKey, ProjectStorageStatsResult>;
    }>(adminClient, { action: 'storage-stats' }, options);

    return { stats: res.stats, source: 'server' };
  } catch (err) {
    if (err instanceof MusicAdminError && err.code === 'unauthorized') {
      throw err;
    }

    const warning =
      err instanceof Error
        ? err.message
        : 'Privileged storage endpoint unavailable; showing direct bucket measurements.';

    const categories: CloudCategoryKey[] = ['jtec_main', 'nasheed', 'love_chill'];
    const result = {} as Record<CloudCategoryKey, ProjectStorageStatsResult>;

    for (const catKey of categories) {
      const cfg = SupabaseService.getCategoryConfig(catKey);
      const meta = CLOUD_CATEGORIES.find((c) => c.key === catKey);
      const projectName = meta?.title || catKey.toUpperCase();

      if (!cfg.isConfigured) {
        result[catKey] = {
          categoryKey: catKey,
          projectName,
          isConfigured: false,
          musicFilesCount: 0,
          musicBytes: 0,
          artworkFilesCount: 0,
          artworkBytes: 0,
          totalBytes: 0,
          recentUploads: [],
          error: 'Project unconfigured (missing VITE URL/Key)',
        };
        continue;
      }

      try {
        const client =
          catKey === 'jtec_main' && adminClient
            ? adminClient
            : SupabaseService.getClientForCategory(catKey);
        if (!client) throw new Error('Client unavailable');

        const musicRes = await measureBucketStorageRecursive(client, cfg.bucket || BUCKET_MUSIC);
        if (musicRes.error) {
          throw new Error(`Music bucket error: ${musicRes.error}`);
        }

        const artworkRes = await measureBucketStorageRecursive(client, BUCKET_ARTWORK);
        if (artworkRes.error) {
          throw new Error(`Artwork bucket error: ${artworkRes.error}`);
        }

        const { data: songRows, error: dbErr } = await client
          .from(cfg.tableName || 'songs')
          .select('title, artist, created_at, file_size')
          .order('created_at', { ascending: false })
          .limit(5);

        if (dbErr) {
          throw new Error(`Database query failed: ${dbErr.message}`);
        }

        result[catKey] = {
          categoryKey: catKey,
          projectName,
          isConfigured: true,
          musicFilesCount: musicRes.count,
          musicBytes: musicRes.bytes,
          artworkFilesCount: artworkRes.count,
          artworkBytes: artworkRes.bytes,
          totalBytes: musicRes.bytes + artworkRes.bytes,
          recentUploads: (songRows || []).map((r: any) => ({
            title: r.title || 'Untitled',
            artist: r.artist || 'Unknown',
            date: r.created_at ? new Date(r.created_at).toLocaleDateString() : 'Recent',
            size: Number(r.file_size) || 0,
          })),
        };
      } catch (catErr: any) {
        result[catKey] = {
          categoryKey: catKey,
          projectName,
          isConfigured: true,
          musicFilesCount: 0,
          musicBytes: 0,
          artworkFilesCount: 0,
          artworkBytes: 0,
          totalBytes: 0,
          recentUploads: [],
          error: sanitizeSecretText(catErr?.message || 'Failed to measure storage', [cfg.anonKey]),
        };
      }
    }

    return { stats: result, source: 'direct_fallback', warning };
  }
}

/**
 * Uploads a new track (audio + custom or embedded cover artwork) into the target project.
 * - Reuses the owner's persisted JTEC Main AAL2 session (never asks for TOTP again).
 * - Uses `music-admin` Edge Function for `nasheed` and `love_chill` (and `jtec_main` when deployed).
 * - Falls back to `adminClient` ONLY for `jtec_main` if `music-admin` is not deployed yet.
 */
export async function uploadSongAdmin(
  adminClient: SupabaseClient | null,
  category: CloudCategoryKey,
  params: {
    audioFile: File;
    coverFile: File | null;
    previewCoverDataUrl?: string;
    title: string;
    artist: string;
    album: string;
    genre: string;
    duration: number;
  },
  onProgress?: (statusText: string) => void,
  options: MusicAdminApiOptions = {}
): Promise<CloudSong | null> {
  if (!isAllowedMusicProject(category)) {
    throw new MusicAdminError('request_failed', 'Protected or invalid music target project.');
  }

  const { client: verifiedAdminClient } = await requireOwnerAal2AccessToken(adminClient);
  const cfg = SupabaseService.getCategoryConfig(category);
  const timestamp = Date.now();
  const audioPath = buildSafeStoragePath('tracks', `${timestamp}_${params.audioFile.name}`);

  // Prepare cover blob if custom file chosen OR embedded ID3 bitmap extracted (not inline SVG placeholder)
  let coverUploadBody: Blob | File | null = params.coverFile;
  let coverExt = 'jpg';
  if (!coverUploadBody && params.previewCoverDataUrl && params.previewCoverDataUrl.startsWith('data:image/')) {
    if (!params.previewCoverDataUrl.startsWith('data:image/svg+xml')) {
      try {
        coverUploadBody = dataUrlToBlob(params.previewCoverDataUrl);
        if (coverUploadBody.type === 'image/png') coverExt = 'png';
        else if (coverUploadBody.type === 'image/webp') coverExt = 'webp';
      } catch {
        coverUploadBody = null;
      }
    }
  } else if (coverUploadBody instanceof File) {
    const extMatch = coverUploadBody.name.toLowerCase().match(/\.(png|webp|jpg|jpeg)$/);
    if (extMatch) coverExt = extMatch[1] === 'jpeg' ? 'jpg' : extMatch[1];
  }

  const coverPath = coverUploadBody ? buildSafeStoragePath('covers', `${timestamp}_cover.${coverExt}`) : null;

  // Try server-side Edge Function first
  try {
    onProgress?.('Requesting authorized server upload URL...');
    const audioTicket = await invokeMusicAdminEdge<{
      ok: true;
      signedUrl: string;
      token: string;
      path: string;
      bucket: string;
      publicUrl: string;
    }>(
      verifiedAdminClient,
      {
        action: 'create-upload-url',
        targetProject: category,
        bucket: 'music',
        path: audioPath,
      },
      options
    );

    const targetPublicClient = makeUnauthenticatedClient(category);

    onProgress?.('Uploading audio file to storage...');
    const { error: audioPutErr } = await targetPublicClient.storage
      .from(audioTicket.bucket || cfg.bucket || BUCKET_MUSIC)
      .uploadToSignedUrl(audioTicket.path, audioTicket.token, params.audioFile, {
        contentType: params.audioFile.type || 'audio/mpeg',
        upsert: false,
      });

    if (audioPutErr) {
      throw new MusicAdminError('request_failed', `Audio upload failed: ${audioPutErr.message}`);
    }

    let finalCoverUrl = params.previewCoverDataUrl || '';
    let uploadedCoverPath: string | null = null;

    if (coverUploadBody && coverPath) {
      onProgress?.('Uploading cover artwork to storage...');
      const coverTicket = await invokeMusicAdminEdge<{
        ok: true;
        signedUrl: string;
        token: string;
        path: string;
        bucket: string;
        publicUrl: string;
      }>(
        verifiedAdminClient,
        {
          action: 'create-upload-url',
          targetProject: category,
          bucket: 'artwork',
          path: coverPath,
        },
        options
      );

      const { error: coverPutErr } = await targetPublicClient.storage
        .from(coverTicket.bucket || BUCKET_ARTWORK)
        .uploadToSignedUrl(coverTicket.path, coverTicket.token, coverUploadBody, {
          contentType: coverUploadBody.type || 'image/jpeg',
          upsert: true,
        });

      if (!coverPutErr && coverTicket.publicUrl) {
        finalCoverUrl = coverTicket.publicUrl;
        uploadedCoverPath = coverTicket.path;
      }
    }

    onProgress?.('Saving song record to database...');
    const insertPayload = buildSongInsertPayload({
      title: params.title,
      artist: params.artist,
      album: params.album,
      genre: params.genre,
      duration: params.duration,
      fileName: params.audioFile.name,
      filePath: audioTicket.path,
      fileSize: params.audioFile.size,
      fileType: params.audioFile.type || 'audio/mpeg',
      audioUrl: audioTicket.publicUrl,
      coverUrl: finalCoverUrl,
      fileHash: `sha256_${timestamp}`,
    });

    const inserted = await invokeMusicAdminEdge<{ ok: true; row?: Record<string, any> }>(
      verifiedAdminClient,
      {
        action: 'insert-song',
        targetProject: category,
        song: insertPayload,
        uploadedCoverPath,
      },
      options
    );

    return inserted.row ? normalizeCloudSongRow(inserted.row) : null;
  } catch (err) {
    if (!(err instanceof MusicAdminError && err.code === 'edge_unavailable' && category === 'jtec_main')) {
      throw err;
    }

    // Safe direct fallback ONLY for `jtec_main` using verified JTEC Main AAL2 `adminClient`
    let uploadedAudioPath: string | null = null;
    let uploadedCoverPath: string | null = null;

    onProgress?.('Uploading audio file to JTEC Main storage...');
    const { error: audioErr } = await verifiedAdminClient.storage
      .from(cfg.bucket || BUCKET_MUSIC)
      .upload(audioPath, params.audioFile, { cacheControl: '3600', upsert: false });

    if (audioErr) {
      throw new MusicAdminError('request_failed', `Audio storage upload failed: ${audioErr.message}`);
    }
    uploadedAudioPath = audioPath;

    const { data: audioPub } = verifiedAdminClient.storage
      .from(cfg.bucket || BUCKET_MUSIC)
      .getPublicUrl(audioPath);
    const audioPublicUrl = audioPub?.publicUrl || '';

    let artworkPublicUrl = params.previewCoverDataUrl || '';
    if (coverUploadBody && coverPath) {
      onProgress?.('Uploading cover artwork to storage...');
      const { error: coverErr } = await verifiedAdminClient.storage
        .from(BUCKET_ARTWORK)
        .upload(coverPath, coverUploadBody, {
          contentType: coverUploadBody.type || 'image/jpeg',
          cacheControl: '3600',
          upsert: true,
        });
      if (!coverErr) {
        uploadedCoverPath = coverPath;
        const { data: coverPub } = verifiedAdminClient.storage.from(BUCKET_ARTWORK).getPublicUrl(coverPath);
        if (coverPub?.publicUrl) artworkPublicUrl = coverPub.publicUrl;
      }
    }

    onProgress?.('Inserting song record into database...');
    const payload = buildSongInsertPayload({
      title: params.title,
      artist: params.artist,
      album: params.album,
      genre: params.genre,
      duration: params.duration,
      fileName: params.audioFile.name,
      filePath: uploadedAudioPath,
      fileSize: params.audioFile.size,
      fileType: params.audioFile.type || 'audio/mpeg',
      audioUrl: audioPublicUrl,
      coverUrl: artworkPublicUrl,
      fileHash: `sha256_${timestamp}`,
    });

    const { error: dbErr } = await executeAdaptiveMutation(payload as unknown as Record<string, unknown>, async (cand) =>
      await verifiedAdminClient.from(cfg.tableName || 'songs').insert(cand)
    );

    if (dbErr) {
      if (uploadedAudioPath) {
        await verifiedAdminClient.storage.from(cfg.bucket || BUCKET_MUSIC).remove([uploadedAudioPath]).catch(() => {});
      }
      if (uploadedCoverPath) {
        await verifiedAdminClient.storage.from(BUCKET_ARTWORK).remove([uploadedCoverPath]).catch(() => {});
      }
      throw new MusicAdminError('request_failed', `Database insert failed: ${dbErr.message}`);
    }

    await recordAdminAuditEvent(verifiedAdminClient, 'song_uploaded', {
      project: category,
      title: params.title.trim(),
      file_path: uploadedAudioPath,
    });

    return null;
  }
}

export async function updateSongMetadataAdmin(
  adminClient: SupabaseClient | null,
  category: CloudCategoryKey,
  songId: string,
  metadata: { title: string; artist: string; album: string; genre: string },
  options: MusicAdminApiOptions = {}
): Promise<void> {
  if (!isAllowedMusicProject(category)) {
    throw new MusicAdminError('request_failed', 'Protected or invalid music target project.');
  }

  const { client: verifiedAdminClient } = await requireOwnerAal2AccessToken(adminClient);
  const cfg = SupabaseService.getCategoryConfig(category);

  try {
    await invokeMusicAdminEdge(
      verifiedAdminClient,
      {
        action: 'update-song',
        targetProject: category,
        songId,
        metadata,
      },
      options
    );
  } catch (err) {
    if (!(err instanceof MusicAdminError && err.code === 'edge_unavailable' && category === 'jtec_main')) {
      throw err;
    }

    const payload = {
      title: metadata.title.trim(),
      artist: metadata.artist.trim() || 'Unknown Artist',
      album: metadata.album.trim() || 'Single',
      genre: metadata.genre.trim() || 'Music',
      updated_at: new Date().toISOString(),
    };

    const { error } = await executeAdaptiveMutation(payload, async (cand) =>
      await verifiedAdminClient.from(cfg.tableName || 'songs').update(cand).eq('id', songId)
    );
    if (error) {
      throw new MusicAdminError('request_failed', error.message);
    }

    await recordAdminAuditEvent(verifiedAdminClient, 'song_edited', {
      project: category,
      song_id: songId,
      title: payload.title,
    });
  }
}

export async function replaceSongAudioAdmin(
  adminClient: SupabaseClient | null,
  category: CloudCategoryKey,
  song: CloudSong,
  file: File,
  duration: number,
  options: MusicAdminApiOptions = {}
): Promise<void> {
  if (!isAllowedMusicProject(category)) {
    throw new MusicAdminError('request_failed', 'Protected or invalid music target project.');
  }

  const { client: verifiedAdminClient } = await requireOwnerAal2AccessToken(adminClient);
  const cfg = SupabaseService.getCategoryConfig(category);
  const timestamp = Date.now();
  const newPath = buildSafeStoragePath('tracks', `${timestamp}_${file.name}`);

  try {
    const ticket = await invokeMusicAdminEdge<{
      ok: true;
      signedUrl: string;
      token: string;
      path: string;
      bucket: string;
      publicUrl: string;
    }>(
      verifiedAdminClient,
      {
        action: 'create-upload-url',
        targetProject: category,
        bucket: 'music',
        path: newPath,
      },
      options
    );

    const targetPublicClient = makeUnauthenticatedClient(category);
    const { error: putErr } = await targetPublicClient.storage
      .from(ticket.bucket || cfg.bucket || BUCKET_MUSIC)
      .uploadToSignedUrl(ticket.path, ticket.token, file, {
        contentType: file.type || 'audio/mpeg',
        upsert: false,
      });

    if (putErr) {
      throw new MusicAdminError('request_failed', `Audio storage upload failed: ${putErr.message}`);
    }

    await invokeMusicAdminEdge(
      verifiedAdminClient,
      {
        action: 'replace-song-audio',
        targetProject: category,
        songId: song.id,
        newPath: ticket.path,
        publicUrl: ticket.publicUrl,
        oldPath: song.file_path || '',
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type || 'audio/mpeg',
        duration: duration || song.duration,
      },
      options
    );
  } catch (err) {
    if (!(err instanceof MusicAdminError && err.code === 'edge_unavailable' && category === 'jtec_main')) {
      throw err;
    }

    const { error: uploadErr } = await verifiedAdminClient.storage
      .from(cfg.bucket || BUCKET_MUSIC)
      .upload(newPath, file, { cacheControl: '3600', upsert: false });

    if (uploadErr) {
      throw new MusicAdminError('request_failed', `Audio storage upload failed: ${uploadErr.message}`);
    }

    const { data: urlData } = verifiedAdminClient.storage
      .from(cfg.bucket || BUCKET_MUSIC)
      .getPublicUrl(newPath);

    const payload = buildAudioUpdatePayload({
      filePath: newPath,
      audioUrl: urlData?.publicUrl || '',
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type || 'audio/mpeg',
      duration: duration || song.duration,
    });

    const { error: dbErr } = await executeAdaptiveMutation(payload, async (cand) =>
      await verifiedAdminClient.from(cfg.tableName || 'songs').update(cand).eq('id', song.id)
    );

    if (dbErr) {
      await verifiedAdminClient.storage.from(cfg.bucket || BUCKET_MUSIC).remove([newPath]).catch(() => {});
      throw new MusicAdminError('request_failed', dbErr.message);
    }

    if (song.file_path && song.file_path !== newPath) {
      await verifiedAdminClient.storage.from(cfg.bucket || BUCKET_MUSIC).remove([song.file_path]).catch(() => {});
    }

    await recordAdminAuditEvent(verifiedAdminClient, 'song_replaced', {
      project: category,
      song_id: song.id,
      audio_changed: true,
      file_path: newPath,
    });
  }
}

export async function replaceSongCoverAdmin(
  adminClient: SupabaseClient | null,
  category: CloudCategoryKey,
  song: CloudSong,
  jpegDataUrl: string,
  options: MusicAdminApiOptions = {}
): Promise<void> {
  if (!isAllowedMusicProject(category)) {
    throw new MusicAdminError('request_failed', 'Protected or invalid music target project.');
  }

  const { client: verifiedAdminClient } = await requireOwnerAal2AccessToken(adminClient);
  const cfg = SupabaseService.getCategoryConfig(category);
  const timestamp = Date.now();
  const coverPath = buildSafeStoragePath('covers', `${timestamp}_${song.id}.jpg`);
  const blob = dataUrlToBlob(jpegDataUrl);

  try {
    const ticket = await invokeMusicAdminEdge<{
      ok: true;
      signedUrl: string;
      token: string;
      path: string;
      bucket: string;
      publicUrl: string;
    }>(
      verifiedAdminClient,
      {
        action: 'create-upload-url',
        targetProject: category,
        bucket: 'artwork',
        path: coverPath,
      },
      options
    );

    const targetPublicClient = makeUnauthenticatedClient(category);
    const { error: putErr } = await targetPublicClient.storage
      .from(ticket.bucket || BUCKET_ARTWORK)
      .uploadToSignedUrl(ticket.path, ticket.token, blob, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (putErr) {
      throw new MusicAdminError('request_failed', `Cover upload failed: ${putErr.message}`);
    }

    await invokeMusicAdminEdge(
      verifiedAdminClient,
      {
        action: 'replace-song-cover',
        targetProject: category,
        songId: song.id,
        newCoverUrl: ticket.publicUrl || jpegDataUrl,
        oldCoverUrl: song.cover_url || '',
      },
      options
    );
  } catch (err) {
    if (!(err instanceof MusicAdminError && err.code === 'edge_unavailable' && category === 'jtec_main')) {
      throw err;
    }

    const { error: uploadErr } = await verifiedAdminClient.storage
      .from(BUCKET_ARTWORK)
      .upload(coverPath, blob, { contentType: 'image/jpeg', upsert: true });

    if (uploadErr) {
      throw new MusicAdminError('request_failed', `Cover upload failed: ${uploadErr.message}`);
    }

    const { data: urlData } = verifiedAdminClient.storage.from(BUCKET_ARTWORK).getPublicUrl(coverPath);
    const newCoverUrl = urlData?.publicUrl || jpegDataUrl;

    const payload = buildCoverUpdatePayload(newCoverUrl);
    const { error: dbErr } = await executeAdaptiveMutation(payload, async (cand) =>
      await verifiedAdminClient.from(cfg.tableName || 'songs').update(cand).eq('id', song.id)
    );

    if (dbErr) {
      await verifiedAdminClient.storage.from(BUCKET_ARTWORK).remove([coverPath]).catch(() => {});
      throw new MusicAdminError('request_failed', dbErr.message);
    }

    const oldArtworkPath = extractStoragePathFromPublicUrl(song.cover_url, BUCKET_ARTWORK);
    if (oldArtworkPath && oldArtworkPath !== coverPath) {
      await verifiedAdminClient.storage.from(BUCKET_ARTWORK).remove([oldArtworkPath]).catch(() => {});
    }

    await recordAdminAuditEvent(verifiedAdminClient, 'song_replaced', {
      project: category,
      song_id: song.id,
      cover_changed: true,
    });
  }
}

export async function deleteSongAdmin(
  adminClient: SupabaseClient | null,
  category: CloudCategoryKey,
  song: CloudSong,
  options: MusicAdminApiOptions = {}
): Promise<void> {
  if (!isAllowedMusicProject(category)) {
    throw new MusicAdminError('request_failed', 'Protected or invalid music target project.');
  }

  const { client: verifiedAdminClient } = await requireOwnerAal2AccessToken(adminClient);
  const cfg = SupabaseService.getCategoryConfig(category);

  try {
    await invokeMusicAdminEdge(
      verifiedAdminClient,
      {
        action: 'delete-song',
        targetProject: category,
        songId: song.id,
        filePath: song.file_path || '',
        coverUrl: song.cover_url || '',
      },
      options
    );
  } catch (err) {
    if (!(err instanceof MusicAdminError && err.code === 'edge_unavailable' && category === 'jtec_main')) {
      throw err;
    }

    const { error: dbErr } = await verifiedAdminClient
      .from(cfg.tableName || 'songs')
      .delete()
      .eq('id', song.id);

    if (dbErr) {
      throw new MusicAdminError('request_failed', dbErr.message);
    }

    if (song.file_path) {
      await verifiedAdminClient.storage
        .from(cfg.bucket || BUCKET_MUSIC)
        .remove([song.file_path])
        .catch(() => {});
    }

    const coverPath = extractStoragePathFromPublicUrl(song.cover_url, BUCKET_ARTWORK);
    if (coverPath) {
      await verifiedAdminClient.storage.from(BUCKET_ARTWORK).remove([coverPath]).catch(() => {});
    }

    await recordAdminAuditEvent(verifiedAdminClient, 'song_deleted', {
      project: category,
      song_id: song.id,
      file_path: song.file_path || null,
    });
  }
}

export function getMaskedCategoryHost(category: CloudCategoryKey): string {
  const cfg = SupabaseService.getCategoryConfig(category);
  return getMaskedHost(cfg.url);
}
