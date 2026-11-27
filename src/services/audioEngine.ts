import { AudioEffectsConfig, AudioBands } from '../types/music';
import { PersistentSettingsService } from './persistentSettings';
import { AppLogger } from './appLogger';
import { Capacitor, registerPlugin, PluginListenerHandle } from '@capacitor/core';

interface JtecAudioPlayerPluginInterface {
  loadSource(options: { url: string }): Promise<void>;
  loadBase64Audio(options: { data: string }): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(options: { time: number }): Promise<void>;
  setVolume(options: { volume: number }): Promise<void>;
  setEffects(options: {
    playbackRate: number;
    preservesPitch: boolean;
    reverbWet?: number;
    echoWet?: number;
    bassGain?: number;
    trebleGain?: number;
  }): Promise<void>;
  addListener(eventName: string, listenerFunc: (data: any) => void): Promise<PluginListenerHandle>;
}

const JtecAudioPlayerNative = registerPlugin<JtecAudioPlayerPluginInterface>('JtecAudioPlayer');

class AudioEngine {
  private audioCtx: AudioContext | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;

  // Audio Nodes Graph
  private inputGain: GainNode | null = null;
  private bassFilter: BiquadFilterNode | null = null;
  private trebleFilter: BiquadFilterNode | null = null;
  private dryGain: GainNode | null = null;

  // Reverb Chain
  private reverbInputGain: GainNode | null = null;
  private convolver: ConvolverNode | null = null;
  private reverbWetGain: GainNode | null = null;

  // Echo Chain
  private echoInputGain: GainNode | null = null;
  private delayNode: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;
  private echoWetGain: GainNode | null = null;

  // Master & Visualization Nodes
  private masterGain: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;

  // Visualizer data buffers
  private timeDataBuffer: Uint8Array | null = null;
  private freqDataBuffer: Uint8Array | null = null;

  private isInitialized = false;
  private currentObjectUrl: string | null = null;
  private currentSource: string | Blob | null = null;
  private hasRetriedWithoutCors = false;
  private currentEffectsConfig: AudioEffectsConfig = PersistentSettingsService.getAudioEffectsSync();
  private isPartyModeActive = false;
  private partyDriftSpeed = 1.0;

  // Track playback state
  public isPlaying = false;
  public currentTime = 0;
  public duration = 0;

  // Listeners
  private timeUpdateCallbacks: Set<(current: number, duration: number) => void> = new Set();
  private playStateCallbacks: Set<(isPlaying: boolean) => void> = new Set();
  private endedCallbacks: Set<() => void> = new Set();
  private errorCallbacks: Set<(error: string) => void> = new Set();
  private nativeListenersRegistered = false;

  constructor() {
    this.initNativeListenersIfNeeded();
  }

  private initNativeListenersIfNeeded() {
    if (this.nativeListenersRegistered) return;
    if (typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
      try {
        JtecAudioPlayerNative.addListener('timeUpdate', (data: { currentTime?: number; duration?: number }) => {
          if (typeof data.currentTime === 'number') this.currentTime = data.currentTime;
          if (typeof data.duration === 'number') this.duration = data.duration;
          this.timeUpdateCallbacks.forEach((cb) => cb(this.currentTime, this.duration));
        });

        JtecAudioPlayerNative.addListener('playStateChange', (data: { isPlaying?: boolean }) => {
          if (typeof data.isPlaying === 'boolean') {
            this.isPlaying = data.isPlaying;
            this.playStateCallbacks.forEach((cb) => cb(this.isPlaying));
          }
        });

        JtecAudioPlayerNative.addListener('ended', () => {
          this.isPlaying = false;
          this.playStateCallbacks.forEach((cb) => cb(false));
          this.endedCallbacks.forEach((cb) => cb());
        });

        JtecAudioPlayerNative.addListener('error', (data: { message?: string }) => {
          this.isPlaying = false;
          this.playStateCallbacks.forEach((cb) => cb(false));
          const err = data.message || "JTEC MUSIC couldn't play this track on native Android.";
          this.errorCallbacks.forEach((cb) => cb(err));
        });

        this.nativeListenersRegistered = true;
      } catch (e) {
        console.warn('Failed to initialize native Android audio plugin listeners:', e);
      }
    }
  }

