import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CloudSong, CloudStorageStats, Song } from '../types/music';

// Storage Bucket Names
export const BUCKET_MUSIC = 'music';
export const BUCKET_ARTWORK = 'artwork';

// Default free tier cloud storage quota (1 GB = 1073741824 bytes)
export const DEFAULT_MAX_CLOUD_BYTES = 1073741824;

const LS_KEY_URL = 'jtec_supabase_url';
const LS_KEY_KEY = 'jtec_supabase_anon_key';
const LS_KEY_CLOUD_STORE = 'jtec_cloud_local_store';

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

let cachedClient: SupabaseClient | null = null;
let currentClientConfig = { url: '', anonKey: '' };

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
    cachedClient = null; // force client recreation
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
          persistSession: true,
          autoRefreshToken: true,
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
      const client = createClient(testUrl, testKey);

      // Check table query
      const { data: tableData, error: tableError } = await client
        .from('songs')
        .select('id')
        .limit(1);

      let tableExists = !tableError;

      // Check storage buckets
      const { data: buckets, error: bucketError } = await client.storage.listBuckets();
      const hasMusicBucket = Boolean(buckets?.some((b) => b.name === BUCKET_MUSIC));
      const bucketsExist = Boolean(!bucketError && hasMusicBucket);

      if (tableError && tableError.code === '42P01') {
        // Table does not exist yet
        return {
          success: true,
          message: 'Connected to Supabase! The "songs" table has not been created yet. Run the SQL schema to create it.',
          tableExists: false,
          bucketsExist,
        };
      }

      if (tableError) {
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
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Connection failed.',
        tableExists: false,
        bucketsExist: false,
      };
    }
  },

  /**
   * Fetches all cloud music tracks from the Supabase "songs" table.
   * Real data only: returns empty array if credentials not set or no tracks uploaded.
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
        console.warn('Error fetching cloud songs from Supabase:', error.message);
        return [];
      }

      const songs: CloudSong[] = (data || []).map((row) => ({
        id: row.id,
        title: row.title || 'Untitled',
        artist: row.artist || 'Unknown Artist',
        album: row.album || 'Single',
        genre: row.genre || 'Music',
        duration: Number(row.duration) || 0,
        file_name: row.file_name || 'track.mp3',
        file_path: row.file_path || '',
        file_size: Number(row.file_size) || 0,
        audio_url: row.audio_url || '',
        cover_url: row.cover_url || '',
        file_hash: row.file_hash || '',
        created_at: row.created_at || new Date().toISOString(),
        updated_at: row.updated_at,
      }));

      return songs;
    } catch (err) {
      console.warn('Network exception fetching cloud songs:', err);
      return [];
    }
  },

  /**
   * Checks whether a song with the same hash or matching metadata already exists in the cloud.
   */
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
   * 1. Uploads file to "music" bucket in Supabase Storage with accurate MIME type.
   * 2. Optionally uploads artwork to "artwork" bucket.
   * 3. Inserts metadata row into "songs" table with real file_size in bytes.
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

    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniqueId = `song_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    // Organized storage path: tracks/{songId}/{filename}
    const storagePath = `tracks/${uniqueId}/${sanitizedFileName}`;

    let audioUrl = '';
    let coverUrl = metadata.artworkUrl || '';

    if (onProgress) onProgress(15);

    // Detect proper audio MIME type
    const mimeType = getAudioMimeType(file.name, file.type);

    // 1. Upload Audio File to "music" bucket
    let { error: uploadError } = await client.storage
      .from(BUCKET_MUSIC)
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: true,
        contentType: mimeType,
      });

    // Auto-create bucket if it doesn't exist
    if (uploadError && uploadError.message?.toLowerCase().includes('bucket not found')) {
      try {
        const { error: createBucketError } = await client.storage.createBucket(BUCKET_MUSIC, { public: true });
        if (!createBucketError) {
          const retry = await client.storage
            .from(BUCKET_MUSIC)
            .upload(storagePath, file, {
              cacheControl: '3600',
              upsert: true,
              contentType: mimeType,
            });
          uploadError = retry.error;
        }
      } catch {
        // proceed to check uploadError below
      }
    }

    if (uploadError) {
      if (uploadError.message?.toLowerCase().includes('bucket not found')) {
        throw new Error(
          'Bucket "music" was not found in your Supabase project. Please create a public bucket named "music" in Supabase Storage or run the SQL setup script in Cloud Settings.'
        );
      }
      throw new Error(`Cloud storage upload failed: ${uploadError.message}`);
    }

    if (onProgress) onProgress(65);

    // Obtain public audio URL
    const { data: publicUrlData } = client.storage
      .from(BUCKET_MUSIC)
      .getPublicUrl(storagePath);
    audioUrl = publicUrlData?.publicUrl || '';

    // 2. Upload Artwork (if a custom binary blob exists)
    if (metadata.artworkBlob && !metadata.artworkUrl?.startsWith('data:')) {
      try {
        const artworkPath = `covers/${uniqueId}.jpg`;
        const { error: artError } = await client.storage
          .from(BUCKET_ARTWORK)
          .upload(artworkPath, metadata.artworkBlob, {
            cacheControl: '3600',
            upsert: true,
            contentType: 'image/jpeg',
          });

        if (!artError) {
          const { data: artPublicUrl } = client.storage
            .from(BUCKET_ARTWORK)
            .getPublicUrl(artworkPath);
          coverUrl = artPublicUrl?.publicUrl || '';
        }
      } catch (err) {
        console.warn('Artwork upload skipped:', err);
      }
    }

    if (onProgress) onProgress(85);

    // 3. Insert into Supabase "songs" table
    const songPayload: Record<string, unknown> = {
      title: metadata.title.trim() || file.name,
      artist: metadata.artist.trim() || 'Unknown Artist',
      album: metadata.album.trim() || 'Single',
      genre: metadata.genre.trim() || 'Music',
      duration: Math.round(metadata.duration) || 0,
      file_name: file.name,
      file_path: storagePath,
      file_size: file.size, // Real byte count
      audio_url: audioUrl,
      cover_url: coverUrl,
      file_hash: metadata.fileHash || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    let insertedData: Record<string, unknown> | null = null;
    const { data: dbData, error: dbError } = await client
      .from('songs')
      .insert(songPayload)
      .select()
      .single();

    if (dbError) {
      if (dbError.code === '42P01') {
        throw new Error(
          'The "songs" table does not exist in your Supabase database. Please copy and run the SQL setup script from Cloud Settings in your Supabase SQL Editor.'
        );
      }
      if (dbError.message?.toLowerCase().includes('file_hash')) {
        const { file_hash, ...fallbackPayload } = songPayload;
        const retry = await client
          .from('songs')
          .insert(fallbackPayload)
          .select()
          .single();
        if (retry.error) {
          throw new Error(`Database record creation failed: ${retry.error.message}`);
        }
        insertedData = retry.data as Record<string, unknown>;
      } else {
        throw new Error(`Database record creation failed: ${dbError.message}`);
      }
    } else {
      insertedData = dbData as Record<string, unknown>;
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
      file_path: String(insertedData?.file_path || songPayload.file_path),
      file_size: Number(insertedData?.file_size || songPayload.file_size),
      audio_url: String(insertedData?.audio_url || songPayload.audio_url),
      cover_url: String(insertedData?.cover_url || songPayload.cover_url || ''),
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
        console.warn('Could not remove file from bucket:', e);
      }
    }

    // 2. Delete database record
    const { error } = await client.from('songs').delete().eq('id', song.id);
    if (error) {
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
 */
export function getAudioMimeType(fileName: string, detectedType?: string): string {
  if (detectedType && detectedType.startsWith('audio/')) return detectedType;
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'mp3': return 'audio/mpeg';
    case 'wav': return 'audio/wav';
    case 'm4a': return 'audio/mp4';
    case 'aac': return 'audio/aac';
    case 'ogg': return 'audio/ogg';
    case 'flac': return 'audio/flac';
    case 'webm': return 'audio/webm';
    default: return detectedType || 'audio/mpeg';
  }
}

/**
 * Supabase SQL setup script that users can copy to create the database table
 * and RLS policies in one click.
 */
export const SUPABASE_SQL_SETUP = `-- JTEC MUSIC: Supabase Database & Storage Complete Setup
-- Copy and run this in your Supabase SQL Editor:

