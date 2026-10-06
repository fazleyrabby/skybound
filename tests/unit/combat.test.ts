import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { Damageable } from '../../src/combat/Damageable';
import { Projectiles, type WorldRaycaster } from '../../src/combat/Projectiles';
import { scoreTarget, Targeting } from '../../src/combat/Targeting';
import { Config } from '../../src/core/Config';
import { EventBus } from '../../src/core/EventBus';
import type { GameEvents } from '../../src/core/GameEvents';
import { CombatController } from '../../src/player/CombatController';
import { createPlayerInput, type PlayerInput } from '../../src/player/PlayerState';
import { createRng } from '../../src/utils/rng';
import { createTestPlayer, STEP } from './helpers';

const combatCfg = Config.combat;
const FORWARD = new Vector3(0, 0, -1);
const ORIGIN = new Vector3();
const openSky: WorldRaycaster = { castRay: () => -1 };

function fakeTarget(id: number, x: number, y: number, z: number): Damageable {
  const target: Damageable = {
    id,
    position: new Vector3(x, y, z),
    velocity: new Vector3(),
    radius: 1.5,
    maxHealth: 100,
    health: 100,
    alive: true,
    threat: 0,
    applyHit(damage) {
      target.health -= damage;
      if (target.health <= 0) target.alive = false;
    },
  };
  return target;
}

/** A target circling a point at drone-like speed, for the moving-target tests. */
class OrbitingTarget implements Damageable {
  readonly id = 1;
  readonly position = new Vector3();
  readonly velocity = new Vector3();
  readonly radius = 1.6;
  readonly maxHealth = 100;
  health = 100;
  alive = true;
  threat = 0;
  private angle = 0;

  constructor(
    private readonly centre: Vector3,
    private readonly orbitRadius = 45,
    private readonly speed = 25,
  ) {
    this.fixedUpdate(STEP);
  }

  applyHit(damage: number): void {
    this.health -= damage;
    if (this.health <= 0) this.alive = false;
  }

  fixedUpdate(dt: number): void {
    const previous = this.position.clone();
    this.angle += (this.speed / this.orbitRadius) * dt;
    this.position.set(
      this.centre.x + Math.cos(this.angle) * this.orbitRadius,
      this.centre.y,
      this.centre.z + Math.sin(this.angle) * this.orbitRadius,
    );
    this.velocity.copy(this.position).sub(previous).divideScalar(dt);
  }
}

/** Player, combat and a set of targets stepped the way Game.ts steps them. */
function createArena(targets: Damageable[], world: WorldRaycaster = openSky) {
  const events = new EventBus<GameEvents>();
  const hits: GameEvents['combat:hit'][] = [];
  const whiffs: GameEvents['combat:whiff'][] = [];
  events.on('combat:hit', (hit) => hits.push(hit));
  events.on('combat:whiff', (whiff) => whiffs.push(whiff));

  const player = createTestPlayer(0, events);
  player.teleport(0, 100, 0);
  const projectiles = new Projectiles(world, events);
  const combat = new CombatController(player.state, () => targets, projectiles, events);
  let frozenSteps = 0;

  const step = (overrides: Partial<PlayerInput> = {}): void => {
    const input = { ...createPlayerInput(), ...overrides };
    if (combat.consumeHitStop(input, STEP)) {
      frozenSteps++;
      return;
    }
    combat.fixedUpdate(input, STEP);
    player.fixedUpdate(input, STEP);
    for (const target of targets) if (target instanceof OrbitingTarget) target.fixedUpdate(STEP);
    projectiles.fixedUpdate(STEP, targets);
  };
  const run = (seconds: number, overrides: Partial<PlayerInput> = {}): void => {
    for (let i = 0; i < Math.round(seconds / STEP); i++) step(overrides);
  };
  return { player, combat, projectiles, hits, whiffs, step, run, frozen: () => frozenSteps };
}

