import { Config } from '../core/Config';
import { createRng } from '../utils/rng';
import type { ChunkManager } from './ChunkManager';
import { roadLength, type Road } from './city/roads';
import { FOLLOWER_STRIDE, PathFollowers, type Path } from './PathFollowers';

interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

const VEHICLE_COLORS = [
  0xd8dce3, 0x2b2f38, 0xb53b32, 0x2e6fa8, 0xd9a520, 0x4f8f5a, 0x8d9199,
] as const;
const PEDESTRIAN_COLORS = [
  0xe6d5b8, 0x3b4a6b, 0x8a3b3b, 0x4a6b4f, 0xd0d4dc, 0x2d2f36, 0xc98a4a,
] as const;
const VEHICLE_HEIGHT = 0.75;
const PEDESTRIAN_HEIGHT = 0.85;
const SIDEWALK_MARGIN = 2.5;
/** Vehicles are visible from far off; hide them only well outside live chunks' reach. */
const VEHICLE_RANGE = 900;
const PARK_PATHS = 26;

/**
 * Traffic and pedestrians (spec sections 22, 23): the things that make the
 * city look inhabited. Vehicles drive the streets, the highway ring and the
 * bridge; pedestrians walk the downtown sidewalks and the park. Pedestrians
 * exist only in live chunks, near the player and near the ground, because from
 * flight height they are a few pixels.
 */
export class StreetLife {
  readonly vehicleBuffer: Float32Array;
  readonly vehicleColors: Uint32Array;
  readonly pedestrianBuffer: Float32Array;
  readonly pedestrianColors: Uint32Array;
  visibleVehicles = 0;
  visiblePedestrians = 0;

  private readonly vehicles: PathFollowers;
  private readonly pedestrians: PathFollowers;

  constructor(
    roads: readonly Road[],
    private readonly chunks: ChunkManager,
    seed: number,
  ) {
    const cfg = Config.world;

    const lanes: Path[] = roads.map((road) => ({ ...road, y: road.y + VEHICLE_HEIGHT }));
    this.vehicles = new PathFollowers(
      lanes,
      {
        count: cfg.vehicleCount,
        minSpeed: cfg.vehicleMinSpeed,
        maxSpeed: cfg.vehicleMaxSpeed,
        colors: VEHICLE_COLORS,
        laneOffset: (_path, index) => roads[index]?.laneOffset ?? 0,
      },
      seed + 101,
    );

    // Sidewalks run along each street; park paths are short random strolls on the lawns.
    const streets = roads.filter((road) => road.street && roadLength(road) > 0);
    const walks: Path[] = streets.map((road) => ({ ...road, y: PEDESTRIAN_HEIGHT }));
    const sidewalkCount = walks.length;
    const rng = createRng(seed + 202);
    for (let i = 0; i < PARK_PATHS; i++) {
      const west = i % 2 === 0;
      const x = west ? rng.range(-490, -310) : rng.range(-290, -20);
      const z = west ? rng.range(215, 490) : rng.range(310, 490);
      walks.push({
        ax: x,
        az: z,
        bx: x + rng.range(-70, 70),
        bz: Math.min(495, z + rng.range(-70, 70)),
        y: PEDESTRIAN_HEIGHT,
      });
    }
    this.pedestrians = new PathFollowers(
      walks,
      {
        count: cfg.pedestrianCount,
        minSpeed: cfg.pedestrianMinSpeed,
        maxSpeed: cfg.pedestrianMaxSpeed,
        colors: PEDESTRIAN_COLORS,
        laneOffset: (_path, index) =>
          index < sidewalkCount ? (streets[index]?.width ?? 0) / 2 + SIDEWALK_MARGIN : 0.6,
      },
      seed + 303,
    );

    this.vehicleBuffer = new Float32Array(this.vehicles.count * FOLLOWER_STRIDE);
    this.vehicleColors = new Uint32Array(this.vehicles.count);
    this.pedestrianBuffer = new Float32Array(this.pedestrians.count * FOLLOWER_STRIDE);
    this.pedestrianColors = new Uint32Array(this.pedestrians.count);
  }

  fixedUpdate(dt: number): void {
    this.vehicles.fixedUpdate(dt);
    this.pedestrians.fixedUpdate(dt);
  }

  /** Fills the instance buffers for this frame. `lead` is seconds since the last fixed step. */
  prepare(player: Vec3Like, lead: number): void {
    const cfg = Config.world;
    this.visibleVehicles = this.vehicles.write(
      this.vehicleBuffer,
      this.vehicleColors,
      lead,
      (x, z) => Math.hypot(x - player.x, z - player.z) < VEHICLE_RANGE,
    );

    this.visiblePedestrians =
      player.y > cfg.pedestrianMaxAltitude
        ? 0
        : this.pedestrians.write(
            this.pedestrianBuffer,
            this.pedestrianColors,
            lead,
            (x, z) =>
              this.chunks.isLiveAt(x, z) &&
              Math.hypot(x - player.x, z - player.z) < cfg.pedestrianRange,
          );
  }
}
