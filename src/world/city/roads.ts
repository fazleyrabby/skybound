import { Layout } from './layout';

/** A straight stretch of road. Traffic and pedestrians follow these; nothing simulates lanes. */
export interface Road {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** Height of the driving surface. */
  y: number;
  /** Paved width. */
  width: number;
  /** Lateral distance from the centreline to each lane. */
  laneOffset: number;
  /** Ground streets get sidewalks, street lights and pedestrians. */
  street: boolean;
}

/** Centrelines of the downtown streets: the gaps between lots (see downtown.ts). */
const STREET_X = [-158, -86, 86, 158] as const;
const STREET_Z = [-140, -70, 0, 70, 140] as const;
const STREET_WIDTH = 12;
const AVENUE_WIDTH = 28;
const HIGHWAY_DECK_TOP = 18;
const BRIDGE_DECK_TOP = 33;

/** Every drivable road in the graybox city. Fixed layout, no randomness. */
export function buildRoads(): Road[] {
  const reach = Layout.highwayRadius - 10;
  const radius = Layout.highwayRadius;
  const roads: Road[] = [];
  const street = (ax: number, az: number, bx: number, bz: number, width = STREET_WIDTH): void => {
    roads.push({ ax, az, bx, bz, y: 0, width, laneOffset: width / 4, street: true });
  };

  street(0, -reach, 0, reach, AVENUE_WIDTH);
  for (const x of STREET_X) street(x, -reach, x, reach);
  for (const z of STREET_Z) street(-reach, z, reach, z);

  // Elevated ring: four deck segments, driven clockwise and anticlockwise.
  const deck = { y: HIGHWAY_DECK_TOP, width: 16, laneOffset: 4, street: false };
  roads.push({ ax: -radius, az: -radius, bx: radius, bz: -radius, ...deck });
  roads.push({ ax: radius, az: -radius, bx: radius, bz: radius, ...deck });
  roads.push({ ax: radius, az: radius, bx: -radius, bz: radius, ...deck });
  roads.push({ ax: -radius, az: radius, bx: -radius, bz: -radius, ...deck });

  // Ocean bridge (see harbor.ts).
  roads.push({
    ax: Layout.shore - 20,
    az: 200,
    bx: Layout.shore + 500,
    bz: 200,
    y: BRIDGE_DECK_TOP,
    width: 18,
    laneOffset: 4.5,
    street: false,
  });
  return roads;
}

export function roadLength(road: Road): number {
  return Math.hypot(road.bx - road.ax, road.bz - road.az);
}
