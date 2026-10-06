import { Vector3 } from 'three';
import { EventBus } from '../../src/core/EventBus';
import type { GameEvents } from '../../src/core/GameEvents';
import type { CollisionMover, MoveResult } from '../../src/physics/CollisionMover';
import { Player } from '../../src/player/Player';
import { createPlayerInput, type PlayerInput } from '../../src/player/PlayerState';

export const STEP = 1 / 60;

/** Collision stand-in: an infinite floor at `floorY` (capsule-centre height), nothing else. */
export function createFloorMover(floorY: number): CollisionMover {
  const position = new Vector3();
  return {
    move(desired: Vector3, _snap: boolean, out: MoveResult): void {
      const targetY = position.y + desired.y;
      const blocked = targetY < floorY;
      out.movement.set(desired.x, blocked ? floorY - position.y : desired.y, desired.z);
      out.grounded = blocked;
      out.hitCount = blocked ? 1 : 0;
      out.hitNormals[0]?.set(0, 1, 0);
      position.add(out.movement);
    },
    teleport(target: Vector3): void {
      position.copy(target);
    },
  };
}

export function createTestPlayer(spawnY = 0, events = new EventBus<GameEvents>()): Player {
  return new Player(createFloorMover(spawnY), new Vector3(0, spawnY, 0), events);
}

/** Runs the player for `seconds`, with `overrides` held on top of neutral input. */
export function run(
  player: Player,
  seconds: number,
  overrides: Partial<PlayerInput> = {},
  dt: number = STEP,
): void {
  const input = { ...createPlayerInput(), ...overrides };
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    player.fixedUpdate(input, dt);
    input.jumpPressed = false; // an edge lasts one step
  }
}

/** Jump, then take off into a hover. */
export function takeOff(player: Player): void {
  run(player, 0.2, { jumpPressed: true });
  run(player, 0.5, { jumpPressed: true });
}
