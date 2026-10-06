import type { Vector3 } from 'three';

export type AttackKind = 'punch' | 'heavy' | 'dash' | 'blast';

/** Anything the player can target and hit. Enemies and the boss implement this. */
export interface Damageable {
  readonly id: number;
  /** Centre, world space. */
  readonly position: Vector3;
  readonly velocity: Vector3;
  /** Bounding radius used for contact, targeting and projectile hits. */
  readonly radius: number;
  readonly maxHealth: number;
  health: number;
  alive: boolean;
  /** 0..1 for target scoring; attacking the player is high. */
  threat: number;
  /** Applies damage and a knockback velocity change. */
  applyHit(damage: number, knockback: Vector3): void;
}
