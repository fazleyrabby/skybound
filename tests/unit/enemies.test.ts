import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Config } from '../../src/core/Config';
import { EventBus } from '../../src/core/EventBus';
import type { GameEvents } from '../../src/core/GameEvents';
import type { DroneState, WorldQuery } from '../../src/enemies/Drone';
import { generateEnemy } from '../../src/enemies/EnemyFactory';
import { EnemyManager } from '../../src/enemies/EnemyManager';
import { createTestPlayer, run, STEP } from './helpers';

const cfg = Config.enemies;
const openSky: WorldQuery = { castRay: () => -1, castSphere: (_o, _d, max) => max };
const GUN_SEED = findSeed('gun');
const MISSILE_SEED = findSeed('missile');

function findSeed(weapon: 'gun' | 'missile'): number {
  for (let seed = 1; seed < 500; seed++) {
    const config = generateEnemy(seed);
    if (config.weaponType === weapon && config.aggression > 0.6) return seed;
  }
  throw new Error(`no ${weapon} drone seed found`);
}

/** A player, an enemy manager and the events between them, stepped like Game.ts. */
function createBattle(world: WorldQuery = openSky) {
  const events = new EventBus<GameEvents>();
  const destroyed: number[] = [];
  events.on('enemy:destroyed', ({ id }) => destroyed.push(id));
  const player = createTestPlayer(0, events);
  player.teleport(0, 200, 0);
  const enemies = new EnemyManager(events, world, player.state, (amount) => player.damage(amount));
  const step = (seconds: number, input = {}): void => {
    for (let i = 0; i < Math.round(seconds / STEP); i++) {
      run(player, STEP, input);
      enemies.fixedUpdate(STEP);
    }
  };
  /** Steps until a drone reaches a state, or fails after `limit` seconds. */
  const until = (drone: { state: DroneState }, state: DroneState, limit = 20): number => {
    let elapsed = 0;
    while (drone.state !== state && elapsed < limit) {
      step(STEP);
      elapsed += STEP;
    }
    expect(drone.state).toBe(state);
    return elapsed;
  };
  return { player, enemies, events, destroyed, step, until };
}

describe('procedural drones (spec section 16)', () => {
  it('the same seed gives the same drone', () => {
    expect(generateEnemy(42)).toEqual(generateEnemy(42));
    expect(generateEnemy(42)).not.toEqual(generateEnemy(43));
  });

  it('every variation is slower than boost and within sane ranges', () => {
    let guns = 0;
    let missiles = 0;
    for (let seed = 0; seed < 300; seed++) {
      const drone = generateEnemy(seed);
      expect(drone.speed).toBeGreaterThan(30);
      expect(drone.speed).toBeLessThan(Config.flight.boostSpeed * 0.6);
      expect(drone.health).toBeGreaterThan(40);
      expect(drone.armor).toBeLessThan(0.5);
      expect(drone.engineCount).toBeGreaterThanOrEqual(2);
      expect(drone.engineCount).toBeLessThanOrEqual(4);
      if (drone.weaponType === 'gun') guns++;
      else missiles++;
    }
    expect(guns).toBeGreaterThan(missiles);
    expect(missiles).toBeGreaterThan(30);
  });
});

