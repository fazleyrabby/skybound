import { Vector3 } from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { Config } from '../../src/core/Config';
import { EventBus } from '../../src/core/EventBus';
import type { GameEvents } from '../../src/core/GameEvents';
import { store } from '../../src/core/store';
import { BossFight, knockPlayer } from '../../src/enemies/boss/BossFight';
import { Titan } from '../../src/enemies/boss/Titan';
import type { WorldQuery } from '../../src/enemies/Drone';
import { EnemyManager } from '../../src/enemies/EnemyManager';
import { createMissions } from '../../src/missions/Mission';
import { MissionManager } from '../../src/missions/MissionManager';
import { createPlayerInput } from '../../src/player/PlayerState';
import { DroneAttackEvent } from '../../src/world/events/DroneAttackEvent';
import { WorldEvents } from '../../src/world/WorldEvents';
import { createTestPlayer, run, STEP } from './helpers';

const cfg = Config.titan;
const openSky: WorldQuery = { castRay: () => -1, castSphere: (_o, _d, max) => max };

function createFight(world: WorldQuery = openSky) {
  const bus = new EventBus<GameEvents>();
  const log: string[] = [];
  bus.on('boss:spawned', () => log.push('spawned'));
  bus.on('boss:phase', ({ phase }) => log.push(`phase:${phase}`));
  bus.on('boss:attack', ({ kind }) => log.push(kind));
  bus.on('boss:defeated', () => log.push('defeated'));
  let damageTaken = 0;
  bus.on('player:damaged', ({ amount }) => (damageTaken += amount));

  const player = createTestPlayer(0, bus);
  player.teleport(0, 300, 300);
  const enemies = new EnemyManager(bus, world, player.state, (amount) => player.damage(amount));
  for (let i = 0; i < Config.enemies.reserve; i++) enemies.addReserve(400 + i);
  const boss = new BossFight(
    player.state,
    enemies.fire,
    world,
    { damage: (amount) => player.damage(amount), knock: (v) => knockPlayer(player.state, v) },
    bus,
    1,
  );
  const step = (seconds: number, movePlayer = false): void => {
    for (let i = 0; i < Math.round(seconds / STEP); i++) {
      if (movePlayer) run(player, STEP);
      enemies.fixedUpdate(STEP);
      boss.fixedUpdate(STEP);
    }
  };
  /** Starts the fight and waits out the reveal. */
  const begin = (): void => {
    boss.start();
    step(cfg.introTime + 0.1);
  };
  /** Drops Titan to a health fraction with raw damage, then waits out the stagger. */
  const dropTo = (fraction: number): void => {
    boss.titan.takeDamage(boss.titan.health - boss.titan.maxHealth * fraction);
    step(cfg.phaseStagger + 0.1);
  };
  return { bus, log, player, enemies, boss, step, begin, dropTo, damageTaken: () => damageTaken };
}

beforeEach(() => {
  store.setState({ score: 0, eventsCompleted: 0, eventsFailed: 0, missionsCompleted: [] });
});

