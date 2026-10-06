import { describe, expect, it } from 'vitest';
import { Config } from '../../src/core/Config';
import { topOf, type BuildingDescriptor, type District } from '../../src/world/Building';
import { generateCity } from '../../src/world/CityGenerator';
import { Layout } from '../../src/world/city/layout';
import { createTestPlayer, run } from './helpers';

const city = generateCity(1337);
const solid = city.buildings.filter((b) => b.solid);
const inDistrict = (district: District): BuildingDescriptor[] =>
  city.buildings.filter((b) => b.district === district);
const covers = (b: BuildingDescriptor, x: number, z: number): boolean =>
  Math.abs(x - b.x) <= b.hx && Math.abs(z - b.z) <= b.hz;

describe('city generation', () => {
  it('is deterministic per seed', () => {
    expect(generateCity(1337)).toEqual(city);
    expect(generateCity(1338).buildings).not.toEqual(city.buildings);
  });

  it('has every district', () => {
    const districts: District[] = [
      'downtown',
      'residential',
      'industrial',
      'park',
      'harbor',
      'highway',
      'surround',
    ];
    for (const district of districts) expect(inDistrict(district).length).toBeGreaterThan(5);
  });

  it('stays within budget for one instanced draw call', () => {
    expect(city.buildings.length).toBeGreaterThan(600);
    expect(city.buildings.length).toBeLessThan(6000);
  });

  it('downtown is tall and stays inside its block', () => {
    // Ground-level boxes taller than a podium are tower base tiers.
    const towers = inDistrict('downtown').filter((b) => b.y - b.hy === 0 && topOf(b) > 20);
    expect(towers.length).toBeGreaterThan(30);
    for (const tower of towers) {
      expect(topOf(tower)).toBeGreaterThanOrEqual(100 * 0.6);
      expect(topOf(tower)).toBeLessThanOrEqual(345);
      expect(Math.abs(tower.x) + tower.hx).toBeLessThanOrEqual(Layout.downtownHalf + 1);
      expect(Math.abs(tower.z) + tower.hz).toBeLessThanOrEqual(Layout.downtownHalf + 1);
    }
    expect(Math.max(...inDistrict('downtown').map(topOf))).toBeGreaterThan(250);
  });

  it('keeps the avenue canyon clear through downtown', () => {
    const half = Layout.avenueWidth / 2;
    const blocking = solid.filter(
      (b) =>
        b.district !== 'highway' &&
        Math.abs(b.z) < Layout.downtownHalf &&
        b.x - b.hx < half - 0.01 &&
        b.x + b.hx > -half + 0.01,
    );
    expect(blocking).toEqual([]);
  });

  it('has a flyable gap between the twin towers', () => {
    const twins = inDistrict('downtown')
      .filter((b) => topOf(b) === 280)
      .sort((a, b) => a.x - b.x);
    expect(twins).toHaveLength(2);
    const [west, east] = twins as [BuildingDescriptor, BuildingDescriptor];
    const gap = east.x - east.hx - (west.x + west.hx);
    expect(gap).toBeGreaterThan(Config.player.radius * 2 * 5);
    expect(gap).toBeLessThan(20);
  });

  it('spawns on a rooftop with nothing on top of it', () => {
    const { x, y, z } = city.spawn;
    const roof = solid.find((b) => covers(b, x, z) && Math.abs(topOf(b) - y) < 1e-6);
    expect(roof).toBeDefined();
    expect(y).toBeGreaterThan(200);
    expect(solid.some((b) => covers(b, x, z) && topOf(b) > y)).toBe(false);
  });

  it('keeps the highway underside and the arch high enough to fly through', () => {
    const decks = inDistrict('highway').filter((b) => b.y - b.hy > 1);
    expect(decks).toHaveLength(4);
    for (const deck of decks) expect(deck.y - deck.hy).toBeGreaterThanOrEqual(15);
    const lintel = inDistrict('park').find((b) => b.solid && b.y - b.hy > 20);
    expect(lintel).toBeDefined();
  });

  it('puts nothing solid in the ocean except harbor structures', () => {
    const wet = solid.filter(
      (b) => (b.x - b.hx > Layout.shore || b.z - b.hz > Layout.shore) && b.district !== 'harbor',
    );
    expect(wet).toEqual([]);
  });
});

