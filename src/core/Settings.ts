import type { QualityPreset } from '../rendering/QualitySettings';
import { Config } from './Config';

/** Player-facing options (spec sections 12, 16). Saved with progress. */
export interface Settings {
  /** Multiplier on look speed. */
  sensitivity: number;
  invertY: boolean;
  /** Base field of view in degrees. */
  fov: number;
  /** How much the view widens with speed, 0..1. */
  fovKick: number;
  /** Camera shake strength, 0..1. */
  cameraShake: number;
  /** Streaks rushing past at speed. */
  speedEffects: boolean;
  /** Tones down full-screen and bright flashes. */
  reduceFlashes: boolean;
  /** Contextual control hints for new players. */
  showHints: boolean;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  quality: QualityPreset | 'auto';
}

export const DEFAULT_SETTINGS: Settings = {
  sensitivity: 1,
  invertY: false,
  fov: 70,
  fovKick: 1,
  cameraShake: 1,
  speedEffects: true,
  reduceFlashes: false,
  showHints: true,
  masterVolume: 0.6,
  musicVolume: 0.5,
  sfxVolume: 1,
  quality: 'auto',
};

/** Allowed range of each numeric setting, for the settings screen and for validating saves. */
export const SETTING_RANGES = {
  sensitivity: [0.3, 2.5],
  fov: [60, 90],
  fovKick: [0, 1],
  cameraShake: [0, 1],
  masterVolume: [0, 1],
  musicVolume: [0, 1],
  sfxVolume: [0, 1],
} as const satisfies Partial<Record<keyof Settings, readonly [number, number]>>;

const QUALITY_CHOICES: readonly string[] = ['auto', 'MOBILE', 'LOW', 'MEDIUM', 'HIGH', 'ULTRA'];
const BASE_MOUSE_SENSITIVITY = Config.input.mouseSensitivity;
const BASE_SPEED_LINE_OPACITY = Config.vfx.speedLineOpacity;

/**
 * Builds valid settings from anything: unknown or out-of-range fields fall
 * back to defaults one by one, so a damaged save loses as little as possible.
 */
export function sanitizeSettings(value: unknown): Settings {
  const source =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const result: Settings = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(SETTING_RANGES) as (keyof typeof SETTING_RANGES)[]) {
    const [min, max] = SETTING_RANGES[key];
    const field = source[key];
    if (typeof field === 'number' && Number.isFinite(field)) {
      result[key] = Math.min(max, Math.max(min, field));
    }
  }
  for (const key of ['invertY', 'speedEffects', 'reduceFlashes', 'showHints'] as const) {
    if (typeof source[key] === 'boolean') result[key] = source[key];
  }
  if (typeof source.quality === 'string' && QUALITY_CHOICES.includes(source.quality)) {
    result.quality = source.quality as Settings['quality'];
  }
  return result;
}

/** Writes settings into the tunables the game reads. Quality is applied by its own system. */
export function applySettings(settings: Settings): void {
  Config.input.mouseSensitivity = BASE_MOUSE_SENSITIVITY * settings.sensitivity;
  Config.input.invertY = settings.invertY ? -1 : 1;
  Config.render.fov = settings.fov;
  Config.camera.fovKickScale = settings.fovKick;
  Config.camera.shakeScale = settings.cameraShake;
  Config.vfx.speedLineOpacity = settings.speedEffects ? BASE_SPEED_LINE_OPACITY : 0;
  Config.vfx.flashScale = settings.reduceFlashes ? 0 : 1;
  Config.audio.masterVolume = settings.masterVolume;
  Config.audio.musicVolume = settings.musicVolume;
  Config.audio.sfxVolume = settings.sfxVolume;
}
