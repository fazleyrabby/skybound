import { Config } from '../core/Config';
import {
  CheckpointsObjective,
  DefeatBossObjective,
  DestroyDronesObjective,
  LandObjective,
  SpeedObjective,
  TakeOffObjective,
  type Objective,
  type Point,
} from './Objective';

/**
 * A mission is data: a title, where it is offered, what it pays, and a
 * function that builds its objectives fresh each time it starts. Adding a
 * mission means adding one of these; the manager does not change.
 */
export interface MissionDefinition {
  id: string;
  title: string;
  brief: string;
  reward: number;
  /** Mission that must be completed first, if any. */
  requires?: string;
  /** Where the start beacon stands. */
  beacon: Point;
  createObjectives(): Objective[];
}

/** Places the fixed missions need, taken from the generated city. */
export interface MissionSites {
  /** Surface point of the spawn rooftop. */
  spawnRoof: Point;
}

const SPAWN_ROOF_RADIUS = 16;

/** The hand-authored missions of the vertical slice (spec section 25). */
export function createMissions(sites: MissionSites): MissionDefinition[] {
  const cfg = Config.missions;
  const roof = sites.spawnRoof;

  return [
    {
      id: 'first-flight',
      title: 'First Flight',
      brief: 'Learn to fly: take off, thread the city, boost, and land.',
      reward: cfg.firstFlightReward,
      beacon: { x: roof.x + 9, y: roof.y, z: roof.z + 6 },
      createObjectives: () => [
        new TakeOffObjective(),
        // A lap that uses each hand-placed flight line once.
        new CheckpointsObjective([
          { x: roof.x, y: roof.y + 18, z: roof.z - 70 },
          { x: 0, y: 190, z: -185 }, // into the avenue from the north
          { x: 0, y: 110, z: -60 },
          { x: 0, y: 60, z: 90 }, // down the canyon
          { x: 0, y: 8, z: 250, radius: 8 }, // under the highway deck
          { x: -400, y: 14, z: 350, radius: 13 }, // through the park arch
          { x: -122, y: 200, z: -105, radius: 7 }, // between the twin towers
          { x: roof.x, y: roof.y + 40, z: roof.z - 40 },
        ]),
        new SpeedObjective(cfg.firstFlightBoostSpeed),
        new LandObjective(roof, SPAWN_ROOF_RADIUS),
      ],
    },
    {
      id: 'drone-swarm',
      title: 'Drone Swarm',
      brief: 'A swarm is gathering over downtown. Destroy ten drones.',
      reward: cfg.droneSwarmReward,
      requires: 'first-flight',
      beacon: { x: roof.x - 9, y: roof.y, z: roof.z + 6 },
      createObjectives: () => [
        new DestroyDronesObjective(
          cfg.droneSwarmTotal,
          cfg.droneSwarmWave,
          { x: -50, y: 300, z: 35 },
          60,
        ),
      ],
    },
    {
      id: 'titan',
      title: 'Titan',
      brief: 'Something enormous is descending on downtown. Stop it.',
      reward: Config.titan.reward,
      requires: 'drone-swarm',
      beacon: { x: roof.x, y: roof.y, z: roof.z + 13 },
      createObjectives: () => [new DefeatBossObjective()],
    },
  ];
}