describe('Titan damage rules (spec section 17)', () => {
  it('is untouchable during the reveal, then takes reduced damage on the hull', () => {
    const fight = createFight();
    fight.boss.start();
    fight.boss.titan.applyHit(500);
    expect(fight.boss.titan.health).toBe(cfg.maxHealth);

    fight.step(cfg.introTime + 0.1);
    expect(fight.boss.titan.state).toBe('FIGHT');
    fight.boss.titan.applyHit(100);
    expect(fight.boss.titan.health).toBeCloseTo(cfg.maxHealth - 100 * cfg.hullArmor1, 5);
  });

  it('weak points take more than the hull, and the reactor most of all', () => {
    const fight = createFight();
    fight.begin();
    const titan = fight.boss.titan;
    const engine = titan.weakPoints.find((point) => point.kind === 'engine')!;
    engine.applyHit(100);
    expect(titan.health).toBeCloseTo(cfg.maxHealth - 100 * cfg.weakMultiplier, 5);

    fight.dropTo(cfg.phase2At);
    fight.dropTo(cfg.phase3At);
    const before = titan.health;
    titan.weakPoints.find((point) => point.kind === 'reactor')!.applyHit(100);
    expect(before - titan.health).toBeCloseTo(100 * cfg.reactorMultiplier, 5);
  });

  it('exposes more weak points as armour breaks', () => {
    const fight = createFight();
    fight.begin();
    const kinds = () => fight.boss.titan.targets.map((t) => ('kind' in t ? t.kind : 'hull')).sort();
    expect(kinds()).toEqual(['engine', 'engine', 'hull']);
    fight.dropTo(cfg.phase2At);
    expect(kinds()).toEqual(['engine', 'engine', 'hull', 'vent', 'vent']);
    fight.dropTo(cfg.phase3At);
    expect(kinds()).toEqual(['engine', 'engine', 'hull', 'reactor', 'vent', 'vent']);
  });

  it('one huge hit cannot skip a phase, and the stagger is a moment of safety for Titan', () => {
    const fight = createFight();
    fight.begin();
    const titan = fight.boss.titan;
    titan.takeDamage(1e9);
    expect(titan.phase).toBe(2);
    expect(titan.healthFraction).toBeCloseTo(cfg.phase2At, 5);
    expect(titan.state).toBe('STAGGER');
    titan.takeDamage(1e9);
    expect(titan.healthFraction).toBeCloseTo(cfg.phase2At, 5);

    fight.step(cfg.phaseStagger + 0.1);
    titan.takeDamage(1e9);
    expect(titan.phase).toBe(3);
    expect(titan.healthFraction).toBeCloseTo(cfg.phase3At, 5);
    fight.step(STEP);
    expect(fight.log.filter((entry) => entry.startsWith('phase'))).toEqual(['phase:2', 'phase:3']);
  });

  it('weak points ride with the hull as it turns', () => {
    const titan = new Titan();
    titan.spawn(100, 200, 50);
    titan.yaw = Math.PI / 2; // facing -X
    titan.updateWeakPoints();
    const left = titan.weakPoints[0]!; // offset (15, 1, 9): left and aft
    expect(left.position.x).toBeCloseTo(100 + 9, 4);
    expect(left.position.y).toBeCloseTo(201, 4);
    expect(left.position.z).toBeCloseTo(50 - 15, 4);
  });
});

