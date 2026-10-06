import { Vector3 } from 'three';
import { Config } from '../core/Config';
import type { Drone, WorldQuery } from './Drone';

/** What a drone knows about the player when it thinks. */
export interface Perception {
  playerPosition: Vector3;
  playerVelocity: Vector3;
  world: WorldQuery;
}

const UP = new Vector3(0, 1, 0);
const toPlayer = new Vector3();
const tangent = new Vector3();
const scratch = new Vector3();
const HOVER_ABOVE_PLAYER = 8;

/**
 * One decision for one drone (spec section 15). Runs at a low, staggered rate;
 * `interval` is the time since this drone last thought. Writes `drone.desired`
 * and the state fields, and nothing else: movement and firing happen every step.
 *
 * PATROL -> DETECT -> CHASE <-> ATTACK <-> EVADE, with DAMAGED as a brief stagger.
 */
export function think(drone: Drone, perception: Perception, interval: number): void {
  const cfg = Config.enemies;
  const speed = drone.config.speed;

  toPlayer.copy(perception.playerPosition).sub(drone.position);
  const distance = toPlayer.length();
  if (distance > 1e-6) toPlayer.divideScalar(distance);

  // Line of sight is only worth a ray when the player could matter.
  drone.canSeePlayer =
    distance < cfg.loseRange && perception.world.castRay(drone.position, toPlayer, distance) < 0;
  drone.evadeCooldown -= interval;

  switch (drone.state) {
    case 'PATROL': {
      drone.threat = 0.2;
      drone.patrolAngle += ((speed * cfg.patrolSpeedScale) / cfg.patrolRadius) * interval;
      scratch
        .set(Math.cos(drone.patrolAngle), 0, Math.sin(drone.patrolAngle))
        .multiplyScalar(cfg.patrolRadius)
        .add(drone.home)
        .sub(drone.position);
      drone.desired.copy(scratch).clampLength(0, speed * cfg.patrolSpeedScale);
      if (drone.desired.lengthSq() > 1) drone.facing.copy(drone.desired).normalize();
      if (distance < cfg.detectRange && drone.canSeePlayer) drone.setState('DETECT');
      break;
    }

    case 'DETECT': {
      // Stop, turn to the player, and visibly wind up before giving chase.
      drone.desired.set(0, 0, 0);
      drone.facing.copy(toPlayer);
      drone.telegraph = Math.min(1, drone.stateTime / cfg.detectTime);
      if (drone.stateTime >= cfg.detectTime) {
        drone.telegraph = 0;
        drone.setState('CHASE');
      }
      break;
    }

    case 'CHASE': {
      drone.threat = 0.6;
      drone.facing.copy(toPlayer);
      drone.desired.copy(toPlayer).multiplyScalar(distance > cfg.preferredRange ? speed : 0);
      if (distance < cfg.attackRange && drone.canSeePlayer) {
        drone.lostTime = 0;
        drone.setState('ATTACK');
      } else if (trackLoss(drone, distance, interval)) {
        drone.setState('PATROL');
      }
      break;
    }

    case 'ATTACK': {
      drone.threat = 1;
      drone.facing.copy(toPlayer);

      // Circle the player at the preferred range, a little above them.
      tangent.crossVectors(UP, toPlayer).multiplyScalar(drone.orbitSign);
      const radial = Math.max(
        -1,
        Math.min(1, (distance - cfg.preferredRange) / cfg.preferredRange),
      );
      drone.desired
        .copy(tangent)
        .multiplyScalar(0.7)
        .addScaledVector(toPlayer, radial * 0.8);
      const heightError = perception.playerPosition.y + HOVER_ABOVE_PLAYER - drone.position.y;
      drone.desired.y += Math.max(-0.5, Math.min(0.5, heightError / 20));
      drone.desired.multiplyScalar(speed);

      const healthRatio = drone.health / drone.maxHealth;
      if (healthRatio < cfg.retreatHealth && !drone.hasRetreated) {
        drone.hasRetreated = true;
        startEvade(drone, scratch.copy(toPlayer).negate().setY(0.3), cfg.retreatTime);
      } else if (shouldJink(drone, perception, distance)) {
        // Jink sideways and up, out of the line of a charge.
        const side = drone.rng.next() < 0.5 ? -1 : 1;
        startEvade(drone, scratch.copy(tangent).multiplyScalar(side).setY(0.6), cfg.evadeTime);
      } else if (distance > cfg.attackRange * 1.2 || trackLoss(drone, distance, interval)) {
        drone.cancelFire();
        drone.setState('CHASE');
      }
      break;
    }

    case 'EVADE': {
      drone.threat = 0.6;
      drone.desired.copy(drone.evadeDirection).multiplyScalar(speed * cfg.evadeSpeedScale);
      if (drone.stateTime >= drone.evadeDuration) drone.setState('CHASE');
      break;
    }

    case 'DAMAGED': {
      drone.desired.set(0, 0, 0);
      if (drone.stateTime >= cfg.staggerTime) drone.setState(drone.resumeState);
      break;
    }

    case 'DESTROYED':
      return;
  }

  avoidObstacles(drone, perception.world);
}

/** Counts time without sight of the player; true once the drone should give up. */
function trackLoss(drone: Drone, distance: number, interval: number): boolean {
  const cfg = Config.enemies;
  if (drone.canSeePlayer && distance < cfg.loseRange) {
    drone.lostTime = 0;
    return false;
  }
  drone.lostTime += interval;
  return drone.lostTime > cfg.loseTime;
}

function shouldJink(drone: Drone, perception: Perception, distance: number): boolean {
  const cfg = Config.enemies;
  if (drone.evadeCooldown > 0 || distance > cfg.evadeTriggerDistance) return false;
  const closing = scratch.copy(perception.playerVelocity).sub(drone.velocity).dot(toPlayer) * -1;
  return closing > cfg.evadeClosingSpeed;
}

function startEvade(drone: Drone, direction: Vector3, duration: number): void {
  drone.evadeDirection.copy(direction).normalize();
  drone.evadeDuration = duration;
  drone.evadeCooldown = Config.enemies.evadeCooldown + duration;
  drone.cancelFire();
  drone.setState('EVADE');
}

/** Climb over whatever is ahead, and stay off the ground. */
function avoidObstacles(drone: Drone, world: WorldQuery): void {
  const cfg = Config.enemies;
  const speed = drone.desired.length();
  if (speed > 1) {
    scratch.copy(drone.desired).divideScalar(speed);
    const lookahead = speed * cfg.avoidLookahead + drone.radius;
    if (world.castRay(drone.position, scratch, lookahead) >= 0) {
      drone.desired.multiplyScalar(0.3);
      drone.desired.y = Math.max(drone.desired.y, speed);
    }
  }
  if (drone.position.y < cfg.minAltitude) drone.desired.y = Math.max(drone.desired.y, 10);
}
