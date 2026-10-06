import { Config } from '../core/Config';
import { clamp } from '../utils/math';
import type { Action } from './Actions';

/** Standard-mapping indices (spec section 44). */
const AXIS = { LEFT_X: 0, LEFT_Y: 1, RIGHT_X: 2, RIGHT_Y: 3 } as const;
const TRIGGER = { LEFT: 6, RIGHT: 7 } as const;
const START = 9;
const BUTTON_BINDINGS: ReadonlyArray<readonly [index: number, action: Action]> = [
  [0, 'ascend'], // A
  [1, 'descend'], // B
  [2, 'punch'], // X
  [3, 'blast'], // Y
  [4, 'boost'], // LB
  [10, 'boost'], // L3
  [5, 'dash'], // RB
  [11, 'lockOn'], // R3
  [12, 'interact'], // D-pad up
  [8, 'abandon'], // Back / View
];

/** Zero inside the dead zone, rescaled to reach 1 at full deflection. */
export function applyDeadZone(value: number, deadZone: number): number {
  const magnitude = Math.abs(value);
  if (magnitude <= deadZone) return 0;
  return Math.sign(value) * Math.min(1, (magnitude - deadZone) / (1 - deadZone));
}

/** Polled once per rendered frame; the first connected standard gamepad wins. */
export class GamepadInput {
  moveX = 0;
  /** Throttle: right trigger minus left trigger, plus left stick forward. */
  moveZ = 0;
  lookX = 0;
  lookY = 0;
  held = new Set<Action>();
  private previousHeld = new Set<Action>();
  /** Press edges, latched until the next fixed step consumes them. */
  readonly pressed = new Set<Action>();

  private startPressed = false;
  private startWasDown = false;
  private pad: Gamepad | null = null;

  poll(): void {
    this.pad = navigator.getGamepads?.().find((pad) => pad?.mapping === 'standard') ?? null;
    const pad = this.pad;
    if (!pad) {
      this.moveX = this.moveZ = this.lookX = this.lookY = 0;
      this.held.clear();
      this.startWasDown = false;
      return;
    }

    const { deadZone, lookCurve } = Config.gamepad;
    const axis = (index: number): number => applyDeadZone(pad.axes[index] ?? 0, deadZone);
    const value = (index: number): number => pad.buttons[index]?.value ?? 0;
    const down = (index: number): boolean => pad.buttons[index]?.pressed ?? false;
    const curve = (v: number): number => Math.sign(v) * Math.pow(Math.abs(v), lookCurve);

    this.moveX = axis(AXIS.LEFT_X);
    this.moveZ = clamp(value(TRIGGER.RIGHT) - value(TRIGGER.LEFT) - axis(AXIS.LEFT_Y), -1, 1);
    this.lookX = curve(axis(AXIS.RIGHT_X));
    this.lookY = curve(axis(AXIS.RIGHT_Y));

    // Swap rather than copy: no allocation per frame.
    const wasHeld = this.held;
    this.held = this.previousHeld;
    this.previousHeld = wasHeld;
    this.held.clear();
    for (const [index, action] of BUTTON_BINDINGS) if (down(index)) this.held.add(action);
    for (const action of this.held) if (!wasHeld.has(action)) this.pressed.add(action);

    const start = down(START);
    if (start && !this.startWasDown) this.startPressed = true;
    this.startWasDown = start;
  }

  /** True once per press of Start. */
  consumeStart(): boolean {
    const pressed = this.startPressed;
    this.startPressed = false;
    return pressed;
  }

  endStep(): void {
    this.pressed.clear();
  }

  /** Vibration where the browser supports it (Chromium in practice). `strength` is 0..1. */
  rumble(strength: number, milliseconds: number): void {
    void this.pad?.vibrationActuator
      ?.playEffect('dual-rumble', {
        duration: milliseconds,
        strongMagnitude: clamp(strength, 0, 1),
        weakMagnitude: clamp(strength * 0.6, 0, 1),
      })
      .catch(() => undefined);
  }
}
