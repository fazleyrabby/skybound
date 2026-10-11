/**
 * Fixed-step accumulator (spec section 63). Pure, so it can be unit tested
 * without a browser.
 */
export class FixedStepper {
  private accumulator = 0;

  constructor(
    private readonly step: number,
    private readonly maxFrameDelta: number,
  ) {}

  /**
   * Consumes `frameDelta` seconds, calling `onStep` once per fixed step.
   * Returns the interpolation alpha (0..1) for rendering between the last two steps.
   */
  advance(frameDelta: number, onStep: (step: number) => void): number {
    this.accumulator += Math.min(Math.max(frameDelta, 0), this.maxFrameDelta);
    while (this.accumulator >= this.step) {
      onStep(this.step);
      this.accumulator -= this.step;
    }
    return this.accumulator / this.step;
  }

  reset(): void {
    this.accumulator = 0;
  }
}

export interface LoopCallbacks {
  /** Gameplay state changes happen only here. */
  fixedUpdate(step: number): void;
  /** Called once per rendered frame with the interpolation alpha and the real frame delta. */
  render(alpha: number, frameDelta: number): void;
}

export interface LoopStats {
  frameCount: number;
  stepCount: number;
  /** Time spent in fixedUpdate during the last frame, in milliseconds. */
  lastSimMs: number;
  /** The same, per fixed step run in that frame: what one step costs. 0 if none ran. */
  lastStepMs: number;
  /** Real delta of the last frame, in milliseconds. */
  lastFrameMs: number;
}

export class GameLoop {
  readonly stats: LoopStats = {
    frameCount: 0,
    stepCount: 0,
    lastSimMs: 0,
    lastStepMs: 0,
    lastFrameMs: 0,
  };

  private readonly stepper: FixedStepper;
  private rafId = 0;
  private lastTime = 0;
  private running = false;
  private isPaused = false;

  constructor(
    private readonly callbacks: LoopCallbacks,
    private readonly step: number,
    maxFrameDelta: number,
  ) {
    this.stepper = new FixedStepper(step, maxFrameDelta);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.stepper.reset();
    this.rafId = requestAnimationFrame(this.frame);
  }

  /** While paused no fixed steps run, but rendering continues (menus, resize). */
  get paused(): boolean {
    return this.isPaused;
  }

  set paused(value: boolean) {
    this.isPaused = value;
    this.stepper.reset();
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  dispose(): void {
    this.stop();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  /** Debug/test batches use the same fixed updates, without waiting for software-rendered frames. */
  advanceSimulation(steps: number): void {
    if (!Number.isInteger(steps) || steps < 0 || steps > 600) {
      throw new Error('Simulation batch must be an integer from 0 to 600 steps');
    }
    if (this.isPaused) throw new Error('Cannot advance a paused simulation');
    for (let i = 0; i < steps; i++) {
      if (this.isPaused) break;
      this.onStep(this.step);
    }
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return;
    const frameDelta = (now - this.lastTime) / 1000;
    this.lastTime = now;

    const simStart = performance.now();
    const stepsBefore = this.stats.stepCount;
    // Paused: render the latest state as-is rather than replaying the last step.
    const alpha = this.isPaused ? 1 : this.stepper.advance(frameDelta, this.onStep);
    this.stats.lastSimMs = performance.now() - simStart;
    const steps = this.stats.stepCount - stepsBefore;
    this.stats.lastStepMs = steps > 0 ? this.stats.lastSimMs / steps : 0;
    this.stats.lastFrameMs = frameDelta * 1000;
    this.stats.frameCount++;

    this.callbacks.render(alpha, frameDelta);
    this.rafId = requestAnimationFrame(this.frame);
  };

  private readonly onStep = (step: number): void => {
    this.stats.stepCount++;
    this.callbacks.fixedUpdate(step);
  };

  // rAF stops in hidden tabs; on return, drop the elapsed time instead of simulating it.
  private readonly onVisibilityChange = (): void => {
    if (!document.hidden && this.running) {
      this.lastTime = performance.now();
      this.stepper.reset();
    }
  };
}