describe('the encounter', () => {
  it('reveals Titan above downtown and turns the player to face it', () => {
    const fight = createFight();
    fight.player.state.aim.yaw = 2.5;
    fight.boss.start();
    expect(fight.log).toEqual(['spawned']);
    expect(fight.boss.titan.position.y).toBeGreaterThan(500);
    fight.step(cfg.introTime);

    const { titan } = fight.boss;
    expect(titan.position.y).toBeLessThan(500); // it has dropped in
    const toTitan = titan.position.clone().sub(fight.player.state.position).normalize();
    const aim = fight.player.state.aim;
    const forward = new Vector3(
      -Math.sin(aim.yaw) * Math.cos(aim.pitch),
      Math.sin(aim.pitch),
      -Math.cos(aim.yaw) * Math.cos(aim.pitch),
    );
    expect(forward.angleTo(toTitan)).toBeLessThan(0.25);
  });

  it('a knocked-out player resumes the current phase, not the whole fight', () => {
    const fight = createFight();
    fight.begin();
    fight.dropTo(cfg.phase2At);
    fight.boss.titan.takeDamage(900);
    expect(fight.boss.titan.healthFraction).toBeLessThan(cfg.phase2At);

    fight.player.damage(1e6);
    expect(fight.boss.titan.phase).toBe(2);
    expect(fight.boss.titan.healthFraction).toBeCloseTo(cfg.phase2At, 5);
  });

  it('dies in a sequence of explosions, then is gone and reports defeat', () => {
    const fight = createFight();
    let pops = 0;
    fight.bus.on('enemy:shotImpact', () => pops++);
    fight.begin();
    fight.dropTo(cfg.phase2At);
    fight.dropTo(cfg.phase3At);
    fight.boss.titan.takeDamage(1e9);
    expect(fight.boss.titan.state).toBe('DYING');
    expect(fight.boss.targets).toHaveLength(0);
    expect(fight.boss.defeated).toBe(false);

    fight.step(cfg.dyingTime + 0.2);
    expect(pops).toBeGreaterThan(8);
    expect(fight.boss.defeated).toBe(true);
    expect(fight.boss.active).toBe(false);
    expect(fight.log.at(-1)).toBe('defeated');
  });

  it('patrols around downtown without leaving the map or sinking into the streets', () => {
    const fight = createFight();
    fight.begin();
    const start = fight.boss.titan.position.clone();
    let lowest = Infinity;
    let furthest = 0;
    for (let i = 0; i < 60 * 90; i++) {
      fight.step(STEP);
      const { position } = fight.boss.titan;
      lowest = Math.min(lowest, position.y);
      furthest = Math.max(furthest, Math.hypot(position.x, position.z));
    }
    expect(fight.boss.titan.position.distanceTo(start)).toBeGreaterThan(100);
    expect(lowest).toBeGreaterThan(120);
    expect(furthest).toBeLessThan(420);
    expect(fight.boss.titan.velocity.length()).toBeLessThanOrEqual(cfg.speed1 + 1);
  });

  it('moves faster each phase', () => {
    const topSpeed = (phases: number): number => {
      const fight = createFight();
      fight.begin();
      if (phases >= 2) fight.dropTo(cfg.phase2At);
      if (phases >= 3) fight.dropTo(cfg.phase3At);
      fight.step(10); // let the speed from the drop-in bleed off
      let top = 0;
      for (let i = 0; i < 60 * 30; i++) {
        fight.step(STEP);
        top = Math.max(top, fight.boss.titan.velocity.length());
      }
      return top;
    };
    const [one, two, three] = [topSpeed(1), topSpeed(2), topSpeed(3)];
    expect(two).toBeGreaterThan(one * 1.3);
    expect(three).toBeGreaterThan(two * 1.3);
    expect(three).toBeLessThan(Config.flight.fastSpeed); // the player can always out-fly it
  });
});

describe('attacks by phase', () => {
  it('phase 1 uses guns and missiles only', () => {
    const fight = createFight();
    fight.begin();
    fight.step(25);
    expect(fight.log).toContain('salvo');
    expect(fight.log).not.toContain('laserCharge');
    expect(fight.log).not.toContain('pulse');
    expect(fight.log).not.toContain('melee');
    expect(fight.damageTaken()).toBeGreaterThan(0); // a player who sits still gets hit
  });

  it('phase 2 adds a laser that warns before it fires', () => {
    const fight = createFight();
    fight.begin();
    fight.dropTo(cfg.phase2At);
    const { attacks } = fight.boss;
    let charged = 0;
    for (let i = 0; i < 60 * 30 && attacks.laserState !== 'fire'; i++) {
      fight.step(STEP);
      if (attacks.laserState === 'charge') charged += STEP;
    }
    expect(attacks.laserState).toBe('fire');
    expect(charged).toBeGreaterThanOrEqual(cfg.laserCharge - 0.05);
    expect(fight.log.indexOf('laserCharge')).toBeLessThan(fight.log.indexOf('laserFire'));
  });

  it('the laser burns a player who stays in it, and is blocked by buildings', () => {
    const exposed = createFight();
    exposed.begin();
    exposed.dropTo(cfg.phase2At);
    exposed.player.state.health = 1e6; // isolate laser damage from everything else
    while (exposed.boss.attacks.laserState !== 'fire') exposed.step(STEP);
    const before = exposed.player.state.health;
    exposed.step(1);
    expect(before - exposed.player.state.health).toBeGreaterThan(cfg.laserDps * 0.5);

    // A world where every ray stops after 20 m: the beam cannot reach.
    const walled: WorldQuery = { castRay: () => 20, castSphere: (_o, _d, max) => max };
    const covered = createFight(walled);
    covered.begin();
    covered.dropTo(cfg.phase2At);
    while (covered.boss.attacks.laserState !== 'fire') covered.step(STEP);
    expect(covered.boss.attacks.laserReach).toBe(20);
    const health = covered.player.state.health;
    covered.step(1);
    expect(covered.player.state.health).toBe(health);
  });

  it('phase 3 adds a pulse that hits once as it passes, and a swipe that throws the player', () => {
    const fight = createFight();
    fight.begin();
    fight.dropTo(cfg.phase2At);
    fight.dropTo(cfg.phase3At);
    fight.step(30);
    expect(fight.log).toContain('pulse');

    // Park the player right beside Titan: the swipe winds up, then lands.
    const close = createFight();
    close.begin();
    close.dropTo(cfg.phase2At);
    close.dropTo(cfg.phase3At);
    close.player.state.health = 1e6;
    const { titan } = close.boss;
    for (let i = 0; i < 60 * 8 && close.player.state.lungeTime === 0; i++) {
      close.player.state.position.copy(titan.position).add(new Vector3(20, 0, 0));
      close.step(STEP);
    }
    expect(close.log).toContain('melee');
    expect(close.player.state.lungeTime).toBeGreaterThan(0);
    expect(close.player.state.lungeVelocity.length()).toBeCloseTo(cfg.meleeKnockback, 3);
  });

  it('stops attacking while staggered and once it is dying', () => {
    const fight = createFight();
    fight.begin();
    fight.dropTo(cfg.phase2At);
    while (fight.boss.attacks.laserState === 'idle') fight.step(STEP);
    fight.boss.titan.takeDamage(1e9);
    fight.step(STEP);
    expect(fight.boss.titan.state).toBe('STAGGER');
    expect(fight.boss.attacks.laserState).toBe('idle');
  });
});

