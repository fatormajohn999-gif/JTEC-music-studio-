import { AudioEffectsConfig } from '../types/music';

class AudioEngine {
  private audioCtx: AudioContext | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  
  // Audio Nodes
  private inputGain: GainNode | null = null;
  private bassFilter: BiquadFilterNode | null = null;
  private trebleFilter: BiquadFilterNode | null = null;
  private dryGain: GainNode | null = null;
  private convolver: ConvolverNode | null = null;
  private reverbWetGain: GainNode | null = null;
  private delayNode: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;
  private echoWetGain: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;

  // Visualizer data buffers
  private timeDataBuffer: Uint8Array | null = null;
  private freqDataBuffer: Uint8Array | null = null;

  private isInitialized = false;
  private currentObjectUrl: string | null = null;

  // Track state
  public isPlaying = false;
  public currentTime = 0;
  public duration = 0;

  // Listeners
  private timeUpdateCallbacks: Set<(current: number, duration: number) => void> = new Set();
  private playStateCallbacks: Set<(isPlaying: boolean) => void> = new Set();
  private endedCallbacks: Set<() => void> = new Set();
  private errorCallbacks: Set<(error: string) => void> = new Set();

  constructor() {
    // Audio element is initialized on demand or in browser
  }

  public init() {
    if (this.isInitialized) return;

    this.audioElement = new Audio();
    this.audioElement.preload = 'auto';
    this.audioElement.crossOrigin = 'anonymous';

    // Hook audio element events
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

  private setupWebAudioNodes() {
    if (!this.audioElement) return;
    if (this.audioCtx && this.sourceNode) return;

    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioContextClass();

      // Source
      this.sourceNode = this.audioCtx.createMediaElementSource(this.audioElement);

      // Input gain
      this.inputGain = this.audioCtx.createGain();
      this.inputGain.gain.value = 1.0;

      // Bass EQ (Low Shelf around 180Hz)
      this.bassFilter = this.audioCtx.createBiquadFilter();
      this.bassFilter.type = 'lowshelf';
      this.bassFilter.frequency.value = 180;
      this.bassFilter.gain.value = 0;

      // Treble EQ (High Shelf around 4000Hz)
      this.trebleFilter = this.audioCtx.createBiquadFilter();
      this.trebleFilter.type = 'highshelf';
      this.trebleFilter.frequency.value = 4000;
      this.trebleFilter.gain.value = 0;

      // Dry gain
      this.dryGain = this.audioCtx.createGain();
      this.dryGain.gain.value = 1.0;

      // Convolution Reverb
      this.convolver = this.audioCtx.createConvolver();
      this.convolver.buffer = this.createImpulseResponse(this.audioCtx, 2.6, 2.8);
      this.reverbWetGain = this.audioCtx.createGain();
      this.reverbWetGain.gain.value = 0.0;

      // Echo / Delay
      this.delayNode = this.audioCtx.createDelay(2.0);
      this.delayNode.delayTime.value = 0.35;
      this.delayFeedback = this.audioCtx.createGain();
      this.delayFeedback.gain.value = 0.38;
      this.echoWetGain = this.audioCtx.createGain();
      this.echoWetGain.gain.value = 0.0;

      // Feedback routing for echo
      this.delayNode.connect(this.delayFeedback);
      this.delayFeedback.connect(this.delayNode);
      this.delayNode.connect(this.echoWetGain);

      // Master Gain
      this.masterGain = this.audioCtx.createGain();
      this.masterGain.gain.value = 1.0;

      // Analyser Node
      this.analyserNode = this.audioCtx.createAnalyser();
      this.analyserNode.fftSize = 256;
      this.analyserNode.smoothingTimeConstant = 0.8;
      this.timeDataBuffer = new Uint8Array(this.analyserNode.fftSize);
      this.freqDataBuffer = new Uint8Array(this.analyserNode.frequencyBinCount);

      // Connect pipeline
      // source -> inputGain -> bassFilter -> trebleFilter
      this.sourceNode.connect(this.inputGain);
      this.inputGain.connect(this.bassFilter);
      this.bassFilter.connect(this.trebleFilter);

      // Dry path: trebleFilter -> dryGain -> masterGain
      this.trebleFilter.connect(this.dryGain);
      this.dryGain.connect(this.masterGain);

      // Reverb path: trebleFilter -> convolver -> reverbWetGain -> masterGain
      this.trebleFilter.connect(this.convolver);
      this.convolver.connect(this.reverbWetGain);
      this.reverbWetGain.connect(this.masterGain);

      // Echo path: trebleFilter -> delayNode (then echoWetGain -> masterGain)
      this.trebleFilter.connect(this.delayNode);
      this.echoWetGain.connect(this.masterGain);

      // Master -> Analyser -> Destination
      this.masterGain.connect(this.analyserNode);
      this.analyserNode.connect(this.audioCtx.destination);
    } catch (e) {
      console.warn('Web Audio API setup warning:', e);
    }
  }

