import { describe, expect, it } from 'vitest';
import { Config } from '../../src/core/Config';
import { ChunkManager } from '../../src/world/ChunkManager';
import { generateCity } from '../../src/world/CityGenerator';
import { buildRoads, roadLength } from '../../src/world/city/roads';
import { FOLLOWER_STRIDE, PathFollowers, type Path } from '../../src/world/PathFollowers';
import { StreetLife } from '../../src/world/StreetLife';

const cfg = Config.world;
const STILL = { x: 0, y: 0, z: 0 };
const STEP = 1 / 60;

/** Runs updates until the time-sliced chunk switches have all been applied. */
function settle(chunks: ChunkManager, position = STILL, velocity = STILL): void {
  for (let i = 0; i < 40; i++) chunks.update(position, velocity);
}

describe('ChunkManager (spec section 34)', () => {
  it('covers the core with a 5 x 5 grid and nothing outside it', () => {
    const chunks = new ChunkManager();
    expect(chunks.total).toBe(25);
    expect(chunks.indexAt(-499, -499)).toBe(0);
    expect(chunks.indexAt(499, 499)).toBe(24);
    expect(chunks.indexAt(0, 0)).toBe(12);
    expect(chunks.indexAt(600, 0)).toBe(-1);
    expect(chunks.isLiveAt(600, 0)).toBe(false);
  });

  it('keeps chunks near the player live and distant ones off', () => {
    const chunks = new ChunkManager();
    settle(chunks, { x: -400, y: 0, z: -400 });
    expect(chunks.isLiveAt(-400, -400)).toBe(true);
    expect(chunks.isLiveAt(400, 400)).toBe(false);
    expect(chunks.liveCount).toBeGreaterThan(0);
    expect(chunks.liveCount).toBeLessThan(chunks.total);

    settle(chunks, { x: 3000, y: 0, z: 3000 });
    expect(chunks.liveCount).toBe(0);
  });

  it('wakes chunks ahead of a fast-moving player before they arrive', () => {
    const position = { x: -1100, y: 300, z: 0 };
    const parked = new ChunkManager();
    settle(parked, position);
    expect(parked.liveCount).toBe(0);

    const boosting = new ChunkManager();
    settle(boosting, position, { x: 250, y: 0, z: 0 });
    expect(boosting.isLiveAt(-450, 0)).toBe(true);
  });

  it('switches only a few chunks per update', () => {
    const chunks = new ChunkManager();
    chunks.update(STILL, STILL);
    expect(chunks.liveCount).toBe(cfg.chunkChangesPerUpdate);
    // The nearest chunk goes first.
    expect(chunks.isLiveAt(0, 0)).toBe(true);
    chunks.update(STILL, STILL);
    expect(chunks.liveCount).toBe(cfg.chunkChangesPerUpdate * 2);
  });
});

describe('roads', () => {
  const city = generateCity(1337);
  const solid = city.buildings.filter((b) => b.solid);

  it('ground streets run through gaps, not through buildings', () => {
    for (const road of city.roads.filter((r) => r.street)) {
      const alongX = Math.abs(road.bx - road.ax) > 0;
      const half = road.width / 2 + 1;
      const blocking = solid.filter((b) => {
        if (b.y - b.hy > 3) return false; // overhead: highway deck, bridge
        if (b.district === 'highway') return false; // pillars stand in the road corridor
        const minX = Math.min(road.ax, road.bx) - (alongX ? 0 : half);
        const maxX = Math.max(road.ax, road.bx) + (alongX ? 0 : half);
        const minZ = Math.min(road.az, road.bz) - (alongX ? half : 0);
        const maxZ = Math.max(road.az, road.bz) + (alongX ? half : 0);
        return b.x + b.hx > minX && b.x - b.hx < maxX && b.z + b.hz > minZ && b.z - b.hz < maxZ;
      });
      expect(blocking).toEqual([]);
    }
  });

  it('elevated roads sit on their decks', () => {
    const decks = buildRoads().filter((road) => !road.street);
    expect(decks).toHaveLength(5);
    for (const road of decks) {
      const midX = (road.ax + road.bx) / 2;
      const midZ = (road.az + road.bz) / 2;
      const deck = solid.find(
        (b) =>
          Math.abs(b.x - midX) <= b.hx &&
          Math.abs(b.z - midZ) <= b.hz &&
          Math.abs(b.y + b.hy - road.y) < 0.01,
      );
      expect(deck).toBeDefined();
    }
  });

  it('street dressing adds no colliders', () => {
    const dressing = city.buildings.filter((b) => b.district === 'street');
    expect(dressing.length).toBeGreaterThan(100);
    expect(dressing.every((b) => !b.solid)).toBe(true);
  });
});

