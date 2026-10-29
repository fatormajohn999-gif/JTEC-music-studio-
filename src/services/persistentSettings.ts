import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';
import { 
  AudioEffectsConfig, 
  AppSettings, 
  RepeatMode, 
  VisualizerMode, 
  ReactionStrength, 
  PerformanceMode,
  EffectPresetName 
} from '../types/music';

// Storage Keys
const KEY_EFFECTS = 'jtec_persistent_effects_v1';
const KEY_VISUALIZER = 'jtec_persistent_visualizer_v1';
const KEY_PLAYBACK = 'jtec_persistent_playback_v1';
const KEY_DOWNLOADS = 'jtec_persistent_downloads_v1';
const KEY_SORT_VIEW = 'jtec_persistent_sort_view_v1';

export interface PersistentAudioEffects extends AudioEffectsConfig {
  preservesPitch: boolean;
  isEnabled: boolean;
}

export interface PersistentVisualizerSettings {
  visualizerMode: VisualizerMode;
  reactionStrength: ReactionStrength;
  performanceMode: PerformanceMode;
  neonGlow: boolean;
  reducedMotion: boolean;
}

export interface PersistentPlaybackSettings {
  autoplayNext: boolean;
  repeatMode: RepeatMode;
  isShuffle: boolean;
  volume: number;
  rememberLastSong: boolean;
}

export interface PersistentDownloadSettings {
  downloadOnWifiOnly: boolean;
  cloudSync: boolean;
  autoDownloadFavorites: boolean;
}

export interface PersistentSortViewSettings {
  librarySortField: 'dateAdded' | 'title' | 'artist' | 'album' | 'duration';
  librarySortAsc: boolean;
  libraryActiveTab: string;
  sortField?: 'dateAdded' | 'title' | 'artist' | 'album' | 'duration';
  sortAsc?: boolean;
  activeTab?: string;
  archiveSort: string;
  jamendoOrder: string;
  downloadsSortField: 'size' | 'date' | 'title';
  downloadsSortDirection: 'desc' | 'asc';
}

// System Defaults
export const DEFAULT_AUDIO_EFFECTS: PersistentAudioEffects = {
  presetName: 'Normal',
  playbackRate: 1.0,
  reverbWet: 0.0,
  echoWet: 0.0,
  bassGain: 0,
  trebleGain: 0,
  volume: 1.0,
  preservesPitch: true,
  isEnabled: false,
};

export const DEFAULT_VISUALIZER_SETTINGS: PersistentVisualizerSettings = {
  visualizerMode: 'auto',
  reactionStrength: 'medium',
  performanceMode: 'balanced',
  neonGlow: true,
  reducedMotion: false,
};

export const DEFAULT_PLAYBACK_SETTINGS: PersistentPlaybackSettings = {
  autoplayNext: true,
  repeatMode: 'all',
  isShuffle: false,
  volume: 1.0,
  rememberLastSong: true,
};

export const DEFAULT_DOWNLOAD_SETTINGS: PersistentDownloadSettings = {
  downloadOnWifiOnly: false,
  cloudSync: true,
  autoDownloadFavorites: false,
};

export const DEFAULT_SORT_VIEW_SETTINGS: PersistentSortViewSettings = {
  librarySortField: 'dateAdded',
  librarySortAsc: false,
  libraryActiveTab: 'all',
  archiveSort: 'downloads desc',
  jamendoOrder: 'featured',
  downloadsSortField: 'size',
  downloadsSortDirection: 'desc',
};

// Low-level safe storage bridge
async function setNative(key: string, value: string): Promise<void> {
  // Always write to localStorage synchronously as primary or mirror
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    console.warn('localStorage.setItem error:', err);
  }

  // On Android native platform, store with @capacitor/preferences
  if (Capacitor.isNativePlatform()) {
    try {
      await Preferences.set({ key, value });
    } catch (err) {
      console.warn('Preferences.set error:', err);
    }
  }
}

