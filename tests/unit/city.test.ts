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
    expect(city.buildings.length).toBeLessThan(2000);
  });

  it('downtown is tall and stays inside its block', () => {
    const towers = inDistrict('downtown').filter((b) => b.y - b.hy === 0);
    expect(towers.length).toBeGreaterThan(30);
    for (const tower of towers) {
      expect(topOf(tower)).toBeGreaterThanOrEqual(100 * 0.6);
      expect(topOf(tower)).toBeLessThanOrEqual(345);
      expect(Math.abs(tower.x) + tower.hx).toBeLessThanOrEqual(Layout.downtownHalf + 1);
      expect(Math.abs(tower.z) + tower.hz).toBeLessThanOrEqual(Layout.downtownHalf + 1);
    }
    expect(Math.max(...towers.map(topOf))).toBeGreaterThan(250);
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
