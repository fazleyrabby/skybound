import type { Rng } from '../../utils/rng';
import { BoxBuilder, shade, type BuildingDescriptor } from '../Building';
import { addRoofPlant, addTower } from './downtown';
import { Layout, Palette } from './layout';

/** Suburbs are laid out on a grid this fine, out to `GRID_RADIUS`. */
const PITCH = 46;
const GRID_RADIUS = 1500;
/** Share of lots built on next to the city, and at the edge of the grid. */
const FILL_NEAR = 0.96;
const FILL_FAR = 0.45;
/** Scattered buildings beyond the grid. */
/** Share of the grid, from the core outward, that is built up like the city rather than like suburbs. */
const URBAN_REACH = 0.8;
/** A street every this many lots, this wide, out to this distance. */
const STREET_EVERY = 3;
const STREET_WIDTH = 8;
const STREET_RADIUS = 1420;
const OUTLYING = 260;
const FIELDS = 110;
const SATELLITES: ReadonlyArray<readonly [x: number, z: number]> = [
  [-1900, -700],
  [-600, -2200],
  [-2300, -2300],
];

/**
 * The land around the core (spec section 19): the city carries on past the core
 * as towers and mid-rise blocks on a street grid, steps down to suburbs that
 * thin out with distance, farmland and scrub beyond, scattered
 * outlying buildings, and a few distant tower clusters. No gameplay content;
 * it gives boost somewhere to go and the city a skyline to return to.
 */
export function buildSurround(out: BuildingDescriptor[], rng: Rng, radius: number): void {
  const boxes = new BoxBuilder(out, 'surround');
  const edge = Layout.coreHalf + 12;
  const onLand = (x: number, z: number): boolean => x < Layout.shore - 40 && z < Layout.shore - 40;
  const inCore = (x: number, z: number): boolean => Math.abs(x) < edge && Math.abs(z) < edge;

  // Fields first, so buildings sit on top of them. No two overlap: they share a
  // height, and overlapping patches of different colours would flicker.
  const patch = { solid: false, baseY: 0.01 } as const;
  const fields: { x: number; z: number; hx: number; hz: number }[] = [];
  for (let attempt = 0; attempt < FIELDS * 6 && fields.length < FIELDS; attempt++) {
    const distance = rng.range(700, radius);
    const angle = rng.range(0, Math.PI * 2);
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;
    const width = rng.range(120, 420);
    const depth = rng.range(120, 420);
    if (!onLand(x + width / 2, z + depth / 2)) continue;
    const overlaps = fields.some(
      (f) => Math.abs(x - f.x) < f.hx + width / 2 + 4 && Math.abs(z - f.z) < f.hz + depth / 2 + 4,
    );
    if (overlaps) continue;
    fields.push({ x, z, hx: width / 2, hz: depth / 2 });
    const color = Palette.fields[Math.floor(rng.next() * Palette.fields.length)] ?? Palette.lawn;
    boxes.add(x, z, width, depth, 0.03, shade(color, rng, 0.08), patch);
  }

  // Streets through the gridded part, every few lots, running between the lots.
  // The two directions sit at different heights so they do not fight where they cross.
  const limit = Layout.shore - 40;
  for (let line = -GRID_RADIUS - PITCH / 2; line < limit; line += PITCH * STREET_EVERY) {
    const reach = Math.sqrt(Math.max(0, STREET_RADIUS ** 2 - line ** 2));
    if (reach < 60) continue;
    const spans: [number, number][] =
      Math.abs(line) < edge + STREET_WIDTH ? [[-reach, -edge]] : [[-reach, Math.min(reach, limit)]];
    for (const [from, to] of spans) {
      if (to - from < 40) continue;
      const middle = (from + to) / 2;
      boxes.add(line, middle, STREET_WIDTH, to - from, 0.04, Palette.sideStreet, {
        solid: false,
        road: true,
        baseY: 0.08,
      });
      boxes.add(middle, line, to - from, STREET_WIDTH, 0.04, Palette.sideStreet, {
        solid: false,
        road: true,
        baseY: 0.05,
      });
    }
  }

  // Gridded blocks: a real second city centre's worth of towers right beside the
  // core, stepping down through mid-rise blocks to low suburbs at the edge.
  for (let x = -GRID_RADIUS; x < limit; x += PITCH) {
    for (let z = -GRID_RADIUS; z < limit; z += PITCH) {
      const distance = Math.hypot(x, z);
      if (distance > GRID_RADIUS || inCore(x, z)) continue;
      // Distance from the edge of the core, 0..1 across the grid.
      const out01 = Math.min(1, Math.max(0, (distance - 560) / (GRID_RADIUS - 560)));
      if (rng.next() > FILL_NEAR + (FILL_FAR - FILL_NEAR) * out01) continue;
      const lotX = x + rng.range(-2, 2);
      const lotZ = z + rng.range(-2, 2);
      const width = rng.range(22, 34);
      const depth = rng.range(22, 34);
      const urban = Math.max(0, 1 - out01 / URBAN_REACH);
      if (rng.next() < 0.55 * urban) {
        const tint = shade(
          Palette.towers[Math.floor(rng.next() * Palette.towers.length)] ?? Palette.downtown,
          rng,
        );
        addTower(
          boxes,
          rng,
          lotX,
          lotZ,
          width - 2.5,
          depth - 2.5,
          rng.range(40, 60 + 110 * urban),
          tint,
        );
        continue;
      }
      const tall = rng.next() < 0.1 * (1 - out01);
      const height = tall ? rng.range(30, 60) : rng.range(8, 26) + 22 * urban;
      const block = boxes.add(
        lotX,
        lotZ,
        width,
        depth,
        height,
        shade(rng.next() < 0.6 ? Palette.suburb : Palette.residential, rng),
        { windows: true },
      );
      if (urban > 0 || tall) addRoofPlant(boxes, rng, block, false);
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
