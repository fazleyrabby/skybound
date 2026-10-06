import { createStore } from 'zustand/vanilla';

/** boot: loading. ready: waiting for the first click. paused: pointer lock was released. */
export type GamePhase = 'boot' | 'ready' | 'running' | 'paused';

export interface GameState {
  phase: GamePhase;
  perfOverlayVisible: boolean;
  setPhase(phase: GamePhase): void;
  togglePerfOverlay(): void;
}

/**
 * Low-frequency state only. Per-frame data (positions, velocities, timers)
 * stays in plain objects owned by their systems.
 */
export const store = createStore<GameState>()((set) => ({
  phase: 'boot',
  perfOverlayVisible: import.meta.env.DEV,
  setPhase: (phase) => set({ phase }),
  togglePerfOverlay: () => set((s) => ({ perfOverlayVisible: !s.perfOverlayVisible })),
}));
