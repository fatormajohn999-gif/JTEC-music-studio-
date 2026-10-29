// Core Music & Audio Types for JTEC MUSIC

export type CinematicScene =
  | 'auto'
  | 'dark_spectrum'
  | 'cyber_city'
  | 'galaxy'
  | 'fire_energy'
  | 'rainy_night'
  | 'anime_ninja'
  | 'samurai'
  | 'deep_ocean'
  | 'music_tunnel'
  | 'minimal_pro'
  | 'shadow_strike'
  | 'shuriken_storm'
  | 'smoke_vanish'
  | 'aurora_skies'
  | 'thunder_storm'
  | 'dragon_spirit'
  | 'hyperspace_warp'
  | 'night_walk'
  | 'off';

export type VisualizerMode = CinematicScene;

export type PerformanceMode = 'battery' | 'balanced' | 'high';

export type ReactionStrength = 'gentle' | 'low' | 'medium' | 'high' | 'intense';

export type RepeatMode = 'off' | 'all' | 'one';

export type EffectPresetName =
  | 'Normal'
  | 'Slow'
  | 'Slow + Reverb'
  | 'Dreamy'
  | 'Night'
  | 'Bass'
  | 'Cinematic'
  | 'Custom';

export interface ArtworkPalette {
  main: string;
  primary: string;
  secondary: string;
  accent: string;
  glow: string;
  darkBg: string;
  hasCover: boolean;
}

export interface AudioEffectsConfig {
  playbackRate: number;
  reverbWet: number;
  echoWet: number;
  bassGain: number;
  trebleGain: number;
  volume: number;
  presetName: EffectPresetName;
  preservesPitch?: boolean;
  isEnabled?: boolean;
}

export interface AudioBands {
  bass: number;
  low: number;
  mid: number;
  high: number;
  volume: number;
  rawFrequency: Uint8Array;
  rawTimeDomain: Uint8Array;
}

export interface SleepTimerState {
  isActive: boolean;
  totalDurationMinutes: number;
  endTime: number | null;
  remainingSeconds: number;
  isFading: boolean;
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration: number;
  genre?: string;
  artworkUrl?: string;
  format?: string;
  size?: number;
  dateAdded?: number;
  hasStoredBlob?: boolean;
  cloudId?: string;
  isCloud?: boolean;
  audioUrl?: string;
  fileHash?: string;
  isFavorite?: boolean;
  isDemo?: boolean;
  palette?: ArtworkPalette;
  year?: string | number;
  coverUrl?: string;
  source?: string;
  license?: string;
  jamendoUrl?: string;
}

export interface JamendoTrack {
  id: string;
  name: string;
  duration: number;
  artist_id: string;
  artist_name: string;
  album_id?: string;
  album_name?: string;
  album_image?: string;
  image: string;
  audio: string;
  audiodownload: string;
  audiodownload_allowed: boolean;
  license_ccurl?: string;
  shareurl?: string;
  shorturl?: string;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  songIds: string[];
  coverGradient?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CloudSong {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration: number;
  genre?: string;
  cover_url?: string;
  audio_url: string;
  file_name: string;
  file_size?: number;
  file_hash?: string;
  file_path?: string;
  storage_path?: string;
  created_at: string;
  category?: string;
  bucket?: string;
}

export interface PlaybackSessionState {
  songId: string;
  position: number;
  queueSongIds?: string[];
  isShuffle?: boolean;
  repeatMode?: RepeatMode;
  visualizerTheme?: VisualizerMode;
  updatedAt?: number;
}

export interface AppSettings {
  performanceMode: PerformanceMode;
  visualizerMode: VisualizerMode;
  reactionStrength: ReactionStrength;
  autoplayNext: boolean;
  rememberLastSong: boolean;
  neonGlow: boolean;
  reducedMotion: boolean;
  downloadOnWifiOnly?: boolean;
}
