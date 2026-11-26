import { AppLogger } from '../services/appLogger';

/**
 * Dedicated audio playback engine for JTEC Party rooms.
 * Maintains its own HTMLAudioElement and independent playback lifecycle
 * so party tracks never collide with or overwrite normal JTEC Music playback.
 */
export class PartyAudioEngineClass {
  private audioElement: HTMLAudioElement | null = null;
  private isInitialized = false;
  private currentObjectUrl: string | null = null;
  private currentSource: string | Blob | null = null;
  private hasRetriedWithoutCors = false;
  private driftSpeed = 1.0;
  private loadGeneration = 0;

  // Track playback state
  public isPlaying = false;
  public currentTime = 0;
  public duration = 0;

  // Listeners
  private timeUpdateCallbacks: Set<(current: number, duration: number) => void> = new Set();
  private playStateCallbacks: Set<(isPlaying: boolean) => void> = new Set();
  private endedCallbacks: Set<() => void> = new Set();
  private errorCallbacks: Set<(error: string) => void> = new Set();

  public hasSource(): boolean {
    if (!this.audioElement) return false;
    const src = this.audioElement.currentSrc || this.audioElement.src;
    const originHref = typeof window !== 'undefined' ? window?.location?.href || '' : '';
    return Boolean(
      src &&
        src !== originHref &&
        src !== 'about:blank' &&
        !src.endsWith('/') &&
        !src.endsWith('#')
    );
  }

  public getCurrentObjectUrl(): string | null {
    return this.currentObjectUrl;
  }

  public getAudioElement(): HTMLAudioElement | null {
    return this.audioElement;
  }

  public enforceNeutralRateAndPitch = () => {
    if (!this.audioElement) return;
    this.audioElement.defaultPlaybackRate = 1.0;
    this.audioElement.playbackRate = this.driftSpeed;
    try {
      (this.audioElement as unknown as { preservesPitch?: boolean }).preservesPitch = true;
      (this.audioElement as unknown as { mozPreservesPitch?: boolean }).mozPreservesPitch = true;
      (this.audioElement as unknown as { webkitPreservesPitch?: boolean }).webkitPreservesPitch = true;
    } catch {
      // browser pitch preservation fallback
    }
  };

  public init(): void {
    if (this.isInitialized) return;
    if (typeof Audio === 'undefined') return;

    this.audioElement = new Audio();
    this.audioElement.preload = 'auto';

    const notifyTimeAndDuration = () => {
      if (!this.audioElement) return;
      this.currentTime = this.audioElement.currentTime || 0;
      const dur = this.audioElement.duration;
      this.duration = isFinite(dur) && dur > 0 ? dur : 0;
      this.timeUpdateCallbacks.forEach((cb) => cb(this.currentTime, this.duration));
    };

    this.audioElement.addEventListener('loadstart', this.enforceNeutralRateAndPitch);
    this.audioElement.addEventListener('loadedmetadata', () => {
      this.enforceNeutralRateAndPitch();
      notifyTimeAndDuration();
    });
    this.audioElement.addEventListener('loadeddata', this.enforceNeutralRateAndPitch);
    this.audioElement.addEventListener('canplay', this.enforceNeutralRateAndPitch);
    this.audioElement.addEventListener('timeupdate', notifyTimeAndDuration);
    this.audioElement.addEventListener('durationchange', notifyTimeAndDuration);

    this.audioElement.addEventListener('play', () => {
      this.enforceNeutralRateAndPitch();
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

      // Ignore abort errors triggered by switching tracks or stopAndUnload()
      if (mediaError?.code === 1) {
        return;
      }

      if (!this.hasSource()) {
        return;
      }

      // Retry once without crossOrigin if external stream failed CORS preflight
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
      AppLogger.error(
        'PartyAudioEngine',
        'party_audio_error',
        mediaError?.message || 'Party audio playback failed',
        {
          code: mediaError?.code ?? 'unknown',
          sourceType: currentSrc?.startsWith('blob:') ? 'local_blob' : currentSrc ? 'remote_url' : 'none',
        },
        'jtec_party'
      );
      this.isPlaying = false;
      this.playStateCallbacks.forEach((cb) => cb(false));
      this.errorCallbacks.forEach((cb) =>
        cb("JTEC Party couldn't play this track. The audio stream may be unavailable.")
      );
    });

    this.isInitialized = true;
  }

