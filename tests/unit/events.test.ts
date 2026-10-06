import { Vector3 } from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { Config } from '../../src/core/Config';
import { EventBus } from '../../src/core/EventBus';
import type { GameEvents } from '../../src/core/GameEvents';
import { store } from '../../src/core/store';
import type { WorldQuery } from '../../src/enemies/Drone';
import { EnemyManager } from '../../src/enemies/EnemyManager';
import { DroneAttackEvent } from '../../src/world/events/DroneAttackEvent';
import { EVENT_SITES } from '../../src/world/events/WorldEvent';
import { WorldEvents } from '../../src/world/WorldEvents';
import { createTestPlayer, STEP } from './helpers';

const cfg = Config.events;
const openSky: WorldQuery = { castRay: () => -1, castSphere: (_o, _d, max) => max };
const FAR_AWAY = { x: 5000, y: 200, z: 5000 };

function createWorld(reserve = Config.enemies.reserve, seed = 1) {
  const bus = new EventBus<GameEvents>();
  const started: GameEvents['world:eventStarted'][] = [];
  const ended: GameEvents['world:eventEnded'][] = [];
  const explosions: number[] = [];
  bus.on('world:eventStarted', (e) => started.push(e));
  bus.on('world:eventEnded', (e) => ended.push(e));
  bus.on('enemy:destroyed', ({ id }) => explosions.push(id));

  const player = createTestPlayer(0, bus);
  const enemies = new EnemyManager(bus, openSky, player.state, () => undefined);
  for (let i = 0; i < reserve; i++) enemies.addReserve(200 + i);
  const worldEvents = new WorldEvents(
    [(site, rng) => new DroneAttackEvent(site, enemies, rng)],
    bus,
    seed,
  );

  const step = (
    seconds: number,
    playerAt: { x: number; y: number; z: number } = FAR_AWAY,
  ): void => {
    for (let i = 0; i < Math.round(seconds / STEP); i++) {
      // Same order as Game.ts: enemies announce kills before the event cleans up.
      enemies.fixedUpdate(STEP);
      worldEvents.fixedUpdate(STEP, playerAt);
    }
  };
  const deployed = () => enemies.drones.filter((drone) => !drone.dormant);
  return { bus, enemies, worldEvents, started, ended, explosions, step, deployed };
}

beforeEach(() => {
  store.setState({ score: 0, eventsCompleted: 0, eventsFailed: 0 });
});

