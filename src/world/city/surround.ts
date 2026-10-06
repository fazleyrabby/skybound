import type { Rng } from '../../utils/rng';
import { BoxBuilder, shade, type BuildingDescriptor } from '../Building';
import { Layout, Palette } from './layout';

const SUBURB_COUNT = 360;
const INNER_RADIUS = 720;
const SATELLITES: ReadonlyArray<readonly [x: number, z: number]> = [
  [-1900, -700],
  [-600, -2200],
  [-2300, -2300],
];

/**
 * Cheap low-detail land around the core (spec section 19): sparse low blocks
 * thinning out with distance, and a few distant tower clusters. No gameplay
 * content; it gives boost somewhere to go and the city a skyline to return to.
 */
export function buildSurround(out: BuildingDescriptor[], rng: Rng, radius: number): void {
  const boxes = new BoxBuilder(out, 'surround');
  const onLand = (x: number, z: number): boolean => x < Layout.shore - 40 && z < Layout.shore - 40;

  for (let i = 0; i < SUBURB_COUNT; i++) {
    // Squaring the sample biases blocks toward the city edge.
    const distance = INNER_RADIUS + (radius - INNER_RADIUS) * rng.next() ** 2;
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
      { windows: true },
    );
  }

  for (const [centreX, centreZ] of SATELLITES) {
    for (let i = 0; i < 9; i++) {
      boxes.add(
        centreX + rng.range(-140, 140),
        centreZ + rng.range(-140, 140),
        rng.range(24, 40),
        rng.range(24, 40),
        rng.range(50, 160),
        shade(Palette.downtown, rng),
        { windows: true },
      );
    }
  }
}
