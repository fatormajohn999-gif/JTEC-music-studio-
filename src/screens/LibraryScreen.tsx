import React, { useState, useMemo } from 'react';
import { 
  Music, User, Disc, Heart, ArrowUpDown, Play, MoreVertical, Plus, Upload, Cloud, HardDrive, CheckCircle2 
} from 'lucide-react';
import { Song, Playlist } from '../types/music';

type LibraryTab = 'all' | 'cloud' | 'local' | 'artists' | 'albums' | 'playlists' | 'favorites' | 'recent';
type SortField = 'dateAdded' | 'title' | 'artist' | 'album' | 'duration';

interface LibraryScreenProps {
  songs: Song[];
  playlists: Playlist[];
  recentlyPlayed: Song[];
  currentSong: Song | null;
  isPlaying: boolean;
  onPlaySong: (song: Song) => void;
  onOpenSongOptions: (song: Song) => void;
  onToggleFavorite: (song: Song) => void;
  onOpenImport: () => void;
  onOpenCloudUpload?: () => void;
  onOpenCreatePlaylist: () => void;
  onSelectPlaylist: (playlist: Playlist) => void;
}

export const LibraryScreen: React.FC<LibraryScreenProps> = ({
  songs,
  playlists,
  recentlyPlayed,
  currentSong,
  isPlaying,
  onPlaySong,
  onOpenSongOptions,
  onToggleFavorite,
  onOpenImport,
  onOpenCloudUpload,
  onOpenCreatePlaylist,
  onSelectPlaylist,
}) => {
  const [activeTab, setActiveTab] = useState<LibraryTab>('all');
  const [sortField, setSortField] = useState<SortField>('dateAdded');
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<string | null>(null);

  const formatDuration = (seconds: number) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const cloudSongsCount = useMemo(() => songs.filter((s) => s.isCloud).length, [songs]);
  const localOnlyCount = useMemo(() => songs.filter((s) => !s.isCloud).length, [songs]);

  // Grouping for Artists
  const artistsMap = useMemo(() => {
    const map = new Map<string, Song[]>();
    songs.forEach((s) => {
      const list = map.get(s.artist) || [];
      list.push(s);
      map.set(s.artist, list);
    });
    return map;
  }, [songs]);

  // Grouping for Albums
  const albumsMap = useMemo(() => {
    const map = new Map<string, { songs: Song[]; artist: string; artworkUrl?: string }>();
    songs.forEach((s) => {
      const alb = s.album || 'Unknown Album';
      const existing = map.get(alb);
      if (existing) {
        existing.songs.push(s);
      } else {
        map.set(alb, { songs: [s], artist: s.artist, artworkUrl: s.artworkUrl });
      }
    });
    return map;
  }, [songs]);

  // Filtered & Sorted Songs
  const displayedSongs = useMemo(() => {
    let list: Song[] = [];

    if (activeTab === 'all') {
      list = [...songs];
    } else if (activeTab === 'cloud') {
      list = songs.filter((s) => s.isCloud);
    } else if (activeTab === 'local') {
      list = songs.filter((s) => !s.isCloud);
    } else if (activeTab === 'favorites') {
      list = songs.filter((s) => s.isFavorite);
    } else if (activeTab === 'recent') {
      list = [...recentlyPlayed];
    } else if (activeTab === 'artists' && selectedArtist) {
      list = artistsMap.get(selectedArtist) || [];
    } else if (activeTab === 'albums' && selectedAlbum) {
      list = albumsMap.get(selectedAlbum)?.songs || [];
    }

    return list.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'title') {
        comparison = a.title.localeCompare(b.title);
      } else if (sortField === 'artist') {
        comparison = a.artist.localeCompare(b.artist);
      } else if (sortField === 'album') {
        comparison = (a.album || '').localeCompare(b.album || '');
      } else if (sortField === 'duration') {
        comparison = a.duration - b.duration;
      } else {
        comparison = a.dateAdded - b.dateAdded;
      }
      return sortAsc ? comparison : -comparison;
    });
  }, [songs, activeTab, sortField, sortAsc, selectedArtist, selectedAlbum, artistsMap, albumsMap, recentlyPlayed]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  return (
    <div className="space-y-4 pb-36 px-4 pt-3 max-w-4xl mx-auto">
      {/* Category Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
        {[
          { id: 'all', label: 'All Songs', count: songs.length },
          { id: 'cloud', label: '☁️ Cloud Music', count: cloudSongsCount },
          { id: 'local', label: '📱 Local Only', count: localOnlyCount },
          { id: 'artists', label: 'Artists', count: artistsMap.size },
          { id: 'albums', label: 'Albums', count: albumsMap.size },
          { id: 'playlists', label: 'Playlists', count: playlists.length },
          { id: 'favorites', label: 'Favorites', count: songs.filter((s) => s.isFavorite).length },
          { id: 'recent', label: 'Recently Played', count: recentlyPlayed.length },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id as LibraryTab);
              setSelectedArtist(null);
              setSelectedAlbum(null);
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition active:scale-95 ${
              activeTab === tab.id
                ? 'bg-gradient-to-r from-cyan-500 to-purple-600 text-white shadow-lg shadow-cyan-500/20'
                : 'bg-slate-900/60 border border-white/5 text-slate-300 hover:text-white hover:border-white/20'
            }`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* Action / Sorting Bar (For Song list views) */}
      {(activeTab === 'all' || activeTab === 'cloud' || activeTab === 'local' || activeTab === 'favorites' || activeTab === 'recent' || selectedArtist || selectedAlbum) && (
        <div className="flex items-center justify-between gap-2 p-2.5 rounded-2xl bg-slate-900/40 border border-white/5 text-xs">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar text-slate-400">
            <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 mr-1">
              <ArrowUpDown className="w-3.5 h-3.5" /> Sort:
            </span>
            {(['dateAdded', 'title', 'artist', 'duration'] as SortField[]).map((f) => (
              <button
                key={f}
                onClick={() => toggleSort(f)}
                className={`px-2 py-1 rounded-lg capitalize transition ${
                  sortField === f
                    ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30'
                    : 'hover:text-slate-200'
                }`}
              >
                {f === 'dateAdded' ? 'Recent' : f} {sortField === f ? (sortAsc ? '↑' : '↓') : ''}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onOpenCloudUpload && (
              <button
                onClick={onOpenCloudUpload}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-cyan-400/30 text-white hover:brightness-110 transition font-medium"
                title="Upload to Supabase Storage"
              >
                <Cloud className="w-3.5 h-3.5 text-cyan-400" />
                <span className="hidden sm:inline">+ Cloud</span>
              </button>
            )}

            <button
              onClick={onOpenImport}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/25 transition font-medium"
              title="Add local audio files"
            >
              <Upload className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">+ Local</span>
            </button>
          </div>
        </div>
      )}

      {/* Back button if drilled down into Artist / Album */}
      {(selectedArtist || selectedAlbum) && (
        <button
          onClick={() => {
            setSelectedArtist(null);
            setSelectedAlbum(null);
          }}
          className="text-xs text-cyan-400 hover:underline flex items-center gap-1"
        >
          ← Back to all {selectedArtist ? 'artists' : 'albums'}
        </button>
      )}

      {/* ARTISTS GRID */}
      {activeTab === 'artists' && !selectedArtist && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {Array.from(artistsMap.entries()).map(([artist, artistSongs]) => (
            <div
              key={artist}
              onClick={() => setSelectedArtist(artist)}
              className="p-4 rounded-2xl bg-slate-900/50 border border-white/5 hover:border-cyan-500/30 cursor-pointer text-center space-y-2 group transition"
            >
              <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-tr from-cyan-500/30 to-purple-600/30 border border-cyan-500/40 flex items-center justify-center text-cyan-300 shadow-md group-hover:scale-105 transition">
                <User className="w-8 h-8" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white truncate group-hover:text-cyan-300">
                  {artist}
                </h4>
                <p className="text-[11px] text-slate-400">{artistSongs.length} songs</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ALBUMS GRID */}
      {activeTab === 'albums' && !selectedAlbum && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Array.from(albumsMap.entries()).map(([album, data]) => (
            <div
              key={album}
              onClick={() => setSelectedAlbum(album)}
              className="p-3 rounded-2xl bg-slate-900/50 border border-white/5 hover:border-cyan-500/30 cursor-pointer transition group space-y-2"
            >
              <div className="relative aspect-square rounded-xl overflow-hidden bg-slate-950">
                <img
                  src={data.artworkUrl || './pwa-192x192.png'}
                  alt={album}
                  className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white truncate group-hover:text-cyan-300">
                  {album}
                </h4>
                <p className="text-[11px] text-slate-400 truncate">{data.artist}</p>
                <p className="text-[10px] text-slate-500">{data.songs.length} tracks</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* PLAYLISTS VIEW */}
      {activeTab === 'playlists' && (
        <div className="space-y-3">
          <button
            onClick={onOpenCreatePlaylist}
            className="w-full p-4 rounded-2xl border-2 border-dashed border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 flex items-center justify-center gap-2 font-semibold text-xs transition"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Playlist</span>
          </button>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {playlists.map((pl) => (
              <div
                key={pl.id}
                onClick={() => onSelectPlaylist(pl)}
                className="flex items-center gap-3 p-3 rounded-2xl bg-slate-900/60 border border-white/5 hover:border-cyan-500/30 cursor-pointer transition"
              >
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-tr ${pl.coverGradient || 'from-cyan-500 to-purple-600'} flex items-center justify-center text-white shadow-md shrink-0`}>
                  <Disc className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-bold text-white truncate">{pl.name}</h4>
                  <p className="text-[11px] text-slate-400">{pl.songIds.length} tracks</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SONGS LIST */}
      {(activeTab === 'all' || activeTab === 'cloud' || activeTab === 'local' || activeTab === 'favorites' || activeTab === 'recent' || selectedArtist || selectedAlbum) && (
        <div className="space-y-2">
          {displayedSongs.length === 0 ? (
            <div className="text-center py-12 space-y-3 text-slate-400">
              <Music className="w-10 h-10 mx-auto text-slate-600" />
              <p className="text-sm font-semibold">
                {activeTab === 'cloud' 
                  ? 'No cloud songs yet. Upload songs to Supabase storage to see them here!' 
                  : activeTab === 'local' 
                  ? 'No local-only songs in this view.' 
                  : 'No songs in this view'}
              </p>
              <div className="flex items-center justify-center gap-2 pt-1">
                {onOpenCloudUpload && (
                  <button
                    onClick={onOpenCloudUpload}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 text-white text-xs font-bold shadow-md shadow-cyan-500/20"
                  >
                    ☁️ Upload to Cloud
                  </button>
                )}
                <button
                  onClick={onOpenImport}
                  className="px-4 py-2 rounded-xl bg-slate-800 border border-white/10 text-slate-300 text-xs font-medium"
                >
                  📱 Add Local Files
                </button>
              </div>
            </div>
          ) : (
            displayedSongs.map((song) => {
              const isThisPlaying = currentSong?.id === song.id && isPlaying;
              return (
                <div
                  key={song.id}
                  className={`flex items-center gap-3 p-2.5 rounded-2xl border transition group ${
                    isThisPlaying
                      ? 'bg-cyan-500/15 border-cyan-400/50'
                      : 'bg-slate-900/40 border-white/5 hover:border-white/15'
                  }`}
                >
                  {/* Artwork */}
                  <div
                    onClick={() => onPlaySong(song)}
                    className="relative w-12 h-12 rounded-xl overflow-hidden cursor-pointer shrink-0 bg-slate-950"
                  >
                    <img
                      src={song.artworkUrl || './pwa-192x192.png'}
                      alt={song.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                      <Play className="w-4 h-4 text-white" />
                    </div>
                  </div>

                  {/* Info */}
                  <div
                    onClick={() => onPlaySong(song)}
                    className="flex-1 min-w-0 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-white truncate group-hover:text-cyan-300">
                        {song.title}
                      </h4>

                      {/* Explicit Distinction: CLOUD MUSIC vs LOCAL MUSIC */}
                      {song.isCloud ? (
                        song.hasStoredBlob ? (
                          <span className="shrink-0 text-[10px] px-1.5 py-0.2 rounded-md bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-semibold font-mono flex items-center gap-0.5" title="Stored in Supabase Cloud & Cached Offline">
                            <Cloud className="w-2.5 h-2.5" />
                            <span>CLOUD</span>
                            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 ml-0.5" />
                          </span>
                        ) : (
                          <span className="shrink-0 text-[10px] px-1.5 py-0.2 rounded-md bg-purple-500/15 border border-purple-500/30 text-purple-300 font-semibold font-mono flex items-center gap-0.5" title="Stored in Supabase Cloud (Streamable)">
                            <Cloud className="w-2.5 h-2.5" />
                            <span>CLOUD</span>
                          </span>
                        )
                      ) : (
                        <span className="shrink-0 text-[10px] px-1.5 py-0.2 rounded-md bg-slate-800/80 border border-white/10 text-slate-400 font-semibold font-mono flex items-center gap-0.5" title="Local device storage only">
                          <HardDrive className="w-2.5 h-2.5" />
                          <span>LOCAL</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-slate-400 truncate mt-0.5">
                      <span className="truncate">{song.artist}</span>
                      <span>•</span>
                      <span className="font-mono">{formatDuration(song.duration)}</span>
                    </div>
                  </div>

                  {/* Favorite */}
                  <button
                    onClick={() => onToggleFavorite(song)}
                    className="p-2 text-slate-400 hover:text-pink-500 transition"
                  >
                    <Heart className={`w-4 h-4 ${song.isFavorite ? 'fill-pink-500 text-pink-500' : ''}`} />
                  </button>

                  {/* Options */}
                  <button
                    onClick={() => onOpenSongOptions(song)}
                    className="p-2 text-slate-400 hover:text-white"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
