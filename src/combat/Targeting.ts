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
 * target, and so does resting the crosshair on one for a moment (hover lock,
 * optional). The lock releases when the key is pressed again, or when the
 * target dies, leaves range, or stays out of view too long. It never
 * constrains movement.
 */
export class Targeting {
  current: Damageable | null = null;
  locked = false;
  private outOfView = 0;
  /** Seconds the crosshair has rested on `hovered`. */
  private hover = 0;
  private hovered: Damageable | null = null;
  /** Target the player just unlocked by hand. */
  private released: Damageable | null = null;

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
      if (togglePressed) this.released = target;
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

    // Hover lock: rest the crosshair on a target for a moment and it locks.
    if (best && cfg.autoLock > 0 && this.isUnderCrosshair(origin, forward, best)) {
      // After a manual release, the same target does not re-lock until the crosshair leaves it.
      if (best !== this.released) this.hover = best === this.hovered ? this.hover + dt : dt;
      this.hovered = best;
      if (this.hover >= cfg.autoLockTime) {
        this.locked = true;
        this.outOfView = 0;
        this.hover = 0;
        return;
      }
    } else {
      this.hover = 0;
      this.hovered = null;
      this.released = null;
    }
    if (togglePressed && best) {
      this.locked = true;
      this.outOfView = 0;
    }
  }

  release(): void {
    this.locked = false;
    this.outOfView = 0;
  }

  /** Whether the aim line passes through the target, with a small margin. */
  private isUnderCrosshair(origin: Vector3, forward: Vector3, target: Damageable): boolean {
    const distance = origin.distanceTo(target.position);
    const outline = Math.atan2(target.radius, Math.max(distance, 1e-3));
    return angleTo(origin, forward, target) <= outline + Config.combat.autoLockMargin;
  }
}
