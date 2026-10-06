import type { Rng } from '../../utils/rng';
import type { BuildingDescriptor } from '../Building';
import { Layout } from './layout';
import type { Road } from './roads';

export type TreeKind = 'broadleaf' | 'conifer';

/** One tree: where it stands and how big it is. Rendering turns these into instances. */
export interface TreePlacement {
  kind: TreeKind;
  x: number;
  z: number;
  /** Total height in metres. */
  height: number;
  /** Canopy width as a share of height. */
  spread: number;
  /** Rotation about the vertical axis, radians. */
  turn: number;
  /** 0..1, picks a leaf tint. */
  tint: number;
}

const PARK_TREES = 190;
const YARD_TREES = 90;
/** Keeps the arch opening clear to fly through. */
const ARCH = { x: -400, z: 350, clearX: 30, clearZ: 40 } as const;
const AVENUE_SPACING = 26;
/** Gap a tree needs from any building wall, metres. */
const WALL_GAP = 3;

/**
 * Trees for the park, the avenue and residential yards. Decoration only: no
 * colliders, so there is nothing to snag on at street level.
 */
export function buildTrees(
  rng: Rng,
  buildings: readonly BuildingDescriptor[],
  roads: readonly Road[],
): TreePlacement[] {
  const trees: TreePlacement[] = [];
  const solid = buildings.filter((b) => b.solid && b.y - b.hy < 4);
  const blocked = (x: number, z: number): boolean =>
    solid.some((b) => Math.abs(x - b.x) < b.hx + WALL_GAP && Math.abs(z - b.z) < b.hz + WALL_GAP);
  const onRoad = (x: number, z: number): boolean =>
    roads.some((road) => {
      if (!road.street) return false;
      const half = road.width / 2 + 1;
      return (
        x > Math.min(road.ax, road.bx) - half &&
        x < Math.max(road.ax, road.bx) + half &&
        z > Math.min(road.az, road.bz) - half &&
        z < Math.max(road.az, road.bz) + half
      );
    });
  const plant = (
    x: number,
    z: number,
    kind: TreeKind,
    minHeight: number,
    maxHeight: number,
  ): void => {
    trees.push({
      kind,
      x,
      z,
      height: rng.range(minHeight, maxHeight),
      spread: kind === 'conifer' ? rng.range(0.3, 0.42) : rng.range(0.55, 0.8),
      turn: rng.range(0, Math.PI * 2),
      tint: rng.next(),
    });
  };

  // Park: mixed woodland on the two lawns, thicker in clumps.
  const { coreHalf, outerStart } = Layout;
  for (let i = 0; i < PARK_TREES; i++) {
    const west = rng.next() < 0.5;
    const x = west ? rng.range(-coreHalf + 10, -outerStart - 10) : rng.range(-outerStart, -10);
    const z = west ? rng.range(210, coreHalf - 10) : rng.range(outerStart + 10, coreHalf - 10);
    if (Math.abs(x - ARCH.x) < ARCH.clearX && Math.abs(z - ARCH.z) < ARCH.clearZ) continue;
    if (blocked(x, z)) continue;
    plant(x, z, rng.next() < 0.3 ? 'conifer' : 'broadleaf', 8, 19);
  }

  // Avenue: an even row down each sidewalk, skipping the cross streets.
  const avenue = roads.find((road) => road.street && road.ax === 0 && road.bx === 0);
  if (avenue) {
    const edge = avenue.width / 2 + 5;
    for (let z = avenue.az + 14; z < avenue.bz - 10; z += AVENUE_SPACING) {
      for (const side of [-1, 1]) {
        const x = side * edge;
        if (!onRoad(x, z) && !blocked(x, z)) plant(x, z, 'broadleaf', 9, 13);
      }
    }
  }

  // Residential yards: wherever there is room between the houses.
  for (let i = 0; i < YARD_TREES * 3 && trees.length < PARK_TREES + 40 + YARD_TREES; i++) {
    const north = rng.next() < 0.45;
    const x = north
      ? rng.range(-outerStart, outerStart)
      : rng.range(-coreHalf + 6, -outerStart - 6);
    const z = north ? rng.range(-coreHalf + 6, -outerStart - 6) : rng.range(-coreHalf + 6, 195);
    if (blocked(x, z)) continue;
    plant(x, z, rng.next() < 0.2 ? 'conifer' : 'broadleaf', 6, 13);
  }

  return trees;
}
