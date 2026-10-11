import type { Rng } from '../../utils/rng';
import { BoxBuilder, shade, type BuildingDescriptor } from '../Building';
import { addRoofPlant, addTower } from './downtown';
import { Layout, Palette } from './layout';

const PITCH = 34;
const FILL = 0.93;
/** A side street every this many lots. */
const STREET_EVERY = 3;
const STREET_WIDTH = 7;

/**
 * Uptown, in the west and north bands: apartment blocks and mid-rise towers on
 * small lots with side streets between them, taller toward downtown. Built the
 * same way as downtown towers, at a smaller scale.
 */
export function buildResidential(out: BuildingDescriptor[], rng: Rng): void {
  const boxes = new BoxBuilder(out, 'residential');
  const { coreHalf, outerStart } = Layout;

  const fill = (minX: number, maxX: number, minZ: number, maxZ: number): void => {
    // Side streets between the blocks, so the ground reads as a neighbourhood.
    // The two directions sit at different heights so they do not fight where they cross.
    for (let x = minX + PITCH * STREET_EVERY; x < maxX - 1; x += PITCH * STREET_EVERY) {
      boxes.add(x, (minZ + maxZ) / 2, STREET_WIDTH, maxZ - minZ, 0.04, Palette.sideStreet, {
        solid: false,
        road: true,
        baseY: 0.06,
      });
    }
    for (let z = minZ + PITCH * STREET_EVERY; z < maxZ - 1; z += PITCH * STREET_EVERY) {
      boxes.add((minX + maxX) / 2, z, maxX - minX, STREET_WIDTH, 0.04, Palette.sideStreet, {
        solid: false,
        road: true,
        baseY: 0.04,
      });
    }
    for (let x = minX + PITCH / 2; x < maxX; x += PITCH) {
      for (let z = minZ + PITCH / 2; z < maxZ; z += PITCH) {
        if (rng.next() > FILL) continue; // gaps read as yards and small parks
        const width = rng.range(14, 21);
        const depth = rng.range(14, 21);
        const lotX = x + rng.range(-1.5, 1.5);
        const lotZ = z + rng.range(-1.5, 1.5);
        const color = shade(
          Palette.houses[Math.floor(rng.next() * Palette.houses.length)] ?? Palette.residential,
          rng,
        );
        // Closer to downtown, more of the lots carry a tower.
        const nearness = 1 - Math.min(1, (Math.max(Math.abs(lotX), Math.abs(lotZ)) - 300) / 200);
        if (rng.next() < 0.22 + 0.3 * nearness) {
          const tint = shade(
            Palette.towers[Math.floor(rng.next() * Palette.towers.length)] ?? Palette.downtown,
            rng,
          );
          addTower(
            boxes,
            rng,
            lotX,
            lotZ,
            width - 2,
            depth - 2,
            rng.range(45, 70 + 55 * nearness),
            tint,
          );
          continue;
        }
        const height = rng.range(12, 40);
        const house = boxes.add(lotX, lotZ, width, depth, height, color, { windows: true });
        // A set-back top floor on some blocks, then stair housing and plant on the roof.
        if (height > 22 && rng.next() < 0.4) {
          const penthouse = boxes.add(lotX, lotZ, width - 5, depth - 5, 3.6, color, {
            baseY: height,
            windows: true,
          });
          addRoofPlant(boxes, rng, penthouse, false);
        } else {
          addRoofPlant(boxes, rng, house, rng.next() < 0.12);
        }
      }
    }
  };

  fill(-coreHalf, -outerStart, -coreHalf, 200); // west band
  fill(-outerStart, outerStart, -coreHalf, -outerStart); // north band
}