  private isNativeAndroid(): boolean {
    return typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  }

  public hasSource(): boolean {
    if (this.isNativeAndroid()) {
      return Boolean(this.currentSource);
    }
    if (!this.audioElement) return false;
    const src = this.audioElement.currentSrc || this.audioElement.src;
    const locHref = typeof window !== 'undefined' && window.location ? window.location.href : '';
    return Boolean(
      src &&
      src !== locHref &&
      src !== 'about:blank' &&
      !src.endsWith('/') &&
      !src.endsWith('#')
    );
  }

  public enforcePlaybackRateAndPitch = () => {
    if (this.isNativeAndroid()) {
      const speed = Math.max(0.5, Math.min(1.5, this.isPartyModeActive ? this.partyDriftSpeed : (this.currentEffectsConfig.playbackRate || 1.0)));
      const isSlowAesthetic =
        this.currentEffectsConfig.presetName === 'Slow + Reverb' ||
        this.currentEffectsConfig.presetName === 'Slow' ||
        this.currentEffectsConfig.presetName === 'Dreamy' ||
        this.currentEffectsConfig.presetName === 'Night' ||
        this.currentEffectsConfig.presetName === 'Cinematic' ||
        (speed < 0.98 && this.currentEffectsConfig.presetName !== 'Normal');
      const preservesPitch = typeof this.currentEffectsConfig.preservesPitch === 'boolean'
        ? this.currentEffectsConfig.preservesPitch
        : !isSlowAesthetic;

      JtecAudioPlayerNative.setEffects({
        playbackRate: speed,
        preservesPitch: this.isPartyModeActive ? true : preservesPitch,
        reverbWet: this.currentEffectsConfig.reverbWet || 0,
        echoWet: this.currentEffectsConfig.echoWet || 0,
        bassGain: this.currentEffectsConfig.bassGain || 0,
        trebleGain: this.currentEffectsConfig.trebleGain || 0,
      }).catch(() => {});
      return;
    }

    if (!this.audioElement) return;

    if (this.isPartyModeActive) {
      this.audioElement.defaultPlaybackRate = 1.0;
      this.audioElement.playbackRate = this.partyDriftSpeed;
      try {
        (this.audioElement as unknown as { preservesPitch?: boolean }).preservesPitch = true;
        (this.audioElement as unknown as { mozPreservesPitch?: boolean }).mozPreservesPitch = true;
        (this.audioElement as unknown as { webkitPreservesPitch?: boolean }).webkitPreservesPitch = true;
      } catch {}
      return;
    }

    const speed = Math.max(0.5, Math.min(1.5, this.currentEffectsConfig.playbackRate || 1.0));
    this.audioElement.defaultPlaybackRate = speed;
    this.audioElement.playbackRate = speed;

    const isSlowAesthetic =
      this.currentEffectsConfig.presetName === 'Slow + Reverb' ||
      this.currentEffectsConfig.presetName === 'Slow' ||
      this.currentEffectsConfig.presetName === 'Dreamy' ||
      this.currentEffectsConfig.presetName === 'Night' ||
      this.currentEffectsConfig.presetName === 'Cinematic' ||
      (speed < 0.98 && this.currentEffectsConfig.presetName !== 'Normal');

    const preservesPitch = typeof this.currentEffectsConfig.preservesPitch === 'boolean'
      ? this.currentEffectsConfig.preservesPitch
      : !isSlowAesthetic;

    try {
      (this.audioElement as unknown as { preservesPitch?: boolean }).preservesPitch = preservesPitch;
      (this.audioElement as unknown as { mozPreservesPitch?: boolean }).mozPreservesPitch = preservesPitch;
      (this.audioElement as unknown as { webkitPreservesPitch?: boolean }).webkitPreservesPitch = preservesPitch;
    } catch {}
  };

