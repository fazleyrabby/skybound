import type { Rng } from '../../utils/rng';
import { BoxBuilder, shade, type BuildingDescriptor } from '../Building';
import { Layout, Palette } from './layout';

const PITCH_X = 66;
const PITCH_Z = 70;

/** Where the crane stands; the lots around it are kept clear. */
const CRANE = { x: 400, z: -200 } as const;
const CRANE_CLEARANCE = 60;

/**
 * Warehouses, chimneys and a tower crane in the east band.
 *
 * Flight line: thread the window under the crane arm, between the mast and
 * the hanging load.
 */
export function buildIndustrial(out: BuildingDescriptor[], rng: Rng): void {
  const boxes = new BoxBuilder(out, 'industrial');
  const { coreHalf, outerStart } = Layout;

  for (let x = outerStart + PITCH_X / 2; x < coreHalf; x += PITCH_X) {
    for (let z = -coreHalf + PITCH_Z / 2; z < 100; z += PITCH_Z) {
      if (Math.hypot(x - CRANE.x, z - CRANE.z) < CRANE_CLEARANCE) continue;
      const width = rng.range(36, 54);
      const depth = rng.range(28, 52);
      const height = rng.range(8, 20);
      boxes.add(x, z, width, depth, height, shade(Palette.industrial, rng));
      if (rng.next() < 0.25) {
        boxes.add(x + width / 2 - 4, z + depth / 2 - 4, 5, 5, rng.range(45, 75), Palette.chimney);
      }
    }
  }

  // Tower crane: mast, arm reaching west, counterweight east, and a hanging load.
  const mastHeight = 70;
  const armLength = 64;
  boxes.add(CRANE.x, CRANE.z, 6, 6, mastHeight, Palette.crane);
  boxes.add(CRANE.x - armLength / 2, CRANE.z, armLength, 4, 4, Palette.crane, {
    baseY: mastHeight,
  });
  boxes.add(CRANE.x + 12, CRANE.z, 18, 5, 6, Palette.crane, { baseY: mastHeight - 1 });
  boxes.add(CRANE.x - armLength + 6, CRANE.z, 12, 6, 6, Palette.containers[0], {
    baseY: mastHeight - 26,
  });
}
