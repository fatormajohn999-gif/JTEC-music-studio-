import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Search,
  Music,
  Cloud,
  Globe,
  HardDrive,
  Check,
  Loader2,
  AlertCircle,
  Plus,
  ChevronRight,
  ArrowLeft,
} from 'lucide-react';
import { Song, CloudSong, JamendoTrack } from '../../types/music';
import { PartyTrack } from '../types';
import {
  SupabaseService,
  CloudCategoryKey,
  CLOUD_CATEGORIES,
} from '../../services/supabase';
import { JamendoService } from '../../services/jamendo';
import {
  ArchiveOrgService,
  ArchiveItemDoc,
  ArchiveItemDetail,
  formatArchiveCreator,
  cleanTrackTitle,
} from '../../services/archiveOrg';
import { triggerHapticFeedback } from '../PartyService';
import { isShareablePartyAudioUrl } from '../utils/audioValidation';

const CoverThumb: React.FC<{ src?: string; alt: string }> = ({ src, alt }) => {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="w-11 h-11 rounded-xl bg-[#0B0F1A] border border-white/10 flex items-center justify-center shrink-0">
        <Music className="w-4 h-4 text-cyan-400/70" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="w-11 h-11 rounded-xl object-cover shrink-0 border border-white/10 bg-[#0B0F1A]"
    />
  );
};

type MusicSourceTab = 'downloaded' | 'jtec_cloud' | 'online';
type OnlineSubSource = 'jamendo' | 'archive';

interface PartyAddMusicModalProps {
  isOpen: boolean;
  onClose: () => void;
  songs: Song[];
  onAddTracks: (tracks: PartyTrack[]) => void;
  onNavigateToCloud?: () => void;
}

const formatDuration = (sec?: number): string => {
  if (!sec || sec <= 0) return '';
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
};