describe('world events (spec section 24)', () => {
  it('stays idle through the opening quiet period, then starts a drone attack', () => {
    const world = createWorld();
    world.step(cfg.firstDelay - 1);
    expect(world.worldEvents.phase).toBe('IDLE');
    expect(world.deployed()).toHaveLength(0);

    world.step(2);
    expect(world.worldEvents.phase).toBe('ACTIVE');
    expect(world.started).toHaveLength(1);
    expect(world.started[0]!.type).toBe('droneAttack');
    expect(EVENT_SITES.map((site) => site.name)).toContain(world.started[0]!.site);

    const squad = world.deployed();
    expect(squad.length).toBeGreaterThanOrEqual(cfg.squadMin);
    expect(squad.length).toBeLessThanOrEqual(cfg.squadMax);
    const site = world.worldEvents.current!.site;
    for (const drone of squad) {
      expect(drone.alive).toBe(true);
      expect(Math.hypot(drone.home.x - site.x, drone.home.z - site.z)).toBeLessThan(
        cfg.squadSpread * 1.5,
      );
    }
    expect(world.worldEvents.current!.status()).toBe(`${squad.length} drones left`);
  });

  it('clearing the squad succeeds, pays out, and returns the drones to reserve', () => {
    const world = createWorld();
    world.worldEvents.trigger(1);
    const squad = world.deployed();
    world.step(0.5);
    for (const drone of squad) drone.applyHit(1e9, new Vector3());
    world.step(STEP * 2);

    expect(world.worldEvents.phase).toBe('SUCCESS');
    expect(world.ended).toEqual([
      { type: 'droneAttack', outcome: 'success', reward: world.worldEvents.lastReward },
    ]);
    expect(world.worldEvents.lastReward).toBeGreaterThanOrEqual(squad.length * cfg.rewardPerDrone);
    expect(store.getState()).toMatchObject({
      score: world.worldEvents.lastReward,
      eventsCompleted: 1,
      eventsFailed: 0,
    });
    expect(world.explosions).toHaveLength(squad.length); // each kill announced once
    expect(world.enemies.reserve).toHaveLength(Config.enemies.reserve);

    world.step(cfg.resultHold + 0.5);
    expect(world.worldEvents.phase).toBe('IDLE');
  });

  it('an event nobody attends fails when the clock runs out, without explosions or reward', () => {
    const world = createWorld();
    world.worldEvents.trigger(1);
    world.step(cfg.timeLimit - 1);
    expect(world.worldEvents.phase).toBe('ACTIVE');
    world.step(2);
    expect(world.worldEvents.phase).toBe('FAILURE');
    expect(store.getState()).toMatchObject({ score: 0, eventsCompleted: 0, eventsFailed: 1 });
    expect(world.explosions).toHaveLength(0);
    expect(world.deployed()).toHaveLength(0);
  });

  it('the clock stops while the player is at the site', () => {
    const world = createWorld();
    world.worldEvents.trigger(1);
    const site = world.worldEvents.current!.site;
    world.step(cfg.timeLimit * 2, { x: site.x + 50, y: site.y, z: site.z });
    expect(world.worldEvents.phase).toBe('ENGAGED');
    expect(world.worldEvents.timeLeft).toBeCloseTo(cfg.timeLimit, 5);
    world.step(5);
    expect(world.worldEvents.phase).toBe('ACTIVE');
    expect(world.worldEvents.timeLeft).toBeLessThan(cfg.timeLimit - 4);
  });

  it('a faster clear earns a bigger reward', () => {
    const reward = (wait: number): number => {
      const world = createWorld();
      world.worldEvents.trigger(1);
      world.step(wait);
      for (const drone of world.deployed()) drone.applyHit(1e9, new Vector3());
      world.step(STEP * 2);
      return world.worldEvents.lastReward;
    };
    expect(reward(1)).toBeGreaterThan(reward(60));
  });

  it('runs one event at a time and leaves a gap before the next, at a different site', () => {
    const world = createWorld();
    world.worldEvents.trigger(1);
    expect(world.worldEvents.trigger(2)).toBe(false);
    const first = world.started[0]!.site;
    for (const drone of world.deployed()) drone.applyHit(1e9, new Vector3());
    world.step(cfg.resultHold + cfg.minGap - 1);
    expect(world.started).toHaveLength(1);
    world.step(cfg.maxGap - cfg.minGap + 2);
    expect(world.started).toHaveLength(2);
    expect(world.started[1]!.site).not.toBe(first);
  });

  it('does not start without enough drones in reserve, and retries later', () => {
    const world = createWorld(cfg.squadMin - 1);
    expect(world.worldEvents.trigger(1)).toBe(false);
    world.step(cfg.firstDelay + cfg.minGap * 2);
    expect(world.started).toHaveLength(0);
    expect(world.worldEvents.phase).toBe('IDLE');
  });

  it('the sequence of sites is the same for the same seed', () => {
    const sites = (seed: number): string[] => {
      const world = createWorld(Config.enemies.reserve, seed);
      for (let i = 0; i < 4; i++) {
        world.step(cfg.maxGap + cfg.firstDelay);
        for (const drone of world.deployed()) drone.applyHit(1e9, new Vector3());
        world.step(cfg.resultHold + 1);
      }
      return world.started.map((event) => event.site);
    };
    expect(sites(7)).toEqual(sites(7));
    expect(sites(7).length).toBeGreaterThanOrEqual(3);
  });

  it('every site is inside the playable area and above the ground', () => {
    for (const site of EVENT_SITES) {
      expect(Math.hypot(site.x, site.z)).toBeLessThan(Config.world.softRadius);
      expect(site.y).toBeGreaterThan(Config.enemies.minAltitude + 20);
    }
  });
});

describe('reserve drones', () => {
  it('are created up front, stay out of the world, and are reused', () => {
    const world = createWorld();
    const count = world.enemies.drones.length;
    expect(world.enemies.targets).toHaveLength(0);
    for (let round = 0; round < 3; round++) {
      world.worldEvents.trigger(round + 1);
      for (const drone of world.deployed()) drone.applyHit(1e9, new Vector3());
      world.step(cfg.resultHold + 0.5);
    }
    expect(world.enemies.drones).toHaveLength(count); // no drone ever allocated after setup
    expect(world.enemies.reserve).toHaveLength(Config.enemies.reserve);
  });
});
