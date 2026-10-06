import { Config } from '../core/Config';

export type QualityPreset = 'MOBILE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'ULTRA';

/** Lowest to highest. Auto-adjust walks this list. */
export const PRESET_ORDER: readonly QualityPreset[] = ['MOBILE', 'LOW', 'MEDIUM', 'HIGH', 'ULTRA'];
/** Auto-adjust never raises itself past this; ULTRA is a manual choice. */
export const AUTO_CEILING: QualityPreset = 'HIGH';
export const DEFAULT_PRESET: QualityPreset = 'MEDIUM';

export interface PresetValues {
  /** Highest and lowest pixel ratio dynamic resolution may use. */
  maxPixelRatio: number;
  minPixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  shadowRange: number;
  /** Multipliers, 1 is full. */
  particles: number;
  vehicles: number;
  pedestrians: number;
  rain: number;
}

/** What each preset means (spec section 37). */
export const PRESETS: Record<QualityPreset, PresetValues> = {
  ULTRA: {
    maxPixelRatio: 2,
    minPixelRatio: 1.25,
    shadows: true,
    shadowMapSize: 4096,
    shadowRange: 220,
    particles: 1,
    vehicles: 1,
    pedestrians: 1,
    rain: 1,
  },
  HIGH: {
    maxPixelRatio: 1.5,
    minPixelRatio: 1,
    shadows: true,
    shadowMapSize: 2048,
    shadowRange: 170,
    particles: 1,
    vehicles: 1,
    pedestrians: 1,
    rain: 1,
  },
  MEDIUM: {
    maxPixelRatio: 1.25,
    minPixelRatio: 0.85,
    shadows: true,
    shadowMapSize: 1024,
    shadowRange: 120,
    particles: 0.7,
    vehicles: 0.8,
    pedestrians: 0.7,
    rain: 0.7,
  },
  LOW: {
    maxPixelRatio: 1,
    minPixelRatio: 0.6,
    shadows: false,
    shadowMapSize: 1024,
    shadowRange: 120,
    particles: 0.4,
    vehicles: 0.5,
    pedestrians: 0.4,
    rain: 0.4,
  },
  MOBILE: {
    maxPixelRatio: 1,
    minPixelRatio: 0.5,
    shadows: false,
    shadowMapSize: 512,
    shadowRange: 80,
    particles: 0.3,
    vehicles: 0.35,
    pedestrians: 0.25,
    rain: 0.3,
  },
};

/** Writes a preset into `Config`. The caller then tells the renderer and atmosphere to re-read it. */
export function writePreset(preset: QualityPreset): void {
  const values = PRESETS[preset];
  Config.render.maxPixelRatio = values.maxPixelRatio;
  Config.render.minPixelRatio = values.minPixelRatio;
  Config.render.shadows = values.shadows ? 1 : 0;
  Config.render.shadowMapSize = values.shadowMapSize;
  Config.render.shadowRange = values.shadowRange;
  Config.vfx.particleScale = values.particles;
  Config.quality.vehicles = values.vehicles;
  Config.quality.pedestrians = values.pedestrians;
  Config.quality.rain = values.rain;
}

const WINDOW_SECONDS = 1;
const SLOW = 1.15;
const FAST = 0.85;
const RATIO_STEP_DOWN = 0.1;
const RATIO_STEP_UP = 0.05;
/** Slow seconds at the lowest resolution before dropping a preset. */
const WINDOWS_BEFORE_DROP = 3;
/** Fast seconds at full resolution before trying the next preset up. */
const WINDOWS_BEFORE_RAISE = 8;
/** A frame this long is a stall (tab switch, shader compile), not a sample. */
const STALL_SECONDS = 0.25;

/**
 * Holds the frame-time target (spec section 37). First it trades resolution,
 * within the preset's range; if the lowest resolution is still too slow it
 * drops a preset, and if full resolution has headroom for a while it tries the
 * next one up. Choosing a preset by hand turns the preset changes off but
 * keeps dynamic resolution. Pure logic: no rendering, so it can be tested.
 */
export class AdaptiveQuality {
  preset: QualityPreset = DEFAULT_PRESET;
  pixelRatio: number = PRESETS[DEFAULT_PRESET].maxPixelRatio;
  /** When false the preset is fixed and only resolution adapts. */
  auto = true;

  private elapsed = 0;
  private frames = 0;
  private slowWindows = 0;
  private fastWindows = 0;

  /** Picks a preset by hand, or hands control back with 'auto'. */
  choose(choice: QualityPreset | 'auto'): void {
    this.auto = choice === 'auto';
    if (choice !== 'auto') this.setPreset(choice);
  }

  /**
   * Feed every rendered frame. Returns true when the preset or pixel ratio
   * changed, so the caller can apply it.
   */
  sample(frameDelta: number): boolean {
    if (frameDelta > STALL_SECONDS) return false;
    this.elapsed += frameDelta;
    this.frames++;
    if (this.elapsed < WINDOW_SECONDS) return false;

    const averageMs = (this.elapsed / this.frames) * 1000;
    this.elapsed = 0;
    this.frames = 0;
    const target = Config.render.targetFrameMs;
    const { minPixelRatio, maxPixelRatio } = PRESETS[this.preset];
    const index = PRESET_ORDER.indexOf(this.preset);

    if (averageMs > target * SLOW) {
      this.fastWindows = 0;
      if (this.pixelRatio > minPixelRatio + 1e-6) {
        this.pixelRatio = Math.max(minPixelRatio, this.pixelRatio - RATIO_STEP_DOWN);
        return true;
      }
      if (this.auto && index > 0 && ++this.slowWindows >= WINDOWS_BEFORE_DROP) {
        this.setPreset(PRESET_ORDER[index - 1] ?? this.preset);
        return true;
      }
      return false;
    }

    this.slowWindows = 0;
    if (averageMs < target * FAST) {
      if (this.pixelRatio < maxPixelRatio - 1e-6) {
        this.pixelRatio = Math.min(maxPixelRatio, this.pixelRatio + RATIO_STEP_UP);
        return true;
      }
      const ceiling = PRESET_ORDER.indexOf(AUTO_CEILING);
      if (this.auto && index < ceiling && ++this.fastWindows >= WINDOWS_BEFORE_RAISE) {
        this.setPreset(PRESET_ORDER[index + 1] ?? this.preset);
        // Start the richer preset at its lowest resolution and climb, rather than risk a stutter.
        this.pixelRatio = PRESETS[this.preset].minPixelRatio;
        return true;
      }
    } else {
      this.fastWindows = 0;
    }
    return false;
  }

  private setPreset(preset: QualityPreset): void {
    this.preset = preset;
    this.pixelRatio = PRESETS[preset].maxPixelRatio;
    this.slowWindows = 0;
    this.fastWindows = 0;
  }
}