describe('world bounds (spec section 64)', () => {
  const { softRadius, boundaryWidth, ceilingStart, ceilingEnd } = Config.world;

  it('does nothing inside the playable area', () => {
    const player = createTestPlayer();
    player.teleport(softRadius - 500, 300, 0);
    player.state.aim.yaw = -Math.PI / 2; // facing +X, outward
    run(player, 2, { moveZ: 1 });
    expect(player.state.boundsPressure).toBe(0);
    expect(player.state.velocity.x).toBeGreaterThan(50);
  });

  it('a headwind stops outward flight and carries the hero back, with no hard wall', () => {
    const player = createTestPlayer();
    player.teleport(softRadius - 100, 300, 0);
    player.state.aim.yaw = -Math.PI / 2;
    let furthest = 0;
    let largestSpeedDrop = 0;
    let lastSpeed = 0;
    for (let i = 0; i < 60 * 40; i++) {
      run(player, 1 / 60, { moveZ: 1, boost: true });
      furthest = Math.max(furthest, player.state.position.x);
      largestSpeedDrop = Math.max(largestSpeedDrop, lastSpeed - player.state.speed);
      lastSpeed = player.state.speed;
    }
    expect(furthest).toBeGreaterThan(softRadius); // the boundary is soft
    expect(furthest).toBeLessThan(softRadius + boundaryWidth + 1);
    expect(player.state.boundsPressure).toBeGreaterThan(0);
    expect(largestSpeedDrop).toBeLessThan(15); // never an abrupt stop
  });

  it('can always fly back in', () => {
    const player = createTestPlayer();
    player.teleport(softRadius + boundaryWidth * 0.9, 300, 0);
    player.state.aim.yaw = Math.PI / 2; // facing -X, inward
    run(player, 6, { moveZ: 1 });
    expect(player.state.position.x).toBeLessThan(softRadius + boundaryWidth * 0.9 - 200);
  });

  it('upward speed fades out toward the ceiling', () => {
    const player = createTestPlayer();
    player.teleport(0, ceilingStart - 50, 0);
    run(player, 60, { ascend: true, boost: true });
    expect(player.state.position.y).toBeGreaterThan(ceilingStart);
    expect(player.state.position.y).toBeLessThanOrEqual(ceilingEnd + 1);
    run(player, 3, { descend: true });
    expect(player.state.position.y).toBeLessThan(ceilingEnd - 30); // coming down is free
  });
});

describe('building design', () => {
  it('real buildings get window facades; infrastructure and props do not', () => {
    const withWindows = (district: District): number =>
      inDistrict(district).filter((b) => b.windows).length;
    expect(withWindows('downtown')).toBeGreaterThan(60);
    expect(withWindows('residential')).toBeGreaterThan(80);
    expect(withWindows('surround')).toBeGreaterThan(100);
    for (const district of ['highway', 'park', 'street', 'harbor'] as const) {
      expect(withWindows(district)).toBe(0);
    }
  });

  it('towers step in as they rise and never overhang their lot', () => {
    const tiers = inDistrict('downtown').filter((b) => b.windows && b.solid);
    const upper = tiers.filter((b) => b.y - b.hy > 30);
    expect(upper.length).toBeGreaterThan(15);
    for (const tier of upper) {
      const below = tiers.find(
        (b) =>
          b !== tier &&
          Math.abs(topOf(b) - (tier.y - tier.hy)) < 1e-6 &&
          b.x === tier.x &&
          b.z === tier.z,
      );
      expect(below).toBeDefined();
      expect(tier.hx).toBeLessThan(below!.hx);
      expect(tier.hz).toBeLessThan(below!.hz);
    }
  });

  it('rooftop plant is decoration: no colliders, and none on the spawn roof', () => {
    const { x, y, z } = city.spawn;
    const plant = inDistrict('downtown').filter((b) => !b.solid);
    expect(plant.length).toBeGreaterThan(60);
    expect(plant.some((b) => Math.abs(b.x - x) < 18 && Math.abs(b.z - z) < 18 && b.y > y)).toBe(
      false,
    );
  });
});

