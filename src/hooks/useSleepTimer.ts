import { useState, useEffect, useRef, useCallback } from 'react';
import { SleepTimerState } from '../types/music';
import { audioEngine } from '../services/audioEngine';

export function useSleepTimer(onTimerEnd?: () => void) {
  const [timerState, setTimerState] = useState<SleepTimerState>({
    isActive: false,
    totalDurationMinutes: 0,
    endTime: null,
    remainingSeconds: 0,
    isFading: false,
  });

  const stateRef = useRef(timerState);
  stateRef.current = timerState;

  const startTimer = useCallback((minutes: number) => {
    if (minutes <= 0) return;
    const now = Date.now();
    const durationMs = minutes * 60 * 1000;
    const end = now + durationMs;
    const totalSecs = Math.round(durationMs / 1000);

    audioEngine.resetFadeMultiplier();

    setTimerState({
      isActive: true,
      totalDurationMinutes: minutes,
      endTime: end,
      remainingSeconds: totalSecs,
      isFading: false,
    });
  }, []);

  const cancelTimer = useCallback(() => {
    audioEngine.resetFadeMultiplier();
    setTimerState({
      isActive: false,
      totalDurationMinutes: 0,
      endTime: null,
      remainingSeconds: 0,
      isFading: false,
    });
  }, []);

  const extendTimer = useCallback((additionalMinutes = 5) => {
    setTimerState((prev) => {
      if (!prev.isActive || !prev.endTime) return prev;
      const newEndTime = prev.endTime + additionalMinutes * 60 * 1000;
      const now = Date.now();
      const remaining = Math.max(0, Math.round((newEndTime - now) / 1000));

      if (remaining > 30) {
        audioEngine.resetFadeMultiplier();
      }

      return {
        ...prev,
        totalDurationMinutes: prev.totalDurationMinutes + additionalMinutes,
        endTime: newEndTime,
        remainingSeconds: remaining,
        isFading: remaining <= 30,
      };
    });
  }, []);

  // Tick interval every second
  useEffect(() => {
    if (!timerState.isActive || !timerState.endTime) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const currentEnd = stateRef.current.endTime;
      if (!currentEnd) return;

      const diffSecs = Math.max(0, Math.round((currentEnd - now) / 1000));

      if (diffSecs === 0) {
        // Timer expired: cleanly pause playback and reset fade multiplier
        audioEngine.pause();
        audioEngine.resetFadeMultiplier();
        setTimerState({
          isActive: false,
          totalDurationMinutes: 0,
          endTime: null,
          remainingSeconds: 0,
          isFading: false,
        });
        if (onTimerEnd) onTimerEnd();
      } else if (diffSecs <= 30) {
        // Last 30 seconds: gentle volume fade-out
        const fadeRatio = Math.max(0, diffSecs / 30);
        audioEngine.setFadeMultiplier(fadeRatio);
        setTimerState((prev) => ({
          ...prev,
          remainingSeconds: diffSecs,
          isFading: true,
        }));
      } else {
        setTimerState((prev) => ({
          ...prev,
          remainingSeconds: diffSecs,
          isFading: false,
        }));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [timerState.isActive, timerState.endTime, onTimerEnd]);

  return {
    timerState,
    startTimer,
    cancelTimer,
    extendTimer,
  };
}
