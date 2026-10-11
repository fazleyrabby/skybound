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
  /** Park and avenue trees are drawn with the full model; the thousands elsewhere with a lighter one. */
  detail: boolean;
}

const PARK_TREES = 190;
const YARD_TREES = 90;
/** Street trees stand this far apart, on the pavement. */
const STREET_SPACING = 19;
const UPTOWN_TREES = 420;
const SUBURB_TREES = 1500;
/** Copses out in the farmland: how many, and how many trees in each. */
const COPSES = 46;
const COPSE_SIZE = 9;
/** Keeps the arch opening clear to fly through. */
const ARCH = { x: -400, z: 350, clearX: 30, clearZ: 40 } as const;
const AVENUE_SPACING = 26;
/** Gap a tree needs from any building wall, metres. */
const WALL_GAP = 3;

/**
 * Trees everywhere a city has them: woodland in the park, a row down every
 * street, yards and squares uptown, gardens through the suburbs and copses in
 * the farmland. Decoration only: no colliders, so there is nothing to snag on.
 */
export function buildTrees(
  rng: Rng,
  buildings: readonly BuildingDescriptor[],
  roads: readonly Road[],
): TreePlacement[] {
  const trees: TreePlacement[] = [];
  // Pavements are solid but low: trees stand on them.
  const solid = buildings.filter((b) => b.solid && b.y - b.hy < 4 && b.hy > 0.5);
  const blocked = (x: number, z: number): boolean =>
    solid.some((b) => Math.abs(x - b.x) < b.hx + WALL_GAP && Math.abs(z - b.z) < b.hz + WALL_GAP);
  const paved = buildings.filter((b) => b.road && b.y < 2);
  const onRoad = (x: number, z: number): boolean =>
    paved.some((b) => Math.abs(x - b.x) < b.hx + 1.5 && Math.abs(z - b.z) < b.hz + 1.5) ||
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
    detail = false,
  ): void => {
    trees.push({
      kind,
      x,
      z,
      height: rng.range(minHeight, maxHeight),
      spread: kind === 'conifer' ? rng.range(0.3, 0.42) : rng.range(0.55, 0.8),
      turn: rng.range(0, Math.PI * 2),
      tint: rng.next(),
      detail,
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
    plant(x, z, rng.next() < 0.3 ? 'conifer' : 'broadleaf', 8, 19, true);
  }

  // Avenue: an even row down each sidewalk, skipping the cross streets.
  const avenue = roads.find((road) => road.street && road.ax === 0 && road.bx === 0);
  if (avenue) {
    const edge = avenue.width / 2 + 5;
    for (let z = avenue.az + 14; z < avenue.bz - 10; z += AVENUE_SPACING) {
      for (const side of [-1, 1]) {
        const x = side * edge;
        if (!onRoad(x, z) && !blocked(x, z)) plant(x, z, 'broadleaf', 9, 13, true);
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

  // Every other street: a row on each pavement, between the junctions.
  for (const road of roads) {
    if (!road.street || road === avenue) continue;
    const length = Math.hypot(road.bx - road.ax, road.bz - road.az);
    const alongX = Math.abs(road.bx - road.ax) > Math.abs(road.bz - road.az);
    const edge = road.width / 2 + 2.2;
    for (let along = STREET_SPACING * 0.7; along < length; along += STREET_SPACING) {
      for (const side of [-1, 1]) {
        const t = along / length;
        const x = road.ax + (road.bx - road.ax) * t + (alongX ? 0 : side * edge);
        const z = road.az + (road.bz - road.az) * t + (alongX ? side * edge : 0);
        if (!onRoad(x, z) && !blocked(x, z)) plant(x, z, 'broadleaf', 7, 11);
      }
    }
  }

  // Uptown: more in the yards and along the side streets.
  for (let i = 0; i < UPTOWN_TREES * 3 && trees.length < 900; i++) {
    const north = rng.next() < 0.45;
    const x = north
      ? rng.range(-outerStart, outerStart)
      : rng.range(-coreHalf + 4, -outerStart - 4);
    const z = north ? rng.range(-coreHalf + 4, -outerStart - 4) : rng.range(-coreHalf + 4, 195);
    if (blocked(x, z) || onRoad(x, z)) continue;
    plant(x, z, rng.next() < 0.15 ? 'conifer' : 'broadleaf', 6, 12);
  }

  // Beyond the core: gardens and street corners, thinning with distance like the buildings.
  const onLand = (x: number, z: number): boolean => x < Layout.shore - 30 && z < Layout.shore - 30;
  const inCore = (x: number, z: number): boolean =>
    Math.abs(x) < coreHalf + 10 && Math.abs(z) < coreHalf + 10;
  let planted = 0;
  for (let i = 0; i < SUBURB_TREES * 4 && planted < SUBURB_TREES; i++) {
    const distance = 520 + 1050 * rng.next() ** 1.4;
    const angle = rng.range(0, Math.PI * 2);
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;
    if (!onLand(x, z) || inCore(x, z) || blocked(x, z) || onRoad(x, z)) continue;
    plant(x, z, rng.next() < 0.22 ? 'conifer' : 'broadleaf', 6, 14);
    planted++;
  }

  // Farmland: copses and shelter belts.
  for (let i = 0; i < COPSES; i++) {
    const distance = rng.range(1500, 2900);
    const angle = rng.range(0, Math.PI * 2);
    const centreX = Math.cos(angle) * distance;
    const centreZ = Math.sin(angle) * distance;
    const conifers = rng.next() < 0.4;
    for (let j = 0; j < COPSE_SIZE; j++) {
      const x = centreX + rng.range(-34, 34);
      const z = centreZ + rng.range(-34, 34);
      if (!onLand(x, z) || blocked(x, z)) continue;
      plant(x, z, conifers ? 'conifer' : 'broadleaf', 8, 18);
    }
  }

  return trees;
}
