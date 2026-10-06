import { Config } from '../core/Config';
import { createRng } from '../utils/rng';
import { topOf, type BuildingDescriptor } from './Building';
import { buildDowntown } from './city/downtown';
import { buildHarbor } from './city/harbor';
import { buildHighway } from './city/highway';
import { buildIndustrial } from './city/industrial';
import { Layout } from './city/layout';
import { buildPark } from './city/park';
import { buildResidential } from './city/residential';
import { buildSurround } from './city/surround';

export interface City {
  buildings: BuildingDescriptor[];
  /** Surface point the player starts standing on. */
  spawn: { x: number; y: number; z: number };
  /** Land ends at this x and z on the east and south sides; beyond is ocean. */
  shore: number;
}

/**
 * Builds Nova City as plain box descriptors, deterministically from a seed.
 * Each district draws from its own random stream, so changing one district
 * does not reshuffle the others.
 */
export function generateCity(seed: number = Config.world.seed): City {
  const buildings: BuildingDescriptor[] = [];
  const stream = (index: number) => createRng(seed * 31 + index);

  const { spawnRoof } = buildDowntown(buildings, stream(1));
  buildResidential(buildings, stream(2));
  buildIndustrial(buildings, stream(3));
  buildHarbor(buildings, stream(4));
  buildPark(buildings, stream(5));
  buildHighway(buildings);
  buildSurround(buildings, stream(6), Config.world.softRadius);

  return {
    buildings,
    spawn: { x: spawnRoof.x, y: topOf(spawnRoof), z: spawnRoof.z },
    shore: Layout.shore,
  };
}
