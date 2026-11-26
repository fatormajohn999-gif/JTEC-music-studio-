import { CloudSong } from '../types/music';

export type ManagedMusicCategory = 'jtec_main' | 'nasheed' | 'love_chill';

export const ALLOWED_MANAGED_MUSIC_PROJECTS: readonly ManagedMusicCategory[] = [
  'jtec_main',
  'nasheed',
  'love_chill',
] as const;

export function isAllowedMusicProject(value: unknown): value is ManagedMusicCategory {
  return (
    typeof value === 'string' &&
    (value === 'jtec_main' || value === 'nasheed' || value === 'love_chill')
  );
}

export function sanitizeStorageFileName(fileName: string, fallback = 'file'): string {
  const base = String(fileName || fallback)
    .split(/[\\/]/)
    .pop() || fallback;
  const cleaned = base.replace(/[^a-zA-Z0-9_.-]/g, '_').replace(/^\.+/, '');
  return cleaned || fallback;
}

export function buildSafeStoragePath(prefix: 'tracks' | 'covers', rawName: string): string {
  const safeName = sanitizeStorageFileName(rawName, prefix === 'tracks' ? 'track.mp3' : 'cover.jpg');
  const candidate = `${prefix}/${safeName}`;
  if (candidate.includes('..')) {
    throw new Error('Invalid storage path.');
  }
  return candidate;
}

export function validateStorageObjectPath(rawPath: string, expectedBucket: 'music' | 'artwork'): string {
  const trimmed = String(rawPath || '').trim().replace(/^\/+/, '');
  if (!trimmed || trimmed.includes('..') || trimmed.includes('\\')) {
    throw new Error('Invalid storage object path.');
  }
  if (expectedBucket === 'artwork' && !trimmed.startsWith('covers/')) {
    throw new Error('Artwork uploads must target the covers/ folder.');
  }
  if (expectedBucket === 'music' && !trimmed.startsWith('tracks/')) {
    // Allow legacy non-tracks/ root paths only when reading/deleting, reject traversal
    if (trimmed.startsWith('/')) {
      throw new Error('Invalid music storage path.');
    }
  }
  return trimmed;
}

/**
 * Extracts a bucket-relative object path from a Supabase public Storage URL.
 * Returns null for data URLs, external URLs, or empty values.
 */
