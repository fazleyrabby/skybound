import { Vector3 } from 'three';
import { Config } from '../core/Config';
import { damp } from '../utils/math';
import { aimForwardFlat, aimRight, type PlayerInput, type PlayerState } from './PlayerState';

const flatForward = new Vector3();
const right = new Vector3();
const wish = new Vector3();

/** Camera-relative horizontal movement toward `maxSpeed`; vertical velocity is left alone. */
function steerHorizontal(
  state: PlayerState,
  input: PlayerInput,
  maxSpeed: number,
  response: number,
  dt: number,
): void {
  aimForwardFlat(state.aim, flatForward);
  aimRight(state.aim, right);
  wish.copy(flatForward).multiplyScalar(input.moveZ).addScaledVector(right, input.moveX);
  if (wish.lengthSq() > 1) wish.normalize();
  wish.multiplyScalar(maxSpeed);
  state.velocity.x = damp(state.velocity.x, wish.x, response, dt);
  state.velocity.z = damp(state.velocity.z, wish.z, response, dt);
}

/** Walking and sprinting. Height is handled by the controller's ground snap, not by pushing down. */
export function updateGround(state: PlayerState, input: PlayerInput, dt: number): void {
  const cfg = Config.ground;
  steerHorizontal(state, input, input.boost ? cfg.sprintSpeed : cfg.walkSpeed, cfg.response, dt);
  state.velocity.y = 0;
}

/** Ballistic jump or fall with a little air control. */
export function updateAirborne(state: PlayerState, input: PlayerInput, dt: number): void {
  const cfg = Config.ground;
  steerHorizontal(state, input, cfg.airSpeed, cfg.airResponse, dt);
  state.velocity.y = Math.max(state.velocity.y + cfg.gravity * dt, -cfg.terminalSpeed);
}

/** Brief settle after touching down: horizontal speed bleeds off, no control. */
export function updateLanding(state: PlayerState, dt: number): void {
  const cfg = Config.ground;
  state.velocity.x = damp(state.velocity.x, 0, cfg.response, dt);
  state.velocity.z = damp(state.velocity.z, 0, cfg.response, dt);
  state.velocity.y = 0;
}
