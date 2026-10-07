import { AudioEffectsConfig, AudioBands } from '../types/music';

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
  private currentEffectsConfig: AudioEffectsConfig = {
    playbackRate: 1.0,
    reverbWet: 0.0,
    echoWet: 0.0,
    bassGain: 0,
    trebleGain: 0,
    volume: 1.0,
    presetName: 'Normal',
  };

  // Track playback state
  public isPlaying = false;
  public currentTime = 0;
  public duration = 0;

  // Listeners
  private timeUpdateCallbacks: Set<(current: number, duration: number) => void> = new Set();
  private playStateCallbacks: Set<(isPlaying: boolean) => void> = new Set();
  private endedCallbacks: Set<() => void> = new Set();
  private errorCallbacks: Set<(error: string) => void> = new Set();

  constructor() {
    // Initialized lazily on first user interaction
  }

  public init() {
    if (this.isInitialized) return;

    this.audioElement = new Audio();
    this.audioElement.preload = 'auto';

    // Hook audio element events once
    this.audioElement.addEventListener('timeupdate', () => {
      if (this.audioElement) {
        this.currentTime = this.audioElement.currentTime;
        this.duration = this.audioElement.duration || 0;
        this.timeUpdateCallbacks.forEach((cb) => cb(this.currentTime, this.duration));
      }
    });

    this.audioElement.addEventListener('play', () => {
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

    this.audioElement.addEventListener('error', (e) => {
      console.error('Audio element playback error', e);
      this.isPlaying = false;
      this.playStateCallbacks.forEach((cb) => cb(false));
      this.errorCallbacks.forEach((cb) =>
        cb("JTEC MUSIC couldn't play this file. The format may not be supported by your browser.")
      );
    });

    this.isInitialized = true;
  }

  /**
   * Builds the single, persistent Web Audio API routing graph.
   * MediaElementAudioSourceNode is created EXACTLY ONCE and reused.
   *
   * Signal Flow:
   *
   *                  ┌──> [AnalyserNode] (Isolated tap for visualizer only)
   *                  │
   * [AudioElement] -> [SourceNode] -> [InputGain] -> [BassFilter] -> [TrebleFilter]
   *                                                                        │
   *    ┌───────────────────────────────────────────────────────────────────┼────────────────────────┐
   *    │                                                                   │                        │
   *    ▼                                                                   ▼                        ▼
   * [DryGain]                                                      [ReverbInputGain]         [EchoInputGain]
   *    │                                                                   │                        │
   *    │                                                                   ▼                        ▼
   *    │                                                              [Convolver]              [DelayNode] <-> [Feedback]
   *    │                                                                   │                        │
   *    │                                                                   ▼                        ▼
   *    │                                                           [ReverbWetGain]            [EchoWetGain]
   *    │                                                                   │                        │
   *    └───────────────────────────────────┬───────────────────────────────┘────────────────────────┘
   *                                        ▼
   *                                  [MasterGain]
   *                                        │
   *                                        ▼
   *                            [audioCtx.destination]
   */
  private setupWebAudioNodes() {
    if (!this.audioElement) return;
    if (this.audioCtx && this.sourceNode) return;

    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioContextClass();

      // Create MediaElementSourceNode ONCE
      this.sourceNode = this.audioCtx.createMediaElementSource(this.audioElement);

      // Input unity gain
      this.inputGain = this.audioCtx.createGain();
      this.inputGain.gain.value = 1.0;

      // Analyser Node (Tapped directly for visualizer without modifying audio or routing to destination)
      this.analyserNode = this.audioCtx.createAnalyser();
      this.analyserNode.fftSize = 256;
      this.analyserNode.smoothingTimeConstant = 0.8;
      this.timeDataBuffer = new Uint8Array(this.analyserNode.fftSize);
      this.freqDataBuffer = new Uint8Array(this.analyserNode.frequencyBinCount);

      // Bass EQ (Low Shelf around 120Hz, Q 0.707)
      this.bassFilter = this.audioCtx.createBiquadFilter();
      this.bassFilter.type = 'lowshelf';
      this.bassFilter.frequency.value = 120;
      this.bassFilter.gain.value = 0;

      // Treble EQ (High Shelf around 4500Hz, Q 0.707)
      this.trebleFilter = this.audioCtx.createBiquadFilter();
      this.trebleFilter.type = 'highshelf';
      this.trebleFilter.frequency.value = 4500;
      this.trebleFilter.gain.value = 0;

      // Dry path gain
      this.dryGain = this.audioCtx.createGain();
      this.dryGain.gain.value = 1.0;

      // Reverb path: ReverbInputGain -> Convolver -> ReverbWetGain
      this.reverbInputGain = this.audioCtx.createGain();
      this.reverbInputGain.gain.value = 0.0;
      this.convolver = this.audioCtx.createConvolver();
      this.convolver.buffer = this.createWarmImpulseResponse(this.audioCtx, 2.2, 3.2);
      this.reverbWetGain = this.audioCtx.createGain();
      this.reverbWetGain.gain.value = 0.0;

      // Echo path: EchoInputGain -> DelayNode -> EchoWetGain (with controlled feedback loop)
      this.echoInputGain = this.audioCtx.createGain();
      this.echoInputGain.gain.value = 0.0;
      this.delayNode = this.audioCtx.createDelay(1.5);
      this.delayNode.delayTime.value = 0.32;
      this.delayFeedback = this.audioCtx.createGain();
      this.delayFeedback.gain.value = 0.0;
      this.echoWetGain = this.audioCtx.createGain();
      this.echoWetGain.gain.value = 0.0;

      // Master Gain
      this.masterGain = this.audioCtx.createGain();
      this.masterGain.gain.value = 1.0;

      // Connect visualizer tap (pure analysis, never outputs to speakers)
      this.sourceNode.connect(this.analyserNode);

      // Connect main audio path:
      // Source -> InputGain -> BassFilter -> TrebleFilter
      this.sourceNode.connect(this.inputGain);
      this.inputGain.connect(this.bassFilter);
      this.bassFilter.connect(this.trebleFilter);

      // 1. Dry path: TrebleFilter -> DryGain -> MasterGain
      this.trebleFilter.connect(this.dryGain);
      this.dryGain.connect(this.masterGain);

      // 2. Reverb path: TrebleFilter -> ReverbInputGain -> Convolver -> ReverbWetGain -> MasterGain
      this.trebleFilter.connect(this.reverbInputGain);
      this.reverbInputGain.connect(this.convolver);
      this.convolver.connect(this.reverbWetGain);
      this.reverbWetGain.connect(this.masterGain);

      // 3. Echo path: TrebleFilter -> EchoInputGain -> DelayNode -> EchoWetGain -> MasterGain
      this.trebleFilter.connect(this.echoInputGain);
      this.echoInputGain.connect(this.delayNode);
      this.delayNode.connect(this.delayFeedback);
      this.delayFeedback.connect(this.delayNode);
      this.delayNode.connect(this.echoWetGain);
      this.echoWetGain.connect(this.masterGain);

      // Single output: MasterGain -> AudioContext Destination
      this.masterGain.connect(this.audioCtx.destination);
    } catch (e) {
      console.warn('Web Audio API setup warning:', e);
    }
  }

  /**
   * Generates a warm, natural acoustic room impulse response with high-frequency
   * absorption and stereo decorrelation. Eliminates metallic white-noise comb-filter artifacts.
   */
  private createWarmImpulseResponse(ctx: AudioContext, duration: number, decay: number): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * duration);
    const impulse = ctx.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    // 1-pole lowpass filter simulation for natural room acoustic damping
    let leftFilter = 0;
    let rightFilter = 0;
    const filterCoef = 0.16;

    for (let i = 0; i < length; i++) {
      const progress = i / length;
      const envelope = Math.exp(-decay * progress);

      // Random reflections
      const noiseL = (Math.random() * 2 - 1) * envelope;
      const noiseR = (Math.random() * 2 - 1) * envelope;

      // Filter high frequencies smoothly over time
      leftFilter += filterCoef * (noiseL - leftFilter);
      rightFilter += filterCoef * (noiseR - rightFilter);

      left[i] = leftFilter;
      right[i] = rightFilter;
    }

    return impulse;
  }

  public async resumeContext() {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      try {
        await this.audioCtx.resume();
      } catch (err) {
        console.warn('Could not resume audio context', err);
      }
    }
  }

  /**
   * Loads an audio track cleanly without destroying or recreating
   * the persistent MediaElementAudioSourceNode or AudioContext.
   */
  public async loadAudio(blobOrUrl: Blob | string): Promise<void> {
    this.init();
    this.setupWebAudioNodes();
    await this.resumeContext();

    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl);
      this.currentObjectUrl = null;
    }

    if (!this.audioElement) return;

    if (blobOrUrl instanceof Blob) {
      this.currentObjectUrl = URL.createObjectURL(blobOrUrl);
      // Local blobs should NOT have crossOrigin attribute set
      this.audioElement.removeAttribute('crossorigin');
      this.audioElement.src = this.currentObjectUrl;
    } else {
      // Only set crossOrigin if loading from an external http(s) origin
      if (typeof blobOrUrl === 'string' && blobOrUrl.startsWith('http') && !blobOrUrl.startsWith(window.location.origin)) {
        this.audioElement.crossOrigin = 'anonymous';
      } else {
        this.audioElement.removeAttribute('crossorigin');
      }
      this.audioElement.src = blobOrUrl;
    }

    this.audioElement.load();
    // Ensure the current active effects are applied cleanly to the new audio source
    this.applyEffects(this.currentEffectsConfig);
  }

  public async play(): Promise<void> {
    this.init();
    this.setupWebAudioNodes();
    await this.resumeContext();

    if (this.audioElement) {
      try {
        await this.audioElement.play();
        this.isPlaying = true;
      } catch (e) {
        console.error('Play prevented or failed', e);
        this.isPlaying = false;
        throw e;
      }
    }
  }

  public pause(): void {
    if (this.audioElement) {
      this.audioElement.pause();
      this.isPlaying = false;
    }
  }

  public seek(seconds: number): void {
    if (this.audioElement && isFinite(seconds)) {
      this.audioElement.currentTime = Math.max(0, Math.min(seconds, this.audioElement.duration || seconds));
    }
  }

  public setVolume(val: number): void {
    const clamped = Math.max(0, Math.min(1, val));
    this.currentEffectsConfig.volume = clamped;
    if (this.masterGain && this.audioCtx) {
      const now = this.audioCtx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(clamped, now);
    }
  }

  /**
   * Applies real-time DSP effects.
   * When preset is Normal (or speed=1.0x, reverb=0%, echo=0%, bass=0, treble=0):
   * The audio graph is guaranteed to be 100% neutral and transparent.
   */
  public applyEffects(config: AudioEffectsConfig): void {
    this.currentEffectsConfig = { ...config };

    if (!this.audioElement) return;

    // 1. Playback Speed and Pitch
    const speed = Math.max(0.5, Math.min(1.5, config.playbackRate || 1.0));
    this.audioElement.playbackRate = speed;
    this.audioElement.defaultPlaybackRate = 1.0;

    // Only apply pitch shifting when explicitly slowed (e.g. Slow + Reverb aesthetic)
    const isSlowAesthetic = config.presetName === 'Slow + Reverb' || (speed < 0.96 && config.presetName !== 'Normal');
    try {
      const preservesPitch = !isSlowAesthetic;
      (this.audioElement as unknown as { preservesPitch?: boolean }).preservesPitch = preservesPitch;
      (this.audioElement as unknown as { mozPreservesPitch?: boolean }).mozPreservesPitch = preservesPitch;
      (this.audioElement as unknown as { webkitPreservesPitch?: boolean }).webkitPreservesPitch = preservesPitch;
    } catch {
      // browser pitch preservation fallback
    }

    if (!this.audioCtx) return;
    const now = this.audioCtx.currentTime;

    // 2. Bass EQ: neutral (0 dB) when bassGain === 0
    if (this.bassFilter) {
      this.bassFilter.gain.cancelScheduledValues(now);
      if (Math.abs(config.bassGain) < 0.1) {
        this.bassFilter.gain.setValueAtTime(0, now);
      } else {
        const bassDb = (config.bassGain / 50) * 12; // Musical range (+-12dB), no clipping
        this.bassFilter.gain.setTargetAtTime(bassDb, now, 0.02);
      }
    }

    // 3. Treble EQ: neutral (0 dB) when trebleGain === 0
    if (this.trebleFilter) {
      this.trebleFilter.gain.cancelScheduledValues(now);
      if (Math.abs(config.trebleGain) < 0.1) {
        this.trebleFilter.gain.setValueAtTime(0, now);
      } else {
        const trebleDb = (config.trebleGain / 50) * 12;
        this.trebleFilter.gain.setTargetAtTime(trebleDb, now, 0.02);
      }
    }

    // 4. Reverb Wet/Dry Mix
    const reverbWet = Math.max(0, Math.min(1, config.reverbWet || 0));
    if (this.reverbInputGain && this.reverbWetGain && this.dryGain) {
      this.reverbInputGain.gain.cancelScheduledValues(now);
      this.reverbWetGain.gain.cancelScheduledValues(now);
      this.dryGain.gain.cancelScheduledValues(now);

      if (reverbWet <= 0.001) {
        // 100% Dry pass-through, completely isolate the convolver
        this.reverbInputGain.gain.setValueAtTime(0.0, now);
        this.reverbWetGain.gain.setValueAtTime(0.0, now);
        this.dryGain.gain.setValueAtTime(1.0, now);
      } else {
        // Smooth wet mix with proportionate dry level
        const dryLevel = Math.max(0.4, 1.0 - reverbWet * 0.35);
        this.reverbInputGain.gain.setValueAtTime(1.0, now);
        this.reverbWetGain.gain.setTargetAtTime(reverbWet * 0.75, now, 0.02);
        this.dryGain.gain.setTargetAtTime(dryLevel, now, 0.02);
      }
    }

    // 5. Echo Wet Mix & Controlled Feedback
    const echoWet = Math.max(0, Math.min(1, config.echoWet || 0));
    if (this.echoInputGain && this.echoWetGain && this.delayFeedback) {
      this.echoInputGain.gain.cancelScheduledValues(now);
      this.echoWetGain.gain.cancelScheduledValues(now);
      this.delayFeedback.gain.cancelScheduledValues(now);

      if (echoWet <= 0.001) {
        // 100% Mute echo path and stop feedback loop
        this.echoInputGain.gain.setValueAtTime(0.0, now);
        this.echoWetGain.gain.setValueAtTime(0.0, now);
        this.delayFeedback.gain.setValueAtTime(0.0, now);
      } else {
        // Controlled feedback prevents runaway resonance and clipping
        this.echoInputGain.gain.setValueAtTime(1.0, now);
        this.echoWetGain.gain.setTargetAtTime(echoWet * 0.55, now, 0.02);
        this.delayFeedback.gain.setTargetAtTime(0.35, now, 0.02);
      }
    }

    // 6. Master Volume
    if (this.masterGain) {
      const vol = Math.max(0, Math.min(1, typeof config.volume === 'number' ? config.volume : 1.0));
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(vol, now, 0.02);
    }
  }

  // Visualizer Analyser Accessors
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

    // Bass: bin 1 to ~8 (20Hz - ~160Hz)
    let bassSum = 0;
    const bassEnd = Math.min(8, len);
    for (let i = 1; i < bassEnd; i++) bassSum += freq[i];
    const bass = bassSum / (Math.max(1, bassEnd - 1) * 255);

    // Low: bin 8 to ~24 (160Hz - ~500Hz)
    let lowSum = 0;
    const lowEnd = Math.min(24, len);
    for (let i = bassEnd; i < lowEnd; i++) lowSum += freq[i];
    const low = lowSum / (Math.max(1, lowEnd - bassEnd) * 255);

    // Mid: bin 24 to ~64 (500Hz - ~2000Hz)
    let midSum = 0;
    const midEnd = Math.min(64, len);
    for (let i = lowEnd; i < midEnd; i++) midSum += freq[i];
    const mid = midSum / (Math.max(1, midEnd - lowEnd) * 255);

    // High: bin 64 to len (2000Hz - 16000Hz)
    let highSum = 0;
    for (let i = midEnd; i < len; i++) highSum += freq[i];
    const high = highSum / (Math.max(1, len - midEnd) * 255);

    // RMS volume
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

  // Event Subscriptions
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