-- 1. Create songs table
create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist text default 'Unknown Artist',
  album text default 'Single',
  genre text default 'Music',
  duration numeric default 0,
  file_name text not null,
  file_path text not null,
  file_size bigint not null default 0,
  audio_url text not null,
  cover_url text,
  file_hash text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Performance Indexes
create index if not exists songs_file_hash_idx on public.songs (file_hash);
create index if not exists songs_created_at_idx on public.songs (created_at desc);
create index if not exists songs_title_idx on public.songs (title);
create index if not exists songs_artist_idx on public.songs (artist);

-- 3. Row Level Security (RLS)
alter table public.songs enable row level security;

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

-- 4. Storage Buckets (creates public buckets)
insert into storage.buckets (id, name, public)
values ('music', 'music', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('artwork', 'artwork', true)
on conflict (id) do nothing;

-- 5. Storage Access Policies
drop policy if exists "Public Access music" on storage.objects;
create policy "Public Access music" on storage.objects for select using (bucket_id = 'music');

drop policy if exists "Public Upload music" on storage.objects;
create policy "Public Upload music" on storage.objects for insert with check (bucket_id = 'music');

drop policy if exists "Public Delete music" on storage.objects;
create policy "Public Delete music" on storage.objects for delete using (bucket_id = 'music');

drop policy if exists "Public Access artwork" on storage.objects;
create policy "Public Access artwork" on storage.objects for select using (bucket_id = 'artwork');

drop policy if exists "Public Upload artwork" on storage.objects;
create policy "Public Upload artwork" on storage.objects for insert with check (bucket_id = 'artwork');
`;
