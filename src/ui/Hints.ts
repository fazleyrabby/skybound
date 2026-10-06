import { store } from '../core/store';
import type { PlayerState } from '../player/PlayerState';

/** What the hint system looks at. */
export interface HintContext {
  player: PlayerState;
  missionActive: boolean;
  /** A mission beacon is within reach. */
  atBeacon: boolean;
  /** Something hostile is targeted. */
  hasTarget: boolean;
  firstFlightDone: boolean;
}

/**
 * The one hint worth showing right now, or null. Hints are for someone who has
 * not finished First Flight; after that the player knows the controls.
 */
export function currentHint(context: HintContext): string | null {
  if (context.firstFlightDone) return null;
  const { player } = context;
  // Combat controls only once airborne: on the ground, learning to take off comes first.
  if (context.hasTarget && player.airborne) {
    return 'Left mouse: punch   ·   Right mouse: energy blast   ·   Q: lock on';
  }
  if (context.atBeacon) return null; // the beacon shows its own prompt
  if (context.missionActive) return null; // the objective text is the instruction
  switch (player.state) {
    case 'GROUND':
    case 'LANDING':
      return 'WASD: walk   ·   Space: jump, then Space again to fly   ·   Walk into the blue beam for your first mission';
    case 'JUMPING':
      return 'Press Space again to take off';
    case 'HOVERING':
      return 'W: fly where you look   ·   Space / C: up / down   ·   Mouse: look around';
    default:
      return 'Shift: boost   ·   S: brake   ·   C: descend and land';
  }
}

const REFRESH_INTERVAL = 0.25;

/** Shows the current hint at the bottom of the screen. Turned off by the showHints setting. */
export class Hints {
  private readonly element: HTMLDivElement;
  private sinceRefresh = REFRESH_INTERVAL;
  private shown = '';

  constructor(
    parent: HTMLElement,
    private readonly context: () => HintContext,
  ) {
    this.element = document.createElement('div');
    this.element.id = 'hint';
    Object.assign(this.element.style, {
      position: 'fixed',
      left: '50%',
      bottom: '9%',
      transform: 'translateX(-50%)',
      padding: '7px 16px',
      background: 'rgba(8, 12, 24, 0.62)',
      borderRadius: '4px',
      color: '#dfe6f3',
      font: '14px/1.4 system-ui, sans-serif',
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
      display: 'none',
      zIndex: '3',
    });
    parent.appendChild(this.element);
  }

  update(frameDelta: number): void {
    this.sinceRefresh += frameDelta;
    if (this.sinceRefresh < REFRESH_INTERVAL) return;
    this.sinceRefresh = 0;
    // Only while playing: menus have their own controls list.
    const { settings, phase } = store.getState();
    const hint =
      settings.showHints && phase === 'running' ? (currentHint(this.context()) ?? '') : '';
    if (hint === this.shown) return;
    this.shown = hint;
    this.element.textContent = hint;
    this.element.style.display = hint ? 'block' : 'none';
  }
}
