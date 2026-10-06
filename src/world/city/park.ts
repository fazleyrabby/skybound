import { BoxBuilder, type BuildingDescriptor } from '../Building';
import { Palette } from './layout';

const ARCH = { x: -400, z: 350, opening: 30, height: 28 } as const;

/**
 * Lawns and two landmarks in the south-west. The trees are placed by `trees.ts`.
 *
 * Flight line: through the stone arch.
 */
export function buildPark(out: BuildingDescriptor[]): void {
  const boxes = new BoxBuilder(out, 'park');

  // Lawn patches sit a hair above the ground plane to avoid z-fighting.
  const lawn = { solid: false, baseY: 0.02 } as const;
  boxes.add(-400, 350, 190, 290, 0.06, Palette.lawn, lawn);
  boxes.add(-150, 400, 290, 190, 0.06, Palette.lawn, lawn);

  // Arch: two piers and a lintel.
  const pier = 8;
  const offset = ARCH.opening / 2 + pier / 2;
  boxes.add(ARCH.x - offset, ARCH.z, pier, 10, ARCH.height, Palette.stone);
  boxes.add(ARCH.x + offset, ARCH.z, pier, 10, ARCH.height, Palette.stone);
  boxes.add(ARCH.x, ARCH.z, ARCH.opening + pier * 2, 10, 8, Palette.stone, { baseY: ARCH.height });

  // Obelisk: a navigation landmark visible from across the city.
  boxes.add(-150, 400, 6, 6, 70, Palette.stone);
}
