import { Vector3 } from 'three';
import { Config } from '../core/Config';
import { clamp } from '../utils/math';

export type FlightState = 'GROUND' | 'JUMPING' | 'HOVERING' | 'FLYING' | 'BOOSTING' | 'LANDING';

/** Abstract player input for one fixed step. Devices are mapped to this by `InputManager`. */
export interface PlayerInput {
  /** Strafe: -1 left .. 1 right. */
  moveX: number;
  /** -1 back/brake .. 1 forward/accelerate. */
  moveZ: number;
  ascend: boolean;
  descend: boolean;
  boost: boolean;
  /** Ascend went down this step (jump, take off). */
  jumpPressed: boolean;
  /** Punch is held (charging a heavy punch). */
  punch: boolean;
  punchPressed: boolean;
  /** Energy blast is held; fires repeatedly on its cooldown. */
  blast: boolean;
  dashPressed: boolean;
  lockPressed: boolean;
  interactPressed: boolean;
  abandonPressed: boolean;
}

export function createPlayerInput(): PlayerInput {
  return {
    moveX: 0,
    moveZ: 0,
    ascend: false,
    descend: false,
    boost: false,
    jumpPressed: false,
    punch: false,
    punchPressed: false,
    blast: false,
    dashPressed: false,
    lockPressed: false,
    interactPressed: false,
    abandonPressed: false,
  };
}

/** Where the player is looking. yaw 0 faces -Z; positive pitch looks up. */
export interface Aim {
  yaw: number;
  pitch: number;
}

export function aimForward(aim: Aim, out: Vector3): Vector3 {
  const cosPitch = Math.cos(aim.pitch);
  return out.set(-Math.sin(aim.yaw) * cosPitch, Math.sin(aim.pitch), -Math.cos(aim.yaw) * cosPitch);
}

/** Horizontal forward (ignores pitch). */
export function aimForwardFlat(aim: Aim, out: Vector3): Vector3 {
  return out.set(-Math.sin(aim.yaw), 0, -Math.cos(aim.yaw));
}

export function aimRight(aim: Aim, out: Vector3): Vector3 {
  return out.set(Math.cos(aim.yaw), 0, -Math.sin(aim.yaw));
}

export class PlayerState {
  /** Capsule centre. */
  readonly position = new Vector3();
  /** Position at the previous fixed step, for render interpolation. */
  readonly previousPosition = new Vector3();
  /** Total velocity. In flight it equals `cruise + nudge`. */
  readonly velocity = new Vector3();
  /** Flight channel: forward flight along the steering direction. */
  readonly cruise = new Vector3();
  /** Flight channel: strafe, direct vertical and reverse. Responds fast, capped low. */
  readonly nudge = new Vector3();
  readonly aim: Aim = { yaw: 0, pitch: 0 };
  /**
   * Yaw the character faces. Follows the direction of travel and holds when
   * still, so looking around with the mouse orbits the camera without turning the hero.
   */
  heading = 0;

  state: FlightState = 'GROUND';
  /** Derived tag for camera, audio and VFX; has no input of its own. */
  diving = false;
  /** Seconds in the current state. */
  stateTime = 0;
  /** Seconds of continuous boost. */
  boostTime = 0;
  /** Seconds of reduced control left after a head-on impact. */
  staggerTime = 0;
  /** Seconds without ground contact while in GROUND. */
  ungroundedTime = 0;
  health: number = Config.vitals.maxHealth;
  energy: number = Config.vitals.maxEnergy;
  /** Seconds since damage was last taken; health regenerates after a delay. */
  sinceDamage = Infinity;
  /** Extreme speed has drained the energy; locked out until boost is released. */
  extremeSpent = false;
  /**
   * While positive, an attack lunge owns the hero's velocity (`lungeVelocity`)
   * and normal flight control is suspended. Set by the combat controller.
   */
  lungeTime = 0;
  readonly lungeVelocity = new Vector3();
  /** 0..1 charge of a held punch; 1 means releasing gives a heavy punch. */
  punchCharge = 0;
  /** 0..1: how far into the world-edge headwind the player is. */
  boundsPressure = 0;
  /** Speed into the surface of the most recent collision, m/s. */
  lastImpactSpeed = 0;

  get speed(): number {
    return this.velocity.length();
  }

  /** 0..1 across the speed tiers; drives camera, audio and VFX. */
  get speedFactor(): number {
    return clamp(this.speed / Config.flight.extremeSpeed, 0, 1);
  }

  get airborne(): boolean {
    return this.state !== 'GROUND' && this.state !== 'LANDING';
  }

  get flying(): boolean {
    return this.state === 'HOVERING' || this.state === 'FLYING' || this.state === 'BOOSTING';
  }
}
