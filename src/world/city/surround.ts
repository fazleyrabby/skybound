import type { Rng } from '../../utils/rng';
import { BoxBuilder, shade, type BuildingDescriptor } from '../Building';
import { Layout, Palette } from './layout';

/** Suburbs are laid out on a grid this fine, out to `GRID_RADIUS`. */
const PITCH = 46;
const GRID_RADIUS = 1500;
/** Share of lots built on next to the city, and at the edge of the grid. */
const FILL_NEAR = 0.9;
const FILL_FAR = 0.22;
/** Scattered buildings beyond the grid. */
const OUTLYING = 260;
const FIELDS = 110;
const SATELLITES: ReadonlyArray<readonly [x: number, z: number]> = [
  [-1900, -700],
  [-600, -2200],
  [-2300, -2300],
];

/**
 * The land around the core (spec section 19): dense suburbs right up against
 * the city that thin out with distance, farmland and scrub beyond, scattered
 * outlying buildings, and a few distant tower clusters. No gameplay content;
 * it gives boost somewhere to go and the city a skyline to return to.
 */
export function buildSurround(out: BuildingDescriptor[], rng: Rng, radius: number): void {
  const boxes = new BoxBuilder(out, 'surround');
  const edge = Layout.coreHalf + 12;
  const onLand = (x: number, z: number): boolean => x < Layout.shore - 40 && z < Layout.shore - 40;
  const inCore = (x: number, z: number): boolean => Math.abs(x) < edge && Math.abs(z) < edge;

  // Fields first, so buildings sit on top of them.
  const patch = { solid: false, baseY: 0.01 } as const;
  for (let i = 0; i < FIELDS; i++) {
    const distance = rng.range(700, radius);
    const angle = rng.range(0, Math.PI * 2);
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;
    const width = rng.range(120, 420);
    const depth = rng.range(120, 420);
    if (!onLand(x + width / 2, z + depth / 2)) continue;
    const color = Palette.fields[Math.floor(rng.next() * Palette.fields.length)] ?? Palette.lawn;
    boxes.add(x, z, width, depth, 0.03, shade(color, rng, 0.08), patch);
  }

  // Gridded suburbs: nearly full beside the city, thinning toward the edge.
  for (let x = -GRID_RADIUS; x < Layout.shore - 40; x += PITCH) {
    for (let z = -GRID_RADIUS; z < Layout.shore - 40; z += PITCH) {
      const distance = Math.hypot(x, z);
      if (distance > GRID_RADIUS || inCore(x, z)) continue;
      // Distance from the edge of the core, 0..1 across the grid.
      const out01 = Math.min(1, Math.max(0, (distance - 560) / (GRID_RADIUS - 560)));
      if (rng.next() > FILL_NEAR + (FILL_FAR - FILL_NEAR) * out01) continue;
      const tall = rng.next() < 0.08 * (1 - out01);
      boxes.add(
        x + rng.range(-5, 5),
        z + rng.range(-5, 5),
        rng.range(16, 34),
        rng.range(16, 34),
        tall ? rng.range(30, 60) : rng.range(6, 24),
        shade(rng.next() < 0.6 ? Palette.suburb : Palette.residential, rng),
        { windows: true },
      );
    }
  }

  for (let i = 0; i < OUTLYING; i++) {
    const distance = GRID_RADIUS + (radius - GRID_RADIUS) * rng.next() ** 1.5;
    const angle = rng.range(0, Math.PI * 2);
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;
    if (!onLand(x, z)) continue;
    boxes.add(
      x,
      z,
      rng.range(20, 60),
      rng.range(20, 60),
      rng.range(6, 28),
      shade(Palette.suburb, rng),
      {
        windows: true,
      },
    );
  }

  for (const [centreX, centreZ] of SATELLITES) {
    for (let i = 0; i < 12; i++) {
      boxes.add(
        centreX + rng.range(-150, 150),
        centreZ + rng.range(-150, 150),
        rng.range(24, 40),
        rng.range(24, 40),
        rng.range(50, 160),
        shade(Palette.downtown, rng),
        { windows: true },
      );
    }
  }
}
