import { Quaternion, Vector3 } from 'three';
import { Config } from '../core/Config';
import { clamp, damp, dampVec3, lerp } from '../utils/math';
import {
  aimForward,
  aimForwardFlat,
  aimRight,
  type FlightState,
  type PlayerInput,
  type PlayerState,
} from './PlayerState';

const forward = new Vector3();
const flatForward = new Vector3();
const right = new Vector3();
const direction = new Vector3();
const nudgeTarget = new Vector3();
const turn = new Quaternion();
const partialTurn = new Quaternion();
const identity = new Quaternion();

const MIN_DIRECTION_SPEED = 0.5;

/**
 * Arcade flight (spec section 9). Pure logic: reads input and aim, writes the
 * `cruise` and `nudge` velocity channels. Does not move the player or know
 * about collisions, rendering or the camera. Returns the flight sub-state.
 *
 * Cruise keeps its speed through turns: the direction rotates toward the aim
 * at a speed-dependent rate and the speed is damped separately. Nudge carries
 * strafe, direct vertical and reverse, so hovering stays precise.
 */
export function updateFlight(state: PlayerState, input: PlayerInput, dt: number): FlightState {
  const cfg = Config.flight;
  const staggered = state.staggerTime > 0;
  const throttle = staggered ? 0 : input.moveZ;
  const accelerating = throttle > 0;
  const braking = throttle < 0;

  aimForward(state.aim, forward);
  aimForwardFlat(state.aim, flatForward);
  aimRight(state.aim, right);

  // Direction: rotate toward where the player is looking, speed preserved.
  const speed = state.cruise.length();
  if (speed > MIN_DIRECTION_SPEED) direction.copy(state.cruise).divideScalar(speed);
  else direction.copy(forward);
  if (accelerating) {
    const turnRate = lerp(
      cfg.turnRateSlow,
      cfg.turnRateFast,
      clamp(speed / cfg.extremeSpeed, 0, 1),
    );
    rotateToward(direction, forward, turnRate * dt);
  }

  // Speed: separate response for boosting, accelerating, braking and coasting.
  const boosting = accelerating && input.boost;
  let targetSpeed = 0;
  let response = cfg.coastResponse;
  if (boosting) {
    state.boostTime += dt;
    // The extreme tier costs energy; when it runs dry the hero drops back to boost speed
    // until boost is released. Flight itself is never taken away (spec section 67).
    let extreme = clamp((state.boostTime - cfg.extremeDelay) / cfg.extremeRamp, 0, 1);
    if (state.extremeSpent) extreme = 0;
    state.energy = Math.max(0, state.energy - Config.vitals.extremeDrain * extreme * dt);
    if (extreme > 0 && state.energy <= 0) state.extremeSpent = true;
    targetSpeed = lerp(cfg.boostSpeed, cfg.extremeSpeed, extreme);
    response = cfg.boostResponse;
  } else {
    state.boostTime = 0;
    state.extremeSpent = false;
    if (accelerating) {
      targetSpeed = cfg.fastSpeed * throttle;
      response = cfg.accelResponse;
    } else if (braking) {
      response = cfg.brakeResponse;
    }
  }
  if (accelerating) targetSpeed += cfg.diveBonus * Math.max(0, -direction.y);
  // Bleed excess speed gently (releasing boost), unless the player is braking.
  if (!braking && speed > targetSpeed) response = cfg.coastResponse;

  const newSpeed = damp(speed, targetSpeed, response, dt);
  state.cruise.copy(direction).multiplyScalar(newSpeed);

  // Nudge: strafe fades with speed and becomes a yaw assist instead.
  const fast = clamp(newSpeed / cfg.fastSpeed, 0, 1);
  const strafe = staggered ? 0 : input.moveX * cfg.strafeSpeed * lerp(1, cfg.strafeAtSpeed, fast);
  const verticalSpeed = input.boost ? cfg.verticalBoostSpeed : cfg.verticalSpeed;
  const vertical = ((input.ascend ? 1 : 0) - (input.descend ? 1 : 0)) * verticalSpeed;
  const reverse = braking && newSpeed < cfg.reverseThreshold ? cfg.reverseSpeed : 0;
  nudgeTarget
    .copy(right)
    .multiplyScalar(strafe)
    .addScaledVector(flatForward, -reverse)
    .setY(vertical);
  dampVec3(state.nudge, nudgeTarget, cfg.nudgeResponse, dt);
  if (!staggered) state.aim.yaw -= input.moveX * cfg.yawAssistRate * fast * dt;

  state.velocity.copy(state.cruise).add(state.nudge);

  const total = state.velocity.length();
  state.diving =
    state.velocity.y < -cfg.diveMinDescent && -state.velocity.y / total > cfg.diveMinSteepness;
  if (boosting) return 'BOOSTING';
  return total > cfg.hoverMaxSpeed ? 'FLYING' : 'HOVERING';
}

/** Rotates unit vector `from` toward unit vector `to` by at most `maxAngle` radians, in place. */
function rotateToward(from: Vector3, to: Vector3, maxAngle: number): void {
  const angle = Math.acos(clamp(from.dot(to), -1, 1));
  if (angle <= maxAngle) {
    from.copy(to);
    return;
  }
  turn.setFromUnitVectors(from, to);
  partialTurn.slerpQuaternions(identity, turn, maxAngle / angle);
  from.applyQuaternion(partialTurn).normalize();
}
