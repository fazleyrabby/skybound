import { Vector3 } from 'three';
import { Config } from '../core/Config';
import type { Damageable } from './Damageable';

const toTarget = new Vector3();

/** Angle in radians between `forward` and the direction from `origin` to the target. */
export function angleTo(origin: Vector3, forward: Vector3, target: Damageable): number {
  toTarget.copy(target.position).sub(origin);
  const distance = toTarget.length();
  if (distance < 1e-6) return 0;
  return Math.acos(Math.min(1, Math.max(-1, toTarget.dot(forward) / distance)));
}

/**
 * Target score from spec section 14, or -1 if the target is not a candidate
 * (dead, out of range, outside the view cone).
 */
export function scoreTarget(
  origin: Vector3,
  forward: Vector3,
  target: Damageable,
  isCurrent: boolean,
): number {
  const cfg = Config.combat;
  if (!target.alive) return -1;
  const distance = origin.distanceTo(target.position);
  if (distance > cfg.targetRange) return -1;
  const angle = angleTo(origin, forward, target);
  if (angle > cfg.targetCone) return -1;
  return (
    cfg.weightAngle * (1 - angle / cfg.targetCone) +
    cfg.weightDistance * (1 - distance / cfg.targetRange) +
    cfg.weightThreat * target.threat +
    (isCurrent ? cfg.weightSticky : 0)
  );
}

/**
 * Soft lock-on. Without a lock, `current` is whatever scores best right now
 * (used for melee assist and blast aim assist). The lock key pins the current
 * target; it releases when pressed again, or when the target dies, leaves
 * range, or stays out of view too long. It never constrains movement.
 */
export class Targeting {
  current: Damageable | null = null;
  locked = false;
  private outOfView = 0;

  update(
    dt: number,
    origin: Vector3,
    forward: Vector3,
    targets: readonly Damageable[],
    togglePressed: boolean,
  ): void {
    const cfg = Config.combat;

    if (this.locked && this.current) {
      const target = this.current;
      const inView = angleTo(origin, forward, target) <= cfg.targetCone;
      this.outOfView = inView ? 0 : this.outOfView + dt;
      const lost =
        !target.alive ||
        origin.distanceTo(target.position) > cfg.targetRange * 1.2 ||
        this.outOfView > cfg.lockDropTime;
      if (lost || togglePressed) this.release();
      else return;
      if (togglePressed) return; // releasing does not immediately re-pin
    }

    let best: Damageable | null = null;
    let bestScore = 0;
    for (const target of targets) {
      const score = scoreTarget(origin, forward, target, target === this.current);
      if (score > bestScore) {
        best = target;
        bestScore = score;
      }
    }
    this.current = best;
    if (togglePressed && best) {
      this.locked = true;
      this.outOfView = 0;
    }
  }

  release(): void {
    this.locked = false;
    this.outOfView = 0;
  }
}
