import type { Rng } from '../utils/rng';

export type District =
  | 'downtown'
  | 'residential'
  | 'industrial'
  | 'park'
  | 'harbor'
  | 'highway'
  | 'surround'
  | 'street'
  | 'midtown';

/**
 * A graybox box. Rendering and physics both consume this, so visuals and
 * colliders cannot drift apart (spec section 21).
 */
export interface BuildingDescriptor {
  district: District;
  /** Centre of the box. */
  x: number;
  y: number;
  z: number;
  /** Half extents. */
  hx: number;
  hy: number;
  hz: number;
  /** 0xRRGGBB. */
  color: number;
  /** False for decoration the player passes through (trees, ground patches). */
  solid: boolean;
  /** Draw a window grid on the walls. For things that are actually buildings. */
  windows: boolean;
  /** Lights up at night: lamp heads, signs, billboards. */
  glow: boolean;
}

export interface BoxOptions {
  /** Height of the underside above the ground. Default 0. */
  baseY?: number;
  solid?: boolean;
  windows?: boolean;
  glow?: boolean;
}

/** Collects boxes for one district, addressed by footprint centre, size and height. */
export class BoxBuilder {
  constructor(
    private readonly out: BuildingDescriptor[],
    private readonly district: District,
  ) {}

  add(
    x: number,
    z: number,
    width: number,
    depth: number,
    height: number,
    color: number,
    options: BoxOptions = {},
  ): BuildingDescriptor {
    const baseY = options.baseY ?? 0;
    const box: BuildingDescriptor = {
      district: this.district,
      x,
      y: baseY + height / 2,
      z,
      hx: width / 2,
      hy: height / 2,
      hz: depth / 2,
      color,
      solid: options.solid ?? true,
      windows: options.windows ?? false,
      glow: options.glow ?? false,
    };
    this.out.push(box);
    return box;
  }
}

/** Varies the brightness of a colour a little so neighbouring boxes read as separate. */
export function shade(color: number, rng: Rng, spread = 0.14): number {
  const factor = 1 - spread + rng.next() * spread * 2;
  const channel = (shift: number): number =>
    Math.max(0, Math.min(255, Math.round(((color >> shift) & 0xff) * factor)));
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** Height of the top face. */
export function topOf(box: BuildingDescriptor): number {
  return box.y + box.hy;
}
