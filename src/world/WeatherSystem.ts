import { Config } from '../core/Config';
import { damp } from '../utils/math';
import { createRng, type Rng } from '../utils/rng';

export type Weather = 'clear' | 'rain';

/**
 * Clear or rain (spec section 42). Weather changes on a seeded timer; `rain`
 * eases between 0 and 1 so showers build and fade instead of switching.
 */
export class WeatherSystem {
  weather: Weather = 'clear';
  /** 0 dry .. 1 full rain. Drives streaks, fog, light and sound. */
  rain = 0;
  private readonly rng: Rng;
  private timer: number;

  constructor(seed: number) {
    this.rng = createRng(seed + 606);
    this.timer = this.rng.range(Config.world.clearMin, Config.world.clearMax);
  }

  /** Switches weather now and restarts its timer. */
  set(weather: Weather): void {
    const cfg = Config.world;
    this.weather = weather;
    this.timer =
      weather === 'rain'
        ? this.rng.range(cfg.rainMin, cfg.rainMax)
        : this.rng.range(cfg.clearMin, cfg.clearMax);
  }

  fixedUpdate(dt: number): void {
    this.timer -= dt;
    if (this.timer <= 0) this.set(this.weather === 'clear' ? 'rain' : 'clear');
    this.rain = damp(this.rain, this.weather === 'rain' ? 1 : 0, Config.world.rainResponse, dt);
  }
}
