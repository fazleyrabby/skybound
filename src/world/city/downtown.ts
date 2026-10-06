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

export interface Downtown {
  /** Rooftop the player starts on. */
  spawnRoof: BuildingDescriptor;
}

/**
 * Skyscrapers 100-300 m on a street grid, tallest toward the centre. Tall
 * narrow canyons are what make cruise speed feel fast (spec section 19).
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
        boxes.add(x - offset, z, TWIN_WIDTH, 40, TWIN_HEIGHT, Palette.landmark);
        boxes.add(x + offset, z, TWIN_WIDTH, 40, TWIN_HEIGHT, Palette.landmark);
        return;
      }
      if (isLot(SPAWN_LOT, column, row)) {
        spawnRoof = boxes.add(x, z, 36, 36, SPAWN_TOWER_HEIGHT, Palette.landmark);
        return;
      }

      // Taller toward the centre, with enough noise that the skyline is uneven.
      const distance = Math.hypot(x, z) / (Layout.downtownHalf * Math.SQRT2);
      const height = Math.max(100, 300 - distance * 190 + rng.range(-45, 45));
      const color = shade(rng.next() < 0.5 ? Palette.downtown : Palette.downtownGlass, rng);
      const setback = rng.range(2, 7);
      const width = lotWidth - setback * 2;
      const depth = LOT_DEPTH - setback * 2;

      if (lotWidth > 40 && rng.next() < 0.3) {
        // Two slimmer towers sharing a lot, with an alley between them.
        const half = width / 2 - 3;
        boxes.add(x - width / 4 - 1.5, z, half, depth, height, color);
        boxes.add(x + width / 4 + 1.5, z, half, depth, height * rng.range(0.6, 0.9), color);
      } else {
        const tower = boxes.add(x, z, width, depth, height, color);
        // A narrower crown on some towers breaks up the flat-topped look.
        if (rng.next() < 0.4) {
          boxes.add(x, z, width * 0.55, depth * 0.55, rng.range(15, 40), color, {
            baseY: topOf(tower),
          });
        }
      }
    });
  });

  if (!spawnRoof) throw new Error('Downtown layout has no spawn tower');
  return { spawnRoof };
}