describe('drone AI (spec section 15)', () => {
  it('patrols around its post while the player is far away', () => {
    const battle = createBattle();
    const drone = battle.enemies.spawnHostile(GUN_SEED, 1500, 200, 0);
    battle.step(20);
    expect(drone.state).toBe('PATROL');
    expect(drone.position.distanceTo(drone.home)).toBeLessThan(cfg.patrolRadius * 1.5);
    expect(drone.velocity.length()).toBeGreaterThan(5);
    expect(battle.player.state.health).toBe(Config.vitals.maxHealth);
  });

  it('telegraphs on detection, then chases, then attacks', () => {
    const battle = createBattle();
    const drone = battle.enemies.spawnHostile(GUN_SEED, 180, 200, 0);
    battle.until(drone, 'DETECT', 2);
    expect(battle.until(drone, 'CHASE', 2)).toBeGreaterThanOrEqual(cfg.detectTime - 0.1);
    battle.until(drone, 'ATTACK', 10);
    battle.step(cfg.thinkInterval * 2);
    expect(drone.threat).toBe(1);
  });

  it('does not detect a player it cannot see', () => {
    const blocked: WorldQuery = {
      castRay: (_o, _d, max) => max / 2,
      castSphere: (_o, _d, max) => max,
    };
    const battle = createBattle(blocked);
    const drone = battle.enemies.spawnHostile(GUN_SEED, 100, 200, 0);
    battle.step(5);
    expect(drone.state).toBe('PATROL');
  });

  it('fires telegraphed bursts that hurt a player who stays put', () => {
    const battle = createBattle();
    const fired: string[] = [];
    battle.events.on('enemy:fired', ({ kind }) => fired.push(kind));
    const drone = battle.enemies.spawnHostile(GUN_SEED, 100, 200, 0);
    battle.until(drone, 'ATTACK', 10);

    let sawTelegraph = false;
    for (let i = 0; i < 60 * 15 && fired.length === 0; i++) {
      battle.step(STEP);
      sawTelegraph ||= drone.telegraph > 0.5;
    }
    expect(sawTelegraph).toBe(true); // the wind-up is visible before the first shot
    battle.step(12);
    expect(fired.every((kind) => kind === 'bullet')).toBe(true);
    expect(fired.length).toBeGreaterThanOrEqual(cfg.burstCount);
    expect(battle.player.state.health).toBeLessThan(Config.vitals.maxHealth);
  });

  it('cannot keep up with a boosting player, and gives up the chase', () => {
    const battle = createBattle();
    const drone = battle.enemies.spawnHostile(GUN_SEED, 100, 200, 0);
    battle.until(drone, 'ATTACK', 10);
    battle.player.state.aim.yaw = Math.PI / 2; // fly -X, away from the drone
    battle.step(12, { moveZ: 1, boost: true });
    expect(battle.player.state.position.distanceTo(drone.position)).toBeGreaterThan(cfg.loseRange);
    battle.step(cfg.loseTime + 2, { moveZ: 1, boost: true });
    expect(drone.state).toBe('PATROL');
  });

  it('jinks out of the way of a fast charge', () => {
    const battle = createBattle();
    const drone = battle.enemies.spawnHostile(GUN_SEED, 100, 200, 0);
    battle.until(drone, 'ATTACK', 10);
    const state = battle.player.state;
    let evaded = false;
    for (let i = 0; i < 60 * 6 && !evaded; i++) {
      // Fly straight at the drone, fast.
      const toDrone = drone.position.clone().sub(state.position).normalize();
      state.aim.yaw = Math.atan2(-toDrone.x, -toDrone.z);
      state.aim.pitch = Math.asin(toDrone.y);
      battle.step(STEP, { moveZ: 1, boost: true });
      evaded = drone.state === 'EVADE';
    }
    expect(evaded).toBe(true);
  });

  it('staggers when hit, then comes after the player even from patrol', () => {
    const battle = createBattle();
    const drone = battle.enemies.spawnHostile(GUN_SEED, 400, 200, 0); // beyond detect range
    battle.step(1);
    expect(drone.state).toBe('PATROL');
    drone.applyHit(5, new Vector3());
    expect(drone.state).toBe('DAMAGED');
    battle.until(drone, 'CHASE', 1);
  });

  it('breaks off once when badly hurt', () => {
    const battle = createBattle();
    const drone = battle.enemies.spawnHostile(GUN_SEED, 100, 200, 0);
    battle.until(drone, 'ATTACK', 10);
    drone.health = drone.maxHealth * 0.2;
    battle.until(drone, 'EVADE', 1);
    const before = drone.position.distanceTo(battle.player.state.position);
    battle.step(cfg.retreatTime * 0.8);
    expect(drone.position.distanceTo(battle.player.state.position)).toBeGreaterThan(before);
    expect(drone.hasRetreated).toBe(true);
  });

  it('climbs over an obstacle in its path and stays off the ground', () => {
    // Everything ahead is blocked for rays, but movement is free.
    const wallAhead: WorldQuery = {
      castRay: (_o, direction) => (Math.abs(direction.y) < 0.5 ? 10 : -1),
      castSphere: (_o, _d, max) => max,
    };
    const battle = createBattle(wallAhead);
    const drone = battle.enemies.spawnHostile(GUN_SEED, 1500, 200, 0);
    battle.step(3);
    expect(drone.position.y).toBeGreaterThan(205);

    const low = createBattle();
    const grounded = low.enemies.spawnHostile(GUN_SEED, 1500, 2, 0);
    low.step(3);
    expect(grounded.position.y).toBeGreaterThan(cfg.minAltitude - 1);
  });
});