  public async loadTrack(blobOrUrl: Blob | string, initialPosition?: number): Promise<void> {
    if (!blobOrUrl) return;
    if (typeof Blob !== 'undefined' && blobOrUrl instanceof Blob && blobOrUrl.size === 0) {
      return;
    }
    if (typeof blobOrUrl === 'string' && (!blobOrUrl.trim() || blobOrUrl === 'about:blank')) {
      return;
    }

    this.init();
    if (!this.audioElement) return;

    this.loadGeneration += 1;
    const expectedGeneration = this.loadGeneration;

    this.currentSource = blobOrUrl;
    this.hasRetriedWithoutCors = false;
    this.driftSpeed = 1.0;

    const oldUrl = this.currentObjectUrl;

    if (typeof Blob !== 'undefined' && blobOrUrl instanceof Blob) {
      this.currentObjectUrl = URL.createObjectURL(blobOrUrl);
      this.audioElement.crossOrigin = null;
      this.audioElement.removeAttribute('crossorigin');
      this.audioElement.src = this.currentObjectUrl;
    } else {
      this.currentObjectUrl = null;
      const origin = typeof window !== 'undefined' ? window?.location?.origin || '' : '';
      if (typeof blobOrUrl === 'string' && blobOrUrl.startsWith('http') && (!origin || !blobOrUrl.startsWith(origin))) {
        this.audioElement.crossOrigin = 'anonymous';
      } else {
        this.audioElement.crossOrigin = null;
        this.audioElement.removeAttribute('crossorigin');
      }
      this.audioElement.src = blobOrUrl as string;
    }

    if (oldUrl) {
      try {
        URL.revokeObjectURL(oldUrl);
      } catch {
        // ignore
      }
    }

    this.enforceNeutralRateAndPitch();
    this.audioElement.load();
    this.enforceNeutralRateAndPitch();

    if (typeof initialPosition === 'number' && initialPosition > 0) {
      const applyPos = () => {
        if (this.audioElement && this.loadGeneration === expectedGeneration) {
          this.audioElement.currentTime = initialPosition;
          this.currentTime = initialPosition;
        }
      };
      this.audioElement.addEventListener('loadedmetadata', applyPos, { once: true });
    }
  }

  public async play(): Promise<void> {
    this.init();
    if (!this.audioElement) return;

    if (!this.hasSource()) {
      this.isPlaying = false;
      throw new Error('The party audio element has no supported sources.');
    }

    const expectedGeneration = this.loadGeneration;
    this.enforceNeutralRateAndPitch();
    try {
      await this.audioElement.play();
      if (this.loadGeneration !== expectedGeneration || !this.hasSource()) {
        try {
          this.audioElement.pause();
        } catch {
          // ignore
        }
        this.isPlaying = false;
        return;
      }
      this.enforceNeutralRateAndPitch();
      this.isPlaying = true;
    } catch (e: unknown) {
      if (typeof DOMException !== 'undefined' && e instanceof DOMException && e.name === 'AbortError') {
        return;
      }
      AppLogger.warning(
        'PartyAudioEngine',
        'party_audio_play_failed',
        e instanceof Error ? e.message : 'Party audio play failed',
        undefined,
        'jtec_party'
      );
      this.isPlaying = false;
      throw e;
    }
  }

  public pause(): void {
    if (this.audioElement) {
      this.audioElement.pause();
    }
    this.isPlaying = false;
  }

  public seek(seconds: number): void {
    if (this.audioElement && isFinite(seconds)) {
      const dur =
        isFinite(this.audioElement.duration) && this.audioElement.duration > 0
          ? this.audioElement.duration
          : seconds;
      const target = Math.max(0, Math.min(seconds, dur));
      this.audioElement.currentTime = target;
      this.currentTime = target;
    }
  }

  public setDriftSpeed(rate: number): void {
    this.driftSpeed = Math.max(0.95, Math.min(1.05, rate));
    if (this.audioElement) {
      this.enforceNeutralRateAndPitch();
    }
  }

  /**
   * Stops playback immediately, revokes any blob object URL,
   * unloads the audio source, and resets all party audio state.
   */
  public stopAndUnload(): void {
    this.loadGeneration += 1;

    if (this.audioElement) {
      try {
        this.audioElement.pause();
      } catch {
        // ignore
      }
      try {
        this.audioElement.currentTime = 0;
      } catch {
        // ignore
      }
      try {
        this.audioElement.removeAttribute('src');
        this.audioElement.src = '';
        this.audioElement.load();
      } catch {
        // ignore
      }
    }

    if (this.currentObjectUrl) {
      try {
        URL.revokeObjectURL(this.currentObjectUrl);
      } catch {
        // ignore
      }
      this.currentObjectUrl = null;
    }

    this.currentSource = null;
    this.hasRetriedWithoutCors = false;
    this.isPlaying = false;
    this.currentTime = 0;
    this.duration = 0;
    this.driftSpeed = 1.0;

    this.playStateCallbacks.forEach((cb) => cb(false));
    this.timeUpdateCallbacks.forEach((cb) => cb(0, 0));
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

export const partyAudioEngine = new PartyAudioEngineClass();
