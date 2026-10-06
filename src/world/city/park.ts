import type { Rng } from '../../utils/rng';
import { BoxBuilder, shade, type BuildingDescriptor } from '../Building';
import { Layout, Palette } from './layout';

const TREE_COUNT = 160;
/** Trees stay this far from the arch so its opening is clear to fly through. */
const ARCH = { x: -400, z: 350, opening: 30, height: 28 } as const;

/**
 * Lawn, trees and two landmarks in the south-west. Trees are not solid: at
 * graybox stage they are scenery to fly over, not obstacles.
 *
 * Flight line: through the stone arch.
 */
export function buildPark(out: BuildingDescriptor[], rng: Rng): void {
  const boxes = new BoxBuilder(out, 'park');
  const { coreHalf, outerStart } = Layout;

  // Lawn patches sit a hair above the ground plane to avoid z-fighting.
  const lawn = { solid: false, baseY: 0.02 } as const;
  boxes.add(-400, 350, 190, 290, 0.06, Palette.lawn, lawn);
  boxes.add(-150, 400, 290, 190, 0.06, Palette.lawn, lawn);

  for (let i = 0; i < TREE_COUNT; i++) {
    const west = rng.next() < 0.5;
    const x = west ? rng.range(-coreHalf + 10, -outerStart - 10) : rng.range(-outerStart, -10);
    const z = west ? rng.range(210, coreHalf - 10) : rng.range(outerStart + 10, coreHalf - 10);
    if (Math.abs(x - ARCH.x) < ARCH.opening && Math.abs(z - ARCH.z) < 40) continue;
    const size = rng.range(4, 8);
    boxes.add(x, z, size, size, rng.range(6, 14), shade(Palette.tree, rng, 0.2), { solid: false });
  }

  // Arch: two piers and a lintel.
  const pier = 8;
  const offset = ARCH.opening / 2 + pier / 2;
  boxes.add(ARCH.x - offset, ARCH.z, pier, 10, ARCH.height, Palette.stone);
  boxes.add(ARCH.x + offset, ARCH.z, pier, 10, ARCH.height, Palette.stone);
  boxes.add(ARCH.x, ARCH.z, ARCH.opening + pier * 2, 10, 8, Palette.stone, { baseY: ARCH.height });

  // Obelisk: a navigation landmark visible from across the city.
  boxes.add(-150, 400, 6, 6, 70, Palette.stone);
}
