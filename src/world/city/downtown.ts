import type { Rng } from '../../utils/rng';
import { BoxBuilder, shade, topOf, type BuildingDescriptor } from '../Building';
import { Layout, Palette } from './layout';

/** Lot centres. Columns leave the central avenue clear; streets run between lots. */
const COLUMNS: ReadonlyArray<readonly [centre: number, width: number]> = [
  [-184, 32],
  [-122, 52],
  [-50, 52],
  [50, 52],
  [122, 52],
  [184, 32],
];
const ROWS: readonly number[] = [-175, -105, -35, 35, 105, 175];
const LOT_DEPTH = 50;

/** Hand-placed lots (column index, row index) that the generator leaves alone. */
const TWIN_LOT = [1, 1] as const;
const SPAWN_LOT = [3, 2] as const;
const PLAZA_LOT = [2, 3] as const;

const TWIN_HEIGHT = 280;
const TWIN_WIDTH = 19;
const TWIN_GAP = 14;
const SPAWN_TOWER_HEIGHT = 240;

const WINDOWS = { windows: true } as const;
const DECOR = { solid: false } as const;

export interface Downtown {
  /** Rooftop the player starts on. */
  spawnRoof: BuildingDescriptor;
}

/**
 * Skyscrapers 100-300 m on a street grid, tallest toward the centre. Tall
 * narrow canyons are what make cruise speed feel fast (spec section 19).
 * Each tower is a podium, one to three stepped tiers, and rooftop plant.
 *
 * Flight lines: the avenue canyon along x = 0, and the gap between the twin towers.
 */
export function buildDowntown(out: BuildingDescriptor[], rng: Rng): Downtown {
  const boxes = new BoxBuilder(out, 'downtown');
  const isLot = (lot: readonly [number, number], column: number, row: number): boolean =>
    lot[0] === column && lot[1] === row;
  let spawnRoof: BuildingDescriptor | undefined;

  COLUMNS.forEach(([x, lotWidth], column) => {
    ROWS.forEach((z, row) => {
      if (isLot(PLAZA_LOT, column, row)) return; // open airspace for the boss fight later

      if (isLot(TWIN_LOT, column, row)) {
        const offset = (TWIN_GAP + TWIN_WIDTH) / 2;
        for (const side of [-1, 1]) {
          const twin = boxes.add(
            x + side * offset,
            z,
            TWIN_WIDTH,
            40,
            TWIN_HEIGHT,
            Palette.landmark,
            WINDOWS,
          );
          addRoofPlant(boxes, rng, twin, true);
        }
        return;
      }
      if (isLot(SPAWN_LOT, column, row)) {
        // Kept bare: the player starts standing here.
        spawnRoof = boxes.add(x, z, 36, 36, SPAWN_TOWER_HEIGHT, Palette.landmark, WINDOWS);
        return;
      }

      // Taller toward the centre, with enough noise that the skyline is uneven.
      const distance = Math.hypot(x, z) / (Layout.downtownHalf * Math.SQRT2);
      const height = Math.max(100, 300 - distance * 190 + rng.range(-45, 45));
      const color = shade(
        Palette.towers[Math.floor(rng.next() * Palette.towers.length)] ?? Palette.downtown,
        rng,
      );
      const setback = rng.range(3, 7);
      const width = lotWidth - setback * 2;
      const depth = LOT_DEPTH - setback * 2;

      if (lotWidth > 40 && rng.next() < 0.3) {
        // Two slimmer towers sharing a lot, with an alley between them.
        const half = width / 2 - 3;
        addTower(boxes, rng, x - width / 4 - 1.5, z, half, depth, height, color);
        addTower(
          boxes,
          rng,
          x + width / 4 + 1.5,
          z,
          half,
          depth,
          height * rng.range(0.6, 0.9),
          color,
        );
      } else {
        addTower(boxes, rng, x, z, width, depth, height, color);
      }
    });
  });

  if (!spawnRoof) throw new Error('Downtown layout has no spawn tower');
  return { spawnRoof };
}

/** Share of the total height taken by each tier, for one, two and three tiers. */
const TIER_SPLITS = [[1], [0.72, 0.28], [0.6, 0.26, 0.14]] as const;
const TIER_SHRINK = 0.2;
const PODIUM_OVERHANG = 2.5;

/** A podium, stepped tiers that narrow toward the top, and rooftop plant. */
function addTower(
  boxes: BoxBuilder,
  rng: Rng,
  x: number,
  z: number,
  width: number,
  depth: number,
  height: number,
  color: number,
): void {
  boxes.add(
    x,
    z,
    width + PODIUM_OVERHANG,
    depth + PODIUM_OVERHANG,
    rng.range(8, 14),
    Palette.podium,
    WINDOWS,
  );

  const tiers = height > 190 ? 3 : height > 135 ? 2 : 1;
  const split = TIER_SPLITS[tiers - 1] ?? TIER_SPLITS[0];
  let baseY = 0;
  let top: BuildingDescriptor | undefined;
  split.forEach((share, index) => {
    const shrink = 1 - TIER_SHRINK * index;
    top = boxes.add(x, z, width * shrink, depth * shrink, height * share, color, {
      baseY,
      windows: true,
    });
    baseY += height * share;
  });
  if (top) addRoofPlant(boxes, rng, top, rng.next() < 0.45);
}

/** Air handlers and, on some roofs, a mast. Decoration only: nothing to snag on. */
function addRoofPlant(boxes: BoxBuilder, rng: Rng, roof: BuildingDescriptor, mast: boolean): void {
  const y = topOf(roof);
  const units = 2 + Math.floor(rng.next() * 3);
  for (let i = 0; i < units; i++) {
    boxes.add(
      roof.x + rng.range(-0.6, 0.6) * roof.hx,
      roof.z + rng.range(-0.6, 0.6) * roof.hz,
      rng.range(2, 5),
      rng.range(2, 5),
      rng.range(1.5, 3.5),
      Palette.roofUnit,
      { baseY: y, solid: false },
    );
  }
  if (mast) {
    const height = rng.range(14, 34);
    boxes.add(roof.x, roof.z, 0.5, 0.5, height, Palette.antenna, { ...DECOR, baseY: y });
    boxes.add(roof.x, roof.z, 2.2, 2.2, 1.2, Palette.roofUnit, { ...DECOR, baseY: y });
  }
}
