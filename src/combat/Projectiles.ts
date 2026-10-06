import { Vector3 } from 'three';
import { Config } from '../core/Config';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/GameEvents';
import type { Damageable } from './Damageable';
import { sphereEntry } from './sweep';

/** Distance along a ray to the first world obstacle, or -1 for none. Implemented by physics. */
export interface WorldRaycaster {
  castRay(origin: Vector3, direction: Vector3, maxDistance: number): number;
}

export interface Projectile {
  active: boolean;
  readonly position: Vector3;
  readonly previousPosition: Vector3;
  readonly velocity: Vector3;
  life: number;
}

const segment = new Vector3();
const knockback = new Vector3();

/**
 * Pooled energy blasts (spec sections 36, 66). Each step a blast is swept from
 * its previous to its current position: against targets as a segment-sphere
 * test, against the world as a ray. No rigid bodies.
 */
export class Projectiles {
  readonly pool: Projectile[];

  constructor(
    private readonly world: WorldRaycaster,
    private readonly events: EventBus<GameEvents>,
  ) {
    this.pool = Array.from({ length: Config.combat.maxProjectiles }, () => ({
      active: false,
      position: new Vector3(),
      previousPosition: new Vector3(),
      velocity: new Vector3(),
      life: 0,
    }));
  }

  /** Returns false if the pool is exhausted. */
  fire(origin: Vector3, velocity: Vector3): boolean {
    const projectile = this.pool.find((p) => !p.active);
    if (!projectile) return false;
    projectile.active = true;
    projectile.position.copy(origin);
    projectile.previousPosition.copy(origin);
    projectile.velocity.copy(velocity);
    projectile.life = Config.combat.blastLife;
    return true;
  }

  fixedUpdate(dt: number, targets: readonly Damageable[]): void {
    const cfg = Config.combat;
    for (const projectile of this.pool) {
      if (!projectile.active) continue;
      projectile.previousPosition.copy(projectile.position);
      projectile.position.addScaledVector(projectile.velocity, dt);
      projectile.life -= dt;

      segment.copy(projectile.position).sub(projectile.previousPosition);
      const length = segment.length();
      if (length < 1e-6) continue;
      segment.divideScalar(length);

      // Nearest thing along this step's path wins: a target or the world.
      let hitTarget: Damageable | null = null;
      let hitDistance = this.world.castRay(projectile.previousPosition, segment, length);
      if (hitDistance < 0) hitDistance = Infinity;
      for (const target of targets) {
        if (!target.alive) continue;
        const along = sphereEntry(
          projectile.previousPosition,
          segment,
          length,
          target.position,
          target.radius + cfg.blastRadius,
        );
        if (along >= 0 && along < hitDistance) {
          hitDistance = along;
          hitTarget = target;
        }
      }

      if (hitDistance === Infinity) {
        if (projectile.life <= 0) projectile.active = false;
        continue;
      }

      projectile.active = false;
      projectile.position.copy(projectile.previousPosition).addScaledVector(segment, hitDistance);
      const { x, y, z } = projectile.position;
      if (hitTarget) {
        knockback.copy(segment).multiplyScalar(cfg.blastKnockback);
        hitTarget.applyHit(cfg.blastDamage, knockback);
        this.events.emit('combat:hit', {
          kind: 'blast',
          targetId: hitTarget.id,
          damage: cfg.blastDamage,
          speed: 0,
          x,
          y,
          z,
        });
      } else {
        this.events.emit('combat:blastImpact', { x, y, z });
      }
    }
  }
}
