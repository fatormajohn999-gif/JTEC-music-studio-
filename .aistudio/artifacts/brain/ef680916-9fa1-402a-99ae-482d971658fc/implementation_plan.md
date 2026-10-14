# Sleep Timer Feature

A persistent, graceful sleep timer for JTEC MUSIC that allows listeners to fall asleep to their music, automatically fading volume over the final 30 seconds before pausing playback. Accessible in both SettingsScreen and AudioEffectsModal, with no intrusive timer widgets on the main player screen.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following user preferences were confirmed during clarification:
> - **Duration Options**: Presets (15m, 30m, 45m, 60m) plus custom minute input.
> - **End-of-Timer Behavior**: Gentle volume fade-out over the final 30 seconds before pausing playback, then restoring master volume to original level for future sessions.
> - **Display Scope**: Timers, active countdown, cancel, and quick +5m buttons will be hosted inside `SettingsScreen` and `AudioEffectsModal`. As explicitly requested, no timer clutter will be added to the player screens (`FullPlayer` or `MiniPlayer`).

- **Confirmed Decision 1**: Presets (15, 30, 45, 60 min) + inline custom minute stepper input.
- **Confirmed Decision 2**: Smooth 30-second linear/exponential volume fade-out curve via Web Audio API master gain.
- **Confirmed Decision 3**: Displayed exclusively in Settings and Audio Effects views; main player views stay clean and uncluttered.

---

## 1. Overview & Core Concept

- **What It Does**: Enables users to set a sleep countdown (15m, 30m, 45m, 60m, or any custom minute duration). While active, users can see the remaining minutes/seconds ticking down, cancel the timer at any time, or quickly add +5 minutes. Over the final 30 seconds of the timer, the audio engine smoothly attenuates master volume to zero, then cleanly pauses the audio engine.
- **Target Audience / Persona**: Bedtime listeners, ambient sound and "Slow + Reverb" loop enjoyers who want playback to shut off automatically without draining phone battery or waking them later in the night.
- **Key Value**: Hands-off, peace-of-mind bedtime playback with gentle acoustic damping that avoids abrupt silences.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Setting from Audio Effects Modal**:
   - The user opens Audio Effects (Sliders button in player or library).
   - Below the EQ and presets, a "Sleep Timer" section displays four quick preset buttons (`15m`, `30m`, `45m`, `60m`) and a "Custom" minute input trigger.
   - Tapping a preset starts the countdown immediately. The section transforms into an active countdown card showing `29:59 remaining`, a progress ring/bar, a `+5 min` extension button, and a `Cancel` button.

2. **Setting from Settings Screen**:
   - The user navigates to the Settings tab.
   - Under a new "Sleep Timer" section, the same synchronized timer state is accessible.
   - The user can start, adjust, extend, or cancel the timer seamlessly. Both views share the same unified timer state.

3. **Fade-Out & Pause Execution**:
   - When the countdown enters the last 30 seconds, a quiet "Fading out..." indicator appears.
   - The audio engine smoothly attenuates master volume from $100\%$ down to $0\%$.
   - At zero seconds, `audioEngine.pause()` is executed, the timer state resets to idle, and master volume is restored to default so the next play begins at full volume.

### Visual Identity & Theme Tokens

- **Aesthetic Direction**: Deep nocturnal slate (`#070b18` and `bg-slate-900/60`), bordered with hairline translucent cyan/purple strokes (`border-white/10` and `border-cyan-500/30`), cyan/purple neon accents matching JTEC MUSIC's cyber-aesthetic.
- **Typography**: Clean display title ("Sleep Timer"), `font-mono tabular-nums` for timer readout (`14:59`), unboxed metadata without pill tags.
- **Interactive Controls**: Touch-friendly buttons ($\ge 44\text{px}$ touch hitbox), responsive active states with subtle press scaling (`active:scale-95`).

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Centralized Timer Hook & Shared State in App Context**:
  - *Chosen Approach*: Maintain sleep timer state at the top-level `App.tsx` state / context or a dedicated `useSleepTimer` controller so both `SettingsScreen` and `AudioEffectsModal` always stay perfectly synchronized in real time.
  - *Why*: Prevents dual timers, out-of-sync states, or timer drops when switching screens or closing modals.
  - *Alternatives Considered*: Independent timers per component (rejected: causes conflicting timeouts and race conditions).

- **Decision 2: Web Audio API Master Gain Fade-Out vs HTMLAudioElement Volume**:
  - *Chosen Approach*: Implement smooth attenuation in `AudioEngine` using `audioEngine.setFadeVolume(ratio)` or ramp on `masterGain` while preserving user settings volume.
  - *Why*: Works reliably across all browsers without triggering permission quirks or stuttering media elements.

- **Decision 3: Zero Player Clutter**:
  - *Chosen Approach*: Strictly confine all sleep timer interfaces to `SettingsScreen` and `AudioEffectsModal`.
  - *Why*: Explicitly commanded by user ("I want the timers in setting I don't want it in player screen ok"). Preserves the immersive visualizer and cover art display in `FullPlayer`.

---

## 4. Technical Architecture & Data Strategy

### System Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                               App.tsx                                  │
│                                                                        │
│  [sleepTimerState: { isActive, targetTimestamp, totalSeconds, ... }]   │
│  [sleepTimerController: startTimer, cancelTimer, addMinutes]           │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
                    ▼                                ▼
     ┌────────────────────────────┐    ┌───────────────────────────┐
     │     SettingsScreen.tsx     │    │   AudioEffectsModal.tsx   │
     │                            │    │                           │
     │  - Sleep Timer Section     │    │  - Sleep Timer Section    │
     │  - 15m, 30m, 45m, 60m      │    │  - 15m, 30m, 45m, 60m     │
     │  - Custom minute input     │    │  - Custom minute input    │
     │  - Countdown + Cancel/+5m  │    │  - Countdown + Cancel/+5m │
     └────────────────────────────┘    └───────────────────────────┘
                    │                                │
                    └────────────────┬───────────────┘
                                     │
                                     ▼
                      ┌────────────────────────────┐
                      │    audioEngine (audio.ts)  │
                      │                            │
                      │  - Last 30s volume fade    │
                      │  - pause() on completion   │
                      │  - Restore master volume   │
                      └────────────────────────────┘
```

### Data Model & State Entities

```typescript
export interface SleepTimerState {
  isActive: boolean;
  totalDurationMinutes: number;
  endTime: number | null;        // Unix timestamp (Date.now() + ms)
  remainingSeconds: number;
  isFading: boolean;
}
```

### Key Handlers & Integrations

- `startSleepTimer(minutes: number)`: Computes `endTime = Date.now() + minutes * 60 * 1000`, sets active flag, and starts 1-second interval tick.
- `cancelSleepTimer()`: Clears interval, restores master volume to normal, resets state.
- `extendSleepTimer(additionalMinutes: number)`: Adds 5 minutes ($300\text{s}$) to current `endTime`.
- `tickHandler()`: Calculates `remainingSeconds = Math.max(0, Math.round((endTime - Date.now()) / 1000))`. If `remainingSeconds <= 30`, calculates `fade = remainingSeconds / 30` and scales audio volume. At `remainingSeconds === 0`, pauses music, resets volume, and clears timer.