describe('PathFollowers', () => {
  const paths: Path[] = [
    { ax: 0, az: 0, bx: 100, bz: 0, y: 1 },
    { ax: 0, az: 50, bx: 0, bz: 350, y: 1 },
  ];
  const spec = {
    count: 40,
    minSpeed: 10,
    maxSpeed: 20,
    colors: [0xff0000, 0x00ff00],
    laneOffset: () => 2,
  };
  const everywhere = (): boolean => true;

  function snapshot(followers: PathFollowers, lead = 0) {
    const buffer = new Float32Array(followers.count * FOLLOWER_STRIDE);
    const colors = new Uint32Array(followers.count);
    const count = followers.write(buffer, colors, lead, everywhere);
    return { buffer, colors, count };
  }

  it('is deterministic per seed', () => {
    const a = snapshot(new PathFollowers(paths, spec, 5));
    const b = snapshot(new PathFollowers(paths, spec, 5));
    const c = snapshot(new PathFollowers(paths, spec, 6));
    expect(a.buffer).toEqual(b.buffer);
    expect(a.buffer).not.toEqual(c.buffer);
  });

  it('keeps every follower on its path, in its lane, forever', () => {
    const followers = new PathFollowers(paths, spec, 5);
    for (let i = 0; i < 60 * 120; i++) followers.fixedUpdate(STEP);
    const { buffer, count } = snapshot(followers);
    expect(count).toBe(spec.count); // pooled: none created, none lost
    for (let i = 0; i < count; i++) {
      const x = buffer[i * FOLLOWER_STRIDE]!;
      const z = buffer[i * FOLLOWER_STRIDE + 2]!;
      const onFirst = x >= 0 && x <= 100 && Math.abs(Math.abs(z) - 2) < 1e-3;
      const onSecond = z >= 50 && z <= 350 && Math.abs(Math.abs(x) - 2) < 1e-3;
      expect(onFirst || onSecond).toBe(true);
    }
  });

  it('spreads followers by path length and drives on the right in both directions', () => {
    const followers = new PathFollowers(paths, { ...spec, count: 400 }, 9);
    const { buffer, count } = snapshot(followers);
    let onLong = 0;
    let eastboundRight = 0;
    let westboundRight = 0;
    for (let i = 0; i < count; i++) {
      const x = buffer[i * FOLLOWER_STRIDE]!;
      const z = buffer[i * FOLLOWER_STRIDE + 2]!;
      const yaw = buffer[i * FOLLOWER_STRIDE + 3]!;
      if (z >= 50) {
        onLong++;
        continue;
      }
      void x;
      // Heading +X has yaw -90 degrees; its right-hand side is +Z.
      if (Math.abs(yaw + Math.PI / 2) < 1e-3 && z > 0) eastboundRight++;
      if (Math.abs(yaw - Math.PI / 2) < 1e-3 && z < 0) westboundRight++;
    }
    expect(onLong / count).toBeGreaterThan(0.65); // 300 m of 400 m total
    expect(eastboundRight).toBeGreaterThan(10);
    expect(westboundRight).toBeGreaterThan(10);
    expect(eastboundRight + westboundRight).toBe(count - onLong);
  });

  it('extrapolates within a step and shrinks at path ends instead of popping', () => {
    const one = new PathFollowers(
      [paths[0]!],
      { ...spec, count: 1, minSpeed: 10, maxSpeed: 10 },
      3,
    );
    const now = snapshot(one, 0).buffer[0]!;
    const later = snapshot(one, 0.5).buffer[0]!;
    expect(Math.abs(later - now)).toBeCloseTo(5, 3);

    let smallest = 1;
    for (let i = 0; i < 60 * 12; i++) {
      one.fixedUpdate(STEP);
      smallest = Math.min(smallest, snapshot(one).buffer[4]!);
    }
    expect(smallest).toBeLessThan(0.1);
  });
});

describe('StreetLife', () => {
  const roads = buildRoads();

  function createLife(player: { x: number; y: number; z: number }) {
    const chunks = new ChunkManager();
    settle(chunks, player);
    const life = new StreetLife(roads, chunks, 1337);
    life.prepare(player, 0);
    return life;
  }

  it('has enough road for the traffic', () => {
    const total = roads.reduce((sum, road) => sum + roadLength(road), 0);
    expect(total / cfg.vehicleCount).toBeGreaterThan(20); // metres of road per vehicle
  });

  it('shows traffic and pedestrians at street level downtown', () => {
    const life = createLife({ x: 0, y: 5, z: 0 });
    expect(life.visibleVehicles).toBeGreaterThan(100);
    expect(life.visiblePedestrians).toBeGreaterThan(20);
    expect(life.visiblePedestrians).toBeLessThan(cfg.pedestrianCount);
  });

  it('drops pedestrians from high up but keeps traffic', () => {
    const life = createLife({ x: 0, y: cfg.pedestrianMaxAltitude + 50, z: 0 });
    expect(life.visiblePedestrians).toBe(0);
    expect(life.visibleVehicles).toBeGreaterThan(100);
  });

  it('shows nothing far outside the city', () => {
    const life = createLife({ x: -2800, y: 5, z: -2800 });
    expect(life.visibleVehicles).toBe(0);
    expect(life.visiblePedestrians).toBe(0);
  });

  it('a minute of street life for the whole city is cheap', () => {
    const life = createLife({ x: 0, y: 5, z: 0 });
    const frames = 60 * 60;
    const start = performance.now();
    for (let i = 0; i < frames; i++) {
      life.fixedUpdate(STEP);
      life.prepare({ x: 0, y: 5, z: 0 }, 0);
    }
    expect((performance.now() - start) / frames).toBeLessThan(0.4);
  });
});
