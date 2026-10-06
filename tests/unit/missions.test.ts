import { Vector3 } from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { Config } from '../../src/core/Config';
import { EventBus } from '../../src/core/EventBus';
import type { GameEvents } from '../../src/core/GameEvents';
import { store } from '../../src/core/store';
import type { WorldQuery } from '../../src/enemies/Drone';
import { BossFight } from '../../src/enemies/boss/BossFight';
import { EnemyManager } from '../../src/enemies/EnemyManager';
import { createMissions } from '../../src/missions/Mission';
import { MissionManager } from '../../src/missions/MissionManager';
import { CheckpointsObjective, LandObjective, SpeedObjective } from '../../src/missions/Objective';
import { createPlayerInput, type PlayerInput } from '../../src/player/PlayerState';
import { DroneAttackEvent } from '../../src/world/events/DroneAttackEvent';
import { WorldEvents } from '../../src/world/WorldEvents';
import { createTestPlayer, STEP } from './helpers';

const cfg = Config.missions;
const openSky: WorldQuery = { castRay: () => -1, castSphere: (_o, _d, max) => max };
const ROOF = { x: 50, y: 0, z: -35 };

function createGame() {
  const bus = new EventBus<GameEvents>();
  const log: string[] = [];
  bus.on('mission:started', ({ id }) => log.push(`start:${id}`));
  bus.on('mission:objective', ({ index }) => log.push(`objective:${index}`));
  bus.on('mission:ended', ({ id, outcome }) => log.push(`${outcome}:${id}`));

  const player = createTestPlayer(0, bus);
  const enemies = new EnemyManager(bus, openSky, player.state, () => undefined);
  for (let i = 0; i < Config.enemies.reserve; i++) enemies.addReserve(300 + i);
  const worldEvents = new WorldEvents(
    [(site, rng) => new DroneAttackEvent(site, enemies, rng)],
    bus,
    1,
  );
  const boss = new BossFight(
    player.state,
    enemies.fire,
    openSky,
    { damage: (amount) => player.damage(amount), knock: () => undefined },
    bus,
    1,
  );
  const missions = new MissionManager(
    createMissions({ spawnRoof: ROOF }),
    { player: player.state, enemies, boss },
    worldEvents,
    bus,
  );
  const step = (seconds = STEP, input: Partial<PlayerInput> = {}): void => {
    for (let i = 0; i < Math.round(seconds / STEP); i++) {
      enemies.fixedUpdate(STEP);
      worldEvents.fixedUpdate(STEP, player.state.position);
      boss.fixedUpdate(STEP);
      missions.fixedUpdate({ ...createPlayerInput(), ...input }, STEP);
    }
  };
  /** Moves the hero in a straight line to a point, one step. */
  const flyTo = (x: number, y: number, z: number): void => {
    player.state.previousPosition.copy(player.state.position);
    player.state.position.set(x, y, z);
    step();
  };
  return { bus, log, player, enemies, worldEvents, missions, boss, step, flyTo };
}

beforeEach(() => {
  store.setState({ score: 0, eventsCompleted: 0, eventsFailed: 0, missionsCompleted: [] });
});

describe('objectives', () => {
  it('checkpoints must be passed in order, and are not skipped at speed', () => {
    const game = createGame();
    const course = new CheckpointsObjective([
      { x: 0, y: 100, z: -100 },
      { x: 0, y: 100, z: -300 },
    ]);
    const context = { player: game.player.state, enemies: game.enemies, boss: game.boss };
    const state = game.player.state;

    state.previousPosition.set(0, 100, -290);
    state.position.set(0, 100, -310); // through the second ring first
    expect(course.update(context)).toBe(false);
    expect(course.progress()).toBe('0 / 2');

    // One long step that starts and ends outside the first ring but passes through it.
    state.previousPosition.set(0, 100, -60);
    state.position.set(0, 100, -140);
    expect(course.update(context)).toBe(false);
    expect(course.progress()).toBe('1 / 2');
    expect(course.target()).toMatchObject({ z: -300, kind: 'ring' });

    state.previousPosition.set(0, 100, -290);
    state.position.set(0, 100, -310);
    expect(course.update(context)).toBe(true);
    expect(course.target()).toBeNull();
  });

  it('a near miss does not count', () => {
    const game = createGame();
    const course = new CheckpointsObjective([{ x: 0, y: 100, z: 0, radius: 8 }]);
    const state = game.player.state;
    state.previousPosition.set(10, 100, -50);
    state.position.set(10, 100, 50);
    expect(course.update({ player: state, enemies: game.enemies, boss: game.boss })).toBe(false);
  });

  it('the speed objective remembers the best speed reached', () => {
    const game = createGame();
    const objective = new SpeedObjective(100);
    const context = { player: game.player.state, enemies: game.enemies, boss: game.boss };
    game.player.state.velocity.set(0, 0, -60);
    expect(objective.update(context)).toBe(false);
    game.player.state.velocity.set(0, 0, -120);
    expect(objective.update(context)).toBe(true);
    expect(objective.label).toContain('km/h');
  });

  it('landing needs to be on the ground and on the spot', () => {
    const game = createGame();
    const objective = new LandObjective({ x: 0, y: 0, z: 0 }, 10);
    const context = { player: game.player.state, enemies: game.enemies, boss: game.boss };
    const state = game.player.state;
    state.position.set(0, 0, 0);
    state.state = 'HOVERING';
    expect(objective.update(context)).toBe(false);
    state.state = 'GROUND';
    expect(objective.update(context)).toBe(true);
    state.position.set(40, 0, 0);
    expect(objective.update(context)).toBe(false);
  });
});

