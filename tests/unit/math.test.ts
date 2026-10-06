import { describe, expect, it } from 'vitest';
import { clamp, damp, lerp } from '../../src/utils/math';

describe('math', () => {
  it('clamps and lerps', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(lerp(10, 20, 0.25)).toBe(12.5);
  });

  it('damp is frame-rate independent', () => {
    const run = (hz: number): number => {
      let value = 0;
      for (let i = 0; i < hz; i++) value = damp(value, 100, 4, 1 / hz);
      return value;
    };
    // One simulated second at 30, 60 and 144 Hz lands on the same value.
    expect(run(30)).toBeCloseTo(run(60), 6);
    expect(run(60)).toBeCloseTo(run(144), 6);
    expect(run(60)).toBeCloseTo(100 * (1 - Math.exp(-4)), 6);
  });
});