export function extractStoragePathFromPublicUrl(url: string | null | undefined, bucketName: string): string | null {
  const raw = String(url || '').trim();
  if (!raw || raw.startsWith('data:')) return null;

  try {
    const parsed = new URL(raw);
    const markers = [
      `/storage/v1/object/public/${bucketName}/`,
      `/storage/v1/object/sign/${bucketName}/`,
      `/storage/v1/object/${bucketName}/`,
    ];
    for (const marker of markers) {
      const idx = parsed.pathname.indexOf(marker);
      if (idx >= 0) {
        const rel = decodeURIComponent(parsed.pathname.slice(idx + marker.length)).replace(/^\/+/, '');
        if (rel && !rel.includes('..')) return rel;
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function extractMissingColumnFromPgrstError(error: { message?: string; details?: string; code?: string } | null | undefined): string | null {
  if (!error) return null;
  const text = `${error.message || ''} ${error.details || ''}`;
  // PostgREST PGRST204: "Could not find the 'storage_path' column of 'songs' in the schema cache"
  const pgrstMatch = text.match(/Could not find the '([a-zA-Z0-9_]+)' column/i);
  if (pgrstMatch?.[1]) return pgrstMatch[1];

  // PostgreSQL 42703: column "storage_path" of relation "songs" does not exist
  const pgMatch = text.match(/column\s+"?([a-zA-Z0-9_]+)"?(?:\s+of\s+relation\s+"?[a-zA-Z0-9_]+"?)?\s+does not exist/i);
  if (pgMatch?.[1]) return pgMatch[1];

  return null;
}

export function isMissingCreatedAtError(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  const code = String(error.code || '').toUpperCase();
  const msg = String(error.message || '').toLowerCase();
  return (code === '42703' || msg.includes('does not exist')) && msg.includes('created_at');
}

export interface SongInsertFields {
  title: string;
  artist: string;
  album: string;
  genre: string;
  duration: number;
  file_name: string;
  file_path: string;
  storage_path: string;
  file_size: number;
  file_type: string;
  audio_url: string;
  public_url: string;
  cover_url: string;
  artwork_url: string;
  file_hash: string;
}

export function buildSongInsertPayload(input: {
  title: string;
  artist?: string;
  album?: string;
  genre?: string;
  duration?: number;
  fileName: string;
  filePath: string;
  fileSize: number;
  fileType?: string;
  audioUrl: string;
  coverUrl?: string;
  fileHash?: string;
}): SongInsertFields {
  const cover = (input.coverUrl || '').trim();
  const path = (input.filePath || '').trim();
  const audio = (input.audioUrl || '').trim();

  return {
    title: input.title.trim(),
    artist: (input.artist || '').trim() || 'Unknown Artist',
    album: (input.album || '').trim() || 'Single',
    genre: (input.genre || '').trim() || 'Music',
    duration: Number(input.duration) || 0,
    file_name: input.fileName || 'track.mp3',
    file_path: path,
    storage_path: path,
    file_size: Number(input.fileSize) || 0,
    file_type: (input.fileType || '').trim() || 'audio/mpeg',
    audio_url: audio,
    public_url: audio,
    cover_url: cover,
    artwork_url: cover,
    file_hash: (input.fileHash || '').trim() || `sha256_${Date.now()}`,
  };
}

export function buildAudioUpdatePayload(input: {
  filePath: string;
  audioUrl: string;
  fileName: string;
  fileSize: number;
  fileType?: string;
  duration?: number;
}): Record<string, unknown> {
  return {
    file_path: input.filePath,
    storage_path: input.filePath,
    audio_url: input.audioUrl,
    public_url: input.audioUrl,
    file_name: input.fileName,
    file_size: Number(input.fileSize) || 0,
    file_type: (input.fileType || '').trim() || 'audio/mpeg',
    duration: Number(input.duration) || 0,
    updated_at: new Date().toISOString(),
  };
}

export function buildCoverUpdatePayload(coverUrl: string): Record<string, unknown> {
  return {
    cover_url: coverUrl,
    artwork_url: coverUrl,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Strips unknown columns when an older `songs` schema lacks optional dual columns
 * (e.g., `storage_path`, `public_url`, `artwork_url`, `file_type`, `updated_at`),
 * retrying up to 8 times without losing the operation.
 */
export async function executeAdaptiveMutation<T extends { error: any }>(
  payload: Record<string, unknown>,
  runMutation: (candidatePayload: Record<string, unknown>) => Promise<T>
): Promise<T> {
  const working: Record<string, unknown> = { ...payload };
  for (let attempt = 0; attempt < 8; attempt++) {
    const result = await runMutation(working);
    if (!result.error) {
      return result;
    }
    const missingCol = extractMissingColumnFromPgrstError(result.error);
    if (missingCol && Object.prototype.hasOwnProperty.call(working, missingCol)) {
      delete working[missingCol];
      continue;
    }
    return result;
  }
  return runMutation(working);
}

export function normalizeCloudSongRow(
  row: Record<string, any>,
  resolvePublicUrl?: (filePath: string) => string
): CloudSong {
  const storagePath = typeof row.storage_path === 'string' ? row.storage_path.trim() : '';
  const legacyPath = typeof row.file_path === 'string' ? row.file_path.trim() : '';
  const filePath = storagePath || legacyPath;

  const publicUrlCol = typeof row.public_url === 'string' ? row.public_url.trim() : '';
  const legacyAudioUrl = typeof row.audio_url === 'string' ? row.audio_url.trim() : '';
  let audioUrl = publicUrlCol || legacyAudioUrl;

  if (!audioUrl && filePath && resolvePublicUrl) {
    audioUrl = resolvePublicUrl(filePath);
  }

  const artworkUrlCol = typeof row.artwork_url === 'string' ? row.artwork_url.trim() : '';
  const legacyCoverUrl = typeof row.cover_url === 'string' ? row.cover_url.trim() : '';
  const coverUrl = artworkUrlCol || legacyCoverUrl;

  return {
    id: String(row.id),
    title: (typeof row.title === 'string' && row.title.trim()) ? row.title : 'Untitled',
    artist: (typeof row.artist === 'string' && row.artist.trim()) ? row.artist : 'Unknown Artist',
    album: (typeof row.album === 'string' && row.album.trim()) ? row.album : 'Single',
    genre: (typeof row.genre === 'string' && row.genre.trim()) ? row.genre : 'Music',
    duration: Number(row.duration) || 0,
    file_name: (typeof row.file_name === 'string' && row.file_name.trim()) ? row.file_name : 'track.mp3',
    file_path: filePath,
    file_size: Number(row.file_size) || 0,
    audio_url: audioUrl,
    cover_url: coverUrl,
    file_hash: typeof row.file_hash === 'string' ? row.file_hash : '',
    created_at: row.created_at || row.updated_at || new Date(0).toISOString(),
  };
}
