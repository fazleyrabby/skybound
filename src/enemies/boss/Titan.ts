import { Vector3 } from 'three';
import type { Damageable } from '../../combat/Damageable';
import { Config } from '../../core/Config';

export type TitanState = 'DORMANT' | 'INTRO' | 'FIGHT' | 'STAGGER' | 'DYING';
export type WeakPointKind = 'engine' | 'vent' | 'reactor';

const BODY_ID = 20_000;

/**
 * A targetable spot on Titan. Hitting one damages Titan itself, at a
 * multiplier: weak points are how the fight is meant to be won (spec section 17).
 */
export class WeakPoint implements Damageable {
  readonly position = new Vector3();
  readonly velocity: Vector3;
  readonly radius = Config.titan.weakRadius;
  readonly maxHealth = 1;
  health = 1;
  alive = false;
  threat = 1;

  constructor(
    readonly id: number,
    readonly kind: WeakPointKind,
    /** Position in Titan's own frame: +X left, +Y up, -Z forward. */
    readonly offset: Vector3,
    /** First phase in which this point is exposed. */
    readonly fromPhase: number,
    private readonly titan: Titan,
  ) {
    this.velocity = titan.velocity;
  }

  applyHit(damage: number): void {
    const { weakMultiplier, reactorMultiplier } = Config.titan;
    this.titan.takeDamage(damage * (this.kind === 'reactor' ? reactorMultiplier : weakMultiplier));
  }
}

/**
 * TITAN, the first boss: a 30 m flying combat machine with three phases.
 * This class is state and damage rules only; movement is `TitanAI`, attacks
 * are `TitanAttacks`, and the encounter around it is `BossFight`.
 */
export class Titan implements Damageable {
  readonly id = BODY_ID;
  readonly position = new Vector3();
  readonly previousPosition = new Vector3();
  readonly velocity = new Vector3();
  readonly radius = Config.titan.radius;
  readonly maxHealth = Config.titan.maxHealth;
  health = Config.titan.maxHealth;
  alive = false;
  threat = 1;

  state: TitanState = 'DORMANT';
  stateTime = 0;
  phase = 1;
  /** Heading: 0 faces -Z. */
  yaw = 0;
  previousYaw = 0;
  /** Seconds since the last hit, for the view's flash. */
  sinceHit = Infinity;
  /** Set on the step a phase breaks; the encounter reads and clears it. */
  phaseJustBroke = false;

  readonly weakPoints: WeakPoint[];
  /** The hull plus whichever weak points are exposed in the current phase. */
  readonly targets: Damageable[] = [];

  constructor() {
    const point = (
      index: number,
      kind: WeakPointKind,
      x: number,
      y: number,
      z: number,
      from: number,
    ) => new WeakPoint(BODY_ID + 1 + index, kind, new Vector3(x, y, z), from, this);
    this.weakPoints = [
      point(0, 'engine', 15, 1, 9, 1),
      point(1, 'engine', -15, 1, 9, 1),
      point(2, 'vent', 8, 5.5, -4, 2),
      point(3, 'vent', -8, 5.5, -4, 2),
      point(4, 'reactor', 0, -5.5, 0, 3),
    ];
  }

  /** Fraction of health left, 0..1. */
  get healthFraction(): number {
    return this.health / this.maxHealth;
  }

  /** Health at the start of the current phase: where a knocked-out player resumes. */
  get checkpointHealth(): number {
    const { phase2At, phase3At } = Config.titan;
    return this.maxHealth * (this.phase === 1 ? 1 : this.phase === 2 ? phase2At : phase3At);
  }

  spawn(x: number, y: number, z: number): void {
    this.position.set(x, y, z);
    this.previousPosition.copy(this.position);
    this.velocity.set(0, 0, 0);
    this.health = this.maxHealth;
    this.alive = true;
    this.phase = 1;
    this.phaseJustBroke = false;
    this.sinceHit = Infinity;
    this.setState('INTRO');
    this.refreshTargets();
  }

  despawn(): void {
    this.alive = false;
    this.setState('DORMANT');
    this.refreshTargets();
  }

  setState(state: TitanState): void {
    this.state = state;
    this.stateTime = 0;
  }

  /** Hull hits: armour soaks most of it. */
  applyHit(damage: number): void {
    const { hullArmor1, hullArmor2, hullArmor3 } = Config.titan;
    this.takeDamage(
      damage * (this.phase === 1 ? hullArmor1 : this.phase === 2 ? hullArmor2 : hullArmor3),
    );
  }

  /**
   * Applies damage after multipliers. Health cannot skip a phase: it stops at
   * the next threshold, Titan reels for a moment, and the next phase begins.
   */
  takeDamage(amount: number): void {
    if (!this.alive || this.state !== 'FIGHT' || amount <= 0) return;
    this.sinceHit = 0;
    const { phase2At, phase3At } = Config.titan;
    const floor =
      this.phase === 1
        ? this.maxHealth * phase2At
        : this.phase === 2
          ? this.maxHealth * phase3At
          : 0;
    this.health = Math.max(floor, this.health - amount);
    if (this.health > floor) return;

    if (this.phase < 3) {
      this.phase++;
      this.phaseJustBroke = true;
      this.setState('STAGGER');
      this.refreshTargets();
    } else {
      this.setState('DYING');
      this.refreshTargets();
    }
  }

  /** Puts Titan back to the start of its current phase. */
  restoreCheckpoint(): void {
    if (!this.alive || this.state === 'DYING') return;
    this.health = this.checkpointHealth;
  }

  /** Moves the weak points with the hull. Call after the hull moves. */
  updateWeakPoints(): void {
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    for (const point of this.weakPoints) {
      const { x, y, z } = point.offset;
      point.position.set(
        this.position.x + x * cos + z * sin,
        this.position.y + y,
        this.position.z - x * sin + z * cos,
      );
      point.health = this.healthFraction;
    }
  }

  private refreshTargets(): void {
    const fighting = this.alive && this.state !== 'DYING';
    this.targets.length = 0;
    for (const point of this.weakPoints) {
      point.alive = fighting && this.phase >= point.fromPhase;
      if (point.alive) this.targets.push(point);
    }
    if (fighting) this.targets.push(this);
  }
}
