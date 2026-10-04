export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number; // in seconds
  artworkUrl?: string;
  format: string; // 'mp3' | 'wav' | 'm4a' | 'ogg' | 'flac' | 'audio'
  size: number; // bytes
  dateAdded: number; // timestamp
  isFavorite?: boolean;
  blobKey?: string; // key in audio_blobs store
  hasStoredBlob: boolean;
  isDemo?: boolean;
  year?: string;
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

export type VisualizerMode = 'circular' | 'spectrum' | 'waveform' | 'particles' | 'off';

export type PerformanceMode = 'battery' | 'balanced' | 'high';

export interface AudioEffectsConfig {
  playbackRate: number; // 0.5 to 1.5
  reverbWet: number;    // 0.0 to 1.0 (0% to 100%)
  echoWet: number;      // 0.0 to 1.0 (0% to 100%)
  bassGain: number;     // -50 to +50 dB (scaled)
  trebleGain: number;   // -50 to +50 dB (scaled)
  volume: number;       // 0.0 to 1.0 (0% to 100%)
  presetName: 'Normal' | 'Slow + Reverb' | 'Night' | 'Bass' | 'Dreamy' | 'Chill' | 'Custom';
}

export type RepeatMode = 'off' | 'all' | 'one';

export interface AppSettings {
  performanceMode: PerformanceMode;
  visualizerMode: VisualizerMode;
  autoplayNext: boolean;
  rememberLastSong: boolean;
  neonGlow: boolean;
  reducedMotion: boolean;
}
