import { Quaternion, Vector3 } from 'three';
import type { Damageable } from '../combat/Damageable';
import { sphereEntry } from '../combat/sweep';
import { Config } from '../core/Config';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/GameEvents';
import type { WorldQuery } from './Drone';

export interface Bullet {
  active: boolean;
  readonly position: Vector3;
  readonly previousPosition: Vector3;
  readonly velocity: Vector3;
  life: number;
}

/**
 * Slow homing missile. It is a target in its own right: it can be punched or
 * shot down, and it can be outrun (spec section 15).
 */
export class Missile implements Damageable, Bullet {
  readonly position = new Vector3();
  readonly previousPosition = new Vector3();
  readonly velocity = new Vector3();
  readonly radius = Config.enemies.missileRadius;
  readonly maxHealth = 1;
  health = 1;
  alive = false;
  threat = 0.5;
  life = 0;

  constructor(readonly id: number) {}

  get active(): boolean {
    return this.alive;
  }

  set active(value: boolean) {
    this.alive = value;
  }

  applyHit(): void {
    this.health = 0;
    this.alive = false;
  }
}

const direction = new Vector3();
const wanted = new Vector3();
const turn = new Quaternion();
const partialTurn = new Quaternion();
const identity = new Quaternion();

/**
 * Pooled enemy bullets and missiles. Swept each step against the world (ray)
 * and the player (segment-sphere), like the player's own blasts.
 */
export class EnemyFire {
  readonly bullets: Bullet[];
  readonly missiles: Missile[];

  constructor(
    private readonly world: WorldQuery,
    private readonly events: EventBus<GameEvents>,
    firstMissileId: number,
  ) {
    const cfg = Config.enemies;
    this.bullets = Array.from({ length: cfg.maxBullets }, () => ({
      active: false,
      position: new Vector3(),
      previousPosition: new Vector3(),
      velocity: new Vector3(),
      life: 0,
    }));
    this.missiles = Array.from(
      { length: cfg.maxMissiles },
      (_, i) => new Missile(firstMissileId + i),
    );
  }

  fireBullet(origin: Vector3, velocity: Vector3): void {
    this.launch(this.bullets, origin, velocity, Config.enemies.bulletLife, 'bullet');
  }

  fireMissile(origin: Vector3, velocity: Vector3): void {
    const missile = this.launch(
      this.missiles,
      origin,
      velocity,
      Config.enemies.missileLife,
      'missile',
    );
    if (missile) missile.health = 1;
  }

  fixedUpdate(dt: number, playerPosition: Vector3, damagePlayer: (amount: number) => void): void {
    const cfg = Config.enemies;
    for (const bullet of this.bullets) {
      if (bullet.active)
        this.advance(bullet, dt, playerPosition, cfg.bulletDamage, 'bullet', damagePlayer);
    }
    for (const missile of this.missiles) {
      if (!missile.active) continue;
      // Home in at a limited turn rate, so a hard turn or raw speed shakes it.
      const speed = missile.velocity.length();
      direction.copy(missile.velocity).divideScalar(speed);
      wanted.copy(playerPosition).sub(missile.position).normalize();
      rotateToward(direction, wanted, cfg.missileTurnRate * dt);
      missile.velocity.copy(direction).multiplyScalar(speed);
      this.advance(missile, dt, playerPosition, cfg.missileDamage, 'missile', damagePlayer);
    }
  }

  /** Announces a missile the player destroyed. Call after player attacks resolve. */
  reportShotDown(wasAlive: readonly boolean[]): void {
    this.missiles.forEach((missile, index) => {
      if (wasAlive[index] && !missile.alive && missile.health <= 0 && missile.life > 0) {
        const { x, y, z } = missile.position;
        missile.life = 0;
        this.events.emit('enemy:shotImpact', { kind: 'missile', x, y, z });
      }
    });
  }

  private launch<T extends Bullet>(
    pool: T[],
    origin: Vector3,
    velocity: Vector3,
    life: number,
    kind: 'bullet' | 'missile',
  ): T | null {
    const shot = pool.find((candidate) => !candidate.active);
    if (!shot) return null;
    shot.active = true;
    shot.position.copy(origin);
    shot.previousPosition.copy(origin);
    shot.velocity.copy(velocity);
    shot.life = life;
    this.events.emit('enemy:fired', { kind, x: origin.x, y: origin.y, z: origin.z });
    return shot;
  }

  private advance(
    shot: Bullet,
    dt: number,
    playerPosition: Vector3,
    damage: number,
    kind: 'bullet' | 'missile',
    damagePlayer: (amount: number) => void,
  ): void {
    shot.previousPosition.copy(shot.position);
    shot.position.addScaledVector(shot.velocity, dt);
    shot.life -= dt;

    direction.copy(shot.position).sub(shot.previousPosition);
    const length = direction.length();
    if (length < 1e-6) return;
    direction.divideScalar(length);

    const wall = this.world.castRay(shot.previousPosition, direction, length);
    const hero = sphereEntry(
      shot.previousPosition,
      direction,
      length,
      playerPosition,
      Config.enemies.playerHitRadius,
    );

    if (hero >= 0 && (wall < 0 || hero <= wall)) {
      shot.active = false;
      damagePlayer(damage);
      return;
    }
    if (wall >= 0 || shot.life <= 0) {
      shot.active = false;
      if (wall >= 0) shot.position.copy(shot.previousPosition).addScaledVector(direction, wall);
      const { x, y, z } = shot.position;
      if (wall >= 0 || kind === 'missile') this.events.emit('enemy:shotImpact', { kind, x, y, z });
    }
  }
}

function rotateToward(from: Vector3, to: Vector3, maxAngle: number): void {
  const angle = Math.acos(Math.min(1, Math.max(-1, from.dot(to))));
  if (angle <= maxAngle) {
    from.copy(to);
    return;
  }
  turn.setFromUnitVectors(from, to);
  partialTurn.slerpQuaternions(identity, turn, maxAngle / angle);
  from.applyQuaternion(partialTurn).normalize();
}
