import { afterEach, describe, expect, it } from 'vitest';
import { Config } from '../../src/core/Config';
import {
  AdaptiveQuality,
  DEFAULT_PRESET,
  PRESET_ORDER,
  PRESETS,
  writePreset,
} from '../../src/rendering/QualitySettings';

/** Feeds `seconds` of frames at a steady frame time; returns how many times something changed. */
function feed(quality: AdaptiveQuality, frameMs: number, seconds: number): number {
  let changes = 0;
  const frames = Math.round((seconds * 1000) / frameMs);
  for (let i = 0; i < frames; i++) if (quality.sample(frameMs / 1000)) changes++;
  return changes;
}

afterEach(() => writePreset('HIGH'));

describe('quality presets (spec section 37)', () => {
  it('each step down is cheaper or equal on every axis', () => {
    for (let i = 1; i < PRESET_ORDER.length; i++) {
      const lower = PRESETS[PRESET_ORDER[i - 1]!];
      const higher = PRESETS[PRESET_ORDER[i]!];
      expect(lower.maxPixelRatio).toBeLessThanOrEqual(higher.maxPixelRatio);
      expect(lower.minPixelRatio).toBeLessThanOrEqual(higher.minPixelRatio);
      expect(lower.particles).toBeLessThanOrEqual(higher.particles);
      expect(lower.vehicles).toBeLessThanOrEqual(higher.vehicles);
      expect(lower.pedestrians).toBeLessThanOrEqual(higher.pedestrians);
      expect(Number(lower.shadows)).toBeLessThanOrEqual(Number(higher.shadows));
      expect(lower.minPixelRatio).toBeLessThanOrEqual(lower.maxPixelRatio);
    }
  });

  it('writing a preset updates the tunables other systems read', () => {
    writePreset('MOBILE');
    expect(Config.render.shadows).toBe(0);
    expect(Config.render.maxPixelRatio).toBe(1);
    expect(Config.quality.pedestrians).toBe(0.25);
    expect(Config.vfx.particleScale).toBe(0.3);
    writePreset('ULTRA');
    expect(Config.render.shadows).toBe(1);
    expect(Config.render.shadowMapSize).toBe(4096);
    expect(Config.quality.vehicles).toBe(1);
  });
});

describe('adaptive quality', () => {
  it('starts at the default preset and leaves a healthy frame rate alone', () => {
    const quality = new AdaptiveQuality();
    expect(quality.preset).toBe(DEFAULT_PRESET);
    expect(quality.auto).toBe(true);
    // Right on target: neither slow nor fast.
    expect(feed(quality, 16.7, 20)).toBe(0);
    expect(quality.preset).toBe(DEFAULT_PRESET);
  });

  it('when slow it lowers resolution first, then the preset', () => {
    const quality = new AdaptiveQuality();
    const { minPixelRatio, maxPixelRatio } = PRESETS[DEFAULT_PRESET];
    feed(quality, 30, 2.2);
    expect(quality.preset).toBe(DEFAULT_PRESET);
    expect(quality.pixelRatio).toBeLessThan(maxPixelRatio);

    feed(quality, 30, 2.5);
    expect(quality.pixelRatio).toBeCloseTo(minPixelRatio, 5);
    expect(quality.preset).toBe(DEFAULT_PRESET); // still giving resolution a chance

    feed(quality, 30, 4);
    expect(PRESET_ORDER.indexOf(quality.preset)).toBeLessThan(PRESET_ORDER.indexOf(DEFAULT_PRESET));
  });

  it('keeps dropping on a hopeless machine but stops at the lowest preset', () => {
    const quality = new AdaptiveQuality();
    feed(quality, 80, 120);
    expect(quality.preset).toBe('MOBILE');
    expect(quality.pixelRatio).toBeCloseTo(PRESETS.MOBILE.minPixelRatio, 5);
  });

  it('with headroom it raises resolution, then the preset, but never past HIGH by itself', () => {
    const quality = new AdaptiveQuality();
    feed(quality, 8, 120);
    expect(quality.preset).toBe('HIGH');
    expect(quality.pixelRatio).toBeCloseTo(PRESETS.HIGH.maxPixelRatio, 5);
  });

  it('does not flap: a preset raise needs sustained headroom', () => {
    const quality = new AdaptiveQuality();
    feed(quality, 8, 3);
    expect(quality.preset).toBe(DEFAULT_PRESET);
  });

  it('ignores stalls such as a tab switch', () => {
    const quality = new AdaptiveQuality();
    for (let i = 0; i < 50; i++) expect(quality.sample(2)).toBe(false);
    expect(quality.preset).toBe(DEFAULT_PRESET);
    expect(quality.pixelRatio).toBe(PRESETS[DEFAULT_PRESET].maxPixelRatio);
  });

  it('a manual choice fixes the preset but resolution still adapts within it', () => {
    const quality = new AdaptiveQuality();
    quality.choose('ULTRA');
    expect(quality).toMatchObject({ preset: 'ULTRA', auto: false });
    feed(quality, 60, 60);
    expect(quality.preset).toBe('ULTRA');
    expect(quality.pixelRatio).toBeCloseTo(PRESETS.ULTRA.minPixelRatio, 5);

    quality.choose('auto');
    feed(quality, 60, 10);
    expect(quality.preset).not.toBe('ULTRA');
  });
});
