import type { Rng } from '../../utils/rng';
import { BoxBuilder, shade, type BuildingDescriptor } from '../Building';
import { Layout, Palette } from './layout';

const PITCH = 34;
const FILL = 0.93;
/** A side street every this many lots. */
const STREET_EVERY = 3;
const STREET_WIDTH = 7;

/** Medium buildings on small lots, in the west and north bands. */
export function buildResidential(out: BuildingDescriptor[], rng: Rng): void {
  const boxes = new BoxBuilder(out, 'residential');
  const { coreHalf, outerStart } = Layout;

  const fill = (minX: number, maxX: number, minZ: number, maxZ: number): void => {
    // Side streets between the blocks, so the ground reads as a neighbourhood.
    const decor = { solid: false, baseY: 0.04 } as const;
    for (let x = minX + PITCH * STREET_EVERY; x < maxX - 1; x += PITCH * STREET_EVERY) {
      boxes.add(x, (minZ + maxZ) / 2, STREET_WIDTH, maxZ - minZ, 0.04, Palette.sideStreet, decor);
    }
    for (let z = minZ + PITCH * STREET_EVERY; z < maxZ - 1; z += PITCH * STREET_EVERY) {
      boxes.add((minX + maxX) / 2, z, maxX - minX, STREET_WIDTH, 0.04, Palette.sideStreet, decor);
    }
    for (let x = minX + PITCH / 2; x < maxX; x += PITCH) {
      for (let z = minZ + PITCH / 2; z < maxZ; z += PITCH) {
        if (rng.next() > FILL) continue; // gaps read as yards and small parks
        const width = rng.range(13, 22);
        const depth = rng.range(13, 22);
        const height = rng.range(10, 40);
        const color = Palette.houses[Math.floor(rng.next() * Palette.houses.length)];
        const house = boxes.add(
          x + rng.range(-2.5, 2.5),
          z + rng.range(-2.5, 2.5),
          width,
          depth,
          height,
          shade(color ?? Palette.residential, rng),
          { windows: true },
        );
        // Stair or lift housing on most flat roofs.
        if (rng.next() < 0.6) {
          boxes.add(
            house.x + rng.range(-0.3, 0.3) * width,
            house.z + rng.range(-0.3, 0.3) * depth,
            3.2,
            3.2,
            2.6,
            Palette.roofUnit,
            { baseY: height, solid: false },
          );
        }
      }
    }
  };

  fill(-coreHalf, -outerStart, -coreHalf, 200); // west band
  fill(-outerStart, outerStart, -coreHalf, -outerStart); // north band
}