export const PartyAddMusicModal: React.FC<PartyAddMusicModalProps> = ({
  isOpen,
  onClose,
  songs,
  onAddTracks,
  onNavigateToCloud,
}) => {
  const [sourceTab, setSourceTab] = useState<MusicSourceTab>('downloaded');
  const [searchQuery, setSearchQuery] = useState('');

  // Multi-select state: track key -> PartyTrack
  const [selectedTracksMap, setSelectedTracksMap] = useState<Map<string, PartyTrack>>(new Map());

  // JTEC Cloud state
  const [cloudCategory, setCloudCategory] = useState<CloudCategoryKey>('jtec_main');
  const [cloudCache, setCloudCache] = useState<Partial<Record<CloudCategoryKey, CloudSong[]>>>({});
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);

  // Online Catalog state (Jamendo + Archive.org)
  const [onlineSubSource, setOnlineSubSource] = useState<OnlineSubSource>('jamendo');
  const [jamendoTracks, setJamendoTracks] = useState<JamendoTrack[]>([]);
  const [jamendoLoading, setJamendoLoading] = useState(false);
  const [jamendoError, setJamendoError] = useState<string | null>(null);

  const [archiveItems, setArchiveItems] = useState<ArchiveItemDoc[]>([]);
  const [archiveDetail, setArchiveDetail] = useState<ArchiveItemDetail | null>(null);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  // Reset selection when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedTracksMap(new Map());
      setSearchQuery('');
    }
  }, [isOpen]);

  // Load JTEC Cloud category songs on tab/category switch
  useEffect(() => {
    if (!isOpen || sourceTab !== 'jtec_cloud') return;
    if (cloudCache[cloudCategory]) {
      setCloudError(null);
      return;
    }

    let cancelled = false;
    setCloudLoading(true);
    setCloudError(null);

    SupabaseService.fetchSongsForCategory(cloudCategory)
      .then((list) => {
        if (!cancelled) {
          setCloudCache((prev) => ({ ...prev, [cloudCategory]: list }));
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setCloudError(err instanceof Error ? err.message : 'Unable to load JTEC Cloud catalog.');
        }
      })
      .finally(() => {
        if (!cancelled) setCloudLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, sourceTab, cloudCategory, cloudCache]);

  // Load Online Catalogs when Online tab is active
  useEffect(() => {
    if (!isOpen || sourceTab !== 'online') return;
    let cancelled = false;

    const timer = setTimeout(() => {
      if (onlineSubSource === 'jamendo') {
        setJamendoLoading(true);
        setJamendoError(null);
        JamendoService.fetchTracks({
          search: searchQuery.trim() || undefined,
          order: 'popularity_total',
          limit: 25,
        })
          .then((tracks) => {
            if (!cancelled) setJamendoTracks(tracks);
          })
          .catch((err) => {
            if (!cancelled) {
              setJamendoError(err instanceof Error ? err.message : 'Unable to load Jamendo tracks.');
            }
          })
          .finally(() => {
            if (!cancelled) setJamendoLoading(false);
          });
      } else if (!archiveDetail) {
        setArchiveLoading(true);
        setArchiveError(null);
        ArchiveOrgService.searchItems({
          searchTerm: searchQuery.trim(),
          chip: 'all',
          sort: 'downloads desc',
          page: 1,
        })
          .then((res) => {
            if (!cancelled) setArchiveItems(res.docs);
          })
          .catch((err) => {
            if (!cancelled) {
              setArchiveError(err instanceof Error ? err.message : 'Unable to load Archive.org catalog.');
            }
          })
          .finally(() => {
            if (!cancelled) setArchiveLoading(false);
          });
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isOpen, sourceTab, onlineSubSource, searchQuery, archiveDetail]);

  const toggleTrackSelection = (key: string, track: PartyTrack) => {
    triggerHapticFeedback();
    setSelectedTracksMap((prev) => {
      const next = new Map(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.set(key, track);
      }
      return next;
    });
  };

  const filteredDownloadedSongs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = !q
      ? songs
      : songs.filter(
          (s) =>
            s.title.toLowerCase().includes(q) ||
            s.artist.toLowerCase().includes(q) ||
            (s.album && s.album.toLowerCase().includes(q))
        );
    // Show shareable cloud downloads before local-only phone files
    return [...list].sort((a, b) => {
      const aShare = a.isCloud && isShareablePartyAudioUrl(a.audioUrl) ? 1 : 0;
      const bShare = b.isCloud && isShareablePartyAudioUrl(b.audioUrl) ? 1 : 0;
      return bShare - aShare;
    });
  }, [songs, searchQuery]);

  const hasLocalOnlySongs = useMemo(
    () => filteredDownloadedSongs.some((s) => !(s.isCloud && isShareablePartyAudioUrl(s.audioUrl))),
    [filteredDownloadedSongs]
  );

  const filteredCloudSongs = useMemo(() => {
    const list = cloudCache[cloudCategory] || [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q) ||
        (s.genre && s.genre.toLowerCase().includes(q))
    );
  }, [cloudCache, cloudCategory, searchQuery]);

  const handleOpenArchiveItem = async (doc: ArchiveItemDoc) => {
    triggerHapticFeedback();
    setArchiveLoading(true);
    setArchiveError(null);
    try {
      const detail = await ArchiveOrgService.getItemDetails(doc.identifier);
      setArchiveDetail(detail);
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : 'Could not load audio tracks for this item.');
    } finally {
      setArchiveLoading(false);
    }
  };

  const handleConfirmAdd = () => {
    const selected = Array.from(selectedTracksMap.values());
    if (selected.length === 0) return;
    onAddTracks(selected);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-4 animate-in fade-in">
      <div className="w-full max-w-xl rounded-3xl bg-[#111521] border border-cyan-500/30 p-4 sm:p-5 space-y-3.5 shadow-2xl flex flex-col max-h-[88vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-2.5 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 border border-cyan-500/30 flex items-center justify-center">
              <Music className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white">Add Music to Party</h3>
              <p className="text-[11px] text-slate-400">Select one or multiple tracks across sources</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Add Music"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 3 Music Sources Tabs */}
        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-[#0A0D16] border border-white/10 shrink-0">
          <button
            type="button"
            onClick={() => setSourceTab('downloaded')}
            className={`min-h-[42px] px-2 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
              sourceTab === 'downloaded'
                ? 'bg-gradient-to-r from-cyan-500 to-purple-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Downloaded</span>
          </button>

          <button
            type="button"
            onClick={() => setSourceTab('jtec_cloud')}
            className={`min-h-[42px] px-2 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
              sourceTab === 'jtec_cloud'
                ? 'bg-gradient-to-r from-cyan-500 to-purple-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Cloud className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">JTEC Cloud</span>
          </button>

          <button
            type="button"
            onClick={() => setSourceTab('online')}
            className={`min-h-[42px] px-2 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
              sourceTab === 'online'
                ? 'bg-gradient-to-r from-cyan-500 to-purple-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Globe className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Online</span>
          </button>
        </div>

        {/* Search Box */}
        <div className="relative shrink-0">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              sourceTab === 'downloaded'
                ? 'Search downloaded songs...'
                : sourceTab === 'jtec_cloud'
                ? 'Search JTEC Cloud...'
                : onlineSubSource === 'jamendo'
                ? 'Search Jamendo tracks...'
                : 'Search Internet Archive nasheeds...'
            }
            className="w-full min-h-[42px] pl-10 pr-3.5 py-2 rounded-xl bg-[#0A0D16] border border-white/10 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-400 transition"
          />
        </div>

        {/* Category / Sub-source Chips */}
        {sourceTab === 'jtec_cloud' && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 shrink-0">
            {CLOUD_CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                type="button"
                onClick={() => setCloudCategory(cat.key)}
                className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap border transition cursor-pointer ${
                  cloudCategory === cat.key
                    ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                    : 'bg-[#171C2B] border-white/10 text-slate-400 hover:text-white'
                }`}
              >
                {cat.title}
              </button>
            ))}
          </div>
        )}

        {sourceTab === 'online' && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setOnlineSubSource('jamendo');
                setArchiveDetail(null);
              }}
              className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                onlineSubSource === 'jamendo'
                  ? 'bg-purple-500/20 border-purple-400/50 text-purple-200'
                  : 'bg-[#171C2B] border-white/10 text-slate-400 hover:text-white'
              }`}
            >
              Jamendo Music
            </button>
            <button
              type="button"
              onClick={() => setOnlineSubSource('archive')}
              className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                onlineSubSource === 'archive'
                  ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                  : 'bg-[#171C2B] border-white/10 text-slate-400 hover:text-white'
              }`}
            >
              Archive.org Nasheed
            </button>
          </div>
        )}

        {/* Track List Content */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[200px]">
          {/* SOURCE 1: DOWNLOADED MUSIC */}
          {sourceTab === 'downloaded' && (
            <>
              {hasLocalOnlySongs && (
                <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-[11px] text-amber-200 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    Local phone files stay on your device and cannot be streamed to friends. Downloaded JTEC Cloud songs or tracks from JTEC Cloud / Online tabs can be shared in Party.
                  </span>
                </div>
              )}

              {filteredDownloadedSongs.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 space-y-2">
                  <p>No matching downloaded songs found.</p>
                  {onNavigateToCloud && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onNavigateToCloud();
                      }}
                      className="min-h-[44px] px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 font-bold text-xs cursor-pointer"
                    >
                      Browse Cloud Catalog
                    </button>
                  )}
                </div>
              ) : (
                filteredDownloadedSongs.map((song) => {
                  const isSyncable = Boolean(song.isCloud && isShareablePartyAudioUrl(song.audioUrl));
                  const trackKey = `dl_${song.id}`;
                  const isSelected = selectedTracksMap.has(trackKey);
                  const partyTrack: PartyTrack = {
                    source: song.source || 'cloud',
                    id: song.cloudId || song.id,
                    title: song.title,
                    artist: song.artist,
                    cover: song.coverUrl || song.artworkUrl,
                    audioUrl: song.audioUrl || '',
                    duration: song.duration,
                    size: song.size,
                  };

                  return (
                    <button
                      key={song.id}
                      type="button"
                      disabled={!isSyncable}
                      onClick={() => isSyncable && toggleTrackSelection(trackKey, partyTrack)}
                      className={`w-full text-left flex items-center justify-between p-2.5 sm:p-3 rounded-2xl border transition min-h-[60px] ${
                        !isSyncable
                          ? 'bg-[#0C0F18]/50 border-white/5 opacity-55 cursor-not-allowed'
                          : isSelected
                          ? 'bg-cyan-500/15 border-cyan-400/50 cursor-pointer'
                          : 'bg-[#171C2B]/90 border-white/10 hover:border-cyan-500/35 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1 pr-2">
                        <CoverThumb src={song.coverUrl || song.artworkUrl} alt={song.title} />
                        <div className="min-w-0">
                          <p className="text-xs sm:text-sm font-bold text-white truncate">{song.title}</p>
                          <p className="text-[11px] text-slate-400 truncate">
                            {song.artist}
                            {song.duration ? ` • ${formatDuration(song.duration)}` : ''}
                          </p>
                          {!isSyncable && (
                            <span className="text-[10px] text-amber-300/90 font-medium block mt-0.5">
                              Local file — cannot stream across devices
                            </span>
                          )}
                        </div>
                      </div>

                      {isSyncable ? (
                        <div
                          className={`w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 transition ${
                            isSelected
                              ? 'bg-cyan-500 border-cyan-400 text-slate-950'
                              : 'bg-[#0A0D16] border-white/20'
                          }`}
                        >
                          {isSelected && <Check className="w-4 h-4 stroke-[3]" />}
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400 px-2 py-1 bg-white/5 border border-white/10 rounded-lg shrink-0">
                          Device Only
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </>
          )}

          {/* SOURCE 2: JTEC CLOUD */}
          {sourceTab === 'jtec_cloud' && (
            <>
              {cloudLoading ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-slate-400">
                  <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
                  <span>Loading JTEC Cloud tracks...</span>
                </div>
              ) : cloudError ? (
                <div className="p-6 text-center space-y-2 text-xs text-rose-300">
                  <AlertCircle className="w-6 h-6 mx-auto text-rose-400" />
                  <p>{cloudError}</p>
                </div>
              ) : filteredCloudSongs.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  No tracks available in this category.
                </div>
              ) : (
                filteredCloudSongs.map((song) => {
                  const isPlayable = isShareablePartyAudioUrl(song.audio_url);
                  const trackKey = `cloud_${cloudCategory}_${song.id}`;
                  const isSelected = selectedTracksMap.has(trackKey);
                  const partyTrack: PartyTrack = {
                    source: cloudCategory,
                    id: song.id,
                    title: song.title,
                    artist: song.artist,
                    cover: song.cover_url,
                    audioUrl: song.audio_url,
                    duration: song.duration,
                    size: song.file_size,
                  };

                  return (
                    <button
                      key={song.id}
                      type="button"
                      disabled={!isPlayable}
                      onClick={() => isPlayable && toggleTrackSelection(trackKey, partyTrack)}
                      className={`w-full text-left flex items-center justify-between p-2.5 sm:p-3 rounded-2xl border transition min-h-[60px] ${
                        !isPlayable
                          ? 'bg-[#0C0F18]/50 border-white/5 opacity-55 cursor-not-allowed'
                          : isSelected
                          ? 'bg-cyan-500/15 border-cyan-400/50 cursor-pointer'
                          : 'bg-[#171C2B]/90 border-white/10 hover:border-cyan-500/35 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1 pr-2">
                        <CoverThumb src={song.cover_url} alt={song.title} />
                        <div className="min-w-0">
                          <p className="text-xs sm:text-sm font-bold text-white truncate">{song.title}</p>
                          <p className="text-[11px] text-slate-400 truncate">
                            {song.artist}
                            {song.duration ? ` • ${formatDuration(song.duration)}` : ''}
                          </p>
                          {!isPlayable && (
                            <span className="text-[10px] text-rose-300/90 font-medium block mt-0.5">
                              Audio stream unavailable
                            </span>
                          )}
                        </div>
                      </div>

                      <div
                        className={`w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 transition ${
                          isSelected
                            ? 'bg-cyan-500 border-cyan-400 text-slate-950'
                            : 'bg-[#0A0D16] border-white/20'
                        }`}
                      >
                        {isSelected && <Check className="w-4 h-4 stroke-[3]" />}
                      </div>
                    </button>
                  );
                })
              )}
            </>
          )}

          {/* SOURCE 3: ONLINE CATALOGS */}
          {sourceTab === 'online' && onlineSubSource === 'jamendo' && (
            <>
              {jamendoLoading ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-slate-400">
                  <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
                  <span>Loading Jamendo music...</span>
                </div>
              ) : jamendoError ? (
                <div className="p-6 text-center space-y-2 text-xs text-rose-300">
                  <AlertCircle className="w-6 h-6 mx-auto text-rose-400" />
                  <p>{jamendoError}</p>
                </div>
              ) : jamendoTracks.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  No Jamendo tracks matched your search.
                </div>
              ) : (
                jamendoTracks.map((track) => {
                  const isPlayable = isShareablePartyAudioUrl(track.audio);
                  const trackKey = `jamendo_${track.id}`;
                  const isSelected = selectedTracksMap.has(trackKey);
                  const partyTrack: PartyTrack = {
                    source: 'jamendo',
                    id: track.id,
                    title: track.name,
                    artist: track.artist_name,
                    cover: track.image || track.album_image,
                    audioUrl: track.audio,
                    duration: track.duration,
                  };

                  return (
                    <button
                      key={track.id}
                      type="button"
                      disabled={!isPlayable}
                      onClick={() => isPlayable && toggleTrackSelection(trackKey, partyTrack)}
                      className={`w-full text-left flex items-center justify-between p-2.5 sm:p-3 rounded-2xl border transition min-h-[60px] ${
                        !isPlayable
                          ? 'bg-[#0C0F18]/50 border-white/5 opacity-55 cursor-not-allowed'
                          : isSelected
                          ? 'bg-purple-500/20 border-purple-400/50 cursor-pointer'
                          : 'bg-[#171C2B]/90 border-white/10 hover:border-purple-500/35 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1 pr-2">
                        <CoverThumb src={track.image || track.album_image} alt={track.name} />
                        <div className="min-w-0">
                          <p className="text-xs sm:text-sm font-bold text-white truncate">{track.name}</p>
                          <p className="text-[11px] text-slate-400 truncate">
                            {track.artist_name}
                            {track.duration ? ` • ${formatDuration(track.duration)}` : ''}
                          </p>
                        </div>
                      </div>

                      <div
                        className={`w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 transition ${
                          isSelected
                            ? 'bg-purple-500 border-purple-400 text-white'
                            : 'bg-[#0A0D16] border-white/20'
                        }`}
                      >
                        {isSelected && <Check className="w-4 h-4 stroke-[3]" />}
                      </div>
                    </button>
                  );
                })
              )}
            </>
          )}

          {sourceTab === 'online' && onlineSubSource === 'archive' && (
            <>
              {archiveDetail && (
                <button
                  type="button"
                  onClick={() => setArchiveDetail(null)}
                  className="mb-2 min-h-[44px] px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-cyan-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Archive results</span>
                </button>
              )}

              {archiveLoading ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-slate-400">
                  <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
                  <span>Loading Archive.org audio...</span>
                </div>
              ) : archiveError ? (
                <div className="p-6 text-center space-y-2 text-xs text-rose-300">
                  <AlertCircle className="w-6 h-6 mx-auto text-rose-400" />
                  <p>{archiveError}</p>
                </div>
              ) : archiveDetail ? (
                archiveDetail.audioFiles.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    No playable audio files found in this item.
                  </div>
                ) : (
                  archiveDetail.audioFiles.map((file) => {
                    const isPlayable = isShareablePartyAudioUrl(file.downloadUrl);
                    const trackId = `${archiveDetail.identifier}::${file.name}`;
                    const trackKey = `archive_${trackId}`;
                    const isSelected = selectedTracksMap.has(trackKey);
                    const title = cleanTrackTitle(file.title || file.name);
                    const artist = formatArchiveCreator(archiveDetail.creator);
                    const partyTrack: PartyTrack = {
                      source: 'archive',
                      id: trackId,
                      title,
                      artist,
                      cover: archiveDetail.coverUrl,
                      audioUrl: file.downloadUrl,
                      duration: file.length,
                      size: file.size,
                    };

                    return (
                      <button
                        key={trackId}
                        type="button"
                        disabled={!isPlayable}
                        onClick={() => isPlayable && toggleTrackSelection(trackKey, partyTrack)}
                        className={`w-full text-left flex items-center justify-between p-2.5 sm:p-3 rounded-2xl border transition min-h-[60px] ${
                          !isPlayable
                            ? 'bg-[#0C0F18]/50 border-white/5 opacity-55 cursor-not-allowed'
                            : isSelected
                            ? 'bg-cyan-500/15 border-cyan-400/50 cursor-pointer'
                            : 'bg-[#171C2B]/90 border-white/10 hover:border-cyan-500/35 cursor-pointer'
                        }`}
                      >
                        <div className="min-w-0 flex-1 pr-2">
                          <p className="text-xs sm:text-sm font-bold text-white truncate">{title}</p>
                          <p className="text-[11px] text-slate-400 truncate">
                            {artist} • {file.format.toUpperCase()}
                            {file.length ? ` • ${formatDuration(file.length)}` : ''}
                          </p>
                        </div>

                        <div
                          className={`w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 transition ${
                            isSelected
                              ? 'bg-cyan-500 border-cyan-400 text-slate-950'
                              : 'bg-[#0A0D16] border-white/20'
                          }`}
                        >
                          {isSelected && <Check className="w-4 h-4 stroke-[3]" />}
                        </div>
                      </button>
                    );
                  })
                )
              ) : archiveItems.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  No Archive.org collections matched your search.
                </div>
              ) : (
                archiveItems.map((doc) => (
                  <button
                    key={doc.identifier}
                    type="button"
                    onClick={() => handleOpenArchiveItem(doc)}
                    className="w-full text-left flex items-center justify-between p-3 rounded-2xl bg-[#171C2B]/90 border border-white/10 hover:border-cyan-500/35 transition min-h-[58px] cursor-pointer"
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <p className="text-xs sm:text-sm font-bold text-white truncate">{doc.title}</p>
                      <p className="text-[11px] text-slate-400 truncate">
                        {formatArchiveCreator(doc.creator)}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-cyan-400 shrink-0" />
                  </button>
                ))
              )}
            </>
          )}
        </div>

        {/* Footer Action Bar */}
        <div className="pt-2.5 border-t border-white/10 flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={selectedTracksMap.size === 0}
            onClick={handleConfirmAdd}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 hover:brightness-110 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-cyan-500/20 active:scale-95 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>
              Add {selectedTracksMap.size > 0 ? `${selectedTracksMap.size} ` : ''}
              {selectedTracksMap.size === 1 ? 'Song' : 'Songs'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
