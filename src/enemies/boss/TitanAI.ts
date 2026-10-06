import { Vector3 } from 'three';
import { Config } from '../../core/Config';
import { dampVec3 } from '../../utils/math';
import type { Titan } from './Titan';

type Waypoint = readonly [x: number, y: number, z: number];

/**
 * The corridor above the ring road is clear of anything tall, so a machine
 * 28 m wide can circle downtown without clipping towers.
 */
const RING: readonly Waypoint[] = [
  [0, 200, -250],
  [250, 185, -250],
  [250, 170, 0],
  [250, 200, 250],
  [0, 180, 250],
  [-250, 210, 250],
  [-250, 170, 0],
  [-250, 190, -250],
];
/** Phase 3 also charges down the avenue canyon, between the towers (spec section 18). */
const AVENUE_RUN: readonly Waypoint[] = [
  [0, 150, -250],
  [0, 140, 0],
  [0, 150, 250],
];
const PHASE3_PATH: readonly Waypoint[] = [...RING.slice(0, 1), ...AVENUE_RUN, ...RING.slice(4)];

/** Where Titan drops in from, and where it settles for the reveal. */
export const TITAN_ENTRY: Waypoint = [0, 600, -120];
const INTRO_HOLD: Waypoint = [0, 390, 0];
const INTRO_SPEED = 70;
const WRAP = Math.PI * 2;

const target = new Vector3();
const desired = new Vector3();

/** Titan's movement: descend for the reveal, then patrol a path that grows faster each phase. */
export class TitanAI {
  private waypoint = 0;

  reset(): void {
    this.waypoint = 0;
  }

  fixedUpdate(titan: Titan, playerPosition: Vector3, dt: number): void {
    const cfg = Config.titan;
    titan.previousPosition.copy(titan.position);
    titan.previousYaw = titan.yaw;

    let speed = 0;
    if (titan.state === 'INTRO') {
      target.set(...INTRO_HOLD);
      speed = INTRO_SPEED;
    } else if (titan.state === 'FIGHT') {
      const path = titan.phase === 3 ? PHASE3_PATH : RING;
      const point = path[this.waypoint % path.length] ?? RING[0]!;
      target.set(...point);
      if (titan.position.distanceTo(target) < cfg.waypointReach) this.waypoint++;
      speed = titan.phase === 1 ? cfg.speed1 : titan.phase === 2 ? cfg.speed2 : cfg.speed3;
    } else if (titan.state === 'DYING') {
      // Engines failing: it sinks.
      target.copy(titan.position).y -= 100;
      speed = 12;
    } else {
      target.copy(titan.position);
    }

    desired.copy(target).sub(titan.position);
    const distance = desired.length();
    if (distance > 1e-3) desired.multiplyScalar(Math.min(speed, distance) / distance);
    dampVec3(titan.velocity, desired, cfg.accel, dt);
    titan.position.addScaledVector(titan.velocity, dt);

    // It always turns to face the player, at a rate the player can out-circle.
    if (titan.state !== 'DYING') {
      const wanted = Math.atan2(
        -(playerPosition.x - titan.position.x),
        -(playerPosition.z - titan.position.z),
      );
      let delta = (wanted - titan.yaw) % WRAP;
      if (delta > Math.PI) delta -= WRAP;
      if (delta < -Math.PI) delta += WRAP;
      const step = cfg.turnRate * dt;
      titan.yaw += Math.max(-step, Math.min(step, delta));
    }
    titan.updateWeakPoints();
  }
}