  public init() {
    this.initNativeListenersIfNeeded();
    if (this.isNativeAndroid()) {
      this.isInitialized = true;
      return;
    }
    if (this.isInitialized) return;

    this.audioElement = new Audio();
    this.audioElement.preload = 'auto';

    const notifyTimeAndDuration = () => {
      if (this.audioElement) {
        this.currentTime = this.audioElement.currentTime || 0;
        const dur = this.audioElement.duration;
        this.duration = isFinite(dur) && dur > 0 ? dur : 0;
        this.timeUpdateCallbacks.forEach((cb) => cb(this.currentTime, this.duration));
      }
    };

    this.audioElement.addEventListener('loadstart', this.enforcePlaybackRateAndPitch);
    this.audioElement.addEventListener('loadedmetadata', () => {
      this.enforcePlaybackRateAndPitch();
      notifyTimeAndDuration();
    });
    this.audioElement.addEventListener('loadeddata', this.enforcePlaybackRateAndPitch);
    this.audioElement.addEventListener('canplay', this.enforcePlaybackRateAndPitch);

    this.audioElement.addEventListener('timeupdate', notifyTimeAndDuration);
    this.audioElement.addEventListener('durationchange', notifyTimeAndDuration);

    this.audioElement.addEventListener('play', () => {
      this.enforcePlaybackRateAndPitch();
      this.isPlaying = true;
      this.playStateCallbacks.forEach((cb) => cb(true));
    });

    this.audioElement.addEventListener('pause', () => {
      this.isPlaying = false;
      this.playStateCallbacks.forEach((cb) => cb(false));
    });

    this.audioElement.addEventListener('ended', () => {
      this.isPlaying = false;
      this.playStateCallbacks.forEach((cb) => cb(false));
      this.endedCallbacks.forEach((cb) => cb());
    });

    this.audioElement.addEventListener('error', () => {
      const mediaError = this.audioElement?.error;
      if (mediaError?.code === 1) return;
      if (!this.hasSource()) return;

      if (
        this.audioElement?.crossOrigin &&
        typeof this.currentSource === 'string' &&
        !this.hasRetriedWithoutCors
      ) {
        this.hasRetriedWithoutCors = true;
        this.audioElement.crossOrigin = null;
        this.audioElement.removeAttribute('crossorigin');
        this.audioElement.src = this.currentSource;
        this.audioElement.load();
        return;
      }

      const currentSrc = this.audioElement?.currentSrc || this.audioElement?.src;
      console.warn('Audio element playback warning:', {
        code: mediaError?.code,
        message: mediaError?.message,
        src: currentSrc ? currentSrc.substring(0, 100) : 'none',
      });
      AppLogger.error('AudioEngine', 'audio_element_error', mediaError?.message || 'Audio playback failed', {
        code: mediaError?.code ?? 'unknown',
        sourceType: currentSrc?.startsWith('blob:') ? 'local_blob' : currentSrc ? 'remote_url' : 'none',
      });
      this.isPlaying = false;
      this.playStateCallbacks.forEach((cb) => cb(false));
      this.errorCallbacks.forEach((cb) =>
        cb("JTEC MUSIC couldn't play this track. The audio format may not be supported or the file is unavailable.")
      );
    });

    this.isInitialized = true;
  }