describe('damage, crashes and reuse', () => {
  it('armor reduces damage; destruction is announced once and the drone is reused', () => {
    const battle = createBattle();
    const drone = battle.enemies.spawnHostile(GUN_SEED, 1500, 200, 0);
    drone.applyHit(10, new Vector3());
    expect(drone.health).toBeCloseTo(drone.maxHealth - 10 * (1 - drone.config.armor), 5);

    drone.applyHit(10_000, new Vector3());
    expect(drone.alive).toBe(false);
    battle.step(1);
    expect(battle.destroyed).toEqual([drone.id]);
    expect(battle.enemies.targets).not.toContain(drone);

    battle.step(cfg.respawnTime);
    expect(drone.alive).toBe(true);
    expect(drone.health).toBe(drone.maxHealth);
    expect(drone.state).toBe('PATROL');
    expect(battle.enemies.drones).toHaveLength(1); // same object, no allocation
    expect(battle.destroyed).toHaveLength(1);
  });

  it('a drone knocked into a wall takes crash damage; flying into one does not', () => {
    const wall: WorldQuery = {
      castRay: () => -1,
      castSphere: (origin, direction, max) =>
        direction.x > 0 ? Math.min(max, Math.max(0, 1508 - origin.x)) : max,
    };
    const battle = createBattle(wall);
    const drone = battle.enemies.spawnHostile(GUN_SEED, 1500, 200, 0);
    const before = drone.health;
    drone.applyHit(0, new Vector3(80, 0, 0));
    battle.step(1.5);
    expect(drone.health).toBeLessThan(before - 20);
    expect(drone.position.x).toBeLessThanOrEqual(1508);

    const gentle = createBattle(wall);
    const cruiser = gentle.enemies.spawnHostile(GUN_SEED, 1500, 200, 0);
    cruiser.desired.set(30, 0, 0);
    cruiser.steer.set(30, 0, 0);
    gentle.step(0.5);
    expect(cruiser.health).toBe(cruiser.maxHealth);
  });

  it('a drone thrown into another damages both', () => {
    const battle = createBattle();
    const thrown = battle.enemies.spawnHostile(GUN_SEED, 1500, 200, 0);
    const bystander = battle.enemies.spawnHostile(GUN_SEED + 1, 1512, 200, 0);
    thrown.applyHit(0, new Vector3(90, 0, 0));
    battle.step(0.5);
    expect(bystander.health).toBeLessThan(bystander.maxHealth);
    expect(thrown.health).toBeLessThan(thrown.maxHealth);
  });

  it('the training dummy holds its post, takes hits and never fights', () => {
    const battle = createBattle();
    const dummy = battle.enemies.spawnTrainingDummy(30, 200, 0);
    battle.step(5);
    expect(dummy.position.distanceTo(dummy.home)).toBeLessThan(0.01);
    dummy.applyHit(10, new Vector3(0, 40, 0));
    expect(dummy.state).toBe('PATROL');
    battle.step(0.5);
    expect(dummy.position.y).toBeGreaterThan(205);
    battle.step(10);
    expect(dummy.position.distanceTo(dummy.home)).toBeLessThan(1);
    expect(battle.player.state.health).toBe(Config.vitals.maxHealth);
  });
});

describe('missiles', () => {
  it('home in on a player who stays put', () => {
    const battle = createBattle();
    const drone = battle.enemies.spawnHostile(MISSILE_SEED, 100, 200, 0);
    battle.until(drone, 'ATTACK', 10);
    battle.step(15);
    expect(battle.player.state.health).toBeLessThanOrEqual(
      Config.vitals.maxHealth - cfg.missileDamage + 1,
    );
  });

  it('are targets: destroying one stops it and reports it', () => {
    const battle = createBattle();
    const impacts: string[] = [];
    battle.events.on('enemy:shotImpact', ({ kind }) => impacts.push(kind));
    battle.enemies.fire.fireMissile(new Vector3(120, 200, 0), new Vector3(-cfg.missileSpeed, 0, 0));
    battle.step(0.2);
    const missile = battle.enemies.targets.find((target) => target.id >= 10_000);
    expect(missile).toBeDefined();
    missile!.applyHit(1, new Vector3());
    battle.step(3);
    expect(impacts).toEqual(['missile']);
    expect(battle.enemies.targets).toHaveLength(0);
    expect(battle.player.state.health).toBe(Config.vitals.maxHealth);
  });

  it('can be outrun at boost speed', () => {
    const battle = createBattle();
    battle.enemies.fire.fireMissile(new Vector3(60, 200, 0), new Vector3(-cfg.missileSpeed, 0, 0));
    battle.player.state.aim.yaw = Math.PI / 2; // away, along -X
    battle.step(cfg.missileLife + 1, { moveZ: 1, boost: true });
    expect(battle.player.state.health).toBe(Config.vitals.maxHealth);
    expect(battle.enemies.fire.missiles.some((m) => m.active)).toBe(false);
  });
});

describe('frame budget (spec Phase 5 acceptance)', () => {
  it('ten drones in a fight cost well under a millisecond per step', () => {
    const battle = createBattle();
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      battle.enemies.spawnHostile(100 + i, Math.cos(angle) * 120, 200, Math.sin(angle) * 120);
    }
    battle.step(5); // let them engage
    const steps = 60 * 30;
    const start = performance.now();
    for (let i = 0; i < steps; i++) battle.enemies.fixedUpdate(STEP);
    const perStep = (performance.now() - start) / steps;
    expect(perStep).toBeLessThan(0.5);
    expect(battle.enemies.fire.bullets).toHaveLength(cfg.maxBullets);
  });
});
