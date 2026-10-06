import { Vector3 } from 'three';
import type { Damageable } from '../combat/Damageable';
import { Config } from '../core/Config';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/GameEvents';
import type { PlayerState } from '../player/PlayerState';
import { Drone, type WorldQuery } from './Drone';
import { think, type Perception } from './EnemyAI';
import { generateEnemy, trainingDummyConfig, type EnemyConfig } from './EnemyFactory';
import { EnemyFire } from './EnemyFire';

const MISSILE_ID_BASE = 10_000;
const aim = new Vector3();
const muzzle = new Vector3();
const shotVelocity = new Vector3();

/**
 * Owns every drone and their fire: staggers AI decisions, runs weapons and
 * movement each step, resolves drone-on-drone crashes, and reuses drones after
 * they are destroyed.
 */
export class EnemyManager {
  readonly drones: Drone[] = [];
  readonly fire: EnemyFire;
  /** Everything the player can target: live drones and missiles in flight. */
  readonly targets: Damageable[] = [];

  private readonly wasAlive: boolean[] = [];
  private readonly missileWasAlive: boolean[] = [];
  private readonly perception: Perception;
  private nextId = 1;

  constructor(
    private readonly events: EventBus<GameEvents>,
    private readonly world: WorldQuery,
    private readonly player: PlayerState,
    private readonly damagePlayer: (amount: number) => void,
  ) {
    this.fire = new EnemyFire(world, events, MISSILE_ID_BASE);
    this.perception = {
      playerPosition: player.position,
      playerVelocity: player.velocity,
      world,
    };
  }

  spawn(config: EnemyConfig, x: number, y: number, z: number, passive = false): Drone {
    const drone = new Drone(this.nextId++, config, new Vector3(x, y, z), passive);
    // Spread decisions out so drones do not all think on the same step.
    drone.thinkTimer = (this.drones.length % 5) * (Config.enemies.thinkInterval / 5);
    this.drones.push(drone);
    this.wasAlive.push(true);
    return drone;
  }

  spawnHostile(seed: number, x: number, y: number, z: number): Drone {
    return this.spawn(generateEnemy(seed), x, y, z);
  }

  spawnTrainingDummy(x: number, y: number, z: number): Drone {
    return this.spawn(trainingDummyConfig(), x, y, z, true);
  }

  fixedUpdate(dt: number): void {
    const cfg = Config.enemies;

    // Player attacks resolved earlier this step; announce what they destroyed.
    this.drones.forEach((drone, index) => {
      if (this.wasAlive[index] && !drone.alive) this.announceDestroyed(drone);
      this.wasAlive[index] = drone.alive;
    });
    this.fire.reportShotDown(this.missileWasAlive);

    for (const drone of this.drones) {
      if (drone.alive && !drone.passive) {
        drone.thinkTimer -= dt;
        if (drone.thinkTimer <= 0) {
          drone.thinkTimer += cfg.thinkInterval;
          think(drone, this.perception, cfg.thinkInterval);
        }
        this.updateWeapons(drone, dt);
      }
      drone.fixedUpdate(dt, this.world);
    }
    this.resolveDroneCrashes();
    this.fire.fixedUpdate(dt, this.player.position, this.damagePlayer);

    // Crashes this step are announced now; rebuild what can be targeted.
    this.targets.length = 0;
    this.drones.forEach((drone, index) => {
      if (this.wasAlive[index] && !drone.alive) this.announceDestroyed(drone);
      this.wasAlive[index] = drone.alive;
      if (drone.alive) this.targets.push(drone);
    });
    this.fire.missiles.forEach((missile, index) => {
      this.missileWasAlive[index] = missile.alive;
      if (missile.alive) this.targets.push(missile);
    });
  }

  private announceDestroyed(drone: Drone): void {
    const { x, y, z } = drone.position;
    this.events.emit('enemy:destroyed', { id: drone.id, x, y, z });
  }

  /** Telegraph, then a burst of bullets or one missile. Only while attacking with a clear shot. */
  private updateWeapons(drone: Drone, dt: number): void {
    const cfg = Config.enemies;
    if (drone.state !== 'ATTACK' || drone.config.weaponCount === 0) return;

    if (drone.burstLeft > 0) {
      drone.burstTimer -= dt;
      if (drone.burstTimer <= 0) {
        drone.burstTimer += cfg.burstInterval;
        drone.burstLeft--;
        this.shootBullet(drone);
      }
      return;
    }

    if (drone.windUp > 0) {
      drone.windUp -= dt;
      drone.telegraph = 1 - Math.max(0, drone.windUp) / cfg.telegraphTime;
      if (drone.windUp > 0) return;
      drone.telegraph = 0;
      const eagerness = 0.6 + drone.config.aggression;
      if (drone.config.weaponType === 'missile') {
        this.shootMissile(drone);
        drone.fireCooldown = cfg.missileCooldown / eagerness;
      } else {
        drone.burstLeft = cfg.burstCount * drone.config.weaponCount;
        drone.burstTimer = 0;
        drone.fireCooldown = cfg.burstCooldown / eagerness;
      }
      return;
    }

    drone.fireCooldown -= dt;
    if (drone.fireCooldown <= 0 && drone.canSeePlayer) drone.windUp = cfg.telegraphTime;
  }

  private shootBullet(drone: Drone): void {
    const cfg = Config.enemies;
    const player = this.player;
    // Lead the target by a fraction that grows with aggression, plus some spread.
    const flightTime = drone.position.distanceTo(player.position) / cfg.bulletSpeed;
    const lead = 0.3 + drone.config.aggression * 0.6;
    aim
      .copy(player.position)
      .addScaledVector(player.velocity, flightTime * lead)
      .sub(drone.position)
      .normalize();
    aim.x += drone.rng.range(-cfg.bulletSpread, cfg.bulletSpread);
    aim.y += drone.rng.range(-cfg.bulletSpread, cfg.bulletSpread);
    aim.z += drone.rng.range(-cfg.bulletSpread, cfg.bulletSpread);
    aim.normalize();
    muzzle.copy(drone.position).addScaledVector(aim, drone.radius);
    this.fire.fireBullet(muzzle, shotVelocity.copy(aim).multiplyScalar(cfg.bulletSpeed));
  }

  private shootMissile(drone: Drone): void {
    aim.copy(this.player.position).sub(drone.position).normalize();
    muzzle.copy(drone.position).addScaledVector(aim, drone.radius + 1);
    this.fire.fireMissile(
      muzzle,
      shotVelocity.copy(aim).multiplyScalar(Config.enemies.missileSpeed),
    );
  }

  /** A drone thrown into another damages both (spec section 15). */
  private resolveDroneCrashes(): void {
    const cfg = Config.enemies;
    for (const thrown of this.drones) {
      if (!thrown.alive) continue;
      const knockSpeed = thrown.knock.length();
      if (knockSpeed <= cfg.crashSpeed) continue;
      for (const other of this.drones) {
        if (other === thrown || !other.alive) continue;
        if (thrown.position.distanceTo(other.position) > thrown.radius + other.radius) continue;
        const damage = (knockSpeed - cfg.crashSpeed) * cfg.crashDamagePerSpeed;
        other.applyHit(damage, shotVelocity.copy(thrown.knock).multiplyScalar(0.5));
        thrown.knock.multiplyScalar(-0.3);
        thrown.applyHit(damage, shotVelocity.set(0, 0, 0));
        break;
      }
    }
  }
}
