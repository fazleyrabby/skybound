import type { Vector3 } from 'three';

export const MAX_MOVE_HITS = 4;

export interface MoveResult {
  /** Movement actually applied after sweeping and sliding. */
  movement: Vector3;
  /** True if the move ended resting on walkable ground. */
  grounded: boolean;
  hitCount: number;
  /** Surface normals of the obstacles hit; only the first `hitCount` are valid. */
  hitNormals: Vector3[];
}

/**
 * Swept movement of the player's collision shape (spec section 66).
 * Gameplay depends on this interface so it can be tested without Rapier.
 */
export interface CollisionMover {
  /** Sweeps by `desired` (metres), slides along obstacles, and writes the outcome to `out`. */
  move(desired: Vector3, out: MoveResult): void;
  /**
   * Looks for ground under the shape, up to `maxDrop` below it. Returns the
   * vertical shift that would rest the shape on that ground (negative is down,
   * positive lifts it out of a surface it has sunk into), or null if there is none.
   */
  groundOffset(maxDrop: number): number | null;
  /** Moves the shape vertically without sweeping. Used with `groundOffset`. */
  shiftY(dy: number): void;
  /** Moves the shape without sweeping. `position` is the capsule centre. */
  teleport(position: Vector3): void;
}
