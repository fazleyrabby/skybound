import type { PlayerState } from '../player/PlayerState';

const SHOW_ABOVE = 0.05;

/** Tells the player why they are slowing down at the edge of the world. */
export class BoundsWarning {
  private readonly element: HTMLDivElement;
  private shown = false;

  constructor(
    parent: HTMLElement,
    private readonly player: PlayerState,
  ) {
    this.element = document.createElement('div');
    this.element.id = 'bounds-warning';
    this.element.textContent = 'Leaving Nova City airspace — turn back';
    Object.assign(this.element.style, {
      position: 'fixed',
      top: '18%',
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '8px 16px',
      background: 'rgba(8, 12, 24, 0.7)',
      color: '#ffd34d',
      font: '600 16px/1.4 system-ui, sans-serif',
      borderRadius: '4px',
      pointerEvents: 'none',
      display: 'none',
      zIndex: '4',
    });
    parent.appendChild(this.element);
  }

  update(): void {
    const show = this.player.boundsPressure > SHOW_ABOVE;
    if (show === this.shown) return;
    this.shown = show;
    this.element.style.display = show ? 'block' : 'none';
  }
}
