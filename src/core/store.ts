import { createStore } from 'zustand/vanilla';

/** boot: loading. ready: waiting for the first click. paused: pointer lock was released. */
export type GamePhase = 'boot' | 'ready' | 'running' | 'paused';

export interface GameState {
  phase: GamePhase;
  perfOverlayVisible: boolean;
  /** Points earned from events and missions. */
  score: number;
  eventsCompleted: number;
  eventsFailed: number;
  setPhase(phase: GamePhase): void;
  togglePerfOverlay(): void;
  /** Records the outcome of a world event and banks its reward. */
  recordEvent(outcome: 'success' | 'failure', reward: number): void;
}

/**
 * Low-frequency state only. Per-frame data (positions, velocities, timers)
 * stays in plain objects owned by their systems.
 */
export const store = createStore<GameState>()((set) => ({
  phase: 'boot',
  perfOverlayVisible: import.meta.env.DEV,
  score: 0,
  eventsCompleted: 0,
  eventsFailed: 0,
  setPhase: (phase) => set({ phase }),
  togglePerfOverlay: () => set((s) => ({ perfOverlayVisible: !s.perfOverlayVisible })),
  recordEvent: (outcome, reward) =>
    set((s) => ({
      score: s.score + reward,
      eventsCompleted: s.eventsCompleted + (outcome === 'success' ? 1 : 0),
      eventsFailed: s.eventsFailed + (outcome === 'failure' ? 1 : 0),
    })),
}));
