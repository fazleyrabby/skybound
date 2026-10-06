import { Vector3 } from 'three';
import type { AttackKind, Damageable } from '../combat/Damageable';
import type { Projectiles } from '../combat/Projectiles';
import { angleTo, Targeting } from '../combat/Targeting';
import { Config } from '../core/Config';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/GameEvents';
import { clamp } from '../utils/math';
import { aimForward, type PlayerInput, type PlayerState } from './PlayerState';
import { spendEnergy } from './PlayerVitals';

type MeleeKind = Exclude<AttackKind, 'blast'>;

interface Lunge {
  kind: MeleeKind;
  target: Damageable;
  /** Seconds left before the lunge gives up. */
  time: number;
  /** Speed the hero had going in; drives damage scaling and the exit speed. */
  entrySpeed: number;
}

const forward = new Vector3();
const attackDirection = new Vector3();
const toTarget = new Vector3();
const scratch = new Vector3();
const MUZZLE_HEIGHT = 0.4;
const MIN_TRAVEL_SPEED = 10;

/**
 * The player's attacks (spec section 13): punch, heavy punch, dash attack and
 * energy blast, built on soft lock-on targeting.
 *
 * Melee uses an assist lunge. Fist-on-drone contact at flight speed is not
 * achievable by raw hit detection, so a punch near a target takes over the
 * hero's velocity for a fraction of a second, homes in, matches the target's
 * velocity and lands. Afterwards the hero keeps most of their speed.
 */
export class CombatController {
  readonly targeting = new Targeting();

  private lunge: Lunge | null = null;
  private punchCooldown = 0;
  private dashCooldown = 0;
  private blastCooldown = 0;
  private chargeTime = 0;
  private hitStop = 0;
  /** Seconds a recent press stays valid, so one made slightly early is not lost. */
  private punchBuffer = 0;
  private dashBuffer = 0;

  constructor(
    private readonly player: PlayerState,
    private readonly targets: () => readonly Damageable[],
    private readonly projectiles: Projectiles,
    private readonly events: EventBus<GameEvents>,
  ) {}

  /** 0..1 until the dash attack is ready again. */
  get dashCooldownFraction(): number {
    return clamp(this.dashCooldown / Config.combat.dashCooldown, 0, 1);
  }

  /**
   * Hit-stop: a few frames of freeze on impact. Call first each fixed step;
   * while it returns true the caller skips the rest of the simulation.
   */
  consumeHitStop(input: PlayerInput, dt: number): boolean {
    if (this.hitStop <= 0) return false;
    this.hitStop -= dt;
    this.bufferPresses(input);
    return true;
  }

  /** Call before the player controller each fixed step. */
  fixedUpdate(input: PlayerInput, dt: number): void {
    const cfg = Config.combat;
    const player = this.player;
    this.punchCooldown -= dt;
    this.dashCooldown -= dt;
    this.blastCooldown -= dt;

    aimForward(player.aim, forward);
    const targets = this.targets();
    this.targeting.update(dt, player.position, forward, targets, input.lockPressed);

    this.punchBuffer -= dt;
    this.dashBuffer -= dt;
    this.bufferPresses(input);

    if (this.lunge) {
      this.advanceLunge(dt);
    } else {
      // A press punches at once; holding on charges a heavy punch, released to throw.
      if (input.punch) {
        this.chargeTime += dt;
      } else {
        if (this.chargeTime >= cfg.heavyChargeTime) this.startMelee('heavy', targets);
        this.chargeTime = 0;
      }
      if (this.punchBuffer > 0 && this.punchCooldown <= 0 && !this.lunge) {
        this.punchBuffer = 0;
        this.punchCooldown = cfg.punchCooldown;
        this.startMelee('punch', targets);
      }
      if (this.dashBuffer > 0 && this.dashCooldown <= 0 && !this.lunge) {
        this.dashBuffer = 0;
        this.startDash();
      }
    }
    player.punchCharge = clamp(this.chargeTime / cfg.heavyChargeTime, 0, 1);

    if (input.blast && this.blastCooldown <= 0 && spendEnergy(player, cfg.blastCost)) {
      this.blastCooldown = cfg.blastCooldown;
      this.fireBlast();
    }
  }

  private bufferPresses(input: PlayerInput): void {
    if (input.punchPressed) this.punchBuffer = Config.combat.inputBuffer;
    if (input.dashPressed) this.dashBuffer = Config.combat.inputBuffer;
  }

  private startMelee(kind: MeleeKind, targets: readonly Damageable[]): void {
    const cfg = Config.combat;
    const player = this.player;
    const speed = player.speed;

    // Attack along the direction of travel when moving, otherwise where the player looks.
    if (speed > MIN_TRAVEL_SPEED) attackDirection.copy(player.velocity).divideScalar(speed);
    else attackDirection.copy(forward);

    const range = cfg.assistBaseRange + speed * cfg.assistRangePerSpeed;
    const target = this.pickMeleeTarget(targets, range);
    if (target) {
      this.lunge = { kind, target, time: cfg.lungeMaxTime, entrySpeed: speed };
      this.steerLunge(this.lunge);
      return;
    }

    // No lunge target: still hit anything directly in front.
    scratch.copy(player.position).addScaledVector(attackDirection, cfg.whiffReach);
    for (const candidate of targets) {
      if (!candidate.alive) continue;
      if (scratch.distanceTo(candidate.position) <= cfg.whiffRadius + candidate.radius) {
        this.land(kind, candidate, speed, attackDirection);
        return;
      }
    }
    this.events.emit('combat:whiff', { kind });
  }

