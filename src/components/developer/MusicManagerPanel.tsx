import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Music, Upload, Trash2, Edit2, RefreshCw, AlertCircle, 
  CheckCircle2, Search, Image as ImageIcon, FileAudio, 
  ShieldCheck, Lock, X, Check, ArrowUpRight, Play, Sparkles
} from 'lucide-react';
import { 
  SupabaseClient 
} from '@supabase/supabase-js';
import { 
  SupabaseService, 
  CloudCategoryKey, 
  CLOUD_CATEGORIES, 
  BUCKET_MUSIC, 
  BUCKET_ARTWORK,
  sanitizeSecretText 
} from '../../services/supabase';
import { 
  assertActiveAdminSession 
} from '../../services/adminAuth';
import { 
  extractAudioMetadata, 
  ExtractedMetadata 
} from '../../services/id3Parser';
import { 
  resizeImageToJpegDataUrl 
} from '../../services/imageUtils';
import { CloudSong } from '../../types/music';

interface MusicManagerPanelProps {
  adminClient: SupabaseClient | null;
  onUnauthorized: () => void;
}

export const MusicManagerPanel: React.FC<MusicManagerPanelProps> = ({ adminClient, onUnauthorized }) => {
  const [activeCategory, setActiveCategory] = useState<CloudCategoryKey>('jtec_main');
  const [songs, setSongs] = useState<CloudSong[]>([]);
  const [isLoadingSongs, setIsLoadingSongs] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Upload Modal State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [audioFileToUpload, setAudioFileToUpload] = useState<File | null>(null);
  const [coverFileToUpload, setCoverFileToUpload] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadArtist, setUploadArtist] = useState('');
  const [uploadAlbum, setUploadAlbum] = useState('');
  const [uploadGenre, setUploadGenre] = useState('');
  const [uploadDuration, setUploadDuration] = useState(0);
  const [previewCoverUrl, setPreviewCoverUrl] = useState<string>('');
  const [isAnalyzingAudio, setIsAnalyzingAudio] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState('');

  // Edit Metadata Modal State
  const [editingSong, setEditingSong] = useState<CloudSong | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editArtist, setEditArtist] = useState('');
  const [editAlbum, setEditAlbum] = useState('');
  const [editGenre, setEditGenre] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Delete Confirmation State
  const [songToDelete, setSongToDelete] = useState<CloudSong | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Replace Audio / Cover States
  const [replacingSongAudio, setReplacingSongAudio] = useState<CloudSong | null>(null);
  const [replacingSongCover, setReplacingSongCover] = useState<CloudSong | null>(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);

  const audioFileInputRef = useRef<HTMLInputElement>(null);
  const coverFileInputRef = useRef<HTMLInputElement>(null);
  const replaceAudioInputRef = useRef<HTMLInputElement>(null);
  const replaceCoverInputRef = useRef<HTMLInputElement>(null);

  const categoryConfig = SupabaseService.getCategoryConfig(activeCategory);
  const activeMeta = CLOUD_CATEGORIES.find((c) => c.key === activeCategory);

  const loadCatalogSongs = useCallback(async () => {
    setIsLoadingSongs(true);
    setErrorMsg(null);
    try {
      const fetched = await SupabaseService.fetchSongsForCategory(activeCategory);
      setSongs(fetched);
    } catch (err: any) {
      setErrorMsg(sanitizeSecretText(err?.message || `Failed to load ${activeMeta?.title || activeCategory} tracks.`));
      setSongs([]);
    } finally {
      setIsLoadingSongs(false);
    }
  }, [activeCategory, activeMeta]);

  useEffect(() => {
    loadCatalogSongs();
  }, [loadCatalogSongs]);

  // Handle Audio File Selection & ID3 Extraction for Upload
  const handleAudioFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAudioFileToUpload(file);
    setIsAnalyzingAudio(true);
    setErrorMsg(null);

    try {
      const meta: ExtractedMetadata = await extractAudioMetadata(file);
      setUploadTitle(meta.title || file.name.replace(/\.[^/.]+$/, ''));
      setUploadArtist(meta.artist || 'Unknown Artist');
      setUploadAlbum(meta.album || 'Single');
      setUploadDuration(meta.duration || 0);
      setUploadGenre(activeCategory === 'nasheed' ? 'Nasheed' : activeCategory === 'love_chill' ? 'Chill' : 'Super Bass');
      if (meta.artworkUrl) {
        setPreviewCoverUrl(meta.artworkUrl);
      }
    } catch (err: any) {
      setErrorMsg('Could not parse audio metadata. You can enter details manually.');
      setUploadTitle(file.name.replace(/\.[^/.]+$/, ''));
      setUploadArtist('Unknown Artist');
      setUploadAlbum('Single');
      setUploadDuration(0);
    } finally {
      setIsAnalyzingAudio(false);
    }
  };

  // Handle Cover Image Selection for Upload
  const handleCoverFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverFileToUpload(file);
    try {
      const dataUrl = await resizeImageToJpegDataUrl(file, 512, 0.85);
      setPreviewCoverUrl(dataUrl);
    } catch (err) {
      setErrorMsg('Could not process cover image.');
    }
  };

  // Execute Upload to Supabase Storage & Database
  const handleExecuteUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!audioFileToUpload || !uploadTitle.trim()) {
      setErrorMsg('Please select an audio file and enter a song title.');
      return;
    }

    setIsUploading(true);
    setErrorMsg(null);
    setUploadProgressText('Verifying admin session...');

    try {
      const authCheck = await assertActiveAdminSession(adminClient);
      if (!authCheck.ok) {
        onUnauthorized();
        throw new Error(authCheck.reason || 'Admin session expired or missing AAL2 2FA.');
      }

      const client = SupabaseService.getClientForCategory(activeCategory);
      if (!client) {
        throw new Error(`Supabase project for ${activeCategory} is not configured.`);
      }

      const timestamp = Date.now();
      const cleanAudioName = audioFileToUpload.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
      const audioStoragePath = `tracks/${timestamp}_${cleanAudioName}`;

      setUploadProgressText('Uploading audio file to storage...');
      const { error: audioUploadErr } = await client.storage
        .from(categoryConfig.bucket || BUCKET_MUSIC)
        .upload(audioStoragePath, audioFileToUpload, {
          cacheControl: '3600',
          upsert: false,
        });

      if (audioUploadErr) {
        throw new Error(`Audio storage upload failed: ${audioUploadErr.message}`);
      }

      // Get Public URL for audio
      const { data: audioPublicUrlData } = client.storage
        .from(categoryConfig.bucket || BUCKET_MUSIC)
        .getPublicUrl(audioStoragePath);
      const audioPublicUrl = audioPublicUrlData?.publicUrl || '';

      let artworkPublicUrl = previewCoverUrl;

      // If a separate cover image was uploaded or extracted, upload to artwork bucket
      if (coverFileToUpload) {
        setUploadProgressText('Uploading cover artwork to storage...');
        const coverStoragePath = `covers/${timestamp}_cover.jpg`;
        const { error: coverUploadErr } = await client.storage
          .from(BUCKET_ARTWORK)
          .upload(coverStoragePath, coverFileToUpload, {
            cacheControl: '3600',
            upsert: true,
          });

        if (!coverUploadErr) {
          const { data: coverUrlData } = client.storage
            .from(BUCKET_ARTWORK)
            .getPublicUrl(coverStoragePath);
          if (coverUrlData?.publicUrl) {
            artworkPublicUrl = coverUrlData.publicUrl;
          }
        }
      }

      setUploadProgressText('Inserting song record into database...');
      const { error: dbInsertErr } = await client
        .from(categoryConfig.tableName || 'songs')
        .insert({
          title: uploadTitle.trim(),
          artist: uploadArtist.trim() || 'Unknown Artist',
          album: uploadAlbum.trim() || 'Single',
          genre: uploadGenre.trim() || 'Music',
          duration: uploadDuration || 0,
          file_name: audioFileToUpload.name,
          file_path: audioStoragePath,
          file_size: audioFileToUpload.size,
          audio_url: audioPublicUrl,
          artwork_url: artworkPublicUrl,
          file_hash: `sha256_${timestamp}`,
        });

      if (dbInsertErr) {
        // Cleanup uploaded audio if database insert failed
        await client.storage.from(categoryConfig.bucket || BUCKET_MUSIC).remove([audioStoragePath]).catch(() => {});
        throw new Error(`Database insert failed: ${dbInsertErr.message}`);
      }

      setSuccessMsg(`Successfully uploaded "${uploadTitle}" to ${activeMeta?.title || activeCategory}!`);
      setShowUploadModal(false);
      setAudioFileToUpload(null);
      setCoverFileToUpload(null);
      setUploadTitle('');
      setUploadArtist('');
      setUploadAlbum('');
      setPreviewCoverUrl('');
      loadCatalogSongs();
    } catch (err: any) {
      setErrorMsg(sanitizeSecretText(err?.message || 'Upload failed.'));
    } finally {
      setIsUploading(false);
      setUploadProgressText('');
    }
  };

  // Save Edit Metadata
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSong || !editTitle.trim()) return;

    setIsSavingEdit(true);
    setErrorMsg(null);

    try {
      const authCheck = await assertActiveAdminSession(adminClient);
      if (!authCheck.ok) {
        onUnauthorized();
        throw new Error(authCheck.reason || 'Admin session expired.');
      }

      const client = SupabaseService.getClientForCategory(activeCategory);
      if (!client) throw new Error('Client unavailable.');

      const { error } = await client
        .from(categoryConfig.tableName || 'songs')
        .update({
          title: editTitle.trim(),
          artist: editArtist.trim() || 'Unknown Artist',
          album: editAlbum.trim() || 'Single',
          genre: editGenre.trim() || 'Music',
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingSong.id);

      if (error) throw new Error(error.message);

      setSuccessMsg(`Successfully updated metadata for "${editTitle}".`);
      setEditingSong(null);
      loadCatalogSongs();
    } catch (err: any) {
      setErrorMsg(sanitizeSecretText(err?.message || 'Failed to update song metadata.'));
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Replace Audio File for Existing Song
  const handleReplaceAudioFile = async (song: CloudSong, file: File) => {
    setIsProcessingFile(true);
    setErrorMsg(null);
    try {
      const authCheck = await assertActiveAdminSession(adminClient);
      if (!authCheck.ok) {
        onUnauthorized();
        throw new Error(authCheck.reason || 'Admin session expired.');
      }

      const client = SupabaseService.getClientForCategory(activeCategory);
      if (!client) throw new Error('Client unavailable.');

      const timestamp = Date.now();
      const cleanName = file.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
      const newPath = `tracks/${timestamp}_${cleanName}`;

      const { error: uploadErr } = await client.storage
        .from(categoryConfig.bucket || BUCKET_MUSIC)
        .upload(newPath, file, { cacheControl: '3600', upsert: false });

      if (uploadErr) throw new Error(`Audio storage upload failed: ${uploadErr.message}`);

      const { data: urlData } = client.storage
        .from(categoryConfig.bucket || BUCKET_MUSIC)
        .getPublicUrl(newPath);

      // Parse metadata / duration
      const meta = await extractAudioMetadata(file);

      const { error: dbErr } = await client
        .from(categoryConfig.tableName || 'songs')
        .update({
          file_path: newPath,
          audio_url: urlData?.publicUrl || '',
          file_name: file.name,
          file_size: file.size,
          duration: meta.duration || song.duration,
          updated_at: new Date().toISOString(),
        })
        .eq('id', song.id);

      if (dbErr) throw new Error(dbErr.message);

      // Delete old file if present
      if (song.file_path && song.file_path !== newPath) {
        await client.storage.from(categoryConfig.bucket || BUCKET_MUSIC).remove([song.file_path]).catch(() => {});
      }

      setSuccessMsg(`Successfully replaced audio file for "${song.title}".`);
      loadCatalogSongs();
    } catch (err: any) {
      setErrorMsg(sanitizeSecretText(err?.message || 'Failed to replace audio file.'));
    } finally {
      setIsProcessingFile(false);
      setReplacingSongAudio(null);
    }
  };

  // Replace Cover Image for Existing Song
  const handleReplaceCoverImage = async (song: CloudSong, file: File) => {
    setIsProcessingFile(true);
    setErrorMsg(null);
    try {
      const authCheck = await assertActiveAdminSession(adminClient);
      if (!authCheck.ok) {
        onUnauthorized();
        throw new Error(authCheck.reason || 'Admin session expired.');
      }

      const client = SupabaseService.getClientForCategory(activeCategory);
      if (!client) throw new Error('Client unavailable.');

      const jpegDataUrl = await resizeImageToJpegDataUrl(file, 512, 0.85);
      const timestamp = Date.now();
      const coverPath = `covers/${timestamp}_${song.id}.jpg`;

      // Convert data URL to Blob for storage upload
      const res = await fetch(jpegDataUrl);
      const blob = await res.blob();

      const { error: uploadErr } = await client.storage
        .from(BUCKET_ARTWORK)
        .upload(coverPath, blob, { contentType: 'image/jpeg', upsert: true });

      if (uploadErr) throw new Error(`Cover upload failed: ${uploadErr.message}`);

      const { data: urlData } = client.storage.from(BUCKET_ARTWORK).getPublicUrl(coverPath);
      const newCoverUrl = urlData?.publicUrl || jpegDataUrl;

      const { error: dbErr } = await client
        .from(categoryConfig.tableName || 'songs')
        .update({
          artwork_url: newCoverUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', song.id);

      if (dbErr) throw new Error(dbErr.message);

      setSuccessMsg(`Successfully updated cover artwork for "${song.title}".`);
      loadCatalogSongs();
    } catch (err: any) {
      setErrorMsg(sanitizeSecretText(err?.message || 'Failed to update cover image.'));
    } finally {
      setIsProcessingFile(false);
      setReplacingSongCover(null);
    }
  };

  // Delete Song & Associated Storage Files
  const handleConfirmDelete = async () => {
    if (!songToDelete) return;
    setIsDeleting(true);
    setErrorMsg(null);

    try {
      const authCheck = await assertActiveAdminSession(adminClient);
      if (!authCheck.ok) {
        onUnauthorized();
        throw new Error(authCheck.reason || 'Admin session expired.');
      }

      const client = SupabaseService.getClientForCategory(activeCategory);
      if (!client) throw new Error('Client unavailable.');

      // 1. Delete database row
      const { error: dbErr } = await client
        .from(categoryConfig.tableName || 'songs')
        .delete()
        .eq('id', songToDelete.id);

      if (dbErr) throw new Error(dbErr.message);

      // 2. Delete audio file from storage bucket if path exists
      if (songToDelete.file_path) {
        await client.storage
          .from(categoryConfig.bucket || BUCKET_MUSIC)
          .remove([songToDelete.file_path])
          .catch(() => {});
      }

      setSuccessMsg(`Successfully deleted "${songToDelete.title}".`);
      setSongToDelete(null);
      loadCatalogSongs();
    } catch (err: any) {
      setErrorMsg(sanitizeSecretText(err?.message || 'Failed to delete song.'));
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredSongs = songs.filter((s) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      s.title.toLowerCase().includes(q) ||
      s.artist.toLowerCase().includes(q) ||
      s.genre.toLowerCase().includes(q) ||
      s.album.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Category Header & Project Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/90 p-4 sm:p-6 rounded-2xl border border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
              Verified Owner AAL2 (TOTP)
            </span>
            <span className="text-xs text-slate-400 font-mono">
              Host: {categoryConfig.url ? new URL(categoryConfig.url).hostname : 'Not Configured'}
            </span>
          </div>
          <h3 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <Music className="w-5 h-5 text-cyan-400" />
            <span>JTEC Unified Music Manager</span>
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Manage catalogues across isolated projects. JTEC Party is completely protected &amp; untouched.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => {
              setShowUploadModal(true);
              setAudioFileToUpload(null);
              setCoverFileToUpload(null);
              setUploadTitle('');
              setUploadArtist('');
              setUploadAlbum('');
              setPreviewCoverUrl('');
            }}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition cursor-pointer shadow-lg shadow-cyan-500/20"
          >
            <Upload className="w-4 h-4 shrink-0" />
            <span>Upload New Song</span>
          </button>

          <button
            type="button"
            onClick={loadCatalogSongs}
            disabled={isLoadingSongs}
            className="min-h-[42px] px-3.5 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-200 text-xs font-semibold flex items-center gap-2 border border-slate-800 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSongs ? 'animate-spin text-cyan-400' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {CLOUD_CATEGORIES.map((cat) => {
          const isActive = activeCategory === cat.key;
          const cfg = SupabaseService.getCategoryConfig(cat.key);

          return (
            <button
              key={cat.key}
              type="button"
              onClick={() => setActiveCategory(cat.key)}
              className={`p-4 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between gap-3 ${
                isActive
                  ? 'bg-slate-900 border-cyan-400/80 shadow-lg shadow-cyan-500/10'
                  : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                  isActive ? 'bg-cyan-500/20 text-cyan-300' : 'bg-slate-900 text-slate-400'
                }`}>
                  {cat.badge}
                </span>
                <span className={`w-2 h-2 rounded-full ${cfg.isConfigured ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">{cat.title}</h4>
                <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">{cat.subtitle}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-500/35 text-xs text-emerald-200 flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
          <button type="button" onClick={() => setSuccessMsg(null)} className="ml-auto text-emerald-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-500/35 text-xs text-rose-200 flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg(null)} className="ml-auto text-rose-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Song Search Bar */}
      <div className="flex items-center gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
        <Search className="w-4 h-4 text-slate-400 ml-2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={`Search ${activeMeta?.title || activeCategory} tracks by title, artist, or genre...`}
          className="w-full bg-transparent text-xs text-white placeholder:text-slate-500 focus:outline-none"
        />
        <span className="text-xs text-slate-400 whitespace-nowrap px-2 font-mono">
          {filteredSongs.length} {filteredSongs.length === 1 ? 'song' : 'songs'}
        </span>
      </div>

      {/* Songs Table / Grid */}
      {isLoadingSongs ? (
        <div className="p-12 text-center text-xs text-slate-400 bg-slate-900/40 rounded-2xl border border-slate-800 flex flex-col items-center justify-center gap-3">
          <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
          <span>Loading catalogue songs from Supabase...</span>
        </div>
      ) : filteredSongs.length === 0 ? (
        <div className="p-12 text-center text-xs text-slate-400 bg-slate-900/40 rounded-2xl border border-slate-800 space-y-2">
          <Music className="w-8 h-8 text-slate-600 mx-auto" />
          <p className="text-sm font-semibold text-white">No tracks found in {activeMeta?.title || activeCategory}</p>
          <p className="text-xs text-slate-400">Click &quot;Upload New Song&quot; above to add music tracks and cover artwork.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSongs.map((song) => (
            <div
              key={song.id}
              className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-cyan-500/40 transition flex flex-col justify-between gap-4 group"
            >
              <div className="flex items-start gap-3.5">
                <img
                  src={song.cover_url || './images/cloud/jtec_main.jpg'}
                  alt={song.title}
                  className="w-16 h-16 rounded-xl object-cover border border-slate-800 shrink-0 bg-slate-950"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = './images/cloud/jtec_main.jpg';
                  }}
                />
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-cyan-300 uppercase">
                    {song.genre || 'Music'}
                  </span>
                  <h4 className="text-sm font-bold text-white truncate mt-1" title={song.title}>
                    {song.title}
                  </h4>
                  <p className="text-xs text-slate-400 truncate" title={song.artist}>
                    {song.artist}
                  </p>
                  <p className="text-[11px] text-slate-500 truncate" title={song.album}>
                    {song.album}
                  </p>
                </div>
              </div>

              {/* Track Details & File Info */}
              <div className="grid grid-cols-2 gap-2 pt-2.5 border-t border-slate-800/80 text-[11px] text-slate-400 font-mono">
                <div>
                  <span>Duration: </span>
                  <strong className="text-slate-200">
                    {Math.floor(song.duration / 60)}:{Math.floor(song.duration % 60).toString().padStart(2, '0')}
                  </strong>
                </div>
                <div className="text-right truncate">
                  <span>Size: </span>
                  <strong className="text-slate-200">
                    {song.file_size ? `${(song.file_size / (1024 * 1024)).toFixed(1)} MB` : 'N/A'}
                  </strong>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between gap-1 pt-2 border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={() => {
                    setEditingSong(song);
                    setEditTitle(song.title);
                    setEditArtist(song.artist);
                    setEditAlbum(song.album || '');
                    setEditGenre(song.genre || '');
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                  title="Edit Metadata"
                >
                  <Edit2 className="w-3 h-3" />
                  <span>Edit</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setReplacingSongAudio(song);
                    if (replaceAudioInputRef.current) replaceAudioInputRef.current.click();
                  }}
                  disabled={isProcessingFile}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                  title="Replace Audio File"
                >
                  <FileAudio className="w-3 h-3" />
                  <span>Audio</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setReplacingSongCover(song);
                    if (replaceCoverInputRef.current) replaceCoverInputRef.current.click();
                  }}
                  disabled={isProcessingFile}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                  title="Replace Cover Image"
                >
                  <ImageIcon className="w-3 h-3" />
                  <span>Cover</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSongToDelete(song)}
                  className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 transition cursor-pointer"
                  title="Delete Song"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Hidden file inputs for replacing audio or cover */}
      <input
        type="file"
        ref={replaceAudioInputRef}
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && replacingSongAudio) {
            handleReplaceAudioFile(replacingSongAudio, file);
          }
          e.target.value = '';
        }}
      />
      <input
        type="file"
        ref={replaceCoverInputRef}
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && replacingSongCover) {
            handleReplaceCoverImage(replacingSongCover, file);
          }
          e.target.value = '';
        }}
      />

      {/* UPLOAD MODAL */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Upload className="w-5 h-5 text-cyan-400" />
                <span>Upload to {activeMeta?.title || activeCategory}</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleExecuteUpload} className="space-y-4">
              {/* Audio File Picker */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 block">Audio File (MP3, FLAC, WAV, AAC)</label>
                <div 
                  onClick={() => audioFileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-700 hover:border-cyan-400 p-4 rounded-xl text-center cursor-pointer bg-slate-950/50 transition space-y-1"
                >
                  <FileAudio className="w-8 h-8 text-cyan-400 mx-auto" />
                  <p className="text-xs font-semibold text-white">
                    {audioFileToUpload ? audioFileToUpload.name : 'Click to select audio file'}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {isAnalyzingAudio ? 'Extracting ID3 tags and duration...' : 'ID3 metadata & cover art auto-extracted'}
                  </p>
                </div>
                <input
                  type="file"
                  ref={audioFileInputRef}
                  accept="audio/*"
                  className="hidden"
                  onChange={handleAudioFileSelected}
                />
              </div>

              {/* Song Metadata Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Song Title *</label>
                  <input
                    type="text"
                    required
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    placeholder="Song title"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:border-cyan-400 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Artist *</label>
                  <input
                    type="text"
                    required
                    value={uploadArtist}
                    onChange={(e) => setUploadArtist(e.target.value)}
                    placeholder="Artist name"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:border-cyan-400 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Album</label>
                  <input
                    type="text"
                    value={uploadAlbum}
                    onChange={(e) => setUploadAlbum(e.target.value)}
                    placeholder="Album name"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:border-cyan-400 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Genre</label>
                  <input
                    type="text"
                    value={uploadGenre}
                    onChange={(e) => setUploadGenre(e.target.value)}
                    placeholder="Genre"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:border-cyan-400 focus:outline-none"
                  />
                </div>
              </div>

              {/* Cover Artwork Section */}
              <div className="space-y-1.5 pt-2">
                <label className="text-xs font-semibold text-slate-300 block">Cover Artwork (Embedded or Custom)</label>
                <div className="flex items-center gap-4">
                  <img
                    src={previewCoverUrl || './images/cloud/jtec_main.jpg'}
                    alt="Cover Preview"
                    className="w-16 h-16 rounded-xl object-cover border border-slate-700 bg-slate-950 shrink-0"
                  />
                  <div className="flex-1 space-y-2">
                    <button
                      type="button"
                      onClick={() => coverFileInputRef.current?.click()}
                      className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span>Choose Custom Cover Image</span>
                    </button>
                    <p className="text-[11px] text-slate-400">
                      {previewCoverUrl.startsWith('data:image/svg+xml') ? 'Using procedural neon artwork (or extracted ID3 cover).' : 'Cover ready.'}
                    </p>
                  </div>
                </div>
                <input
                  type="file"
                  ref={coverFileInputRef}
                  accept="image/*"
                  className="hidden"
                  onChange={handleCoverFileSelected}
                />
              </div>

              {/* Upload Progress & Action */}
              <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isUploading || !audioFileToUpload || !uploadTitle.trim()}
                  className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition cursor-pointer flex items-center gap-2 disabled:opacity-50"
                >
                  {isUploading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>{uploadProgressText || 'Uploading...'}</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>Upload &amp; Save Song</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT METADATA MODAL */}
      {editingSong && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-cyan-400" />
                <span>Edit Song Metadata</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingSong(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Title</label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Artist</label>
                <input
                  type="text"
                  required
                  value={editArtist}
                  onChange={(e) => setEditArtist(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Album</label>
                <input
                  type="text"
                  value={editAlbum}
                  onChange={(e) => setEditAlbum(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Genre</label>
                <input
                  type="text"
                  value={editGenre}
                  onChange={(e) => setEditGenre(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingSong(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-2 disabled:opacity-50"
                >
                  {isSavingEdit ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {songToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-500/30 rounded-2xl w-full max-w-md p-6 space-y-6 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertCircle className="w-6 h-6 shrink-0" />
              <h3 className="text-lg font-bold text-white">Delete Song &amp; Files</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to delete <strong className="text-white">&quot;{songToDelete.title}&quot;</strong> by <strong className="text-white">{songToDelete.artist}</strong>? This will permanently remove the database row and its storage files from the <span className="font-mono text-cyan-300">{activeCategory}</span> project.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSongToDelete(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-2 disabled:opacity-50"
              >
                {isDeleting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span>Delete Permanently</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
