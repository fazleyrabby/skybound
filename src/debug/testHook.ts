import { Vector3 } from 'three';
import type { LoopStats } from '../core/GameLoop';
import type { BossFight } from '../enemies/boss/BossFight';
import type { EnemyManager } from '../enemies/EnemyManager';
import type { MissionManager } from '../missions/MissionManager';
import type { DayNightSystem } from '../world/DayNightSystem';
import type { WeatherSystem, Weather } from '../world/WeatherSystem';
import type { WorldEvents } from '../world/WorldEvents';
import type { CombatController } from '../player/CombatController';
import { store, type GamePhase } from '../core/store';
import type { Action } from '../input/Actions';
import type { InputManager } from '../input/InputManager';
import type { Player } from '../player/Player';
import type { FlightState } from '../player/PlayerState';
import type { QualityPreset } from '../rendering/QualitySettings';
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
  /** Time of day, 0..24. */
  hour: number;
  /** 0 by day .. 1 at night. */
  night: number;
  /** 0 dry .. 1 full rain. */
  rain: number;
}

export interface BossSnapshot {
  alive: boolean;
  state: string;
  phase: number;
  health: number;
  targets: number;
  laser: string;
  defeated: boolean;
  x: number;
  y: number;
  z: number;
}

export interface MissionSnapshot {
  active: string | null;
  objective: string | null;
  progress: string | null;
  target: { x: number; y: number; z: number; radius: number; kind: string } | null;
  available: string[];
  offered: string | null;
  completed: string[];
  result: string | null;
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
  readonly emittedParticles: number;
  readonly world: WorldSnapshot;
  /** Whether the hero model loaded, how many of its joints were found, and its pose. */
  readonly hero: { model: boolean; joints: number; pose: string | null };
  damagePlayer(amount: number): void;
  /** The current world event, if any, and the score so far. */
  readonly event: { phase: string; site: string | null; status: string | null; timeLeft: number };
  readonly score: number;
  readonly mission: MissionSnapshot;
  readonly boss: BossSnapshot;
  /** Whether sound is playing, the music intensity, and how close the hero is to a surface. */
  readonly audio: { running: boolean; intensity: number; whoosh: number };
  readonly quality: { preset: QualityPreset; auto: boolean; pixelRatio: number };
  /** Picks a quality preset by hand, or 'auto' to let it adapt. */
  setQuality(choice: QualityPreset | 'auto'): void;
  /** Milliseconds the simulation took on the last frame. */
  readonly simMs: number;
  /** Jumps the clock to an hour (0..24) and holds it there. */
  setTime(hour: number): void;
  setWeather(weather: Weather): void;
  /** Starts the Titan fight directly, outside any mission. */
  spawnBoss(): void;
  /** Damages Titan as a weak-point hit would, ignoring armour. */
  damageBoss(amount: number): void;
  startMission(id: string): boolean;
  abandonMission(): void;
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
  emittedParticles: () => number;
  world: () => WorldSnapshot;
  hero: () => { model: boolean; joints: number; pose: string | null };
  worldEvents: WorldEvents;
  missions: MissionManager;
  boss: BossFight;
  audio: () => { running: boolean; intensity: number; whoosh: number };
  dayNight: DayNightSystem;
  weather: WeatherSystem;
  quality: {
    get(): { preset: QualityPreset; auto: boolean; pixelRatio: number };
    set(choice: QualityPreset | 'auto'): void;
  };
  simMs: () => number;
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
    get emittedParticles() {
      return sources.emittedParticles();
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
    get mission() {
      const missions = sources.missions;
      return {
        active: missions.active?.id ?? null,
        objective: missions.objective?.label ?? null,
        progress: missions.objective?.progress() ?? null,
        target: missions.target,
        available: missions.available.map((mission) => mission.id),
        offered: missions.offered?.id ?? null,
        completed: store.getState().missionsCompleted,
        result: missions.result?.outcome ?? null,
      };
    },
    get boss() {
      const { titan, attacks, defeated, targets } = sources.boss;
      return {
        alive: titan.alive,
        state: titan.state,
        phase: titan.phase,
        health: titan.healthFraction,
        targets: targets.length,
        laser: attacks.laserState,
        defeated,
        x: titan.position.x,
        y: titan.position.y,
        z: titan.position.z,
      };
    },
    get audio() {
      return sources.audio();
    },
    get quality() {
      return sources.quality.get();
    },
    setQuality: (choice) => sources.quality.set(choice),
    get simMs() {
      return sources.simMs();
    },
    setTime: (hour) => {
      sources.dayNight.frozen = true;
      sources.dayNight.setHour(hour);
    },
    setWeather: (weather) => sources.weather.set(weather),
    spawnBoss: () => sources.boss.start(),
    damageBoss: (amount) => sources.boss.titan.takeDamage(amount),
    startMission: (id) => sources.missions.start(id),
    abandonMission: () => sources.missions.abandon(),
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
