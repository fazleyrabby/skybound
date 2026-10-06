export type Action =
  | 'moveForward'
  | 'moveBack'
  | 'moveLeft'
  | 'moveRight'
  | 'ascend'
  | 'descend'
  | 'boost'
  | 'punch'
  | 'blast'
  | 'dash'
  | 'lockOn'
  | 'interact'
  | 'abandon';

/**
 * Physical key (`KeyboardEvent.code`) to action, so WASD works on any layout.
 * No binding may use Ctrl, Alt or Meta: the browser owns those (spec section 9).
 */
export const KEY_BINDINGS: Readonly<Record<string, Action>> = {
  KeyW: 'moveForward',
  KeyS: 'moveBack',
  KeyA: 'moveLeft',
  KeyD: 'moveRight',
  Space: 'ascend',
  KeyC: 'descend',
  ShiftLeft: 'boost',
  ShiftRight: 'boost',
  KeyF: 'dash',
  KeyQ: 'lockOn',
  KeyE: 'interact',
  KeyX: 'abandon',
};

/** `MouseEvent.button` to action. */
export const MOUSE_BINDINGS: Readonly<Record<number, Action>> = {
  0: 'punch',
  2: 'blast',
};

/** Keys whose browser default (scroll, quick-find) must be suppressed during play. */
export const PREVENT_DEFAULT_CODES: ReadonlySet<string> = new Set([
  'Space',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Backquote',
]);
