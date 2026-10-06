import { Config } from '../core/Config';

/** World speed in m/s to the km/h figure shown to the player (spec section 11). */
export function toDisplaySpeed(metresPerSecond: number): number {
  return metresPerSecond * 3.6 * Config.hud.displaySpeedScale;
}
