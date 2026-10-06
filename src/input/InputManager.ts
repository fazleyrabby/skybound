import type { PlayerInput } from '../player/PlayerState';
import { KEY_BINDINGS, MOUSE_BINDINGS, PREVENT_DEFAULT_CODES, type Action } from './Actions';
import { Config } from '../core/Config';
import { clamp } from '../utils/math';
import { GamepadInput } from './GamepadInput';
import { MouseInput } from './MouseInput';

/**
 * Maps devices to abstract actions. Gameplay reads actions, never key codes.
 * "Pressed" edges are held until the next fixed step consumes them, so a tap
 * is never lost on a frame that runs zero simulation steps.
 */
export class InputManager {
  readonly mouse: MouseInput;
  readonly gamepad = new GamepadInput();

  private readonly held = new Set<Action>();
  private readonly pressed = new Set<Action>();
  private readonly heldCodes = new Map<string, Action>();
  private readonly mouseDelta = { dx: 0, dy: 0 };

  constructor(canvas: HTMLCanvasElement, onLockChange: (locked: boolean) => void) {
    this.mouse = new MouseInput(
      canvas,
      (locked) => {
        if (!locked) this.clear();
        onLockChange(locked);
      },
      (button, down) => {
        const action = MOUSE_BINDINGS[button];
        if (action) this.setAction(action, down);
      },
    );
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.clear);
  }

  isHeld(action: Action): boolean {
    return this.held.has(action) || this.gamepad.held.has(action);
  }

  /** True if the action went down since the last `endStep`. */
  wasPressed(action: Action): boolean {
    return this.pressed.has(action) || this.gamepad.pressed.has(action);
  }

  /** Call after each fixed step. */
  endStep(): void {
    this.pressed.clear();
    this.gamepad.endStep();
  }

  /** Call once per rendered frame, before reading input. */
  poll(): void {
    this.gamepad.poll();
  }

  /** Look input for this frame in radians: mouse movement plus the gamepad stick. */
  consumeLook(frameDelta: number, out: { yaw: number; pitch: number }): void {
    this.mouse.consume(this.mouseDelta);
    const { mouseSensitivity } = Config.input;
    const { lookYawRate, lookPitchRate } = Config.gamepad;
    out.yaw =
      -this.mouseDelta.dx * mouseSensitivity - this.gamepad.lookX * lookYawRate * frameDelta;
    out.pitch =
      -this.mouseDelta.dy * mouseSensitivity - this.gamepad.lookY * lookPitchRate * frameDelta;
  }

  readPlayerInput(out: PlayerInput): void {
    const pad = this.gamepad;
    const keyX = (this.isHeld('moveRight') ? 1 : 0) - (this.isHeld('moveLeft') ? 1 : 0);
    const keyZ = (this.isHeld('moveForward') ? 1 : 0) - (this.isHeld('moveBack') ? 1 : 0);
    out.moveX = clamp(keyX + pad.moveX, -1, 1);
    out.moveZ = clamp(keyZ + pad.moveZ, -1, 1);
    out.ascend = this.isHeld('ascend');
    out.descend = this.isHeld('descend');
    out.boost = this.isHeld('boost');
    out.jumpPressed = this.wasPressed('ascend');
    out.punch = this.isHeld('punch');
    out.punchPressed = this.wasPressed('punch');
    out.blast = this.isHeld('blast');
    out.dashPressed = this.wasPressed('dash');
    out.lockPressed = this.wasPressed('lockOn');
    out.interactPressed = this.wasPressed('interact');
    out.abandonPressed = this.wasPressed('abandon');
  }

  /** Sets an action directly. Used by gamepad/touch later and by tests now. */
  setAction(action: Action, held: boolean): void {
    if (held) {
      if (!this.held.has(action)) this.pressed.add(action);
      this.held.add(action);
    } else {
      this.held.delete(action);
    }
  }

  /** Releases everything, so focus or pointer-lock loss cannot leave a key stuck. */
  readonly clear = (): void => {
    this.held.clear();
    this.pressed.clear();
    this.heldCodes.clear();
  };

  dispose(): void {
    this.mouse.dispose();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.clear);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (PREVENT_DEFAULT_CODES.has(event.code)) event.preventDefault();
    const action = KEY_BINDINGS[event.code];
    if (!action || event.repeat) return;
    this.heldCodes.set(event.code, action);
    this.setAction(action, true);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    const action = this.heldCodes.get(event.code);
    if (!action) return;
    this.heldCodes.delete(event.code);
    // Two keys can share an action (left/right Shift); release only when both are up.
    for (const other of this.heldCodes.values()) if (other === action) return;
    this.setAction(action, false);
  };
}
