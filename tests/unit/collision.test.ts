import { Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { Config } from '../../src/core/Config';
import { EventBus } from '../../src/core/EventBus';
import type { GameEvents } from '../../src/core/GameEvents';
import { PhysicsWorld } from '../../src/physics/PhysicsWorld';
import { Player } from '../../src/player/Player';
import { createPlayerInput, type PlayerInput } from '../../src/player/PlayerState';
import { STEP } from './helpers';

const { height, radius, skin, maxSlope, snapToGround } = Config.player;
const FLOOR_Y = height / 2 + skin;
const WALL_Z = -60;
const WALL_HALF_THICKNESS = 0.25;

/** Real Rapier world: a floor and a thin wall across the -Z flight path. */
async function createScene(start: Vector3) {
  const physics = await PhysicsWorld.create(STEP, Config.sim.gravity);
  physics.addStaticCuboid(0, -0.5, 0, 2000, 0.5, 2000);
  physics.addStaticCuboid(0, 50, WALL_Z, 200, 50, WALL_HALF_THICKNESS);
  const mover = physics.createCharacterMover(
    { height, radius, skin, maxSlope, snapToGround },
    start,
  );
  const events = new EventBus<GameEvents>();
  const impacts: GameEvents['player:impact'][] = [];
  events.on('player:impact', (impact) => impacts.push(impact));
  const player = new Player(mover, start, events);
  physics.step();

  const run = (seconds: number, overrides: Partial<PlayerInput> = {}): void => {
    const input = { ...createPlayerInput(), ...overrides };
    for (let i = 0; i < Math.round(seconds / STEP); i++) {
      player.fixedUpdate(input, STEP);
      physics.step();
      input.jumpPressed = false;
    }
  };
  const hover = (): void => {
    run(0.1, { jumpPressed: true });
    run(0.3, { jumpPressed: true });
    run(1);
  };
  return { player, run, hover, impacts };
}

describe('swept collision against Rapier (spec section 66)', () => {
  beforeAll(async () => {
    await PhysicsWorld.create(STEP, 0); // warm up WASM
  });

  it('stands on the floor', async () => {
    const { player, run } = await createScene(new Vector3(0, FLOOR_Y, 0));
    run(1);
    expect(player.state.state).toBe('GROUND');
    expect(player.state.position.y).toBeCloseTo(FLOOR_Y, 1);
  });

  it('does not tunnel through a thin wall at maximum speed', async () => {
    const { player, run, hover } = await createScene(new Vector3(0, FLOOR_Y, 0));
    hover();
    // Faster than anything reachable in play: 5 m per step against a 0.5 m wall.
    player.state.cruise.set(0, 0, -300);
    run(1, { moveZ: 1, boost: true });
    expect(player.state.position.z).toBeGreaterThan(WALL_Z + WALL_HALF_THICKNESS);
    expect(player.state.lastImpactSpeed).toBeGreaterThan(100);
  });

  it('bounces off a head-on hit at speed instead of stopping dead', async () => {
    const { player, run, hover, impacts } = await createScene(new Vector3(0, FLOOR_Y, 0));
    hover();
    player.state.cruise.set(0, 0, -120);
    let bounced = false;
    for (let i = 0; i < 60 && !bounced; i++) {
      run(STEP);
      bounced = player.state.staggerTime > 0;
    }
    expect(bounced).toBe(true);
    expect(player.state.velocity.z).toBeGreaterThan(5); // moving away from the wall
    expect(impacts.some((impact) => impact.bounced && impact.speed > 60)).toBe(true);
  });

  it('a glancing hit keeps more than two thirds of the speed and slides', async () => {
    const { player, run, hover } = await createScene(new Vector3(0, FLOOR_Y, -52));
    hover();
    // 20 degrees into the wall at cruise speed.
    const speed = 45;
    const angle = (20 * Math.PI) / 180;
    player.state.aim.yaw = -(Math.PI / 2 - angle);
    player.state.cruise.set(Math.cos(angle) * speed, 0, -Math.sin(angle) * speed);
    const startX = player.state.position.x;
    run(1.5);
    expect(player.state.lastImpactSpeed).toBeGreaterThan(0);
    expect(player.state.position.z).toBeGreaterThan(WALL_Z + WALL_HALF_THICKNESS);
    expect(player.state.position.x - startX).toBeGreaterThan(30); // kept sliding along it
    // Coasting for 1.5 s alone costs speed; compare against a free coast of the same length.
    const freeCoast = speed * Math.exp(-Config.flight.coastResponse * 1.5);
    expect(player.state.speed).toBeGreaterThan(freeCoast * (2 / 3));
  });

  it('lands on the floor from a hover', async () => {
    const { player, run, hover } = await createScene(new Vector3(0, FLOOR_Y, 0));
    hover();
    run(1, { ascend: true });
    expect(player.state.position.y).toBeGreaterThan(10);
    run(4, { descend: true });
    expect(player.state.state).toBe('GROUND');
    expect(player.state.position.y).toBeCloseTo(FLOOR_Y, 1);
  });
});

describe('teleport', () => {
  it('does not report stale ground on the first move after teleporting off a floor', async () => {
    const { player, run } = await createScene(new Vector3(0, FLOOR_Y, 0));
    run(0.5);
    expect(player.state.state).toBe('GROUND');
    player.teleport(0, 300, 0);
    run(2, { descend: true });
    expect(player.state.flying).toBe(true);
    expect(player.state.position.y).toBeGreaterThan(200);
  });
});