describe('the Titan mission', () => {
  it('unlocks after Drone Swarm, starts the fight, and pays out on defeat', () => {
    const fight = createFight();
    const worldEvents = new WorldEvents(
      [(site, rng) => new DroneAttackEvent(site, fight.enemies, rng)],
      fight.bus,
      1,
    );
    const missions = new MissionManager(
      createMissions({ spawnRoof: { x: 50, y: 0, z: -35 } }),
      { player: fight.player.state, enemies: fight.enemies, boss: fight.boss },
      worldEvents,
      fight.bus,
    );
    const tick = (seconds: number): void => {
      for (let i = 0; i < Math.round(seconds / STEP); i++) {
        fight.step(STEP);
        missions.fixedUpdate(createPlayerInput(), STEP);
      }
    };

    expect(missions.start('titan')).toBe(false);
    store.setState({ missionsCompleted: ['first-flight', 'drone-swarm'] });
    expect(missions.start('titan')).toBe(true);
    tick(cfg.introTime + 0.2);
    expect(fight.boss.active).toBe(true);
    expect(missions.objective!.progress()).toBe('100%');
    expect(missions.target).toMatchObject({ kind: 'spot' });

    fight.boss.titan.takeDamage(1e9);
    tick(cfg.phaseStagger + 0.1);
    fight.boss.titan.takeDamage(1e9);
    tick(cfg.phaseStagger + 0.1);
    fight.boss.titan.takeDamage(1e9);
    tick(cfg.dyingTime + 0.5);

    expect(missions.result).toMatchObject({ outcome: 'complete', reward: cfg.reward });
    expect(store.getState().missionsCompleted).toContain('titan');
  });

  it('abandoning removes Titan', () => {
    const fight = createFight();
    const worldEvents = new WorldEvents([], fight.bus, 1);
    const missions = new MissionManager(
      createMissions({ spawnRoof: { x: 50, y: 0, z: -35 } }),
      { player: fight.player.state, enemies: fight.enemies, boss: fight.boss },
      worldEvents,
      fight.bus,
    );
    store.setState({ missionsCompleted: ['first-flight', 'drone-swarm'] });
    missions.start('titan');
    missions.fixedUpdate(createPlayerInput(), STEP);
    expect(fight.boss.active).toBe(true);
    missions.abandon();
    expect(fight.boss.active).toBe(false);
    expect(fight.boss.targets).toHaveLength(0);
  });
});
