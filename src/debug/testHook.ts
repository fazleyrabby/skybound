import { Vector3 } from 'three';
import type { LoopStats } from '../core/GameLoop';
import type { EnemyManager } from '../enemies/EnemyManager';
import type { WorldEvents } from '../world/WorldEvents';
import type { CombatController } from '../player/CombatController';
import { store, type GamePhase } from '../core/store';
import type { Action } from '../input/Actions';
import type { InputManager } from '../input/InputManager';
import type { Player } from '../player/Player';
import type { FlightState } from '../player/PlayerState';
import type { RenderStats } from '../rendering/Renderer';

const ZERO = new Vector3();

export interface PlayerSnapshot {
  state: FlightState;
  diving: boolean;
  x: number;
  y: number;
  z: number;
  speed: number;
  heading: number;
  lastImpactSpeed: number;
  boundsPressure: number;
  health: number;
  energy: number;
}

export interface WorldSnapshot {
  liveChunks: number;
  totalChunks: number;
  vehicles: number;
  pedestrians: number;
}

export interface EnemySnapshot {
  id: number;
  alive: boolean;
  passive: boolean;
  dormant: boolean;
  state: string;
  health: number;
  x: number;
  y: number;
  z: number;
}

export interface TestHook {
  readonly phase: GamePhase;
  readonly frameCount: number;
  readonly stepCount: number;
  readonly errorCount: number;
  readonly bodyCount: number;
  readonly render: RenderStats;
  readonly perfOverlayVisible: boolean;
  readonly player: PlayerSnapshot;
  readonly camera: { fov: number; distance: number; roll: number };
  readonly combat: { targetId: number | null; locked: boolean };
  readonly enemies: EnemySnapshot[];
  /** Enemy bullets and missiles currently in flight. */
  readonly enemyShots: number;
  readonly particles: number;
  readonly world: WorldSnapshot;
  /** Whether the hero model loaded, how many of its joints were found, and its pose. */
  readonly hero: { model: boolean; joints: number; pose: string | null };
  damagePlayer(amount: number): void;
  /** The current world event, if any, and the score so far. */
  readonly event: { phase: string; site: string | null; status: string | null; timeLeft: number };
  readonly score: number;
  /** Starts a world event now, optionally at a given site index. */
  triggerEvent(siteIndex?: number): boolean;
  /** Destroys an enemy outright, as if the player had. */
  destroyEnemy(id: number): void;
  /** Starts the simulation without pointer lock, which headless browsers may refuse. */
  start(): void;
  setAction(action: Action, held: boolean): void;
  setAim(yaw: number, pitch: number): void;
  /** Places the player hovering at a point, for reaching far parts of the map quickly. */
  teleport(x: number, y: number, z: number): void;
}

declare global {
  interface Window {
    __SKYBOUND__?: TestHook;
  }
}

export function isDebugEnabled(): boolean {
  return import.meta.env.DEV || new URLSearchParams(location.search).has('debug');
}

/** State and input injection for Playwright (spec section 68). Dev builds or `?debug` only. */
export function installTestHook(sources: {
  loop: LoopStats;
  render: () => RenderStats;
  bodyCount: () => number;
  input: InputManager;
  player: Player;
  camera: () => { fov: number; distance: number; roll: number };
  combat: CombatController;
  enemies: EnemyManager;
  particles: () => number;
  world: () => WorldSnapshot;
  hero: () => { model: boolean; joints: number; pose: string | null };
  worldEvents: WorldEvents;
}): void {
  let errorCount = 0;
  window.addEventListener('error', () => errorCount++);
  window.addEventListener('unhandledrejection', () => errorCount++);
  const { input, player } = sources;

  window.__SKYBOUND__ = {
    get phase() {
      return store.getState().phase;
    },
    get frameCount() {
      return sources.loop.frameCount;
    },
    get stepCount() {
      return sources.loop.stepCount;
    },
    get errorCount() {
      return errorCount;
    },
    get bodyCount() {
      return sources.bodyCount();
    },
    get render() {
      return sources.render();
    },
    get perfOverlayVisible() {
      return store.getState().perfOverlayVisible;
    },
    get player() {
      const s = player.state;
      return {
        state: s.state,
        diving: s.diving,
        x: s.position.x,
        y: s.position.y,
        z: s.position.z,
        speed: s.speed,
        heading: s.heading,
        lastImpactSpeed: s.lastImpactSpeed,
        boundsPressure: s.boundsPressure,
        health: s.health,
        energy: s.energy,
      };
    },
    get camera() {
      return sources.camera();
    },
    get combat() {
      const { current, locked } = sources.combat.targeting;
      return { targetId: current?.id ?? null, locked };
    },
    get enemies() {
      return sources.enemies.drones.map((drone) => ({
        id: drone.id,
        alive: drone.alive,
        passive: drone.passive,
        dormant: drone.dormant,
        state: drone.state,
        health: drone.health,
        x: drone.position.x,
        y: drone.position.y,
        z: drone.position.z,
      }));
    },
    get enemyShots() {
      const { bullets, missiles } = sources.enemies.fire;
      return bullets.filter((b) => b.active).length + missiles.filter((m) => m.active).length;
    },
    get particles() {
      return sources.particles();
    },
    get world() {
      return sources.world();
    },
    get hero() {
      return sources.hero();
    },
    damagePlayer: (amount) => player.damage(amount),
    get event() {
      const { phase, current, timeLeft } = sources.worldEvents;
      return {
        phase,
        site: current?.site.name ?? null,
        status: current?.status() ?? null,
        timeLeft,
      };
    },
    get score() {
      return store.getState().score;
    },
    triggerEvent: (siteIndex) => sources.worldEvents.trigger(siteIndex),
    destroyEnemy: (id) => {
      const drone = sources.enemies.drones.find((candidate) => candidate.id === id);
      drone?.applyHit(1e9, ZERO);
    },
    start: () => store.getState().setPhase('running'),
    setAction: (action, held) => input.setAction(action, held),
    teleport: (x, y, z) => player.teleport(x, y, z),
    setAim: (yaw, pitch) => {
      player.state.aim.yaw = yaw;
      player.state.aim.pitch = pitch;
    },
  };
}