describe('targeting (spec section 14)', () => {
  it('rejects dead, distant and off-cone targets', () => {
    expect(scoreTarget(ORIGIN, FORWARD, fakeTarget(1, 0, 0, -50), false)).toBeGreaterThan(0);
    expect(scoreTarget(ORIGIN, FORWARD, fakeTarget(1, 0, 0, -400), false)).toBe(-1);
    expect(scoreTarget(ORIGIN, FORWARD, fakeTarget(1, 80, 0, -50), false)).toBe(-1);
    const dead = fakeTarget(1, 0, 0, -50);
    dead.alive = false;
    expect(scoreTarget(ORIGIN, FORWARD, dead, false)).toBe(-1);
  });

  it('prefers centred, near and threatening targets', () => {
    const centred = fakeTarget(1, 0, 0, -100);
    const offCentre = fakeTarget(2, 30, 0, -100);
    const far = fakeTarget(3, 0, 0, -200);
    const score = (t: Damageable) => scoreTarget(ORIGIN, FORWARD, t, false);
    expect(score(centred)).toBeGreaterThan(score(offCentre));
    expect(score(centred)).toBeGreaterThan(score(far));
    offCentre.threat = 1;
    expect(score(offCentre)).toBeGreaterThan(
      scoreTarget(ORIGIN, FORWARD, fakeTarget(4, 30, 0, -100), false),
    );
  });

  it('is sticky: two similar targets do not flicker', () => {
    const a = fakeTarget(1, -4, 0, -100);
    const b = fakeTarget(2, 4, 0, -100);
    const targeting = new Targeting();
    targeting.update(STEP, ORIGIN, FORWARD, [a, b], false);
    const first = targeting.current;
    // Nudge the other one slightly closer to centre; the current target holds.
    (first === a ? b : a).position.x *= 0.8;
    targeting.update(STEP, ORIGIN, FORWARD, [a, b], false);
    expect(targeting.current).toBe(first);
  });

  it('locks, holds the lock off-centre, and drops it after time out of view or on death', () => {
    const a = fakeTarget(1, 0, 0, -100);
    const b = fakeTarget(2, 0, 0, -40);
    const targeting = new Targeting();
    targeting.update(STEP, ORIGIN, FORWARD, [a], true);
    expect(targeting.locked).toBe(true);
    expect(targeting.current).toBe(a);

    // A better candidate appears; the lock stays on a.
    targeting.update(STEP, ORIGIN, FORWARD, [a, b], false);
    expect(targeting.current).toBe(a);

    const away = new Vector3(1, 0, 0);
    for (let t = 0; t < combatCfg.lockDropTime - 0.1; t += STEP) {
      targeting.update(STEP, ORIGIN, away, [a], false);
    }
    expect(targeting.locked).toBe(true);
    for (let t = 0; t < 0.3; t += STEP) targeting.update(STEP, ORIGIN, away, [a], false);
    expect(targeting.locked).toBe(false);

    targeting.update(STEP, ORIGIN, FORWARD, [a], true);
    expect(targeting.locked).toBe(true);
    a.alive = false;
    targeting.update(STEP, ORIGIN, FORWARD, [a], false);
    expect(targeting.locked).toBe(false);
    expect(targeting.current).toBeNull();
  });

  it('the lock key toggles off', () => {
    const a = fakeTarget(1, 0, 0, -100);
    const targeting = new Targeting();
    targeting.update(STEP, ORIGIN, FORWARD, [a], true);
    targeting.update(STEP, ORIGIN, FORWARD, [a], true);
    expect(targeting.locked).toBe(false);
  });
});

