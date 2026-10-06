import type { Rng } from '../../utils/rng';
import { BoxBuilder, shade, type BuildingDescriptor } from '../Building';
import { Layout, Palette } from './layout';

const PITCH = 40;
const FILL = 0.8;

/** Medium buildings on small lots, in the west and north bands. */
export function buildResidential(out: BuildingDescriptor[], rng: Rng): void {
  const boxes = new BoxBuilder(out, 'residential');
  const { coreHalf, outerStart } = Layout;

  const fill = (minX: number, maxX: number, minZ: number, maxZ: number): void => {
    for (let x = minX + PITCH / 2; x < maxX; x += PITCH) {
      for (let z = minZ + PITCH / 2; z < maxZ; z += PITCH) {
        if (rng.next() > FILL) continue; // gaps read as yards and small parks
        const width = rng.range(12, 24);
        const depth = rng.range(12, 24);
        const height = rng.range(10, 40);
        const color = Palette.houses[Math.floor(rng.next() * Palette.houses.length)];
        const house = boxes.add(
          x + rng.range(-4, 4),
          z + rng.range(-4, 4),
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
