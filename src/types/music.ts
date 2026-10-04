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
  blobKey?: string;
  hasStoredBlob: boolean;
  isDemo?: boolean;
  year?: string;
  palette?: ArtworkPalette;
}

export interface ArtworkPalette {
  primary: string;    // dominant color e.g. '#00f0ff'
  secondary: string;  // supporting harmonic e.g. '#a855f7'
  accent: string;     // high-energy accent e.g. '#ec4899'
  glow: string;       // ambient rgba string
  darkBg: string;     // deep ambient background hex
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

export type CinematicScene = 
  | 'auto' 
  | 'aurora' 
  | 'galaxy' 
  | 'neon_city' 
  | 'dream' 
  | 'energy' 
  | 'inferno' 
  | 'ocean' 
  | 'deep_space' 
  | 'crystal' 
  | 'vortex' 
  | 'prism' 
  | 'meteor_shower' 
  | 'nature' 
  | 'neural_network' 
  | 'black_hole' 
  | 'off';
export type VisualizerMode = CinematicScene;

export type PerformanceMode = 'battery' | 'balanced' | 'high';

export interface AudioEffectsConfig {
  playbackRate: number; // 0.5 to 1.5
  reverbWet: number;    // 0.0 to 1.0 (0% to 100%)
  echoWet: number;      // 0.0 to 1.0 (0% to 100%)
  bassGain: number;     // -50 to +50 dB (scaled)
  trebleGain: number;   // -50 to +50 dB (scaled)
  volume: number;       // 0.0 to 1.0 (0% to 100%)
  presetName: 'Normal' | 'Slow' | 'Slow + Reverb' | 'Dreamy' | 'Night' | 'Bass' | 'Cinematic' | 'Custom';
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

export interface AudioBands {
  bass: number;        // 0 to 1 (20-160Hz)
  low: number;         // 0 to 1 (160-500Hz)
  mid: number;         // 0 to 1 (500-2000Hz)
  high: number;        // 0 to 1 (2000-16000Hz)
  volume: number;      // 0 to 1 (RMS energy)
  rawFrequency: Uint8Array;
  rawTimeDomain: Uint8Array;
}
