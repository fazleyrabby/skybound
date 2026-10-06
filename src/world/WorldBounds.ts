import { Config } from '../core/Config';
import type { PlayerState } from '../player/PlayerState';
import { smoothstep } from '../utils/math';

/**
 * Soft limits on the flyable volume (spec section 64). No invisible wall:
 * past the surround a headwind builds until outward flight stops and the hero
 * is pushed back; near the ceiling the air "thins" and upward speed fades.
 * Operates on the flight velocity channels, before the move.
 */
export function applyWorldBounds(state: PlayerState, dt: number): void {
  const { softRadius, boundaryWidth, boundaryPush, ceilingStart, ceilingEnd } = Config.world;
  const { x, y, z } = state.position;

  const distance = Math.hypot(x, z);
  const pressure = smoothstep(softRadius, softRadius + boundaryWidth, distance);
  state.boundsPressure = pressure;
  if (pressure > 0 && distance > 0) {
    const outX = x / distance;
    const outZ = z / distance;
    for (const channel of [state.cruise, state.nudge]) {
      const outward = channel.x * outX + channel.z * outZ;
      if (outward > 0) {
        channel.x -= outX * outward * pressure;
        channel.z -= outZ * outward * pressure;
      }
    }
    // Deep in the boundary the wind actively carries the hero back.
    const push = boundaryPush * pressure * pressure * dt;
    state.nudge.x -= outX * push;
    state.nudge.z -= outZ * push;
  }

  const thin = smoothstep(ceilingStart, ceilingEnd, y);
  if (thin > 0) {
    if (state.cruise.y > 0) state.cruise.y *= 1 - thin;
    if (state.nudge.y > 0) state.nudge.y *= 1 - thin;
  }

  state.velocity.copy(state.cruise).add(state.nudge);
}