  // Generates algorithmic impulse response for true Convolver Reverb
  private createImpulseResponse(ctx: AudioContext, duration: number, decay: number): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const length = sampleRate * duration;
    const impulse = ctx.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const n = length - i;
      const factor = Math.pow(n / length, decay);
      // Stereo decorrelation
      left[i] = (Math.random() * 2 - 1) * factor;
      right[i] = (Math.random() * 2 - 1) * factor;
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
      this.audioElement.src = this.currentObjectUrl;
    } else {
      this.audioElement.src = blobOrUrl;
    }

    this.audioElement.load();
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
    if (this.masterGain && this.audioCtx) {
      const clamped = Math.max(0, Math.min(1, val));
      this.masterGain.gain.setValueAtTime(clamped, this.audioCtx.currentTime);
    }
  }

  // Real-time Audio Effects Application (Does NOT restart song)
  public applyEffects(config: AudioEffectsConfig): void {
    if (!this.audioElement) return;

    // 1. Playback speed + pitch
    // HTML5 audio elements default to preservesPitch = true
    // When speed < 0.95 or preset is Slow+Reverb, disabling preservesPitch gives authentic lowered pitch
    try {
      const isSlowReverb = config.presetName === 'Slow + Reverb' || config.playbackRate < 0.95;
      (this.audioElement as unknown as { preservesPitch?: boolean }).preservesPitch = !isSlowReverb;
      (this.audioElement as unknown as { mozPreservesPitch?: boolean }).mozPreservesPitch = !isSlowReverb;
      (this.audioElement as unknown as { webkitPreservesPitch?: boolean }).webkitPreservesPitch = !isSlowReverb;
    } catch {
      // ignore
    }
    this.audioElement.playbackRate = config.playbackRate;

    if (!this.audioCtx) return;
    const now = this.audioCtx.currentTime;

    // 2. Bass EQ: config.bassGain is -50 to +50 -> mapped to -16dB to +16dB
    if (this.bassFilter) {
      const bassDb = (config.bassGain / 50) * 16;
      this.bassFilter.gain.setTargetAtTime(bassDb, now, 0.05);
    }

    // 3. Treble EQ: config.trebleGain is -50 to +50 -> mapped to -16dB to +16dB
    if (this.trebleFilter) {
      const trebleDb = (config.trebleGain / 50) * 16;
      this.trebleFilter.gain.setTargetAtTime(trebleDb, now, 0.05);
    }

    // 4. Reverb Wet/Dry mix
    // reverbWet: 0.0 to 1.0
    if (this.reverbWetGain && this.dryGain) {
      const wet = Math.max(0, Math.min(1, config.reverbWet));
      // Crossfade: dry reduced slightly when wet is maximum
      const dry = Math.max(0.3, 1.0 - wet * 0.45);
      this.reverbWetGain.gain.setTargetAtTime(wet * 0.9, now, 0.05);
      this.dryGain.gain.setTargetAtTime(dry, now, 0.05);
    }

    // 5. Echo Wet mix: config.echoWet is 0.0 to 1.0
    if (this.echoWetGain) {
      const echo = Math.max(0, Math.min(1, config.echoWet));
      this.echoWetGain.gain.setTargetAtTime(echo * 0.7, now, 0.05);
    }

    // 6. Master Volume
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(Math.max(0, Math.min(1, config.volume)), now, 0.05);
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

  // Event Subscription
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
