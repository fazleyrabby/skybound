import type { Rng } from '../../utils/rng';
import { BoxBuilder, shade, type BuildingDescriptor } from '../Building';
import { Layout, Palette } from './layout';

const CONTAINER = { length: 12, width: 2.6, height: 2.6 } as const;

/**
 * Docks, container yards, piers and ships on the south-east shore, plus a
 * bridge heading out over the ocean.
 *
 * Flight line: under the bridge deck, between its two towers.
 */
export function buildHarbor(out: BuildingDescriptor[], rng: Rng): void {
  const boxes = new BoxBuilder(out, 'harbor');
  const { coreHalf, outerStart, shore } = Layout;

  // Container yard: rows of stacks, one to four high.
  for (let x = 30; x < coreHalf - 20; x += 22) {
    for (let z = outerStart + 30; z < coreHalf - 30; z += 9) {
      if (rng.next() < 0.3) continue;
      const stack = 1 + Math.floor(rng.next() * 4);
      const color = Palette.containers[Math.floor(rng.next() * Palette.containers.length)];
      boxes.add(
        x,
        z,
        CONTAINER.length,
        CONTAINER.width * 2,
        CONTAINER.height * stack,
        shade(color ?? Palette.containers[0], rng, 0.08),
      );
    }
  }

  // Dock warehouses along the east edge.
  for (let z = 130; z < outerStart; z += 60) {
    boxes.add(400, z, rng.range(70, 110), 40, rng.range(10, 16), shade(Palette.industrial, rng));
  }

  // Piers reaching into the water, with a ship alongside two of them.
  const pierLength = 140;
  [90, 230, 370].forEach((x, index) => {
    boxes.add(x, shore + pierLength / 2 - 10, 26, pierLength, 3, Palette.harborConcrete);
    if (index === 1) return;
    const shipZ = shore + 70;
    const hull = boxes.add(x + 34, shipZ, 20, 120, 12, Palette.ship);
    boxes.add(x + 34, shipZ + 40, 16, 22, 14, Palette.landmark, { baseY: hull.y + hull.hy });
  });

  // Bridge east over the ocean: deck high enough to boost under.
  const bridgeZ = 200;
  const start = shore - 20;
  const length = 520;
  boxes.add(start + length / 2, bridgeZ, length, 18, 3, Palette.highway, { baseY: 30 });
  for (const along of [0.3, 0.7]) {
    const x = start + length * along;
    boxes.add(x, bridgeZ - 12, 6, 6, 95, Palette.stone);
    boxes.add(x, bridgeZ + 12, 6, 6, 95, Palette.stone);
    boxes.add(x, bridgeZ, 6, 30, 5, Palette.stone, { baseY: 90 });
  }
}