describe('melee (spec section 13)', () => {
  it('a punch from a hover lunges to a nearby target and lands', () => {
    const target = fakeTarget(1, 0, 100, -8);
    const arena = createArena([target]);
    arena.step({ punchPressed: true, punch: true });
    arena.run(0.5);
    expect(arena.hits).toHaveLength(1);
    expect(target.health).toBeCloseTo(100 - combatCfg.punchDamage, 5);
  });

  it('a punch with nothing in reach whiffs and does not move the hero', () => {
    const arena = createArena([fakeTarget(1, 0, 100, -200)]);
    arena.step({ punchPressed: true, punch: true });
    arena.run(0.3);
    expect(arena.hits).toHaveLength(0);
    expect(arena.whiffs).toHaveLength(1);
    expect(arena.player.state.position.distanceTo(new Vector3(0, 100, 0))).toBeLessThan(0.5);
  });

  it('holding then releasing throws a heavy punch that hits harder', () => {
    const target = fakeTarget(1, 0, 100, -8);
    target.health = 1000;
    const arena = createArena([target]);
    arena.step({ punchPressed: true, punch: true });
    arena.run(combatCfg.heavyChargeTime + 0.3, { punch: true });
    expect(arena.player.state.punchCharge).toBe(1);
    arena.run(0.5);
    expect(arena.hits.map((hit) => hit.kind)).toEqual(['punch', 'heavy']);
    expect(arena.hits[1]!.damage).toBeGreaterThan(arena.hits[0]!.damage * 2);
  });

  it('hits harder the faster the hero is going, up to the cap', () => {
    const damageAt = (speed: number): number => {
      const target = fakeTarget(1, 0, 100, -9);
      target.health = 1e6;
      const arena = createArena([target]);
      arena.player.state.cruise.set(0, 0, -speed);
      arena.player.state.velocity.set(0, 0, -speed);
      arena.step({ punchPressed: true, punch: true, moveZ: 1 });
      arena.run(0.5, { moveZ: 1 });
      return arena.hits[0]?.damage ?? 0;
    };
    expect(damageAt(0)).toBeCloseTo(combatCfg.punchDamage, 5);
    expect(damageAt(80)).toBeGreaterThan(damageAt(0) * 1.8);
    expect(damageAt(1000)).toBeCloseTo(combatCfg.punchDamage * (1 + combatCfg.maxSpeedBonus), 5);
  });

  it('freezes the simulation briefly on impact and buffers a press made during it', () => {
    const target = fakeTarget(1, 0, 100, -8);
    target.health = 1000;
    const arena = createArena([target]);
    arena.step({ punchPressed: true, punch: true });
    while (arena.hits.length === 0) arena.step();
    arena.step({ punchPressed: true, punch: true }); // lands inside the hit-stop
    arena.run(1);
    expect(arena.frozen()).toBeGreaterThanOrEqual(Math.floor(combatCfg.punchHitStop / STEP));
    expect(arena.hits).toHaveLength(2);
  });

  it('keeps most of the hero speed after a hit', () => {
    const target = fakeTarget(1, 0, 100, -30);
    const arena = createArena([target]);
    arena.player.state.cruise.set(0, 0, -100);
    arena.player.state.velocity.set(0, 0, -100);
    arena.step({ punchPressed: true, punch: true, moveZ: 1 });
    while (arena.hits.length === 0) arena.step({ moveZ: 1 });
    arena.run(0.2, { moveZ: 1 });
    expect(arena.player.state.speed).toBeGreaterThan(80);
  });

  it('reliably hits a moving drone at flight speed from many approaches', () => {
    const rng = createRng(99);
    let landed = 0;
    const trials = 60;
    for (let trial = 0; trial < trials; trial++) {
      const drone = new OrbitingTarget(new Vector3(0, 100, 0));
      for (let i = 0; i < Math.floor(rng.range(0, 600)); i++) drone.fixedUpdate(STEP);
      const arena = createArena([drone]);

      // Start 150-250 m out in a random direction, flying at the drone at 40-160 m/s.
      const from = new Vector3(rng.range(-1, 1), rng.range(-0.4, 0.4), rng.range(-1, 1))
        .normalize()
        .multiplyScalar(rng.range(150, 250))
        .add(drone.position);
      arena.player.teleport(from.x, from.y, from.z);
      const speed = rng.range(40, 160);
      const state = arena.player.state;

      for (let i = 0; i < 60 * 8 && arena.hits.length === 0; i++) {
        // The pilot keeps the drone roughly centred and mashes punch when close.
        const toDrone = drone.position.clone().sub(state.position);
        const distance = toDrone.length();
        toDrone.normalize();
        state.aim.yaw = Math.atan2(-toDrone.x, -toDrone.z);
        state.aim.pitch = Math.asin(toDrone.y);
        if (i === 0) {
          state.cruise.copy(toDrone).multiplyScalar(speed);
          state.velocity.copy(state.cruise);
        }
        const punch = distance < 40 && i % 12 === 0;
        arena.step({ moveZ: 1, punchPressed: punch, punch });
      }
      if (arena.hits.length > 0) landed++;
    }
    expect(landed).toBe(trials);
  });
});

describe('dash attack', () => {
  it('closes a long gap to the target and goes on cooldown', () => {
    const target = fakeTarget(1, 0, 100, -100);
    target.health = 1000;
    const arena = createArena([target]);
    arena.step({ dashPressed: true });
    arena.run(1);
    expect(arena.hits.map((hit) => hit.kind)).toEqual(['dash']);
    expect(arena.combat.dashCooldownFraction).toBeGreaterThan(0.5);
    arena.step({ dashPressed: true });
    arena.run(1);
    expect(arena.hits).toHaveLength(1);
  });

  it('does nothing without a target in range', () => {
    const arena = createArena([fakeTarget(1, 0, 100, -(combatCfg.dashRange + 30))]);
    arena.step({ dashPressed: true });
    arena.run(0.5);
    expect(arena.hits).toHaveLength(0);
    expect(arena.combat.dashCooldownFraction).toBe(0);
  });
});

