import { createRng } from '../utils/rng';

/** A straight line that followers travel along, in both directions. */
export interface Path {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  y: number;
}

export interface FollowerSpec {
  count: number;
  minSpeed: number;
  maxSpeed: number;
  colors: readonly number[];
  /** Lateral distance from the path centreline; followers keep to the right. */
  laneOffset: (path: Path, pathIndex: number) => number;
}

/** Values written per visible follower into the output buffer. */
export const FOLLOWER_STRIDE = 5;

/**
 * Things that move along fixed paths and wrap at the ends: vehicles and
 * pedestrians (spec sections 22, 23). No physics, no steering, no allocation
 * after construction. Positions are a pure function of distance travelled, so
 * rendering can extrapolate within a step.
 */
export class PathFollowers {
  readonly count: number;
  private readonly pathIndex: Uint16Array;
  /** +1 travels a to b, -1 travels b to a. */
  private readonly direction: Int8Array;
  private readonly distance: Float32Array;
  private readonly speed: Float32Array;
  private readonly color: Uint32Array;
  private readonly lengths: Float32Array;

  constructor(
    private readonly paths: readonly Path[],
    private readonly spec: FollowerSpec,
    seed: number,
  ) {
    const rng = createRng(seed);
    this.count = paths.length === 0 ? 0 : spec.count;
    this.pathIndex = new Uint16Array(this.count);
    this.direction = new Int8Array(this.count);
    this.distance = new Float32Array(this.count);
    this.speed = new Float32Array(this.count);
    this.color = new Uint32Array(this.count);
    this.lengths = Float32Array.from(paths, (p) => Math.hypot(p.bx - p.ax, p.bz - p.az));

    // Spread followers over paths in proportion to length, so density is even.
    const total = this.lengths.reduce((sum, length) => sum + length, 0);
    for (let i = 0; i < this.count; i++) {
      let pick = rng.next() * total;
      let index = 0;
      while (index < paths.length - 1 && pick > (this.lengths[index] ?? 0)) {
        pick -= this.lengths[index] ?? 0;
        index++;
      }
      this.pathIndex[i] = index;
      this.direction[i] = rng.next() < 0.5 ? 1 : -1;
      this.distance[i] = rng.next() * (this.lengths[index] ?? 0);
      this.speed[i] = rng.range(spec.minSpeed, spec.maxSpeed);
      this.color[i] = spec.colors[Math.floor(rng.next() * spec.colors.length)] ?? 0xffffff;
    }
  }

  fixedUpdate(dt: number): void {
    for (let i = 0; i < this.count; i++) {
      const length = this.lengths[this.pathIndex[i] ?? 0] ?? 1;
      let travelled = (this.distance[i] ?? 0) + (this.speed[i] ?? 0) * dt;
      if (travelled >= length) travelled -= length;
      this.distance[i] = travelled;
    }
  }

  /**
   * Writes x, y, z, yaw, scale for each follower that passes `visible`, and
   * its colour, and returns how many were written. `lead` is seconds to
   * extrapolate past the last fixed step. Followers shrink to nothing at path
   * ends so they do not pop in and out.
   */
  write(
    out: Float32Array,
    colors: Uint32Array,
    lead: number,
    visible: (x: number, z: number) => boolean,
  ): number {
    let written = 0;
    for (let i = 0; i < this.count; i++) {
      const index = this.pathIndex[i] ?? 0;
      const path = this.paths[index];
      if (!path) continue;
      const length = this.lengths[index] ?? 1;
      const direction = this.direction[i] ?? 1;
      const travelled = Math.min(length, (this.distance[i] ?? 0) + (this.speed[i] ?? 0) * lead);

      const dirX = ((path.bx - path.ax) / length) * direction;
      const dirZ = ((path.bz - path.az) / length) * direction;
      const startX = direction > 0 ? path.ax : path.bx;
      const startZ = direction > 0 ? path.az : path.bz;
      const offset = this.spec.laneOffset(path, index);
      // Right-hand side of the direction of travel.
      const x = startX + dirX * travelled - dirZ * offset;
      const z = startZ + dirZ * travelled + dirX * offset;
      if (!visible(x, z)) continue;

      const fade = Math.min(1, travelled / FADE_DISTANCE, (length - travelled) / FADE_DISTANCE);
      const base = written * FOLLOWER_STRIDE;
      out[base] = x;
      out[base + 1] = path.y;
      out[base + 2] = z;
      out[base + 3] = Math.atan2(-dirX, -dirZ);
      out[base + 4] = Math.max(fade, 0.001);
      colors[written] = this.color[i] ?? 0xffffff;
      written++;
    }
    return written;
  }
}

const FADE_DISTANCE = 8;
