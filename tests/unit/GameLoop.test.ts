import { afterEach, describe, expect, it, vi } from 'vitest';
import { FixedStepper, GameLoop } from '../../src/core/GameLoop';

const STEP = 1 / 60;

describe('explicit simulation advancement', () => {
  afterEach(() => vi.unstubAllGlobals());

  function makeLoop() {
    vi.stubGlobal('document', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    const callbacks = { fixedUpdate: vi.fn(), render: vi.fn() };
    return { loop: new GameLoop(callbacks, STEP, 0.1), callbacks };
  }

  it('runs real fixed updates without depending on rendering or the frame delta clamp', () => {
    const { loop, callbacks } = makeLoop();
    loop.advanceSimulation(240);
    expect(callbacks.fixedUpdate).toHaveBeenCalledTimes(240);
    expect(callbacks.fixedUpdate).toHaveBeenLastCalledWith(STEP);
    expect(callbacks.render).not.toHaveBeenCalled();
    expect(loop.stats.stepCount).toBe(240);
    expect(loop.stats.frameCount).toBe(0);
  });

  it('respects pause and rejects invalid batches without changing state', () => {
    const { loop, callbacks } = makeLoop();
    loop.paused = true;
    expect(() => loop.advanceSimulation(60)).toThrow('paused');
    loop.paused = false;
    for (const steps of [-1, 1.5, Infinity, 601]) {
      expect(() => loop.advanceSimulation(steps)).toThrow();
    }
    expect(callbacks.fixedUpdate).not.toHaveBeenCalled();
    expect(loop.stats.stepCount).toBe(0);
  });
});

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
