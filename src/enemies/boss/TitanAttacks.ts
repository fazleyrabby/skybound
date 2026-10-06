import { Quaternion, Vector3 } from 'three';
import { Config } from '../../core/Config';
import type { EventBus } from '../../core/EventBus';
import type { GameEvents } from '../../core/GameEvents';
import type { PlayerState } from '../../player/PlayerState';
import type { Rng } from '../../utils/rng';
import type { WorldQuery } from '../Drone';
import type { EnemyFire } from '../EnemyFire';
import type { Titan } from './Titan';

export interface PlayerHooks {
  damage(amount: number): void;
  /** Throws the player with the given velocity. */
  knock(velocity: Vector3): void;
}

export type LaserState = 'idle' | 'charge' | 'fire';

const HEAD_OFFSET = new Vector3(0, 1, -15);
const aim = new Vector3();
const muzzle = new Vector3();
const shot = new Vector3();
const toPlayer = new Vector3();
const turn = new Quaternion();
const partialTurn = new Quaternion();
const identity = new Quaternion();

/**
 * Titan's weapons, by phase (spec section 17):
 *   1: machine guns, missile salvos
 *   2: adds a sweeping laser
 *   3: adds a melee swipe and an area pulse
 * Every attack that can hurt badly is telegraphed first.
 */
export class TitanAttacks {
  laserState: LaserState = 'idle';
  readonly laserOrigin = new Vector3();
  readonly laserDirection = new Vector3(0, 0, -1);
  /** Length of the beam after the world has blocked it. */
  laserReach = 0;
  /** 0..1 wind-up of the swipe, for the view. */
  meleeWindup = 0;
  /** Radius of the expanding shockwave, or -1 when there is none. */
  pulseRadius = -1;
  /** 0..1 charge before the shockwave releases. */
  pulseCharge = 0;

  private gunTimer = 2;
  private burstLeft = 0;
  private burstTimer = 0;
  private missileTimer = 4;
  private laserTimer = 5;
  private laserTime = 0;
  private meleeTimer = 0;
  private meleeTime = -1;
  private pulseTimer = 6;
  private pulseTime = -1;
  private pulseHit = false;

  constructor(
    private readonly fire: EnemyFire,
    private readonly world: WorldQuery,
    private readonly player: PlayerState,
    private readonly hooks: PlayerHooks,
    private readonly events: EventBus<GameEvents>,
    private readonly rng: Rng,
  ) {}

  reset(): void {
    this.cancel();
    this.gunTimer = 2;
    this.missileTimer = 4;
    this.laserTimer = 5;
    this.meleeTimer = 0;
    this.pulseTimer = 6;
  }

  /** Stops anything in progress: used when a phase breaks or Titan dies. */
  cancel(): void {
    this.laserState = 'idle';
    this.burstLeft = 0;
    this.meleeTime = -1;
    this.meleeWindup = 0;
    this.pulseTime = -1;
    this.pulseRadius = -1;
    this.pulseCharge = 0;
  }

  fixedUpdate(titan: Titan, dt: number): void {
    if (titan.state !== 'FIGHT') {
      this.cancel();
      return;
    }
    this.headPosition(titan, muzzle);
    toPlayer.copy(this.player.position).sub(muzzle);
    const distance = toPlayer.length();
    const clear = this.world.castRay(muzzle, aim.copy(toPlayer).normalize(), distance) < 0;

    this.updateGuns(distance, clear, dt);
    this.updateMissiles(distance, dt);
    if (titan.phase >= 2) this.updateLaser(titan, dt);
    if (titan.phase >= 3) {
      this.updateMelee(titan, dt);
      this.updatePulse(titan, dt);
    }
  }

  private headPosition(titan: Titan, out: Vector3): Vector3 {
    const sin = Math.sin(titan.yaw);
    const cos = Math.cos(titan.yaw);
    return out.set(
      titan.position.x + HEAD_OFFSET.x * cos + HEAD_OFFSET.z * sin,
      titan.position.y + HEAD_OFFSET.y,
      titan.position.z - HEAD_OFFSET.x * sin + HEAD_OFFSET.z * cos,
    );
  }

  private updateGuns(distance: number, clear: boolean, dt: number): void {
    const cfg = Config.titan;
    const enemy = Config.enemies;
    if (this.burstLeft > 0) {
      this.burstTimer -= dt;
      if (this.burstTimer > 0) return;
      this.burstTimer += cfg.gunBurstInterval;
      this.burstLeft--;
      const flight = distance / enemy.bulletSpeed;
      aim
        .copy(this.player.position)
        .addScaledVector(this.player.velocity, flight * 0.7)
        .sub(muzzle)
        .normalize();
      aim.x += this.rng.range(-enemy.bulletSpread, enemy.bulletSpread) * 1.5;
      aim.y += this.rng.range(-enemy.bulletSpread, enemy.bulletSpread) * 1.5;
      aim.z += this.rng.range(-enemy.bulletSpread, enemy.bulletSpread) * 1.5;
      this.fire.fireBullet(muzzle, shot.copy(aim.normalize()).multiplyScalar(enemy.bulletSpeed));
      return;
    }
    this.gunTimer -= dt;
    if (this.gunTimer <= 0 && clear && distance < cfg.gunRange && this.laserState === 'idle') {
      this.gunTimer = cfg.gunInterval;
      this.burstLeft = cfg.gunBurst;
      this.burstTimer = 0;
    }
  }

