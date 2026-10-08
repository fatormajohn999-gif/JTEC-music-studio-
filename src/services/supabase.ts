import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CloudSong, CloudStorageStats, Song } from '../types/music';

// Storage Bucket Names
export const BUCKET_MUSIC = 'music';
export const BUCKET_ARTWORK = 'artwork';

// Default free tier cloud storage quota (1 GB = 1073741824 bytes)
export const DEFAULT_MAX_CLOUD_BYTES = 1073741824;

const LS_KEY_URL = 'jtec_supabase_url';
const LS_KEY_KEY = 'jtec_supabase_anon_key';
const LS_KEY_SETTINGS = 'jtec_cloud_settings';

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
  maxCloudQuotaBytes: DEFAULT_MAX_CLOUD_BYTES,
};

// Singleton client cache to eliminate multiple GoTrueClient warnings
let cachedClient: SupabaseClient | null = null;
let currentClientConfig = { url: '', anonKey: '' };

/**
 * Structured diagnostic logger for Supabase operations.
 * Outputs detailed error metadata in development console as required:
 * - error message
 * - error code
 * - bucket
 * - file name
 * - upload path
 * - HTTP status when available
 */
export function logSupabaseError(context: string, details: {
  errorMessage: string;
  errorCode?: string | number;
  bucket?: string;
  fileName?: string;
  uploadPath?: string;
  httpStatus?: number;
  raw?: unknown;
}) {
  console.error(`🚨 [JTEC MUSIC - SUPABASE ERROR in ${context}]`, {
    'error message': details.errorMessage,
    'error code': details.errorCode || 'UNKNOWN',
    'bucket': details.bucket || 'N/A',
    'file name': details.fileName || 'N/A',
    'upload path': details.uploadPath || 'N/A',
    'HTTP status': details.httpStatus || 'N/A',
    'raw error': details.raw,
  });
}

/**
 * Detects and extracts any missing column name from PostgREST / PostgreSQL error messages.
 * Handles:
 * - PostgREST PGRST204: "Could not find the 'artwork_url' column of 'songs' in the schema cache"
 * - PostgreSQL 42703: "column "artwork_url" of relation "songs" does not exist"
 * - Fallback: checks for any payload key name explicitly contained in the error message
 */
export function extractMissingColumn(errorMsg: string, payload: Record<string, unknown>): string | null {
  if (!errorMsg) return null;

  // Pattern 1: PostgREST code PGRST204 ("Could not find the 'column_name' column")
  const pgrstMatch = errorMsg.match(/Could not find the ['"]([^'"]+)['"] column/i);
  if (pgrstMatch && pgrstMatch[1] && pgrstMatch[1] in payload) {
    return pgrstMatch[1];
  }

  // Pattern 2: PostgreSQL code 42703 ("column "column_name" does not exist")
  const pgMatch = errorMsg.match(/column ["']([^"']+)["']/i);
  if (pgMatch && pgMatch[1] && pgMatch[1] in payload) {
    return pgMatch[1];
  }

  // Pattern 3: Explicit key names in quotes
  for (const key of Object.keys(payload)) {
    if (errorMsg.includes(`'${key}'`) || errorMsg.includes(`"${key}"`)) {
      return key;
    }
  }

  // Pattern 4: Case-insensitive token check
  const lowerMsg = errorMsg.toLowerCase();
  for (const key of Object.keys(payload)) {
    if (lowerMsg.includes(key.toLowerCase()) && lowerMsg.includes('column')) {
      return key;
    }
  }

  return null;
}

