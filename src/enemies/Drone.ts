import { Vector3 } from 'three';
import type { Damageable } from '../combat/Damageable';
import { Config } from '../core/Config';
import { dampVec3 } from '../utils/math';
import { createRng, type Rng } from '../utils/rng';
import type { EnemyConfig } from './EnemyFactory';

export type DroneState =
  'PATROL' | 'DETECT' | 'CHASE' | 'ATTACK' | 'EVADE' | 'DAMAGED' | 'DESTROYED';

/** World queries a drone needs. Implemented by physics; faked in tests. */
export interface WorldQuery {
  /** Distance to the first obstacle along a ray, or -1 for none. */
  castRay(origin: Vector3, direction: Vector3, maxDistance: number): number;
  /** Distance a sphere can travel before hitting something; `maxDistance` if clear. */
  castSphere(origin: Vector3, direction: Vector3, maxDistance: number, radius: number): number;
}

const BASE_RADIUS = 1.6;
const SKIN = 0.05;
const ZERO = new Vector3();
const move = new Vector3();

/**
 * A flying combat drone (spec section 15). Holds state and moves itself;
 * decisions come from `EnemyAI`, which writes `desired` and the state fields.
 * Instances are reused after destruction (pooling).
 */
export class Drone implements Damageable {
  readonly position = new Vector3();
  readonly previousPosition = new Vector3();
  /** Actual velocity over the last step, including knockback. */
  readonly velocity = new Vector3();
  readonly radius: number;
  readonly maxHealth: number;
  health: number;
  alive = true;
  threat = 0;

  state: DroneState = 'PATROL';
  stateTime = 0;
  /** State to resume after a stagger or an evade. */
  resumeState: DroneState = 'PATROL';
  /** Velocity the AI wants; the drone accelerates toward it. */
  readonly desired = new Vector3();
  /** Self-propelled velocity, without knockback. */
  readonly steer = new Vector3();
  readonly knock = new Vector3();
  readonly evadeDirection = new Vector3();
  /** Unit direction the drone faces, for aiming and the view. */
  readonly facing = new Vector3(0, 0, -1);
  /** 0..1 wind-up before firing or giving chase; the view makes it visible. */
  telegraph = 0;
  /** Seconds since last hit, for the view's flash. */
  sinceHit = Infinity;

  // AI bookkeeping, owned by EnemyAI.
  thinkTimer = 0;
  patrolAngle = 0;
  lostTime = 0;
  evadeCooldown = 0;
  evadeDuration = 0;
  hasRetreated = false;
  canSeePlayer = false;
  fireCooldown = 0;
  windUp = 0;
  burstLeft = 0;
  burstTimer = 0;
  orbitSign = 1;

  readonly rng: Rng;
  private respawnIn = 0;

  constructor(
    readonly id: number,
    readonly config: EnemyConfig,
    readonly home: Vector3,
    /** Never thinks, moves or fires: a training target. */
    readonly passive: boolean,
  ) {
    this.radius = BASE_RADIUS * config.bodyScale;
    this.maxHealth = config.health;
    this.health = config.health;
    this.rng = createRng(config.seed * 7919 + id);
    this.reset();
  }

  setState(state: DroneState): void {
    if (this.state === state) return;
    this.state = state;
    this.stateTime = 0;
  }

  applyHit(damage: number, knockback: Vector3): void {
    if (!this.alive) return;
    this.health = Math.max(0, this.health - damage * (1 - this.config.armor));
    this.knock.add(knockback);
    this.sinceHit = 0;
    if (this.health <= 0) {
      this.destroy();
      return;
    }
    if (this.passive) return;
    // A hit staggers, then the drone comes after whoever hit it.
    if (this.state !== 'DAMAGED') {
      this.resumeState = this.state === 'PATROL' || this.state === 'DETECT' ? 'CHASE' : this.state;
    }
    this.setState('DAMAGED');
    this.cancelFire();
  }

  cancelFire(): void {
    this.windUp = 0;
    this.burstLeft = 0;
    this.telegraph = 0;
  }

  /**
   * Integrates movement and handles respawn. Returns true on the step the
   * drone comes back after being destroyed.
   */
  fixedUpdate(dt: number, world: WorldQuery): boolean {
    const cfg = Config.enemies;
    this.sinceHit += dt;
    this.stateTime += dt;

    if (!this.alive) {
      this.respawnIn -= dt;
      if (this.respawnIn > 0) return false;
      this.reset();
      return true;
    }

    this.previousPosition.copy(this.position);
    if (this.passive) this.desired.copy(this.home).sub(this.position);
    dampVec3(this.steer, this.desired, cfg.accel, dt);
    dampVec3(this.knock, ZERO, cfg.knockDamping, dt);

    move.copy(this.steer).add(this.knock);
    const speed = move.length();
    const distance = speed * dt;
    if (distance > 1e-6) {
      move.divideScalar(speed);
      const clear = world.castSphere(this.position, move, distance, this.radius);
      if (clear < distance) {
        this.position.addScaledVector(move, Math.max(0, clear - SKIN));
        this.crash();
      } else {
        this.position.addScaledVector(move, distance);
      }
    }
    this.velocity.copy(this.position).sub(this.previousPosition).divideScalar(dt);
    return false;
  }

  /** Hit the world: being thrown into it hurts, flying into it just stops. */
  private crash(): void {
    const cfg = Config.enemies;
    const knockSpeed = this.knock.length();
    this.steer.multiplyScalar(0.2);
    this.knock.multiplyScalar(-0.3);
    if (knockSpeed > cfg.crashSpeed) {
      this.applyHit((knockSpeed - cfg.crashSpeed) * cfg.crashDamagePerSpeed, ZERO);
    }
  }

  private destroy(): void {
    this.alive = false;
    this.setState('DESTROYED');
    this.threat = 0;
    this.cancelFire();
    const { respawnTime, dummyRespawnTime } = Config.enemies;
    this.respawnIn = this.passive ? dummyRespawnTime : respawnTime;
  }

  private reset(): void {
    this.alive = true;
    this.health = this.maxHealth;
    this.position.copy(this.home);
    this.previousPosition.copy(this.home);
    this.velocity.set(0, 0, 0);
    this.steer.set(0, 0, 0);
    this.knock.set(0, 0, 0);
    this.desired.set(0, 0, 0);
    this.state = 'PATROL';
    this.resumeState = 'PATROL';
    this.stateTime = 0;
    this.threat = 0;
    this.lostTime = 0;
    this.evadeCooldown = 0;
    this.hasRetreated = false;
    this.canSeePlayer = false;
    this.fireCooldown = this.rng.range(0.5, 1.5);
    this.orbitSign = this.rng.next() < 0.5 ? -1 : 1;
    this.patrolAngle = this.rng.range(0, Math.PI * 2);
    this.cancelFire();
  }
}
