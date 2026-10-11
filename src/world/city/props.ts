import { Config } from '../../core/Config';
import { BoxBuilder, type BuildingDescriptor } from '../Building';
import { roadLength, type Road } from './roads';

const ASPHALT = 0x34373d;
const KERB = 0x8b8e94;
const LAMP_POST = 0x2e3138;
const LAMP_HEAD = 0xffe9a8;
const LAMP_HEIGHT = 9;
const SIGNAL_POLE = 0x23262b;
const SIGNALS = [0x35e06a, 0xff4b3a, 0xffb52e] as const;
/** Streets running east-west and north-south sit at different heights so they do not fight where they cross. */
const ASPHALT_Y_EAST_WEST = 0.05;
const ASPHALT_Y_NORTH_SOUTH = 0.075;
export const SIDEWALK_WIDTH = 3.2;
/** Height of the pavement above the ground. Solid: the hero steps up onto it. */
export const SIDEWALK_TOP = 0.1;

/**
 * Street dressing: asphalt with lane markings (drawn by the building shader on
 * boxes flagged `road`), raised pavements broken at every junction, lamp posts
 * and traffic signals. All boxes in the shared instanced mesh, so they cost no
 * draw calls; only the pavements are solid.
 */
export function buildProps(out: BuildingDescriptor[], roads: readonly Road[]): void {
  const boxes = new BoxBuilder(out, 'street');
  const decor = { solid: false } as const;
  const streets = roads.filter((road) => road.street && roadLength(road) > 0);
  const runsEastWest = (road: Road): boolean =>
    Math.abs(road.bx - road.ax) > Math.abs(road.bz - road.az);

  for (const road of streets) {
    const length = roadLength(road);
    const alongX = runsEastWest(road);
    const midX = (road.ax + road.bx) / 2;
    const midZ = (road.az + road.bz) / 2;
    boxes.add(
      midX,
      midZ,
      alongX ? length : road.width,
      alongX ? road.width : length,
      0.04,
      ASPHALT,
      { solid: false, road: true, baseY: alongX ? ASPHALT_Y_EAST_WEST : ASPHALT_Y_NORTH_SOUTH },
    );

    // Pavements down both sides, broken wherever another street crosses.
    const start = alongX ? Math.min(road.ax, road.bx) : Math.min(road.az, road.bz);
    const end = start + length;
    const line = alongX ? road.az : road.ax;
    const gaps = streets
      .filter((other) => runsEastWest(other) !== alongX)
      .map((other) => {
        const at = alongX ? other.ax : other.az;
        const half = other.width / 2 + SIDEWALK_WIDTH;
        return [at - half, at + half] as const;
      })
      .sort((a, b) => a[0] - b[0]);
    let from = start;
    for (const [gapStart, gapEnd] of [...gaps, [end, end] as const]) {
      const to = Math.min(gapStart, end);
      if (to - from > 1) {
        for (const side of [-1, 1]) {
          const offset = line + side * (road.width / 2 + SIDEWALK_WIDTH / 2);
          const centre = (from + to) / 2;
          boxes.add(
            alongX ? centre : offset,
            alongX ? offset : centre,
            alongX ? to - from : SIDEWALK_WIDTH,
            alongX ? SIDEWALK_WIDTH : to - from,
            SIDEWALK_TOP,
            KERB,
          );
        }
      }
      from = Math.max(from, gapEnd);
    }

    // Lamp posts down both sides, staggered.
    const edge = road.width / 2 + 1.5;
    const spacing = Config.world.streetLightSpacing;
    for (let along = spacing / 2; along < length; along += spacing) {
      const side = Math.round(along / spacing) % 2 === 0 ? 1 : -1;
      const t = along / length;
      const x = road.ax + (road.bx - road.ax) * t + (alongX ? 0 : side * edge);
      const z = road.az + (road.bz - road.az) * t + (alongX ? side * edge : 0);
      boxes.add(x, z, 0.3, 0.3, LAMP_HEIGHT, LAMP_POST, decor);
      boxes.add(x, z, 1.2, 1.2, 0.35, LAMP_HEAD, { solid: false, baseY: LAMP_HEIGHT, glow: true });
    }
  }

  // Traffic signals on two opposite corners of every junction: a pole, an arm
  // out over the road, and a lit head.
  let junction = 0;
  for (const eastWest of streets.filter(runsEastWest)) {
    for (const northSouth of streets.filter((road) => !runsEastWest(road))) {
      const x = northSouth.ax;
      const z = eastWest.az;
      const inX = x > Math.min(eastWest.ax, eastWest.bx) && x < Math.max(eastWest.ax, eastWest.bx);
      const inZ =
        z > Math.min(northSouth.az, northSouth.bz) && z < Math.max(northSouth.az, northSouth.bz);
      if (!inX || !inZ) continue;
      for (const corner of [-1, 1]) {
        const poleX = x + corner * (northSouth.width / 2 + 0.9);
        const poleZ = z + corner * (eastWest.width / 2 + 0.9);
        const reach = Math.min(5, northSouth.width / 2);
        boxes.add(poleX, poleZ, 0.26, 0.26, 6.4, SIGNAL_POLE, decor);
        boxes.add(poleX - corner * (reach / 2), poleZ, reach, 0.18, 0.18, SIGNAL_POLE, {
          solid: false,
          baseY: 6.1,
        });
        const signal = SIGNALS[(junction + (corner > 0 ? 1 : 0)) % SIGNALS.length] ?? SIGNALS[0];
        boxes.add(poleX - corner * reach, poleZ, 0.45, 0.45, 1.1, SIGNAL_POLE, {
          solid: false,
          baseY: 5.1,
        });
        boxes.add(poleX - corner * reach, poleZ + corner * 0.26, 0.3, 0.1, 0.3, signal, {
          solid: false,
          baseY: 5.5,
          glow: true,
        });
      }
      junction++;
    }
  }
}