export const SupabaseService = {
  /**
   * Retrieves active Supabase connection configuration.
   * Checks LocalStorage first (allows user to connect via UI), then Vite environment variables.
   */
  getConfig(): { url: string; anonKey: string; isConfigured: boolean } {
    const lsUrl = typeof localStorage !== 'undefined' ? localStorage.getItem(LS_KEY_URL) || '' : '';
    const lsKey = typeof localStorage !== 'undefined' ? localStorage.getItem(LS_KEY_KEY) || '' : '';

    const envUrl = (import.meta.env.VITE_SUPABASE_URL as string) || '';
    const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || '';

    const url = (lsUrl || envUrl).trim();
    const anonKey = (lsKey || envKey).trim();

    return {
      url,
      anonKey,
      isConfigured: Boolean(url && anonKey),
    };
  },

  /**
   * Saves or updates custom Supabase credentials in local browser storage.
   */
  saveConfig(url: string, anonKey: string) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LS_KEY_URL, url.trim());
      localStorage.setItem(LS_KEY_KEY, anonKey.trim());
    }
    cachedClient = null; // force singleton recreation
  },

  /**
   * Clears saved Supabase credentials.
   */
  clearConfig() {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(LS_KEY_URL);
      localStorage.removeItem(LS_KEY_KEY);
    }
    cachedClient = null;
  },

  /**
   * Reads Cloud preferences from local storage.
   */
  getCloudSettings(): CloudSettings {
    if (typeof localStorage === 'undefined') return DEFAULT_CLOUD_SETTINGS;
    try {
      const stored = localStorage.getItem(LS_KEY_SETTINGS);
      if (stored) {
        return { ...DEFAULT_CLOUD_SETTINGS, ...JSON.parse(stored) };
      }
    } catch {
      // fallback
    }
    return DEFAULT_CLOUD_SETTINGS;
  },

  /**
   * Saves Cloud preferences to local storage.
   */
  saveCloudSettings(settings: Partial<CloudSettings>): CloudSettings {
    const current = this.getCloudSettings();
    const updated = { ...current, ...settings };
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(LS_KEY_SETTINGS, JSON.stringify(updated));
      } catch {
        // ignore
      }
    }
    return updated;
  },

  /**
   * Returns a singleton SupabaseClient or null if credentials are not configured.
   * Configures auth options to eliminate duplicate GoTrueClient initialization warnings.
   */
  getClient(): SupabaseClient | null {
    const { url, anonKey, isConfigured } = this.getConfig();
    if (!isConfigured) return null;

    if (cachedClient && currentClientConfig.url === url && currentClientConfig.anonKey === anonKey) {
      return cachedClient;
    }

    try {
      cachedClient = createClient(url, anonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });
      currentClientConfig = { url, anonKey };
      return cachedClient;
    } catch (err) {
      console.warn('Failed to initialize Supabase client:', err);
      return null;
    }
  },

  /**
   * Tests connection to Supabase database and verifies storage bucket access.
   * Avoids duplicate GoTrueClient instances.
   */
  async testConnection(url?: string, anonKey?: string): Promise<{
    success: boolean;
    message: string;
    tableExists: boolean;
    bucketsExist: boolean;
  }> {
    const testUrl = (url || this.getConfig().url).trim();
    const testKey = (anonKey || this.getConfig().anonKey).trim();

    if (!testUrl || !testKey) {
      return {
        success: false,
        message: 'Supabase URL and Anon Key are required.',
        tableExists: false,
        bucketsExist: false,
      };
    }

    try {
      // Create lightweight client without persistent session listeners to eliminate GoTrueClient warning
      const client = createClient(testUrl, testKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });

      // Check table query
      const { error: tableError } = await client
        .from('songs')
        .select('id')
        .limit(1);

      let tableExists = !tableError;

      // Check storage buckets
      const { data: buckets, error: bucketError } = await client.storage.listBuckets();
      const hasMusicBucket = Boolean(buckets?.some((b) => b.name === BUCKET_MUSIC));
      const bucketsExist = Boolean(!bucketError && hasMusicBucket);

      if (tableError && tableError.code === '42P01') {
        return {
          success: true,
          message: 'Connected to Supabase! The "songs" table has not been created yet. Run the SQL schema to create it.',
          tableExists: false,
          bucketsExist,
        };
      }

      if (tableError) {
        logSupabaseError('testConnection.table', {
          errorMessage: tableError.message,
          errorCode: tableError.code,
          raw: tableError,
        });
        return {
          success: false,
          message: `Database error: ${tableError.message}`,
          tableExists: false,
          bucketsExist,
        };
      }

      return {
        success: true,
        message: 'Successfully connected to JTEC Cloud Database & Storage!',
        tableExists,
        bucketsExist,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection failed.';
      logSupabaseError('testConnection', {
        errorMessage: msg,
        raw: err,
      });
      return {
        success: false,
        message: msg,
        tableExists: false,
        bucketsExist: false,
      };
    }
  },

  /**
   * Fetches all cloud music tracks from the Supabase "songs" table.
   * Real data only: returns empty array if credentials not set or no tracks uploaded.
   * Supports both storage_path/file_path, public_url/audio_url, artwork_url/cover_url conventions.
   */
  async fetchCloudSongs(): Promise<CloudSong[]> {
    const client = this.getClient();
    if (!client) {
      return [];
    }

    try {
      const { data, error } = await client
        .from('songs')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        logSupabaseError('fetchCloudSongs', {
          errorMessage: error.message,
          errorCode: error.code,
          raw: error,
        });
        return [];
      }

      const songs: CloudSong[] = (data || []).map((row) => {
        const filePath = row.storage_path || row.file_path || '';
        const audioUrl = row.public_url || row.audio_url || '';
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
      logSupabaseError('fetchCloudSongs.exception', {
        errorMessage: err instanceof Error ? err.message : 'Unknown exception',
        raw: err,
      });
      return [];
    }
  },

  /**
   * Checks whether a song with the same hash or matching metadata already exists in the cloud.
   */
  async checkDuplicate(
    fileHash: string,
    fileName: string,
    title: string,
    artist: string,
    size: number
  ): Promise<CloudSong | null> {
    const cloudSongs = await this.fetchCloudSongs();

    // 1. Strict hash match
    if (fileHash) {
      const exactHashMatch = cloudSongs.find(
        (s) => s.file_hash && s.file_hash === fileHash
      );
      if (exactHashMatch) return exactHashMatch;
    }

    // 2. Exact filename + file size match
    if (fileName && size > 0) {
      const nameMatch = cloudSongs.find(
        (s) => s.file_name.toLowerCase() === fileName.toLowerCase() && s.file_size === size
      );
      if (nameMatch) return nameMatch;
    }

    // 3. Exact clean title + artist match
    const cleanTitle = title.trim().toLowerCase();
    const cleanArtist = artist.trim().toLowerCase();

    if (cleanTitle && cleanTitle !== 'untitled') {
      const metadataMatch = cloudSongs.find((s) => {
        const sameTitle = s.title.trim().toLowerCase() === cleanTitle;
        const sameArtist = !cleanArtist || cleanArtist === 'unknown artist' || s.artist.trim().toLowerCase() === cleanArtist;
        const sameSize = Math.abs(s.file_size - size) < 4096; // within 4KB
        return sameTitle && (sameArtist || sameSize);
      });
      if (metadataMatch) return metadataMatch;
    }

    return null;
  },

  /**
   * Uploads an audio file and metadata to Supabase Cloud.
   * Architecture:
   * 1. Validate file format and size.
   * 2. Upload file to dedicated "music" bucket in Supabase Storage at safe path:
   *    music/{userId}/{uniqueFileName} (or public/{uniqueFileName} in development mode)
   * 3. Confirm storage upload succeeded.
   * 4. Retrieve public/streaming URL.
   * 5. Insert metadata into Supabase "songs" database table (all required columns).
   * 6. Show detailed console diagnostics on any failure.
   */
  async uploadMusicFile(
    file: File,
    metadata: {
      title: string;
      artist: string;
      album: string;
      genre: string;
      duration: number;
      artworkBlob?: Blob;
      artworkUrl?: string;
      fileHash: string;
    },
    onProgress?: (percent: number) => void
  ): Promise<CloudSong> {
    const client = this.getClient();
    if (!client) {
      throw new Error(
        'Supabase is not configured. Please open Cloud Settings and enter your Supabase URL and public Anon Key.'
      );
    }

    // 1. Validate File
    if (!file || file.size === 0) {
      throw new Error('Upload failed: Selected file is empty (0 bytes).');
    }

    const mimeType = getAudioMimeType(file.name, file.type);
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    
    // Determine user ID: check active session or use explicit development-safe 'public' scope
    let userId = 'public';
    try {
      const { data: userData } = await client.auth.getUser();
      if (userData?.user?.id) {
        userId = userData.user.id;
      }
    } catch {
      userId = 'public';
    }

    const uniqueId = `song_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const uniqueFileName = `${Date.now()}_${sanitizedFileName}`;
    
    // Safe storage path: {userId}/{uniqueFileName}
    let storagePath = `${userId}/${uniqueFileName}`;

    let audioUrl = '';
    let coverUrl = metadata.artworkUrl || '';

    if (onProgress) onProgress(15);

    // 2. Upload Audio File to "music" bucket
    // IMPORTANT: Use upsert: false. When upsert: true is used, Supabase Storage evaluates
    // the UPDATE policy on storage.objects in addition to INSERT, which triggers
    // "new row violates row-level security policy" if an UPDATE policy is not defined.
    // Since uniqueFileName already contains Date.now(), collisions never occur.
    let uploadRes = await client.storage
      .from(BUCKET_MUSIC)
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: mimeType,
      });

    let uploadError = uploadRes.error;

    // Intelligent auto-recovery for Storage RLS & path constraints
    if (uploadError) {
      const errLower = uploadError.message?.toLowerCase() || '';
      const isRls =
        errLower.includes('row-level security') ||
        errLower.includes('policy') ||
        errLower.includes('accessdenied') ||
        errLower.includes('permission denied') ||
        (uploadError as { statusCode?: string | number })?.statusCode === 403 ||
        (uploadError as { statusCode?: string | number })?.statusCode === '403';

      if (isRls) {
        // Recovery Attempt 1: Try anonymous session if enabled on the Supabase project
        try {
          const authRes = await client.auth.signInAnonymously();
          if (authRes?.data?.user?.id) {
            userId = authRes.data.user.id;
            const authStoragePath = `${userId}/${uniqueFileName}`;
            const retryAuth = await client.storage
              .from(BUCKET_MUSIC)
              .upload(authStoragePath, file, {
                cacheControl: '3600',
                upsert: false,
                contentType: mimeType,
              });

            if (!retryAuth.error) {
              uploadError = null;
              storagePath = authStoragePath;
            }
          }
        } catch {
          // Anonymous sign-in not enabled on project, proceed to attempt 2
        }

        // Recovery Attempt 2: Try flat root path in bucket in case RLS policy restricts folder names
        if (uploadError) {
          const flatPath = uniqueFileName;
          const retryFlat = await client.storage
            .from(BUCKET_MUSIC)
            .upload(flatPath, file, {
              cacheControl: '3600',
              upsert: false,
              contentType: mimeType,
            });

          if (!retryFlat.error) {
            uploadError = null;
            storagePath = flatPath;
          }
        }
      }
    }

    // Diagnose and handle bucket creation / lookup / RLS policy error
    if (uploadError) {
      const errStatus = (uploadError as { statusCode?: number | string })?.statusCode;
      const parsedStatus = typeof errStatus === 'string' ? parseInt(errStatus, 10) : errStatus;

      logSupabaseError('uploadMusicFile.storage', {
        errorMessage: uploadError.message,
        errorCode: (uploadError as { error?: string })?.error || uploadError.name,
        bucket: BUCKET_MUSIC,
        fileName: file.name,
        uploadPath: storagePath,
        httpStatus: parsedStatus,
        raw: uploadError,
      });

      const errLower = uploadError.message?.toLowerCase() || '';

      if (
        errLower.includes('exceeded the maximum allowed size') ||
        errLower.includes('entitytoolarge') ||
        errLower.includes('too large') ||
        parsedStatus === 413
      ) {
        throw new Error(
          `Upload failed: Audio file (${formatBytes(file.size)}) exceeds the maximum allowed upload size in Supabase Storage (HTTP 413 EntityTooLarge). Supabase Free Tier caps files at 50MB. Click "Save to Local Library Instead" to play and visualize this song immediately, or remove the bucket limit in Supabase.`
        );
      }

      if (errLower.includes('bucket not found') || errLower.includes('does not exist')) {
        throw new Error(
          `Upload failed: Storage bucket "${BUCKET_MUSIC}" does not exist in your Supabase project. Please create a public bucket named "${BUCKET_MUSIC}" in your Supabase Dashboard -> Storage.`
        );
      }

      if (
        errLower.includes('row-level security') ||
        errLower.includes('policy') ||
        errLower.includes('permission denied') ||
        errLower.includes('unauthorized') ||
        parsedStatus === 403 ||
        parsedStatus === 401
      ) {
        throw new Error(
          `Upload failed: Permission denied by Supabase Storage RLS policy. The "${BUCKET_MUSIC}" bucket requires an INSERT policy for public/anon access. Run the 1-click Storage Fix SQL in Cloud Settings.`
        );
      }

      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    if (onProgress) onProgress(65);

    // 3. Confirm upload succeeded and obtain public URL
    const { data: publicUrlData } = client.storage
      .from(BUCKET_MUSIC)
      .getPublicUrl(storagePath);

    audioUrl = publicUrlData?.publicUrl || '';
    if (!audioUrl) {
      throw new Error('Upload failed: Could not retrieve public URL for uploaded audio file.');
    }

    // 4. Upload Artwork if present (upsert: false)
    if (metadata.artworkBlob && !metadata.artworkUrl?.startsWith('data:')) {
      try {
        const artworkPath = `${userId}/covers/${uniqueId}.jpg`;
        const { error: artError } = await client.storage
          .from(BUCKET_ARTWORK)
          .upload(artworkPath, metadata.artworkBlob, {
            cacheControl: '3600',
            upsert: false,
            contentType: 'image/jpeg',
          });

        if (!artError) {
          const { data: artPublicUrl } = client.storage
            .from(BUCKET_ARTWORK)
            .getPublicUrl(artworkPath);
          coverUrl = artPublicUrl?.publicUrl || '';
        } else {
          logSupabaseError('uploadMusicFile.artwork', {
            errorMessage: artError.message,
            bucket: BUCKET_ARTWORK,
            fileName: file.name,
            uploadPath: artworkPath,
            raw: artError,
          });
        }
      } catch (err) {
        console.warn('Artwork upload skipped:', err);
      }
    }

    if (onProgress) onProgress(85);

    // 5. Insert metadata row into Supabase database table
    // Accommodates both column naming conventions (storage_path & file_path, public_url & audio_url, cover_url & artwork_url, etc.)
    const songPayload: Record<string, unknown> = {
      title: metadata.title.trim() || file.name.replace(/\.[^/.]+$/, ''),
      artist: metadata.artist.trim() || 'Unknown Artist',
      album: metadata.album.trim() || 'Single',
      genre: metadata.genre.trim() || 'Music',
      duration: Math.round(metadata.duration) || 0,
      file_name: file.name,
      file_path: storagePath,
      storage_path: storagePath,
      file_size: file.size,
      file_type: mimeType,
      audio_url: audioUrl,
      public_url: audioUrl,
      cover_url: coverUrl,
      artwork_url: coverUrl,
      file_hash: metadata.fileHash || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    let insertedData: Record<string, unknown> | null = null;
    const currentPayload: Record<string, unknown> = { ...songPayload };
    let lastDbError: { message: string; code?: string } | null = null;

    // Resilient schema adaptation loop:
    // User database schemas may differ (e.g. some have cover_url but not artwork_url,
    // or file_path but not storage_path). When PostgREST returns PGRST204 or PostgreSQL
    // returns 42703, we detect the missing column, remove it from the payload, and retry.
    for (let attempt = 0; attempt < 12; attempt++) {
      const dbRes = await client
        .from('songs')
        .insert(currentPayload)
        .select()
        .single();

      if (!dbRes.error) {
        insertedData = dbRes.data as Record<string, unknown>;
        break;
      }

      const dbError = dbRes.error;
      lastDbError = dbError;
      const dbErrLower = dbError.message?.toLowerCase() || '';

      // Check if table missing
      if (dbError.code === '42P01' || dbErrLower.includes('relation "public.songs" does not exist')) {
        logSupabaseError('uploadMusicFile.database_missing_table', {
          errorMessage: dbError.message,
          errorCode: dbError.code,
          fileName: file.name,
          uploadPath: storagePath,
          raw: dbError,
        });
        throw new Error(
          'Upload failed: Database table "songs" does not exist in your Supabase project. Please run the SQL setup script from Cloud Settings.'
        );
      }

      // Check RLS permission error
      if (
        dbError.code === '42501' ||
        dbErrLower.includes('row-level security') ||
        dbErrLower.includes('permission denied')
      ) {
        logSupabaseError('uploadMusicFile.database_rls', {
          errorMessage: dbError.message,
          errorCode: dbError.code,
          fileName: file.name,
          uploadPath: storagePath,
          raw: dbError,
        });
        throw new Error(
          'Upload failed: Permission denied by database RLS policy on "songs" table. Please enable public insert policy (see Cloud Settings SQL script).'
        );
      }

      // Detect missing column from error message:
      // PostgREST: "Could not find the 'artwork_url' column of 'songs' in the schema cache" (code PGRST204)
      // Postgres: "column "artwork_url" does not exist" (code 42703)
      const missingColumn = extractMissingColumn(dbError.message, currentPayload);

      if (missingColumn) {
        console.warn(`[JTEC MUSIC] Adapting to user schema: column '${missingColumn}' not found in 'songs' table. Retrying...`);
        delete currentPayload[missingColumn];
        continue;
      }

      // If we could not identify a specific column to strip, log and break
      logSupabaseError('uploadMusicFile.database_unhandled', {
        errorMessage: dbError.message,
        errorCode: dbError.code,
        fileName: file.name,
        uploadPath: storagePath,
        raw: dbError,
      });
      break;
    }

    if (!insertedData && lastDbError) {
      logSupabaseError('uploadMusicFile.database_failed', {
        errorMessage: lastDbError.message,
        errorCode: lastDbError.code,
        fileName: file.name,
        uploadPath: storagePath,
        raw: lastDbError,
      });
      throw new Error(`Upload failed: Database record creation error: ${lastDbError.message}`);
    }

    if (onProgress) onProgress(100);

    const createdSong: CloudSong = {
      id: String(insertedData?.id || uniqueId),
      title: String(insertedData?.title || songPayload.title),
      artist: String(insertedData?.artist || songPayload.artist),
      album: String(insertedData?.album || songPayload.album),
      genre: String(insertedData?.genre || songPayload.genre),
      duration: Number(insertedData?.duration || songPayload.duration),
      file_name: String(insertedData?.file_name || songPayload.file_name),
      file_path: String(insertedData?.storage_path || insertedData?.file_path || storagePath),
      file_size: Number(insertedData?.file_size || songPayload.file_size),
      audio_url: String(insertedData?.public_url || insertedData?.audio_url || audioUrl),
      cover_url: String(insertedData?.artwork_url || insertedData?.cover_url || coverUrl),
      file_hash: String(insertedData?.file_hash || songPayload.file_hash || ''),
      created_at: String(insertedData?.created_at || songPayload.created_at),
    };

    return createdSong;
  },

  /**
   * Deletes a song from the Supabase database and removes its storage file.
   */
  async deleteSongFromCloud(song: CloudSong): Promise<void> {
    const client = this.getClient();
    if (!client) {
      throw new Error('Supabase is not configured.');
    }

    // 1. Delete storage file if path exists
    if (song.file_path) {
      try {
        await client.storage.from(BUCKET_MUSIC).remove([song.file_path]);
      } catch (e) {
        logSupabaseError('deleteSongFromCloud.storage', {
          errorMessage: e instanceof Error ? e.message : 'Storage remove error',
          bucket: BUCKET_MUSIC,
          uploadPath: song.file_path,
          raw: e,
        });
      }
    }

    // 2. Delete database record
    const { error } = await client.from('songs').delete().eq('id', song.id);
    if (error) {
      logSupabaseError('deleteSongFromCloud.database', {
        errorMessage: error.message,
        errorCode: error.code,
        raw: error,
      });
      throw new Error(`Failed to delete cloud track: ${error.message}`);
    }
  },

  /**
   * Downloads a song from Supabase Cloud to local device storage (IndexedDB).
   * Once downloaded, the song is playable completely offline without internet!
   */
  async downloadForOffline(
    cloudSong: CloudSong,
    onProgress?: (percent: number) => void
  ): Promise<{ song: Song; blob: Blob }> {
    if (onProgress) onProgress(20);

    // Fetch the binary audio blob from Supabase audio_url
    const response = await fetch(cloudSong.audio_url);
    if (!response.ok) {
      throw new Error(`Could not download audio from cloud (HTTP ${response.status})`);
    }

    if (onProgress) onProgress(60);
    const audioBlob = await response.blob();
    if (onProgress) onProgress(90);

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

  /**
   * Calculates real storage stats from actual file records.
   */
  calculateStorageStats(
    cloudSongs: CloudSong[],
    offlineSongsCount: number,
    offlineBytes: number,
    playlistCount = 0,
    favoriteCount = 0,
    customMaxBytes: number = DEFAULT_MAX_CLOUD_BYTES
  ): CloudStorageStats {
    let totalCloudBytes = 0;
    for (const song of cloudSongs) {
      totalCloudBytes += Number(song.file_size) || 0;
    }

    const maxBytes = customMaxBytes > 0 ? customMaxBytes : DEFAULT_MAX_CLOUD_BYTES;
    const availableBytes = Math.max(0, maxBytes - totalCloudBytes);
    const usagePercentage = Math.min(100, Math.round((totalCloudBytes / maxBytes) * 100));

    return {
      totalSongs: cloudSongs.length,
      usedBytes: totalCloudBytes,
      maxBytes,
      availableBytes,
      usagePercentage,
      offlineSongsCount,
      offlineBytes,
      playlistCount,
      favoriteCount,
    };
  },
};

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
 * Computes a fast, reliable SHA-256 cryptographic fingerprint for duplicate detection.
 */
export async function computeFileHash(file: File | Blob): Promise<string> {
  try {
    const sliceSize = 256 * 1024; // 256KB sample
    let buffer: ArrayBuffer;
    if (file.size <= sliceSize * 2) {
      buffer = await file.arrayBuffer();
    } else {
      const start = file.slice(0, sliceSize);
      const end = file.slice(file.size - sliceSize, file.size);
      const [buf1, buf2] = await Promise.all([start.arrayBuffer(), end.arrayBuffer()]);
      const combined = new Uint8Array(buf1.byteLength + buf2.byteLength);
      combined.set(new Uint8Array(buf1), 0);
      combined.set(new Uint8Array(buf2), buf1.byteLength);
      buffer = combined.buffer;
    }
    const hashBuf = await crypto.subtle.digest('SHA-256', buffer);
    const hashArr = Array.from(new Uint8Array(hashBuf));
    const hex = hashArr.map((b) => b.toString(16).padStart(2, '0')).join('');
    return `${file.size}-${hex.substring(0, 24)}`;
  } catch {
    return `${file.size}-${(file as File).name || 'audio'}`;
  }
}

/**
 * Returns accurate audio MIME type based on file extension and browser detection.
 * Supports: audio/mpeg, audio/wav, audio/mp4, audio/aac, audio/ogg, audio/flac, audio/webm.
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
 * Supabase SQL setup script with all required columns and comprehensive RLS policies.
 */
export const SUPABASE_SQL_SETUP = `-- ==============================================================================
-- JTEC MUSIC — SUPABASE DATABASE & STORAGE INITIALIZATION SCRIPT
-- ==============================================================================
-- Run this script in your Supabase SQL Editor (Dashboard -> SQL Editor -> New Query).
-- It creates the 'songs' table with all required fields, performance indexes,
-- public Storage buckets ('music' and 'artwork'), and Row Level Security policies.
-- ==============================================================================

-- 1. Create the songs table with both storage_path/file_path and public_url/audio_url support
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

-- Safe column migrations for existing 'songs' tables (adds any missing columns without data loss)
alter table public.songs add column if not exists storage_path text not null default '';
alter table public.songs add column if not exists file_path text not null default '';
alter table public.songs add column if not exists public_url text not null default '';
alter table public.songs add column if not exists audio_url text not null default '';
alter table public.songs add column if not exists artwork_url text;
alter table public.songs add column if not exists cover_url text;
alter table public.songs add column if not exists file_type text default 'audio/mpeg';
alter table public.songs add column if not exists genre text default 'Music';
alter table public.songs add column if not exists file_hash text;
alter table public.songs add column if not exists updated_at timestamp with time zone default timezone('utc'::text, now()) not null;

-- 2. Indexes for fast search, duplicate detection, and chronological sorting
create index if not exists idx_songs_file_hash on public.songs (file_hash);
create index if not exists idx_songs_created_at on public.songs (created_at desc);
create index if not exists idx_songs_title on public.songs (title);
create index if not exists idx_songs_artist on public.songs (artist);

-- 3. Enable Row Level Security (RLS)
alter table public.songs enable row level security;

-- 4. Define public RLS policies
drop policy if exists "Allow public read on songs" on public.songs;
create policy "Allow public read on songs"
  on public.songs for select
  using (true);

drop policy if exists "Allow public insert on songs" on public.songs;
create policy "Allow public insert on songs"
  on public.songs for insert
  with check (true);

drop policy if exists "Allow public update on songs" on public.songs;
create policy "Allow public update on songs"
  on public.songs for update
  using (true)
  with check (true);

drop policy if exists "Allow public delete on songs" on public.songs;
create policy "Allow public delete on songs"
  on public.songs for delete
  using (true);

-- 5. Storage Buckets (creates dedicated public buckets with no bucket-level size limits)
insert into storage.buckets (id, name, public, file_size_limit)
values ('music', 'music', true, null)
on conflict (id) do update set public = true, file_size_limit = null;

insert into storage.buckets (id, name, public, file_size_limit)
values ('artwork', 'artwork', true, null)
on conflict (id) do update set public = true, file_size_limit = null;

-- 6. Storage Access Policies for 'music' bucket (explicitly granted TO public)
drop policy if exists "Public Access music" on storage.objects;
create policy "Public Access music"
  on storage.objects for select
  to public
  using (bucket_id = 'music');

drop policy if exists "Public Upload music" on storage.objects;
create policy "Public Upload music"
  on storage.objects for insert
  to public
  with check (bucket_id = 'music');

drop policy if exists "Public Update music" on storage.objects;
create policy "Public Update music"
  on storage.objects for update
  to public
  using (bucket_id = 'music')
  with check (bucket_id = 'music');

drop policy if exists "Public Delete music" on storage.objects;
create policy "Public Delete music"
  on storage.objects for delete
  to public
  using (bucket_id = 'music');

-- 7. Storage Access Policies for 'artwork' bucket
drop policy if exists "Public Access artwork" on storage.objects;
create policy "Public Access artwork"
  on storage.objects for select
  to public
  using (bucket_id = 'artwork');

drop policy if exists "Public Upload artwork" on storage.objects;
create policy "Public Upload artwork"
  on storage.objects for insert
  to public
  with check (bucket_id = 'artwork');

drop policy if exists "Public Update artwork" on storage.objects;
create policy "Public Update artwork"
  on storage.objects for update
  to public
  using (bucket_id = 'artwork')
  with check (bucket_id = 'artwork');

drop policy if exists "Public Delete artwork" on storage.objects;
create policy "Public Delete artwork"
  on storage.objects for delete
  to public
  using (bucket_id = 'artwork');
`;

/**
 * 1-click SQL statement snippet to quickly resolve Supabase Storage RLS upload policy errors.
 */
export const SUPABASE_STORAGE_FIX_SQL = `-- Run in Supabase SQL Editor to allow music uploads to the 'music' bucket:
insert into storage.buckets (id, name, public, file_size_limit) values ('music', 'music', true, null) on conflict (id) do update set public = true, file_size_limit = null;
update storage.buckets set file_size_limit = null where id = 'music';
drop policy if exists "Public Upload music" on storage.objects;
create policy "Public Upload music" on storage.objects for insert to public with check (bucket_id = 'music');
drop policy if exists "Public Update music" on storage.objects;
create policy "Public Update music" on storage.objects for update to public using (bucket_id = 'music') with check (bucket_id = 'music');
drop policy if exists "Public Access music" on storage.objects;
create policy "Public Access music" on storage.objects for select to public using (bucket_id = 'music');
`;

/**
 * 1-click SQL statement snippet to remove file size limits on the 'music' bucket.
 */
export const SUPABASE_STORAGE_SIZE_FIX_SQL = `-- Run in Supabase SQL Editor to remove file size limit on 'music' bucket:
update storage.buckets set file_size_limit = null where id = 'music';
`;


