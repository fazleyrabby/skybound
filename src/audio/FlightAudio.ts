import { Vector3 } from 'three';
import { Config } from '../core/Config';
import type { PlayerState } from '../player/PlayerState';
import { clamp, damp, lerp, smoothstep } from '../utils/math';
import type { AudioManager } from './AudioManager';

/** Distance to the nearest obstacle along a ray, or -1. Implemented by physics. */
export interface ProximityQuery {
  castRay(origin: Vector3, direction: Vector3, maxDistance: number): number;
}

const RUMBLE_CUTOFF = 90;
const AIRBORNE_FLOOR = 0.04;
const PROBE_INTERVAL = 0.1;
const UP = new Vector3(0, 1, 0);
const DOWN = new Vector3(0, -1, 0);
const side = new Vector3();
const forward = new Vector3();

/**
 * How close the hero is to a surface, 0 (nothing within `range`) to 1
 * (touching), from the nearest of left, right and below. Pure, for tests.
 */
export function closeness(distances: readonly number[], range: number): number {
  let nearest = range;
  for (const distance of distances) if (distance >= 0) nearest = Math.min(nearest, distance);
  return clamp(1 - nearest / range, 0, 1);
}

/**
 * The continuous layers that react to flight (spec section 40): wind that
 * rises and brightens with speed, a low rumble at boost speeds, a whoosh when
 * passing close to buildings or the ground at speed, and the hum of the city
 * near street level.
 */
export class FlightAudio {
  private windFilter: BiquadFilterNode | undefined;
  private windGain: GainNode | undefined;
  private rumbleGain: GainNode | undefined;
  private whooshGain: GainNode | undefined;
  private cityGain: GainNode | undefined;
  private rainGain: GainNode | undefined;
  private built = false;
  private sinceProbe = 0;
  private near = 0;
  /** Smoothed closeness, for the debug hook. */
  whoosh = 0;

  constructor(
    private readonly audio: AudioManager,
    private readonly player: PlayerState,
    private readonly world: ProximityQuery,
    /** Current rain, 0..1. */
    private readonly rain: () => number,
  ) {}

  /** Call once per rendered frame. */
  update(frameDelta: number): void {
    const context = this.audio.context;
    if (!context || !this.audio.running) return;
    if (!this.built) this.build(context);

    const cfg = Config.audio;
    const player = this.player;
    const speedFactor = player.speedFactor;
    const now = context.currentTime;
    const smoothing = 1 / cfg.response;

    // Wind: louder and brighter with speed; a dive pushes it brighter still.
    const floor = player.airborne ? AIRBORNE_FLOOR : 0;
    const wind = cfg.windVolume * Math.max(floor, Math.pow(speedFactor, 0.8));
    const cutoff =
      lerp(cfg.windMinCutoff, cfg.windMaxCutoff, speedFactor) * (player.diving ? 1.25 : 1);
    this.windGain?.gain.setTargetAtTime(wind, now, smoothing);
    this.windFilter?.frequency.setTargetAtTime(cutoff, now, smoothing);

    const { fastSpeed, extremeSpeed } = Config.flight;
    const rumble = cfg.rumbleVolume * smoothstep(fastSpeed, extremeSpeed, player.speed);
    this.rumbleGain?.gain.setTargetAtTime(rumble, now, smoothing);

    // Whoosh: probing the world is throttled; the result is eased between probes.
    this.sinceProbe += frameDelta;
    if (this.sinceProbe >= PROBE_INTERVAL) {
      this.sinceProbe = 0;
      this.near = this.probe();
    }
    this.whoosh = damp(this.whoosh, this.near, 8, frameDelta);
    const fast = smoothstep(cfg.whooshMinSpeed, fastSpeed, player.speed);
    this.whooshGain?.gain.setTargetAtTime(cfg.whooshVolume * this.whoosh * fast, now, 0.06);

    // City hum fades out with altitude and with distance from the core.
    const low = 1 - clamp(player.position.y / cfg.cityMaxAltitude, 0, 1);
    const inTown = 1 - smoothstep(500, 900, Math.hypot(player.position.x, player.position.z));
    this.cityGain?.gain.setTargetAtTime(cfg.cityVolume * low * inTown, now, 0.5);
    this.rainGain?.gain.setTargetAtTime(cfg.rainVolume * this.rain(), now, 0.4);
  }

  /** Looks left, right and down for something close. */
  private probe(): number {
    const player = this.player;
    const range = Config.audio.whooshRange;
    if (player.speed < Config.audio.whooshMinSpeed) return 0;
    forward.copy(player.velocity).normalize();
    side.crossVectors(forward, UP);
    if (side.lengthSq() < 1e-4) return 0;
    side.normalize();
    const right = this.world.castRay(player.position, side, range);
    const left = this.world.castRay(player.position, side.negate(), range);
    const below = this.world.castRay(player.position, DOWN, range);
    return closeness([left, right, below], range);
  }

  private build(context: AudioContext): void {
    const { sfx, noise } = this.audio;
    if (!sfx || !noise) return;
    this.built = true;

    const source = context.createBufferSource();
    source.buffer = noise;
    source.loop = true;

    const layer = (type: BiquadFilterType, frequency: number, q: number) => {
      const filter = context.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = frequency;
      filter.Q.value = q;
      const gain = context.createGain();
      gain.gain.value = 0;
      source.connect(filter).connect(gain).connect(sfx);
      return { filter, gain };
    };

    const wind = layer('bandpass', Config.audio.windMinCutoff, 0.7);
    this.windFilter = wind.filter;
    this.windGain = wind.gain;
    this.rumbleGain = layer('lowpass', RUMBLE_CUTOFF, 0.7).gain;
    this.whooshGain = layer('bandpass', 950, 1.6).gain;
    this.cityGain = layer('lowpass', 260, 0.5).gain;
    this.rainGain = layer('highpass', 2600, 0.4).gain;
    source.start();
  }
}