  private setupWebAudioNodes() {
    if (this.isNativeAndroid()) return;
    if (!this.audioElement) return;
    if (this.audioCtx && this.sourceNode) return;

    try {
      const win = typeof window !== 'undefined' ? window : ({} as any);
      const AudioContextClass = win.AudioContext || win.webkitAudioContext;
      if (!AudioContextClass) return;
      this.audioCtx = new AudioContextClass();

      this.sourceNode = this.audioCtx.createMediaElementSource(this.audioElement);
      this.inputGain = this.audioCtx.createGain();
      this.inputGain.gain.value = 1.0;

      this.analyserNode = this.audioCtx.createAnalyser();
      this.analyserNode.fftSize = 256;
      this.analyserNode.smoothingTimeConstant = 0.8;
      this.timeDataBuffer = new Uint8Array(this.analyserNode.fftSize);
      this.freqDataBuffer = new Uint8Array(this.analyserNode.frequencyBinCount);

      this.bassFilter = this.audioCtx.createBiquadFilter();
      this.bassFilter.type = 'lowshelf';
      this.bassFilter.frequency.value = 120;
      this.bassFilter.gain.value = 0;

      this.trebleFilter = this.audioCtx.createBiquadFilter();
      this.trebleFilter.type = 'highshelf';
      this.trebleFilter.frequency.value = 4500;
      this.trebleFilter.gain.value = 0;

      this.dryGain = this.audioCtx.createGain();
      this.dryGain.gain.value = 1.0;

      this.reverbInputGain = this.audioCtx.createGain();
      this.reverbInputGain.gain.value = 0.0;
      this.convolver = this.audioCtx.createConvolver();
      this.convolver.buffer = this.createWarmImpulseResponse(this.audioCtx, 2.2, 3.2);
      this.reverbWetGain = this.audioCtx.createGain();
      this.reverbWetGain.gain.value = 0.0;

      this.echoInputGain = this.audioCtx.createGain();
      this.echoInputGain.gain.value = 0.0;
      this.delayNode = this.audioCtx.createDelay(1.5);
      this.delayNode.delayTime.value = 0.32;
      this.delayFeedback = this.audioCtx.createGain();
      this.delayFeedback.gain.value = 0.0;
      this.echoWetGain = this.audioCtx.createGain();
      this.echoWetGain.gain.value = 0.0;

      this.masterGain = this.audioCtx.createGain();
      this.masterGain.gain.value = 1.0;

      this.sourceNode.connect(this.analyserNode);
      this.sourceNode.connect(this.inputGain);
      this.inputGain.connect(this.bassFilter);
      this.bassFilter.connect(this.trebleFilter);

      this.trebleFilter.connect(this.dryGain);
      this.dryGain.connect(this.masterGain);

      this.trebleFilter.connect(this.reverbInputGain);
      this.reverbInputGain.connect(this.convolver);
      this.convolver.connect(this.reverbWetGain);
      this.reverbWetGain.connect(this.masterGain);

      this.trebleFilter.connect(this.echoInputGain);
      this.echoInputGain.connect(this.delayNode);
      this.delayNode.connect(this.delayFeedback);
      this.delayFeedback.connect(this.delayNode);
      this.delayNode.connect(this.echoWetGain);
      this.echoWetGain.connect(this.masterGain);

      this.masterGain.connect(this.audioCtx.destination);
    } catch (e) {
      console.warn('Web Audio API setup warning:', e);
      AppLogger.warning('AudioEngine', 'webaudio_setup_failed', 'Web Audio API setup failed', {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  private createWarmImpulseResponse(ctx: AudioContext, duration: number, decay: number): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * duration);
    const impulse = ctx.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    let leftFilter = 0;
    let rightFilter = 0;
    const filterCoef = 0.16;

    for (let i = 0; i < length; i++) {
      const progress = i / length;
      const envelope = Math.exp(-decay * progress);
      const noiseL = (Math.random() * 2 - 1) * envelope;
      const noiseR = (Math.random() * 2 - 1) * envelope;

      leftFilter += filterCoef * (noiseL - leftFilter);
      rightFilter += filterCoef * (noiseR - rightFilter);

      left[i] = leftFilter;
      right[i] = rightFilter;
    }

    return impulse;
  }

  public async resumeContext() {
    if (this.isNativeAndroid()) return;
    if (this.audioCtx && (this.audioCtx.state === 'suspended' || (this.audioCtx.state as string) === 'interrupted')) {
      try {
        await this.audioCtx.resume();
      } catch (err) {
        console.warn('Could not resume audio context', err);
      }
    }
  }

  public async loadAudio(blobOrUrl: Blob | string, initialPosition?: number): Promise<void> {
    if (!blobOrUrl) return;
    if (blobOrUrl instanceof Blob && blobOrUrl.size === 0) {
      console.warn('Cannot load empty audio blob (0 bytes)');
      return;
    }
    if (typeof blobOrUrl === 'string' && (!blobOrUrl.trim() || blobOrUrl === 'about:blank')) {
      return;
    }

    this.init();
    this.currentSource = blobOrUrl;

    if (this.isNativeAndroid()) {
      let base64Data = '';
      if (blobOrUrl instanceof Blob) {
        base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blobOrUrl);
        });
      } else if (typeof blobOrUrl === 'string' && blobOrUrl.startsWith('blob:')) {
        try {
          const res = await fetch(blobOrUrl);
          const blob = await res.blob();
          base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } catch (e) {
          console.warn('Failed to fetch blob url for native android:', e);
        }
      }

      if (base64Data) {
        await JtecAudioPlayerNative.loadBase64Audio({ data: base64Data });
      } else {
        await JtecAudioPlayerNative.loadSource({ url: blobOrUrl as string });
      }

      if (typeof initialPosition === 'number' && initialPosition > 0) {
        await JtecAudioPlayerNative.seek({ time: initialPosition });
      }
      this.enforcePlaybackRateAndPitch();
      this.applyEffects(this.currentEffectsConfig);
      return;
    }

