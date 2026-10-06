import { describe, expect, it } from 'vitest';
import { EventBus } from '../../src/core/EventBus';
import { applyDeadZone } from '../../src/input/GamepadInput';
import { createRng } from '../../src/utils/rng';

describe('applyDeadZone', () => {
  it('is zero inside the dead zone and reaches 1 at full deflection', () => {
    expect(applyDeadZone(0.1, 0.15)).toBe(0);
    expect(applyDeadZone(-0.15, 0.15)).toBe(0);
    expect(applyDeadZone(1, 0.15)).toBe(1);
    expect(applyDeadZone(-1, 0.15)).toBe(-1);
    expect(applyDeadZone(0.575, 0.15)).toBeCloseTo(0.5, 6);
  });
});

describe('EventBus', () => {
  it('delivers to subscribers until they unsubscribe', () => {
    const bus = new EventBus<{ ping: number }>();
    const seen: number[] = [];
    const off = bus.on('ping', (value) => seen.push(value));
    bus.emit('ping', 1);
    off();
    bus.emit('ping', 2);
    expect(seen).toEqual([1]);
  });
});

describe('seeded generation', () => {
  it('rng repeats for the same seed and differs across seeds', () => {
    const a = createRng(42);
    const b = createRng(42);
    const c = createRng(43);
    const first = [a.next(), a.next(), a.next()];
    expect([b.next(), b.next(), b.next()]).toEqual(first);
    expect(c.next()).not.toBe(first[0]);
    for (const value of first) expect(value).toBeGreaterThanOrEqual(0);
    for (const value of first) expect(value).toBeLessThan(1);
  });
});
