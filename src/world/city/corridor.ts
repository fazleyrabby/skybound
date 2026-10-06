import type { Rng } from '../../utils/rng';
import { BoxBuilder, shade, type BuildingDescriptor } from '../Building';
import { Layout, Palette } from './layout';

/** Lines the downtown streets leave on, as [position, half clearance]. The avenue is wider. */
const CROSSINGS: ReadonlyArray<readonly [number, number]> = [
  [0, 22],
  [-86, 11],
  [86, 11],
  [-158, 11],
  [158, 11],
  [-140, 11],
  [-70, 11],
  [70, 11],
  [140, 11],
];
const LOT = 30;
const DEPTH = 26;
/** Band centres either side of the elevated ring, clear of the deck and its pillars. */
const INNER = 221;
const OUTER = 279;
/** The stretch south of downtown the First Flight course crosses at street level. */
const FLIGHT_GAP = { minX: -215, maxX: 45 } as const;

/**
 * Midtown: low and mid-rise blocks lining both sides of the highway ring,
 * filling what used to be bare ground between downtown and the outer
 * districts. Kept under 50 m so the corridor above the ring stays open for
 * fast flight and for Titan.
 */
export function buildCorridor(out: BuildingDescriptor[], rng: Rng): void {
  const boxes = new BoxBuilder(out, 'midtown');
  const reach = Layout.outerStart - 6;
  const crossesStreet = (along: number, half: number): boolean =>
    CROSSINGS.some(([line, clearance]) => Math.abs(along - line) < clearance + half);

  for (const side of [-1, 1]) {
    for (const band of [INNER, OUTER]) {
      for (let along = -reach + LOT / 2; along < reach; along += LOT) {
        const width = rng.range(18, LOT - 4);
        // Streets only reach as far as the inner band; the outer one is unbroken.
        if (band === INNER && crossesStreet(along, width / 2)) continue;
        if (Math.abs(along) > band + DEPTH / 2) continue; // corners are filled by the other axis
        const height = rng.range(12, 46);
        const color = shade(
          Palette.towers[Math.floor(rng.next() * Palette.towers.length)] ?? Palette.downtown,
          rng,
        );
        const options = { windows: true } as const;

        // Along the north and south sides (running east-west) ...
        const southOpen =
          side === 1 &&
          band === OUTER &&
          along + width / 2 > FLIGHT_GAP.minX &&
          along - width / 2 < FLIGHT_GAP.maxX;
        if (!southOpen) boxes.add(along, side * band, width, DEPTH, height, color, options);
        // ... and the east and west sides (running north-south).
        boxes.add(side * band, along, DEPTH, width, height * rng.range(0.7, 1.2), color, options);
      }
    }
  }

  // The gap left for the flight course becomes a paved square rather than bare ground.
  boxes.add(
    (FLIGHT_GAP.minX + FLIGHT_GAP.maxX) / 2,
    OUTER,
    FLIGHT_GAP.maxX - FLIGHT_GAP.minX - 8,
    DEPTH,
    0.05,
    Palette.plaza,
    { solid: false, baseY: 0.03 },
  );
}
