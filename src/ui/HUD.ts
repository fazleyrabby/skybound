import { Config } from '../core/Config';
import type { CombatController } from '../player/CombatController';
import type { PlayerState } from '../player/PlayerState';
import { toDisplaySpeed } from './speed';

const REFRESH_INTERVAL = 1 / 15;

interface Bar {
  root: HTMLDivElement;
  fill: HTMLDivElement;
}

/**
 * Minimal HUD (spec section 43): health, energy, dash cooldown and speed. Each
 * bar fades out when full so free flight stays uncluttered. Refreshes at 15 Hz, not per frame.
 */
export class HUD {
  private readonly health: Bar;
  private readonly energy: Bar;
  private readonly dash: Bar;
  private readonly speed: HTMLDivElement;
  private sinceRefresh = REFRESH_INTERVAL;

  constructor(
    parent: HTMLElement,
    private readonly player: PlayerState,
    private readonly combat: CombatController,
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
    this.dash = createBar('dash', '#ffc24d');
    this.dash.root.style.width = '90px';
    this.dash.root.style.height = '6px';
    root.append(this.health.root, this.energy.root, this.dash.root);

    this.speed = document.createElement('div');
    this.speed.id = 'hud-speed';
    Object.assign(this.speed.style, {
      position: 'fixed',
      right: '24px',
      bottom: '24px',
      color: '#e8ecf5',
      font: '600 22px/1 ui-monospace, Menlo, monospace',
      textShadow: '0 1px 4px rgba(0, 0, 0, 0.75)',
      pointerEvents: 'none',
      zIndex: '3',
    });
    parent.append(root, this.speed);
  }

  update(frameDelta: number): void {
    this.sinceRefresh += frameDelta;
    if (this.sinceRefresh < REFRESH_INTERVAL) return;
    this.sinceRefresh = 0;
    setBar(this.health, this.player.health / Config.vitals.maxHealth);
    setBar(this.energy, this.player.energy / Config.vitals.maxEnergy);
    // Fills as the dash attack comes back; hidden when it is ready.
    setBar(this.dash, 1 - this.combat.dashCooldownFraction);
    this.speed.textContent = `${Math.round(toDisplaySpeed(this.player.speed))} km/h`;
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
    opacity: '0',
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