  private updateMissiles(distance: number, dt: number): void {
    const cfg = Config.titan;
    this.missileTimer -= dt;
    if (this.missileTimer > 0 || distance > cfg.gunRange * 1.5) return;
    this.missileTimer = cfg.missileInterval;
    this.events.emit('boss:attack', { kind: 'salvo' });
    for (let i = 0; i < cfg.missileSalvo; i++) {
      // Fan the salvo out upward so the missiles arc in separately.
      const spread = (i - (cfg.missileSalvo - 1) / 2) * 0.5;
      aim.copy(toPlayer).normalize();
      aim.x += spread;
      aim.y += 0.6;
      this.fire.fireMissile(
        muzzle,
        shot.copy(aim.normalize()).multiplyScalar(Config.enemies.missileSpeed),
      );
    }
  }

  /** Charge with a visible warning line, then a beam that tracks slowly enough to out-fly. */
  private updateLaser(titan: Titan, dt: number): void {
    const cfg = Config.titan;
    this.headPosition(titan, this.laserOrigin);
    aim.copy(this.player.position).sub(this.laserOrigin).normalize();

    if (this.laserState === 'idle') {
      this.laserTimer -= dt;
      if (this.laserTimer > 0) return;
      this.laserState = 'charge';
      this.laserTime = cfg.laserCharge;
      this.laserDirection.copy(aim);
      this.events.emit('boss:attack', { kind: 'laserCharge' });
    }

    rotateToward(this.laserDirection, aim, cfg.laserTurnRate * dt);
    const hit = this.world.castRay(this.laserOrigin, this.laserDirection, cfg.laserLength);
    this.laserReach = hit < 0 ? cfg.laserLength : hit;
    this.laserTime -= dt;

    if (this.laserState === 'charge') {
      if (this.laserTime > 0) return;
      this.laserState = 'fire';
      this.laserTime = cfg.laserDuration;
      this.events.emit('boss:attack', { kind: 'laserFire' });
      return;
    }

    // Firing: hurt the player while they are inside the beam.
    toPlayer.copy(this.player.position).sub(this.laserOrigin);
    const along = Math.max(0, Math.min(this.laserReach, toPlayer.dot(this.laserDirection)));
    const offBeam = toPlayer.addScaledVector(this.laserDirection, -along).length();
    if (offBeam < cfg.laserRadius) this.hooks.damage(cfg.laserDps * dt);
    if (this.laserTime <= 0) {
      this.laserState = 'idle';
      this.laserTimer = cfg.laserInterval;
    }
  }

  /** A wind-up, then a swipe that hits and throws anything still close. */
  private updateMelee(titan: Titan, dt: number): void {
    const cfg = Config.titan;
    const distance = titan.position.distanceTo(this.player.position);
    this.meleeTimer -= dt;

    if (this.meleeTime < 0) {
      if (this.meleeTimer > 0 || distance > cfg.meleeRange) return;
      this.meleeTime = cfg.meleeWindup;
      this.events.emit('boss:attack', { kind: 'melee' });
    }
    this.meleeTime -= dt;
    this.meleeWindup = 1 - Math.max(0, this.meleeTime) / cfg.meleeWindup;
    if (this.meleeTime > 0) return;

    this.meleeTime = -1;
    this.meleeWindup = 0;
    this.meleeTimer = cfg.meleeCooldown;
    if (distance <= cfg.meleeRange) {
      this.hooks.damage(cfg.meleeDamage);
      shot
        .copy(this.player.position)
        .sub(titan.position)
        .normalize()
        .multiplyScalar(cfg.meleeKnockback);
      this.hooks.knock(shot);
    }
  }

  /** A charge, then a shockwave shell that expands outward; it hits once as it passes. */
  private updatePulse(titan: Titan, dt: number): void {
    const cfg = Config.titan;
    if (this.pulseTime < 0) {
      this.pulseTimer -= dt;
      if (this.pulseTimer > 0) return;
      this.pulseTime = 0;
      this.pulseHit = false;
      this.events.emit('boss:attack', { kind: 'pulse' });
    }
    this.pulseTime += dt;
    if (this.pulseTime < cfg.pulseWindup) {
      this.pulseCharge = this.pulseTime / cfg.pulseWindup;
      return;
    }
    this.pulseCharge = 0;
    this.pulseRadius = (this.pulseTime - cfg.pulseWindup) * cfg.pulseSpeed;
    const distance = titan.position.distanceTo(this.player.position);
    if (!this.pulseHit && Math.abs(distance - this.pulseRadius) < cfg.pulseThickness) {
      this.pulseHit = true;
      this.hooks.damage(cfg.pulseDamage);
    }
    if (this.pulseRadius >= cfg.pulseMaxRadius) {
      this.pulseTime = -1;
      this.pulseRadius = -1;
      this.pulseTimer = cfg.pulseInterval;
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
