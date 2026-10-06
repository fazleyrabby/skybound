import { afterEach, describe, expect, it } from 'vitest';
import { Config } from '../../src/core/Config';
import { applySettings, DEFAULT_SETTINGS } from '../../src/core/Settings';
import { currentHint, type HintContext } from '../../src/ui/Hints';
import { createTestPlayer, run, takeOff } from './helpers';

afterEach(() => applySettings(DEFAULT_SETTINGS));

describe('applying settings', () => {
  it('defaults leave the tuned values as they were', () => {
    const before = JSON.stringify(Config);
    applySettings(DEFAULT_SETTINGS);
    expect(JSON.stringify(Config)).toBe(before);
  });

  it('writes each option into the tunable the game reads', () => {
    const base = Config.input.mouseSensitivity;
    applySettings({
      ...DEFAULT_SETTINGS,
      sensitivity: 2,
      invertY: true,
      fov: 85,
      fovKick: 0,
      cameraShake: 0,
      speedEffects: false,
      reduceFlashes: true,
      masterVolume: 0.1,
    });
    expect(Config.input.mouseSensitivity).toBeCloseTo(base * 2, 10);
    expect(Config.input.invertY).toBe(-1);
    expect(Config.render.fov).toBe(85);
    expect(Config.camera.fovKickScale).toBe(0);
    expect(Config.camera.shakeScale).toBe(0);
    expect(Config.vfx.speedLineOpacity).toBe(0);
    expect(Config.vfx.flashScale).toBe(0);
    expect(Config.audio.masterVolume).toBe(0.1);
  });

  it('inverted look flips the vertical axis only', () => {
    const player = createTestPlayer();
    player.applyLook(0.1, 0.1);
    expect(player.state.aim.pitch).toBeCloseTo(0.1, 6);
    applySettings({ ...DEFAULT_SETTINGS, invertY: true });
    player.applyLook(0.1, 0.1);
    expect(player.state.aim.pitch).toBeCloseTo(0, 6);
    expect(player.state.aim.yaw).toBeCloseTo(0.2, 6);
  });
});

describe('hints for new players', () => {
  const context = (overrides: Partial<HintContext> = {}): HintContext => ({
    player: createTestPlayer().state,
    missionActive: false,
    atBeacon: false,
    hasTarget: false,
    firstFlightDone: false,
    ...overrides,
  });

  it('teach walking and take-off on the ground, then flight in the air', () => {
    const player = createTestPlayer();
    expect(currentHint(context({ player: player.state }))).toContain('Space');
    run(player, 0.1, { jumpPressed: true });
    expect(currentHint(context({ player: player.state }))).toContain('take off');
    takeOff(player);
    expect(currentHint(context({ player: player.state }))).toContain('fly where you look');
    run(player, 1, { moveZ: 1 });
    expect(currentHint(context({ player: player.state }))).toContain('boost');
  });

  it('switch to combat controls when something is targeted', () => {
    const player = createTestPlayer();
    expect(currentHint(context({ player: player.state, hasTarget: true }))).toContain('Space');
    takeOff(player);
    expect(currentHint(context({ player: player.state, hasTarget: true }))).toContain('punch');
  });

  it('stay out of the way of the beacon prompt and mission objectives', () => {
    expect(currentHint(context({ atBeacon: true }))).toBeNull();
    expect(currentHint(context({ missionActive: true }))).toBeNull();
  });

  it('stop once First Flight is done', () => {
    expect(currentHint(context({ firstFlightDone: true }))).toBeNull();
    expect(currentHint(context({ firstFlightDone: true, hasTarget: true }))).toBeNull();
  });
});
