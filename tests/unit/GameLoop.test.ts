import { describe, expect, it } from 'vitest';
import { FixedStepper } from '../../src/core/GameLoop';

const STEP = 1 / 60;

function countSteps(stepper: FixedStepper, frameDelta: number): { steps: number; alpha: number } {
  let steps = 0;
  const alpha = stepper.advance(frameDelta, () => steps++);
  return { steps, alpha };
}

describe('FixedStepper', () => {
  it('runs the same number of steps per second at any frame rate', () => {
    for (const hz of [30, 60, 144]) {
      const stepper = new FixedStepper(STEP, 0.1);
      let total = 0;
      for (let i = 0; i < hz * 2; i++) total += countSteps(stepper, 1 / hz).steps;
      expect(Math.abs(total - 120)).toBeLessThanOrEqual(1);
    }
  });

  it('passes the fixed step to the callback and returns alpha in [0, 1)', () => {
    const stepper = new FixedStepper(STEP, 0.1);
    const seen: number[] = [];
    const alpha = stepper.advance(STEP * 2.5, (step) => seen.push(step));
    expect(seen).toEqual([STEP, STEP]);
    expect(alpha).toBeCloseTo(0.5, 6);
  });

  it('clamps a long stall instead of spiralling', () => {
    const stepper = new FixedStepper(STEP, 0.1);
    expect(countSteps(stepper, 5).steps).toBeLessThanOrEqual(6);
  });

  it('ignores negative deltas and resets cleanly', () => {
    const stepper = new FixedStepper(STEP, 0.1);
    expect(countSteps(stepper, -1).steps).toBe(0);
    stepper.advance(STEP * 0.9, () => {});
    stepper.reset();
    expect(countSteps(stepper, STEP * 0.5).steps).toBe(0);
  });
});
