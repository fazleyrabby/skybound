import { Config } from '../core/Config';
import type { PlayerState } from '../player/PlayerState';

const REFRESH_INTERVAL = 1 / 15;

interface Bar {
  root: HTMLDivElement;
  fill: HTMLDivElement;
}

/**
 * Minimal HUD (spec section 43): health and energy for now. Each bar fades out
 * when full so free flight stays uncluttered. Refreshes at 15 Hz, not per frame.
 */
export class HUD {
  private readonly health: Bar;
  private readonly energy: Bar;
  private sinceRefresh = REFRESH_INTERVAL;

  constructor(
    parent: HTMLElement,
    private readonly player: PlayerState,
  ) {
    const root = document.createElement('div');
    root.id = 'hud';
    Object.assign(root.style, {
      position: 'fixed',
      left: '24px',
      bottom: '24px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      pointerEvents: 'none',
      zIndex: '3',
    });
    this.health = createBar('health', '#ff5d5d');
    this.energy = createBar('energy', '#5dd6ff');
    root.append(this.health.root, this.energy.root);
    parent.appendChild(root);
  }

  update(frameDelta: number): void {
    this.sinceRefresh += frameDelta;
    if (this.sinceRefresh < REFRESH_INTERVAL) return;
    this.sinceRefresh = 0;
    setBar(this.health, this.player.health / Config.vitals.maxHealth);
    setBar(this.energy, this.player.energy / Config.vitals.maxEnergy);
  }
}

function createBar(name: string, color: string): Bar {
  const root = document.createElement('div');
  root.id = `hud-${name}`;
  Object.assign(root.style, {
    width: '220px',
    height: '10px',
    background: 'rgba(8, 12, 24, 0.6)',
    border: '1px solid rgba(255, 255, 255, 0.25)',
    borderRadius: '3px',
    overflow: 'hidden',
    transition: 'opacity 0.4s',
  });
  const fill = document.createElement('div');
  Object.assign(fill.style, { height: '100%', background: color, transformOrigin: 'left' });
  root.appendChild(fill);
  return { root, fill };
}

function setBar(bar: Bar, ratio: number): void {
  const clamped = Math.min(1, Math.max(0, ratio));
  bar.fill.style.transform = `scaleX(${clamped})`;
  bar.root.dataset.value = clamped.toFixed(2);
  bar.root.style.opacity = clamped >= 0.999 ? '0' : '1';
}