describe('trees', () => {
  it('are placed deterministically, in the park, along the avenue and in yards', () => {
    expect(generateCity(1337).trees).toEqual(city.trees);
    expect(city.trees.length).toBeGreaterThan(200);
    expect(city.trees.length).toBeLessThan(450);
    const inPark = city.trees.filter((t) => t.x < 0 && t.z > 200);
    const onAvenue = city.trees.filter((t) => Math.abs(t.x) < 25 && Math.abs(t.z) < 240);
    const inYards = city.trees.filter((t) => t.z < 195 && (t.x < -300 || t.z < -300));
    expect(inPark.length).toBeGreaterThan(120);
    expect(onAvenue.length).toBeGreaterThan(20);
    expect(inYards.length).toBeGreaterThan(40);
    expect(city.trees.some((t) => t.kind === 'conifer')).toBe(true);
  });

  it('never stand inside a building, on a street, in the arch or in the sea', () => {
    for (const tree of city.trees) {
      const inside = solid.find(
        (b) => b.y - b.hy < 4 && Math.abs(tree.x - b.x) < b.hx && Math.abs(tree.z - b.z) < b.hz,
      );
      expect(inside).toBeUndefined();
      expect(tree.x).toBeLessThan(Layout.shore);
      expect(tree.z).toBeLessThan(Layout.shore);
      const onStreet = city.roads.some(
        (road) =>
          road.street &&
          tree.x > Math.min(road.ax, road.bx) - road.width / 2 &&
          tree.x < Math.max(road.ax, road.bx) + road.width / 2 &&
          tree.z > Math.min(road.az, road.bz) - road.width / 2 &&
          tree.z < Math.max(road.az, road.bz) + road.width / 2,
      );
      expect(onStreet).toBe(false);
      expect(Math.abs(tree.x + 400) < 30 && Math.abs(tree.z - 350) < 40).toBe(false);
    }
  });

  it('have sensible sizes', () => {
    for (const tree of city.trees) {
      expect(tree.height).toBeGreaterThanOrEqual(6);
      expect(tree.height).toBeLessThanOrEqual(19);
      expect(tree.spread).toBeGreaterThan(0.25);
      expect(tree.spread).toBeLessThan(0.85);
    }
  });
});

describe('filling the ground', () => {
  /** Share of a square area covered by building footprints, sampled on a grid. */
  function coverage(minX: number, maxX: number, minZ: number, maxZ: number): number {
    const footprints = city.buildings.filter((b) => b.hy > 1.5);
    let covered = 0;
    let total = 0;
    for (let x = minX; x <= maxX; x += 8) {
      for (let z = minZ; z <= maxZ; z += 8) {
        total++;
        if (footprints.some((b) => Math.abs(x - b.x) <= b.hx && Math.abs(z - b.z) <= b.hz))
          covered++;
      }
    }
    return covered / total;
  }

  it('midtown lines the highway ring with low blocks', () => {
    const midtown = inDistrict('midtown').filter((b) => b.solid);
    expect(midtown.length).toBeGreaterThan(80);
    for (const block of midtown) expect(topOf(block)).toBeLessThan(58); // corridor above stays open
    expect(coverage(-190, 190, -292, -208)).toBeGreaterThan(0.25);
    expect(coverage(208, 292, -190, 190)).toBeGreaterThan(0.25);
  });

  it('leaves the First Flight course clear at street level south of downtown', () => {
    const inTheWay = solid.filter(
      (b) =>
        b.z - b.hz < 296 &&
        b.z + b.hz > 262 &&
        b.x + b.hx > -200 &&
        b.x - b.hx < 40 &&
        b.y - b.hy < 20,
    );
    expect(inTheWay.filter((b) => b.district !== 'highway')).toEqual([]);
  });

  it('residential, industrial and the east docks are built up', () => {
    expect(coverage(-490, -310, -490, 190)).toBeGreaterThan(0.22); // west residential
    expect(coverage(-290, 290, -490, -310)).toBeGreaterThan(0.22); // north residential
    expect(coverage(310, 490, -490, 90)).toBeGreaterThan(0.3); // industrial
    expect(coverage(310, 490, 110, 290)).toBeGreaterThan(0.2); // east docks
  });

  it('suburbs run right up to the city and thin out with distance', () => {
    const near = coverage(-800, -540, -400, 400);
    const far = coverage(-1450, -1200, -400, 400);
    expect(near).toBeGreaterThan(0.2);
    expect(far).toBeLessThan(near * 0.7);
    expect(far).toBeGreaterThan(0.02);
    // No bare ring between the core and the suburbs any more.
    expect(coverage(-640, -510, -300, 300)).toBeGreaterThan(0.18);
  });

  it('open land beyond is broken up by fields', () => {
    const fields = inDistrict('surround').filter((b) => !b.solid);
    expect(fields.length).toBeGreaterThan(30);
  });
});
