export interface VisualizerPerformanceStats {
  theme: string;
  avgFrameTimeMs: number;
  drawTimeMs: number;
  fps: number;
  qualityStep: 'low' | 'balanced' | 'high';
  bubblesCount: number;
  starsCount: number;
  lastUpdated: number;
}

const defaultStats: VisualizerPerformanceStats = {
  theme: 'jt_night',
  avgFrameTimeMs: 16.6,
  drawTimeMs: 2.0,
  fps: 60,
  qualityStep: 'balanced',
  bubblesCount: 48,
  starsCount: 120,
  lastUpdated: Date.now(),
};

let currentStats: VisualizerPerformanceStats = { ...defaultStats };
const listeners = new Set<(stats: VisualizerPerformanceStats) => void>();

export const VisualizerDiagnostics = {
  getStats(): VisualizerPerformanceStats {
    return currentStats;
  },

  updateStats(partial: Partial<VisualizerPerformanceStats>): void {
    currentStats = { ...currentStats, ...partial, lastUpdated: Date.now() };
    listeners.forEach((cb) => {
      try {
        cb(currentStats);
      } catch (err) {
        console.warn('[VisualizerDiagnostics] listener error:', err);
      }
    });
  },

  subscribe(callback: (stats: VisualizerPerformanceStats) => void): () => void {
    listeners.add(callback);
    callback(currentStats);
    return () => {
      listeners.delete(callback);
    };
  },
};