    this.setupWebAudioNodes();
    await this.resumeContext();

    if (!this.audioElement) return;
    this.hasRetriedWithoutCors = false;

    const oldUrl = this.currentObjectUrl;

    if (blobOrUrl instanceof Blob) {
      this.currentObjectUrl = URL.createObjectURL(blobOrUrl);
      this.audioElement.crossOrigin = null;
      this.audioElement.removeAttribute('crossorigin');
      this.audioElement.src = this.currentObjectUrl;
    } else {
      this.currentObjectUrl = null;
      const origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
      if (typeof blobOrUrl === 'string' && blobOrUrl.startsWith('http') && (!origin || !blobOrUrl.startsWith(origin))) {
        this.audioElement.crossOrigin = 'anonymous';
      } else {
        this.audioElement.crossOrigin = null;
        this.audioElement.removeAttribute('crossorigin');
      }
      this.audioElement.src = blobOrUrl;
    }

    if (oldUrl) {
      try {
        URL.revokeObjectURL(oldUrl);
      } catch {}
    }

    this.enforcePlaybackRateAndPitch();
    this.audioElement.load();
    this.enforcePlaybackRateAndPitch();
    this.applyEffects(this.currentEffectsConfig);

    if (typeof initialPosition === 'number' && initialPosition > 0) {
      const applyPos = () => {
        if (this.audioElement) {
          this.audioElement.currentTime = initialPosition;
          this.currentTime = initialPosition;
        }
      };
      this.audioElement.addEventListener('loadedmetadata', applyPos, { once: true });
    }
  }

  public async play(): Promise<void> {
    this.init();
    if (this.isNativeAndroid()) {
      await JtecAudioPlayerNative.play();
      this.isPlaying = true;
      this.playStateCallbacks.forEach((cb) => cb(true));
      return;
    }

    this.setupWebAudioNodes();
    await this.resumeContext();

    if (this.audioElement) {
      if (!this.hasSource()) {
        this.isPlaying = false;
        throw new Error('The element has no supported sources.');
      }
      this.enforcePlaybackRateAndPitch();
      this.applyEffects(this.currentEffectsConfig);
      try {
        await this.audioElement.play();
        this.enforcePlaybackRateAndPitch();
        this.isPlaying = true;
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === 'AbortError') {
          return;
        }
        console.warn('Play prevented or failed', e);
        AppLogger.warning('AudioEngine', 'audio_play_failed', e instanceof Error ? e.message : 'Audio play failed');
        this.isPlaying = false;
        throw e;
      }
    }
  }

  public pause(): void {
    if (this.isNativeAndroid()) {
      JtecAudioPlayerNative.pause().catch(() => {});
      this.isPlaying = false;
      this.playStateCallbacks.forEach((cb) => cb(false));
      return;
    }

    if (this.audioElement) {
      this.audioElement.pause();
      this.isPlaying = false;
    }
  }

  public seek(seconds: number): void {
    if (this.isNativeAndroid()) {
      JtecAudioPlayerNative.seek({ time: seconds }).catch(() => {});
      return;
    }

    if (this.audioElement && isFinite(seconds)) {
      const dur = isFinite(this.audioElement.duration) && this.audioElement.duration > 0
        ? this.audioElement.duration
        : seconds;
      this.audioElement.currentTime = Math.max(0, Math.min(seconds, dur));
    }
  }

  private fadeMultiplier = 1.0;

  public setFadeMultiplier(multiplier: number): void {
    const clamped = Math.max(0, Math.min(1, multiplier));
    this.fadeMultiplier = clamped;
    if (this.isNativeAndroid()) return;

    if (this.masterGain && this.audioCtx) {
      const now = this.audioCtx.currentTime;
      const baseVol = typeof this.currentEffectsConfig.volume === 'number' ? this.currentEffectsConfig.volume : 1.0;
      const targetVol = baseVol * this.fadeMultiplier;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(targetVol, now, 0.05);
    }
  }

  public resetFadeMultiplier(): void {
    this.setFadeMultiplier(1.0);
  }

  public setVolume(val: number): void {
    const clamped = Math.max(0, Math.min(1, val));
    this.currentEffectsConfig.volume = clamped;
    if (this.isNativeAndroid()) {
      JtecAudioPlayerNative.setVolume({ volume: clamped * this.fadeMultiplier }).catch(() => {});
      return;
    }

    if (this.masterGain && this.audioCtx) {
      const now = this.audioCtx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(clamped * this.fadeMultiplier, now);
    }
  }

  public applyEffects(config: AudioEffectsConfig): void {
    const speed = Math.max(0.5, Math.min(1.5, config.playbackRate || 1.0));
    const isSlowAesthetic =
      config.presetName === 'Slow + Reverb' ||
      config.presetName === 'Slow' ||
      config.presetName === 'Dreamy' ||
      config.presetName === 'Night' ||
      config.presetName === 'Cinematic' ||
      (speed < 0.98 && config.presetName !== 'Normal');

    const preservesPitch = typeof config.preservesPitch === 'boolean'
      ? config.preservesPitch
      : !isSlowAesthetic;

    const isEnabled = typeof config.isEnabled === 'boolean'
      ? config.isEnabled
      : (config.presetName !== 'Normal' || speed !== 1.0 || (config.reverbWet || 0) > 0.01 || (config.echoWet || 0) > 0.01 || config.bassGain !== 0 || config.trebleGain !== 0);

    this.currentEffectsConfig = {
      ...config,
      playbackRate: speed,
      preservesPitch,
      isEnabled,
    };

    PersistentSettingsService.saveAudioEffects(this.currentEffectsConfig);

    if (this.isNativeAndroid()) {
      JtecAudioPlayerNative.setEffects({
        playbackRate: this.isPartyModeActive ? this.partyDriftSpeed : speed,
        preservesPitch: this.isPartyModeActive ? true : preservesPitch,
        reverbWet: config.reverbWet || 0,
        echoWet: config.echoWet || 0,
        bassGain: config.bassGain || 0,
        trebleGain: config.trebleGain || 0,
      }).catch(() => {});
      JtecAudioPlayerNative.setVolume({
        volume: Math.max(0, Math.min(1, typeof config.volume === 'number' ? config.volume : 1.0)) * this.fadeMultiplier,
      }).catch(() => {});
      return;
    }

    if (this.isPartyModeActive) {
      if (this.audioElement) {
        this.audioElement.defaultPlaybackRate = 1.0;
        this.audioElement.playbackRate = this.partyDriftSpeed;
      }
      if (this.masterGain && this.audioCtx) {
        const vol = Math.max(0, Math.min(1, typeof config.volume === 'number' ? config.volume : 1.0));
        this.masterGain.gain.cancelScheduledValues(this.audioCtx.currentTime);
        this.masterGain.gain.setTargetAtTime(vol * this.fadeMultiplier, this.audioCtx.currentTime, 0.02);
      }
      return;
    }

    if (!this.audioElement) return;

    this.audioElement.defaultPlaybackRate = speed;
    this.audioElement.playbackRate = speed;

    try {
      (this.audioElement as unknown as { preservesPitch?: boolean }).preservesPitch = preservesPitch;
      (this.audioElement as unknown as { mozPreservesPitch?: boolean }).mozPreservesPitch = preservesPitch;
      (this.audioElement as unknown as { webkitPreservesPitch?: boolean }).webkitPreservesPitch = preservesPitch;
    } catch {}

    if (!this.audioCtx) return;
    const now = this.audioCtx.currentTime;

    if (this.bassFilter) {
      this.bassFilter.gain.cancelScheduledValues(now);
      if (Math.abs(config.bassGain) < 0.1) {
        this.bassFilter.gain.setValueAtTime(0, now);
      } else {
        const bassDb = (config.bassGain / 50) * 12;
        this.bassFilter.gain.setTargetAtTime(bassDb, now, 0.02);
      }
    }

    if (this.trebleFilter) {
      this.trebleFilter.gain.cancelScheduledValues(now);
      if (Math.abs(config.trebleGain) < 0.1) {
        this.trebleFilter.gain.setValueAtTime(0, now);
      } else {
        const trebleDb = (config.trebleGain / 50) * 12;
        this.trebleFilter.gain.setTargetAtTime(trebleDb, now, 0.02);
      }
    }

    const reverbWet = Math.max(0, Math.min(1, config.reverbWet || 0));
    if (this.reverbInputGain && this.reverbWetGain && this.dryGain) {
      this.reverbInputGain.gain.cancelScheduledValues(now);
      this.reverbWetGain.gain.cancelScheduledValues(now);
      this.dryGain.gain.cancelScheduledValues(now);

      if (reverbWet <= 0.001) {
        this.reverbInputGain.gain.setValueAtTime(0.0, now);
        this.reverbWetGain.gain.setValueAtTime(0.0, now);
        this.dryGain.gain.setValueAtTime(1.0, now);
      } else {
        const dryLevel = Math.max(0.4, 1.0 - reverbWet * 0.35);
        this.reverbInputGain.gain.setValueAtTime(1.0, now);
        this.reverbWetGain.gain.setTargetAtTime(reverbWet * 0.75, now, 0.02);
        this.dryGain.gain.setTargetAtTime(dryLevel, now, 0.02);
      }
    }

    const echoWet = Math.max(0, Math.min(1, config.echoWet || 0));
    if (this.echoInputGain && this.echoWetGain && this.delayFeedback) {
      this.echoInputGain.gain.cancelScheduledValues(now);
      this.echoWetGain.gain.cancelScheduledValues(now);
      this.delayFeedback.gain.cancelScheduledValues(now);

      if (echoWet <= 0.001) {
        this.echoInputGain.gain.setValueAtTime(0.0, now);
        this.echoWetGain.gain.setValueAtTime(0.0, now);
        this.delayFeedback.gain.setValueAtTime(0.0, now);
      } else {
        this.echoInputGain.gain.setValueAtTime(1.0, now);
        this.echoWetGain.gain.setTargetAtTime(echoWet * 0.55, now, 0.02);
        this.delayFeedback.gain.setTargetAtTime(0.35, now, 0.02);
      }
    }

    if (this.masterGain) {
      const vol = Math.max(0, Math.min(1, typeof config.volume === 'number' ? config.volume : 1.0));
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(vol * this.fadeMultiplier, now, 0.02);
    }
  }

  public setPartyNeutralOverride(enabled: boolean): void {
    this.isPartyModeActive = enabled;
    this.partyDriftSpeed = 1.0;

    if (this.isNativeAndroid()) {
      if (enabled) {
        JtecAudioPlayerNative.setEffects({ playbackRate: 1.0, preservesPitch: true, reverbWet: 0, echoWet: 0, bassGain: 0, trebleGain: 0 }).catch(() => {});
      } else {
        this.applyEffects(this.currentEffectsConfig);
      }
      return;
    }

    if (enabled) {
      if (this.audioElement) {
        this.audioElement.defaultPlaybackRate = 1.0;
        this.audioElement.playbackRate = 1.0;
        try {
          (this.audioElement as unknown as { preservesPitch?: boolean }).preservesPitch = true;
          (this.audioElement as unknown as { mozPreservesPitch?: boolean }).mozPreservesPitch = true;
          (this.audioElement as unknown as { webkitPreservesPitch?: boolean }).webkitPreservesPitch = true;
        } catch {}
      }

      if (this.audioCtx) {
        const now = this.audioCtx.currentTime;
        if (this.bassFilter) this.bassFilter.gain.setValueAtTime(0, now);
        if (this.trebleFilter) this.trebleFilter.gain.setValueAtTime(0, now);
        if (this.reverbInputGain) this.reverbInputGain.gain.setValueAtTime(0.0, now);
        if (this.reverbWetGain) this.reverbWetGain.gain.setValueAtTime(0.0, now);
        if (this.dryGain) this.dryGain.gain.setValueAtTime(1.0, now);
        if (this.echoInputGain) this.echoInputGain.gain.setValueAtTime(0.0, now);
        if (this.echoWetGain) this.echoWetGain.gain.setValueAtTime(0.0, now);
        if (this.delayFeedback) this.delayFeedback.gain.setValueAtTime(0.0, now);
      }
    } else {
      this.applyEffects(this.currentEffectsConfig);
    }
  }

  public setPartyDriftSpeed(rate: number): void {
    if (!this.isPartyModeActive) return;
    this.partyDriftSpeed = Math.max(0.95, Math.min(1.05, rate));
    if (this.isNativeAndroid()) {
      JtecAudioPlayerNative.setEffects({
        playbackRate: this.partyDriftSpeed,
        preservesPitch: true,
        reverbWet: 0,
        echoWet: 0,
        bassGain: 0,
        trebleGain: 0,
      }).catch(() => {});
      return;
    }
    if (this.audioElement) {
      this.audioElement.playbackRate = this.partyDriftSpeed;
    }
  }

  public getAnalyserNode(): AnalyserNode | null {
    return this.analyserNode;
  }

  public getFrequencyData(): Uint8Array | null {
    if (!this.analyserNode || !this.freqDataBuffer) return null;
    this.analyserNode.getByteFrequencyData(this.freqDataBuffer as unknown as Uint8Array<ArrayBuffer>);
    return this.freqDataBuffer;
  }

  public getTimeDomainData(): Uint8Array | null {
    if (!this.analyserNode || !this.timeDataBuffer) return null;
    this.analyserNode.getByteTimeDomainData(this.timeDataBuffer as unknown as Uint8Array<ArrayBuffer>);
    return this.timeDataBuffer;
  }

  public getAudioBands(): AudioBands | null {
    if (!this.analyserNode || !this.freqDataBuffer || !this.timeDataBuffer) return null;
    this.analyserNode.getByteFrequencyData(this.freqDataBuffer as unknown as Uint8Array<ArrayBuffer>);
    this.analyserNode.getByteTimeDomainData(this.timeDataBuffer as unknown as Uint8Array<ArrayBuffer>);

    const freq = this.freqDataBuffer;
    const time = this.timeDataBuffer;
    const len = freq.length;

    let bassSum = 0;
    const bassEnd = Math.min(8, len);
    for (let i = 1; i < bassEnd; i++) bassSum += freq[i];
    const bass = bassSum / (Math.max(1, bassEnd - 1) * 255);

    let lowSum = 0;
    const lowEnd = Math.min(24, len);
    for (let i = bassEnd; i < lowEnd; i++) lowSum += freq[i];
    const low = lowSum / (Math.max(1, lowEnd - bassEnd) * 255);

    let midSum = 0;
    const midEnd = Math.min(64, len);
    for (let i = lowEnd; i < midEnd; i++) midSum += freq[i];
    const mid = midSum / (Math.max(1, midEnd - lowEnd) * 255);

    let highSum = 0;
    for (let i = midEnd; i < len; i++) highSum += freq[i];
    const high = highSum / (Math.max(1, len - midEnd) * 255);

    let sumSquares = 0;
    for (let i = 0; i < time.length; i++) {
      const norm = (time[i] - 128) / 128;
      sumSquares += norm * norm;
    }
    const volume = Math.min(1, Math.sqrt(sumSquares / time.length) * 1.8);

    return {
      bass,
      low,
      mid,
      high,
      volume,
      rawFrequency: freq,
      rawTimeDomain: time,
    };
  }

  public getCurrentEffects(): AudioEffectsConfig {
    return { ...this.currentEffectsConfig };
  }

  public onTimeUpdate(cb: (current: number, duration: number) => void): () => void {
    this.timeUpdateCallbacks.add(cb);
    return () => this.timeUpdateCallbacks.delete(cb);
  }

  public onPlayStateChange(cb: (isPlaying: boolean) => void): () => void {
    this.playStateCallbacks.add(cb);
    return () => this.playStateCallbacks.delete(cb);
  }

  public onEnded(cb: () => void): () => void {
    this.endedCallbacks.add(cb);
    return () => this.endedCallbacks.delete(cb);
  }

  public onError(cb: (err: string) => void): () => void {
    this.errorCallbacks.add(cb);
    return () => this.errorCallbacks.delete(cb);
  }
}

export const audioEngine = new AudioEngine();