describe('MissionManager (spec section 25)', () => {
  it('offers only First Flight at the start, at its beacon, started with interact', () => {
    const game = createGame();
    expect(game.missions.available.map((m) => m.id)).toEqual(['first-flight']);
    expect(game.missions.offered).toBeNull();

    const beacon = game.missions.available[0]!.beacon;
    game.player.state.position.set(beacon.x + 2, beacon.y, beacon.z);
    expect(game.missions.offered?.id).toBe('first-flight');
    game.step(STEP, { interactPressed: true });
    expect(game.missions.active?.id).toBe('first-flight');
    expect(game.missions.available).toEqual([]);
    expect(game.log).toEqual(['start:first-flight', 'objective:0']);
  });

  it('First Flight runs take-off, the ring course, boost, and landing, then pays out', () => {
    const game = createGame();
    game.missions.start('first-flight');
    expect(game.missions.objective!.label).toContain('Take off');
    expect(game.missions.target).toBeNull();

    game.player.state.state = 'HOVERING';
    game.step();
    expect(game.missions.objective!.label).toContain('rings');

    // Fly the course by going to each target in turn.
    let rings = 0;
    while (game.missions.target?.kind === 'ring') {
      const { x, y, z } = game.missions.target;
      game.flyTo(x, y, z);
      rings++;
      expect(rings).toBeLessThan(20);
    }
    expect(rings).toBe(8);
    expect(game.missions.objective!.label).toContain('Boost');

    game.player.state.velocity.set(0, 0, -(cfg.firstFlightBoostSpeed + 5));
    game.step();
    expect(game.missions.objective!.label).toContain('Land');
    expect(game.missions.target).toMatchObject({ kind: 'spot', x: ROOF.x, z: ROOF.z });

    game.player.state.velocity.set(0, 0, 0);
    game.player.state.state = 'GROUND';
    game.flyTo(ROOF.x, ROOF.y, ROOF.z);

    expect(game.missions.active).toBeNull();
    expect(game.missions.result).toMatchObject({
      outcome: 'complete',
      reward: cfg.firstFlightReward,
    });
    expect(store.getState()).toMatchObject({
      score: cfg.firstFlightReward,
      missionsCompleted: ['first-flight'],
    });
    expect(game.log.at(-1)).toBe('complete:first-flight');
    expect(game.missions.available.map((m) => m.id)).toEqual(['first-flight', 'drone-swarm']);
  });

  it('Drone Swarm is locked until First Flight is done', () => {
    const game = createGame();
    expect(game.missions.start('drone-swarm')).toBe(false);
    store.getState().completeMission('first-flight', 0);
    expect(game.missions.start('drone-swarm')).toBe(true);
  });

  it('Drone Swarm sends ten drones in waves and completes when all are destroyed', () => {
    const game = createGame();
    store.setState({ missionsCompleted: ['first-flight'] });
    game.missions.start('drone-swarm');
    game.step(0.2);

    let destroyed = 0;
    let largestWave = 0;
    while (game.missions.active && destroyed < 30) {
      const wave = game.enemies.drones.filter((drone) => drone.alive);
      largestWave = Math.max(largestWave, wave.length);
      expect(game.missions.objective!.progress()).toBe(`${destroyed} / ${cfg.droneSwarmTotal}`);
      wave[0]!.applyHit(1e9, new Vector3());
      destroyed++;
      game.step(0.2);
    }
    expect(destroyed).toBe(cfg.droneSwarmTotal);
    expect(largestWave).toBe(cfg.droneSwarmWave);
    expect(game.missions.result?.outcome).toBe('complete');
    expect(store.getState().score).toBe(cfg.droneSwarmReward);
    expect(game.enemies.reserve).toHaveLength(Config.enemies.reserve);
  });

  it('abandoning pays nothing, clears the drones, and the mission can be retried', () => {
    const game = createGame();
    store.setState({ missionsCompleted: ['first-flight'] });
    game.missions.start('drone-swarm');
    game.step(0.2);
    expect(game.enemies.drones.some((drone) => drone.alive)).toBe(true);

    game.step(STEP, { abandonPressed: true });
    expect(game.missions.active).toBeNull();
    expect(game.missions.result?.outcome).toBe('abandoned');
    expect(store.getState().score).toBe(0);
    expect(game.enemies.reserve).toHaveLength(Config.enemies.reserve);
    expect(game.missions.start('drone-swarm')).toBe(true);
  });

  it('holds world events off while a mission runs, and ends one already in progress', () => {
    const game = createGame();
    game.worldEvents.trigger(1);
    expect(game.worldEvents.current).not.toBeNull();

    game.missions.start('first-flight');
    expect(game.worldEvents.current).toBeNull();
    game.step(Config.events.firstDelay + Config.events.maxGap * 2);
    expect(game.worldEvents.phase).toBe('IDLE');
    expect(store.getState().eventsFailed).toBe(0);

    game.missions.abandon();
    game.step(Config.events.maxGap + 5);
    expect(game.worldEvents.phase).not.toBe('IDLE');
  });

  it('a finished mission can be replayed without paying twice into the completed list', () => {
    const game = createGame();
    store.getState().completeMission('first-flight', 100);
    store.getState().completeMission('first-flight', 100);
    expect(store.getState().missionsCompleted).toEqual(['first-flight']);
    expect(game.missions.isCompleted('first-flight')).toBe(true);
    expect(game.missions.available.map((m) => m.id)).toContain('first-flight');
  });

  it('the result clears after a few seconds', () => {
    const game = createGame();
    game.missions.start('first-flight');
    game.missions.abandon();
    expect(game.missions.result).not.toBeNull();
    game.step(cfg.resultHold + 0.5);
    expect(game.missions.result).toBeNull();
  });
});