describe('energy blast', () => {
  it('costs energy, travels and damages the target', () => {
    const target = fakeTarget(1, 0, 100, -150);
    const arena = createArena([target]);
    arena.step({ blast: true });
    expect(arena.player.state.energy).toBeCloseTo(Config.vitals.maxEnergy - combatCfg.blastCost, 0);
    arena.run(1);
    expect(arena.hits.map((hit) => hit.kind)).toEqual(['blast']);
    expect(target.health).toBe(100 - combatCfg.blastDamage);
  });

  it('leads a moving target that is near the crosshair', () => {
    const target = fakeTarget(1, 5, 100, -150);
    target.velocity.set(20, 0, 0);
    const arena = createArena([target]);
    arena.step({ blast: true });
    for (let i = 0; i < 60 && arena.hits.length === 0; i++) {
      target.position.addScaledVector(target.velocity, STEP);
      arena.step();
    }
    expect(arena.hits).toHaveLength(1);
  });

  it('stops at the world instead of passing through it', () => {
    const target = fakeTarget(1, 0, 100, -150);
    const wall: WorldRaycaster = {
      castRay: (origin, direction, max) => {
        const distance = (origin.z - -60) / -direction.z;
        return distance >= 0 && distance <= max ? distance : -1;
      },
    };
    const arena = createArena([target], wall);
    arena.step({ blast: true });
    arena.run(1);
    expect(arena.hits).toHaveLength(0);
    expect(target.health).toBe(100);
    expect(arena.projectiles.pool.some((p) => p.active)).toBe(false);
  });

  it('cannot fire without enough energy, and the pool never grows', () => {
    const arena = createArena([]);
    arena.player.state.energy = combatCfg.blastCost - 1;
    arena.step({ blast: true });
    expect(arena.projectiles.pool.some((p) => p.active)).toBe(false);
    arena.player.state.energy = 1e6;
    arena.run(3, { blast: true });
    expect(arena.projectiles.pool).toHaveLength(combatCfg.maxProjectiles);
  });
});

describe('vitals (spec section 67)', () => {
  const vitals = Config.vitals;

  it('health regenerates only after a quiet spell', () => {
    const arena = createArena([]);
    arena.player.damage(40);
    arena.run(vitals.healthRegenDelay - 0.5);
    expect(arena.player.state.health).toBe(60);
    arena.run(3);
    expect(arena.player.state.health).toBe(vitals.maxHealth);
  });

  it('a knock-out respawns the hero hovering with full health, at no cost', () => {
    const events = new EventBus<GameEvents>();
    let died = 0;
    events.on('player:died', () => died++);
    const player = createTestPlayer(0, events);
    player.teleport(500, 300, 500);
    player.damage(500);
    expect(died).toBe(1);
    expect(player.state.health).toBe(vitals.maxHealth);
    expect(player.state.state).toBe('HOVERING');
    expect(player.state.position.y).toBeCloseTo(vitals.respawnHeight, 5);
    expect(player.state.position.x).toBe(0);
  });

  it('extreme speed drains energy, then drops back to boost speed without ending flight', () => {
    const arena = createArena([]);
    const state = arena.player.state;
    state.energy = 30;
    arena.run(4, { moveZ: 1, boost: true });
    expect(state.speed).toBeGreaterThan(Config.flight.boostSpeed + 10); // into the extreme tier
    arena.run(10, { moveZ: 1, boost: true });
    expect(state.extremeSpent).toBe(true);
    expect(state.state).toBe('BOOSTING');
    expect(state.speed).toBeGreaterThan(Config.flight.boostSpeed * 0.95);
    expect(state.speed).toBeLessThan(Config.flight.boostSpeed * 1.1);
    // Releasing boost lets energy come back and re-arms the extreme tier.
    arena.run(8, { moveZ: 1 });
    expect(state.energy).toBeGreaterThan(90);
    expect(state.extremeSpent).toBe(false);
  });

  it('normal flight and boost below the extreme tier are free', () => {
    const arena = createArena([]);
    arena.run(Config.flight.extremeDelay - 0.2, { moveZ: 1, boost: true });
    expect(arena.player.state.energy).toBe(vitals.maxEnergy);
  });
});
