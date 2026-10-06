import { Config } from '../../core/Config';
import { BoxBuilder, type BuildingDescriptor } from '../Building';
import { roadLength, type Road } from './roads';

const ASPHALT = 0x3a3d43;
const LAMP_POST = 0x2e3138;
const LAMP_HEAD = 0xffe9a8;
const LAMP_HEIGHT = 9;
/** Just above the ground plane and lawn patches. */
const ASPHALT_Y = 0.05;

/**
 * Street dressing: asphalt strips so streets read as streets, and lamp posts
 * along them. All non-solid boxes in the shared instanced mesh, so they cost
 * no draw calls and no colliders.
 */
export function buildProps(out: BuildingDescriptor[], roads: readonly Road[]): void {
  const boxes = new BoxBuilder(out, 'street');
  const decor = { solid: false } as const;

  for (const road of roads) {
    if (!road.street) continue;
    const length = roadLength(road);
    const alongX = Math.abs(road.bx - road.ax) > Math.abs(road.bz - road.az);
    const midX = (road.ax + road.bx) / 2;
    const midZ = (road.az + road.bz) / 2;
    boxes.add(
      midX,
      midZ,
      alongX ? length : road.width,
      alongX ? road.width : length,
      0.04,
      ASPHALT,
      { solid: false, baseY: ASPHALT_Y },
    );

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
}