  /** The current target if it is in reach, otherwise the nearest candidate that is. */
  private pickMeleeTarget(targets: readonly Damageable[], range: number): Damageable | null {
    const cfg = Config.combat;
    const origin = this.player.position;
    const inReach = (target: Damageable): boolean =>
      target.alive &&
      origin.distanceTo(target.position) - target.radius <= range &&
      (angleTo(origin, attackDirection, target) <= cfg.assistCone ||
        angleTo(origin, forward, target) <= cfg.assistCone);

    const current = this.targeting.current;
    if (current && inReach(current)) return current;

    let nearest: Damageable | null = null;
    let nearestDistance = Infinity;
    for (const target of targets) {
      if (!inReach(target)) continue;
      const distance = origin.distanceTo(target.position);
      if (distance < nearestDistance) {
        nearest = target;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  private startDash(): void {
    const cfg = Config.combat;
    const player = this.player;
    const target = this.targeting.current;
    if (!target || player.position.distanceTo(target.position) > cfg.dashRange) {
      this.events.emit('combat:whiff', { kind: 'dash' });
      return;
    }
    this.dashCooldown = cfg.dashCooldown;
    this.lunge = { kind: 'dash', target, time: cfg.dashMaxTime, entrySpeed: player.speed };
    this.steerLunge(this.lunge);
  }

  private lungeSpeed(lunge: Lunge): number {
    const cfg = Config.combat;
    if (lunge.kind === 'dash') return cfg.dashSpeed;
    return Math.max(lunge.entrySpeed * cfg.lungeSpeedScale, cfg.lungeMinSpeed);
  }

  /** Points the lunge at the target, adding the target's velocity so it cannot be outrun. */
  private steerLunge(lunge: Lunge): number {
    const player = this.player;
    toTarget.copy(lunge.target.position).sub(player.position);
    const distance = toTarget.length();
    if (distance > 1e-6) toTarget.divideScalar(distance);
    else toTarget.copy(forward);
    player.lungeVelocity
      .copy(toTarget)
      .multiplyScalar(this.lungeSpeed(lunge))
      .add(lunge.target.velocity);
    player.lungeTime = lunge.time;
    return distance;
  }

  private advanceLunge(dt: number): void {
    const cfg = Config.combat;
    const lunge = this.lunge;
    if (!lunge) return;

    lunge.time -= dt;
    const distance = lunge.target.alive ? this.steerLunge(lunge) : Infinity;
    // Contact if this step's closing distance reaches the target: no overshoot.
    const reach = lunge.target.radius + cfg.contactRange + this.lungeSpeed(lunge) * dt;
    if (distance <= reach) {
      const carried = lunge.kind === 'dash' ? cfg.dashSpeed * 0.5 : lunge.entrySpeed;
      this.land(lunge.kind, lunge.target, carried, toTarget);
      this.endLunge(lunge, toTarget);
    } else if (lunge.time <= 0 || !lunge.target.alive) {
      this.events.emit('combat:whiff', { kind: lunge.kind });
      this.endLunge(lunge, toTarget);
    }
  }

  /** Hands velocity back to flight, keeping most of the speed the hero came in with. */
  private endLunge(lunge: Lunge, direction: Vector3): void {
    const cfg = Config.combat;
    const player = this.player;
    const exitSpeed =
      lunge.kind === 'dash'
        ? Math.max(lunge.entrySpeed, cfg.dashExitSpeed)
        : lunge.entrySpeed * cfg.momentumKeep;
    player.cruise.copy(direction).multiplyScalar(exitSpeed);
    player.nudge.set(0, 0, 0);
    player.velocity.copy(player.cruise);
    player.lungeTime = 0;
    this.lunge = null;
  }

  private land(kind: MeleeKind, target: Damageable, speed: number, direction: Vector3): void {
    const cfg = Config.combat;
    const bonus = 1 + Math.min(speed / cfg.speedScaleRef, cfg.maxSpeedBonus);
    const damage = cfg[`${kind}Damage`] * bonus;
    scratch.copy(direction).multiplyScalar(cfg[`${kind}Knockback`] + speed * cfg.knockbackPerSpeed);
    target.applyHit(damage, scratch);
    this.hitStop = cfg[`${kind}HitStop`];
    this.events.emit('combat:hit', {
      kind,
      targetId: target.id,
      damage,
      speed,
      x: target.position.x,
      y: target.position.y,
      z: target.position.z,
    });
  }

  private fireBlast(): void {
    const cfg = Config.combat;
    const player = this.player;
    const origin = scratch.copy(player.position);
    origin.y += MUZZLE_HEIGHT;

    // Aim assist: if the current target is close to the crosshair, lead it.
    attackDirection.copy(forward);
    const target = this.targeting.current;
    if (target && angleTo(origin, forward, target) <= cfg.blastAssistCone) {
      const flightTime = origin.distanceTo(target.position) / cfg.blastSpeed;
      attackDirection
        .copy(target.position)
        .addScaledVector(target.velocity, flightTime)
        .sub(origin)
        .normalize();
    }

    toTarget.copy(attackDirection).multiplyScalar(cfg.blastSpeed);
    // Carry the hero's forward speed so a blast never trails behind at boost.
    const carried = Math.max(0, player.velocity.dot(attackDirection));
    toTarget.addScaledVector(attackDirection, carried);
    if (this.projectiles.fire(origin, toTarget)) this.events.emit('combat:blastFired', {});
  }
}
