import { Vector3, type PerspectiveCamera } from 'three';
import { Config } from '../core/Config';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/GameEvents';
import { aimForward, type PlayerState } from '../player/PlayerState';
import { clamp, damp, lerp } from '../utils/math';
import { CameraShake } from './CameraShake';

/** Finds how far a sphere can travel before hitting the world. Implemented by physics. */
export interface CameraObstacleQuery {
  castSphere(origin: Vector3, direction: Vector3, maxDistance: number, radius: number): number;
}

const RAD_TO_DEG = 180 / Math.PI;

/**
 * Third-person camera (spec section 12). The mouse orbits it around the hero;
 * it never turns the hero. Runs per rendered frame on the interpolated hero
 * position, and every change is damped so the view never snaps.
 */
export class CameraRig {
  private readonly pivot = new Vector3();
  private readonly forward = new Vector3();
  private readonly back = new Vector3();
  private readonly shake = new CameraShake();

  private distance = Config.camera.distance;
  private obstructed = false;
  private fovKick = 0;
  private boostPunch = 0;
  private dip = 0;
  private roll = 0;
  private lastYaw: number;

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly player: PlayerState,
    private readonly obstacles: CameraObstacleQuery,
    events: EventBus<GameEvents>,
  ) {
    this.lastYaw = player.aim.yaw;

    events.on('player:state', ({ from, to }) => {
      const cfg = Config.camera;
      if (to === 'BOOSTING') {
        this.shake.add(cfg.boostTrauma);
        this.boostPunch = cfg.boostFovPunch;
      } else if (to === 'LANDING') {
        this.shake.add(cfg.landTrauma);
        // Coming down from flight dips harder than hopping off a jump.
        this.dip = cfg.landingDip * (from === 'JUMPING' ? 0.6 : 1);
      }
    });
    events.on('combat:hit', ({ kind }) => {
      const cfg = Config.camera;
      this.shake.add(
        kind === 'blast'
          ? cfg.blastHitTrauma
          : kind === 'punch'
            ? cfg.punchTrauma
            : cfg.heavyTrauma,
      );
    });
    events.on('player:damaged', ({ amount }) => {
      this.shake.add(amount * Config.camera.damageTraumaPerPoint);
    });
    events.on('player:impact', ({ speed }) => {
      this.shake.add(speed * Config.camera.impactTraumaPerSpeed);
    });
  }

  update(alpha: number, frameDelta: number): void {
    const cfg = Config.camera;
    const player = this.player;
    const speedFactor = player.speedFactor;

    this.dip = damp(this.dip, 0, cfg.dipResponse, frameDelta);
    this.pivot.lerpVectors(player.previousPosition, player.position, alpha);
    this.pivot.y += cfg.pivotHeight - this.dip;

    // Pull back with speed, in slightly for a dive.
    let wanted = lerp(cfg.distance, cfg.distanceMax, speedFactor);
    if (player.diving) wanted *= cfg.diveDistanceScale;

    // Keep the view out of buildings: pull in at once, ease back out.
    aimForward(player.aim, this.forward);
    this.back.copy(this.forward).negate();
    const reach = Math.max(wanted, this.distance);
    const clear = this.obstacles.castSphere(this.pivot, this.back, reach, cfg.collisionRadius);
    if (clear < reach && clear < this.distance) {
      this.distance = clear;
      this.obstructed = true;
    } else {
      const response = this.obstructed ? cfg.collisionEaseOut : cfg.distanceResponse;
      this.distance = Math.min(damp(this.distance, wanted, response, frameDelta), clear);
      if (Math.abs(this.distance - wanted) < 0.05) this.obstructed = false;
    }

    this.camera.position.copy(this.pivot).addScaledVector(this.back, this.distance);
    this.camera.position.y = Math.max(this.camera.position.y, cfg.minHeight);
    this.camera.lookAt(this.pivot);

    // Slight roll into turns, capped to a few degrees.
    const yawRate = frameDelta > 0 ? (player.aim.yaw - this.lastYaw) / frameDelta : 0;
    this.lastYaw = player.aim.yaw;
    const wantedRoll = clamp(yawRate * cfg.rollPerYawRate * speedFactor, -cfg.maxRoll, cfg.maxRoll);
    this.roll = damp(this.roll, wantedRoll, cfg.rollResponse, frameDelta);
    this.camera.rotateZ(this.roll);

    this.shake.apply(this.camera, frameDelta);

    // FOV widens with speed, plus a short punch on boost entry.
    // The punch is a decaying target that the damped kick chases, so it eases in too.
    this.boostPunch = damp(this.boostPunch, 0, cfg.boostPunchDecay, frameDelta);
    const kickTarget =
      (cfg.fovKick * Math.pow(speedFactor, cfg.fovCurve) + this.boostPunch) * cfg.fovKickScale;
    this.fovKick = damp(this.fovKick, kickTarget, cfg.fovResponse, frameDelta);
    const fov = Math.min(Config.render.fov + this.fovKick, cfg.maxFov);
    if (Math.abs(fov - this.camera.fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Current FOV in degrees and follow distance, for the debug overlay and tests. */
  get debug(): { fov: number; distance: number; roll: number } {
    return { fov: this.camera.fov, distance: this.distance, roll: this.roll * RAD_TO_DEG };
  }
}
