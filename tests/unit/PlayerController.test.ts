import { describe, expect, it } from 'vitest';
import { Config } from '../../src/core/Config';
import { createTestPlayer, run, takeOff } from './helpers';

const flight = Config.flight;

describe('player state machine', () => {
  it('starts on the ground and stays there', () => {
    const player = createTestPlayer();
    run(player, 1);
    expect(player.state.state).toBe('GROUND');
    expect(player.state.position.y).toBeCloseTo(0, 5);
  });

  it('walks relative to the aim direction', () => {
    const player = createTestPlayer();
    run(player, 1, { moveZ: 1 });
    expect(player.state.position.z).toBeLessThan(-4); // yaw 0 faces -Z
    expect(Math.abs(player.state.position.x)).toBeLessThan(1e-6);
  });

  it('jumps, falls back and lands', () => {
    const player = createTestPlayer();
    run(player, 0.1, { jumpPressed: true });
    expect(player.state.state).toBe('JUMPING');
    expect(player.state.position.y).toBeGreaterThan(0.5);
    run(player, 2);
    expect(player.state.state).toBe('GROUND');
  });

  it('takes off on a second press, then hovers in place', () => {
    const player = createTestPlayer();
    takeOff(player);
    expect(player.state.state).toBe('HOVERING');
    run(player, 2);
    expect(player.state.state).toBe('HOVERING');
    expect(player.state.speed).toBeLessThan(0.1);
    expect(player.state.position.y).toBeGreaterThan(1);
  });

  it('goes HOVERING -> FLYING -> BOOSTING and back', () => {
    const player = createTestPlayer();
    takeOff(player);
    run(player, 1, { moveZ: 1 });
    expect(player.state.state).toBe('FLYING');
    run(player, 1, { moveZ: 1, boost: true });
    expect(player.state.state).toBe('BOOSTING');
    expect(player.state.speed).toBeGreaterThan(flight.fastSpeed);
    run(player, 0.1, { moveZ: 1 });
    expect(player.state.state).toBe('FLYING');
    run(player, 3, { moveZ: -1 });
    expect(player.state.state).toBe('HOVERING');
  });

  it('lands when descending onto the ground at low speed', () => {
    const player = createTestPlayer();
    takeOff(player);
    run(player, 1, { ascend: true });
    expect(player.state.position.y).toBeGreaterThan(10);
    run(player, 4, { descend: true });
    expect(player.state.state).toBe('GROUND');
    expect(player.state.position.y).toBeCloseTo(0, 5);
  });

  it('skims the ground instead of landing when fast', () => {
    const player = createTestPlayer();
    takeOff(player);
    run(player, 3, { moveZ: 1 });
    player.state.aim.pitch = -0.3;
    run(player, 3, { moveZ: 1 });
    expect(player.state.flying).toBe(true);
    expect(player.state.speed).toBeGreaterThan(flight.landMaxSpeed);
    expect(player.state.position.y).toBeCloseTo(0, 5);
  });
});

describe('flight feel targets (spec section 57)', () => {
  it('responds within one step', () => {
    const player = createTestPlayer();
    takeOff(player);
    run(player, 1);
    const before = player.state.position.z;
    run(player, 1 / 60, { moveZ: 1 });
    expect(player.state.position.z).toBeLessThan(before);
  });

  it('reaches cruise speed in about a second', () => {
    const player = createTestPlayer();
    takeOff(player);
    run(player, 1, { moveZ: 1 });
    expect(player.state.speed).toBeGreaterThan(40);
  });

  it('boost is felt within 0.2 s', () => {
    const player = createTestPlayer();
    takeOff(player);
    run(player, 6, { moveZ: 1 });
    const before = player.state.speed;
    run(player, 0.2, { moveZ: 1, boost: true });
    expect(player.state.speed - before).toBeGreaterThan(10);
  });

  it('sustained boost climbs into the extreme tier', () => {
    const player = createTestPlayer();
    takeOff(player);
    run(player, 12, { moveZ: 1, boost: true });
    expect(player.state.speed).toBeGreaterThan(flight.boostSpeed + 40);
    expect(player.state.speed).toBeLessThanOrEqual(flight.extremeSpeed + flight.diveBonus);
  });

  it('stops from cruise in under 1.5 s', () => {
    const player = createTestPlayer();
    takeOff(player);
    run(player, 1, { moveZ: 1 });
    run(player, 1.5, { moveZ: -1 });
    expect(player.state.cruise.length()).toBeLessThan(1);
  });

  it('keeps speed through a turn', () => {
    const player = createTestPlayer();
    takeOff(player);
    run(player, 8, { moveZ: 1 });
    const before = player.state.speed;
    player.state.aim.yaw = Math.PI / 2;
    run(player, 1, { moveZ: 1 });
    expect(player.state.speed).toBeGreaterThan(before * 0.95);
    expect(player.state.velocity.x).toBeLessThan(-before * 0.8); // now heading -X
  });

  it('turns wider at higher speed', () => {
    const turned = (speed: number): number => {
      const player = createTestPlayer();
      takeOff(player);
      player.state.cruise.set(0, 0, -speed);
      player.state.aim.yaw = Math.PI / 2;
      run(player, 0.2, { moveZ: 1 });
      return Math.atan2(-player.state.cruise.x, -player.state.cruise.z);
    };
    expect(turned(30)).toBeGreaterThan(turned(200) * 1.5);
    expect(turned(200)).toBeGreaterThan(0.1); // never reaches zero
  });

  it('diving is tagged and adds speed', () => {
    const player = createTestPlayer();
    takeOff(player);
    run(player, 2, { ascend: true });
    player.state.aim.pitch = -1.2;
    run(player, 0.6, { moveZ: 1 });
    expect(player.state.diving).toBe(true);
  });

  it('behaves the same at 30, 60 and 144 steps per second', () => {
    const fly = (hz: number) => {
      const player = createTestPlayer();
      const dt = 1 / hz;
      run(player, 0.2, { jumpPressed: true }, dt);
      run(player, 0.5, { jumpPressed: true }, dt);
      run(player, 3, { moveZ: 1 }, dt);
      run(player, 2, { moveZ: 1, boost: true }, dt);
      return { speed: player.state.speed, z: player.state.position.z };
    };
    const [a, b, c] = [fly(30), fly(60), fly(144)];
    expect(a.speed).toBeCloseTo(b.speed, 3);
    expect(b.speed).toBeCloseTo(c.speed, 3);
    expect(Math.abs(a.z - b.z) / Math.abs(b.z)).toBeLessThan(0.03);
    expect(Math.abs(c.z - b.z) / Math.abs(b.z)).toBeLessThan(0.03);
  });
});

describe('heading', () => {
  it('holds while looking around and follows the direction of travel', () => {
    const player = createTestPlayer();
    player.state.aim.yaw = 1;
    run(player, 0.5);
    expect(player.state.heading).toBe(0); // mouse look alone does not turn the hero
    run(player, 0.5, { moveZ: 1 });
    expect(player.state.heading).toBeCloseTo(1, 2);
    player.state.aim.yaw = 2;
    run(player, 0.5);
    expect(player.state.heading).toBeCloseTo(1, 2);
  });
});