async function getNative(key: string): Promise<string | null> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { value } = await Preferences.get({ key });
      if (value !== null && value !== undefined) {
        try {
          localStorage.setItem(key, value);
        } catch {}
        return value;
      }
    } catch (err) {
      console.warn('Preferences.get error:', err);
    }
  }

  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function getSync(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export const PersistentSettingsService = {
  // --------------------------------------------------------------------------
  // 1. SLOW + REVERB & AUDIO EFFECTS
  // --------------------------------------------------------------------------
  getAudioEffectsSync(): PersistentAudioEffects {
    const raw = getSync(KEY_EFFECTS);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_AUDIO_EFFECTS, ...parsed };
      } catch {}
    }
    return { ...DEFAULT_AUDIO_EFFECTS };
  },

  async getAudioEffects(): Promise<PersistentAudioEffects> {
    const raw = await getNative(KEY_EFFECTS);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_AUDIO_EFFECTS, ...parsed };
      } catch {}
    }
    return this.getAudioEffectsSync();
  },

  async saveAudioEffects(effects: Partial<PersistentAudioEffects>): Promise<PersistentAudioEffects> {
    const current = this.getAudioEffectsSync();
    const updated: PersistentAudioEffects = {
      ...current,
      ...effects,
      // Check whether effect is actively enabled
      isEnabled: typeof effects.isEnabled === 'boolean' 
        ? effects.isEnabled 
        : (effects.presetName && effects.presetName !== 'Normal') || 
          (effects.playbackRate !== undefined && effects.playbackRate !== 1.0) || 
          (effects.reverbWet !== undefined && effects.reverbWet > 0.01) ||
          current.isEnabled,
    };

    await setNative(KEY_EFFECTS, JSON.stringify(updated));
    return updated;
  },

  // --------------------------------------------------------------------------
  // 2. VISUALIZER (Theme, Reaction Strength, Engine & Battery Profile)
  // --------------------------------------------------------------------------
  getVisualizerSettingsSync(): PersistentVisualizerSettings {
    const raw = getSync(KEY_VISUALIZER);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_VISUALIZER_SETTINGS, ...parsed };
      } catch {}
    }

    // Migration from legacy session or legacy settings
    try {
      const sessionRaw = localStorage.getItem('jtec_playback_session');
      if (sessionRaw) {
        const sess = JSON.parse(sessionRaw);
        if (sess.visualizerTheme) {
          return { ...DEFAULT_VISUALIZER_SETTINGS, visualizerMode: sess.visualizerTheme };
        }
      }
    } catch {}

    return { ...DEFAULT_VISUALIZER_SETTINGS };
  },

  async getVisualizerSettings(): Promise<PersistentVisualizerSettings> {
    const raw = await getNative(KEY_VISUALIZER);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_VISUALIZER_SETTINGS, ...parsed };
      } catch {}
    }
    return this.getVisualizerSettingsSync();
  },

  async saveVisualizerSettings(settings: Partial<PersistentVisualizerSettings>): Promise<PersistentVisualizerSettings> {
    const current = this.getVisualizerSettingsSync();
    const updated: PersistentVisualizerSettings = { ...current, ...settings };
    await setNative(KEY_VISUALIZER, JSON.stringify(updated));
    return updated;
  },

  // --------------------------------------------------------------------------
  // 3. PLAYBACK (Automatic Next, Repeat, Shuffle, Volume)
  // --------------------------------------------------------------------------
  getPlaybackSettingsSync(): PersistentPlaybackSettings {
    const raw = getSync(KEY_PLAYBACK);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_PLAYBACK_SETTINGS, ...parsed };
      } catch {}
    }

    // Migration from legacy session
    try {
      const sessionRaw = localStorage.getItem('jtec_playback_session');
      if (sessionRaw) {
        const sess = JSON.parse(sessionRaw);
        return {
          ...DEFAULT_PLAYBACK_SETTINGS,
          isShuffle: typeof sess.isShuffle === 'boolean' ? sess.isShuffle : DEFAULT_PLAYBACK_SETTINGS.isShuffle,
          repeatMode: sess.repeatMode || DEFAULT_PLAYBACK_SETTINGS.repeatMode,
        };
      }
    } catch {}

    return { ...DEFAULT_PLAYBACK_SETTINGS };
  },

  async getPlaybackSettings(): Promise<PersistentPlaybackSettings> {
    const raw = await getNative(KEY_PLAYBACK);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_PLAYBACK_SETTINGS, ...parsed };
      } catch {}
    }
    return this.getPlaybackSettingsSync();
  },

  async savePlaybackSettings(playback: Partial<PersistentPlaybackSettings>): Promise<PersistentPlaybackSettings> {
    const current = this.getPlaybackSettingsSync();
    const updated: PersistentPlaybackSettings = { ...current, ...playback };
    await setNative(KEY_PLAYBACK, JSON.stringify(updated));
    return updated;
  },

  // --------------------------------------------------------------------------
  // 4. DOWNLOADS & SETTINGS TOGGLES (Wi-Fi Only, etc.)
  // --------------------------------------------------------------------------
  getDownloadSettingsSync(): PersistentDownloadSettings {
    const raw = getSync(KEY_DOWNLOADS);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_DOWNLOAD_SETTINGS, ...parsed };
      } catch {}
    }

    // Migration from jtec_cloud_settings
    try {
      const cloudRaw = localStorage.getItem('jtec_cloud_settings');
      if (cloudRaw) {
        const cloud = JSON.parse(cloudRaw);
        return {
          ...DEFAULT_DOWNLOAD_SETTINGS,
          downloadOnWifiOnly: typeof cloud.wifiOnly === 'boolean' ? cloud.wifiOnly : false,
          cloudSync: typeof cloud.cloudSync === 'boolean' ? cloud.cloudSync : true,
          autoDownloadFavorites: typeof cloud.autoDownloadFavorites === 'boolean' ? cloud.autoDownloadFavorites : false,
        };
      }
    } catch {}

    return { ...DEFAULT_DOWNLOAD_SETTINGS };
  },

  async getDownloadSettings(): Promise<PersistentDownloadSettings> {
    const raw = await getNative(KEY_DOWNLOADS);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_DOWNLOAD_SETTINGS, ...parsed };
      } catch {}
    }
    return this.getDownloadSettingsSync();
  },

  async saveDownloadSettings(settings: Partial<PersistentDownloadSettings>): Promise<PersistentDownloadSettings> {
    const current = this.getDownloadSettingsSync();
    const updated: PersistentDownloadSettings = { ...current, ...settings };
    await setNative(KEY_DOWNLOADS, JSON.stringify(updated));
    return updated;
  },

  // --------------------------------------------------------------------------
  // 5. SORTING & VIEW CHOICES (Library, Cloud Catalogs, Downloads)
  // --------------------------------------------------------------------------
  getSortViewSettingsSync(): PersistentSortViewSettings {
    const raw = getSync(KEY_SORT_VIEW);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        const merged = { ...DEFAULT_SORT_VIEW_SETTINGS, ...parsed };
        return {
          ...merged,
          sortField: merged.librarySortField,
          sortAsc: merged.librarySortAsc,
          activeTab: merged.libraryActiveTab,
        };
      } catch {}
    }
    return {
      ...DEFAULT_SORT_VIEW_SETTINGS,
      sortField: DEFAULT_SORT_VIEW_SETTINGS.librarySortField,
      sortAsc: DEFAULT_SORT_VIEW_SETTINGS.librarySortAsc,
      activeTab: DEFAULT_SORT_VIEW_SETTINGS.libraryActiveTab,
    };
  },

  async getSortViewSettings(): Promise<PersistentSortViewSettings> {
    const raw = await getNative(KEY_SORT_VIEW);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        const merged = { ...DEFAULT_SORT_VIEW_SETTINGS, ...parsed };
        return {
          ...merged,
          sortField: merged.librarySortField,
          sortAsc: merged.librarySortAsc,
          activeTab: merged.libraryActiveTab,
        };
      } catch {}
    }
    return this.getSortViewSettingsSync();
  },

  async saveSortViewSettings(sortSettings: Partial<PersistentSortViewSettings>): Promise<PersistentSortViewSettings> {
    const current = this.getSortViewSettingsSync();
    const effective: Partial<PersistentSortViewSettings> = { ...sortSettings };
    if (effective.sortField) effective.librarySortField = effective.sortField;
    if (typeof effective.sortAsc === 'boolean') effective.librarySortAsc = effective.sortAsc;
    if (effective.activeTab) effective.libraryActiveTab = effective.activeTab;

    const updated: PersistentSortViewSettings = {
      ...current,
      ...effective,
      sortField: effective.librarySortField ?? current.librarySortField,
      sortAsc: effective.librarySortAsc ?? current.librarySortAsc,
      activeTab: effective.libraryActiveTab ?? current.libraryActiveTab,
    };
    await setNative(KEY_SORT_VIEW, JSON.stringify(updated));
    return updated;
  },

  // --------------------------------------------------------------------------
  // 6. RESET ONLY SOUND AND VISUAL SETTINGS
  // --------------------------------------------------------------------------
  async resetSoundAndVisualSettings(): Promise<{
    effects: PersistentAudioEffects;
    visualizer: PersistentVisualizerSettings;
  }> {
    const effects = { ...DEFAULT_AUDIO_EFFECTS };
    const visualizer = { ...DEFAULT_VISUALIZER_SETTINGS };

    await setNative(KEY_EFFECTS, JSON.stringify(effects));
    await setNative(KEY_VISUALIZER, JSON.stringify(visualizer));

    return { effects, visualizer };
  },

  // Initial one-time hydration and migration
  async initialize(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      try {
        // Read native values into localStorage if not present
        const [eff, vis, play, down, sort] = await Promise.all([
          Preferences.get({ key: KEY_EFFECTS }),
          Preferences.get({ key: KEY_VISUALIZER }),
          Preferences.get({ key: KEY_PLAYBACK }),
          Preferences.get({ key: KEY_DOWNLOADS }),
          Preferences.get({ key: KEY_SORT_VIEW }),
        ]);

        if (eff.value) localStorage.setItem(KEY_EFFECTS, eff.value);
        if (vis.value) localStorage.setItem(KEY_VISUALIZER, vis.value);
        if (play.value) localStorage.setItem(KEY_PLAYBACK, play.value);
        if (down.value) localStorage.setItem(KEY_DOWNLOADS, down.value);
        if (sort.value) localStorage.setItem(KEY_SORT_VIEW, sort.value);
      } catch (err) {
        console.warn('Preferences initialization notice:', err);
      }
    }
  },
};
