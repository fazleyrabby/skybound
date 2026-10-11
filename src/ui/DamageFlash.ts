import { Config } from '../core/Config';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/GameEvents';

/** Red vignette that pulses when the hero is hit, stronger for bigger hits. */
export class DamageFlash {
  private readonly element: HTMLDivElement;
  private strength = 0;
  /** Set by a hit: the flash is drawn at full strength for one frame before it starts to fade. */
  private fresh = false;

  constructor(parent: HTMLElement, events: EventBus<GameEvents>) {
    this.element = document.createElement('div');
    this.element.id = 'damage-flash';
    Object.assign(this.element.style, {
      position: 'fixed',
      inset: '0',
      background:
        'radial-gradient(ellipse at center, transparent 45%, rgba(255, 30, 30, 0.75) 100%)',
      opacity: '0',
      pointerEvents: 'none',
      zIndex: '2',
    });
    parent.appendChild(this.element);
    events.on('player:damaged', ({ amount }) => {
      // With reduce-flashes on, a faint edge tint still signals the hit.
      const cap = Config.vfx.flashScale > 0 ? 1 : 0.25;
      this.strength = Math.min(cap, Math.max(this.strength, 0.35 + amount / 30));
      this.fresh = true;
    });
  }

  update(frameDelta: number): void {
    if (this.strength <= 0) return;
    // Without this a slow frame would fade the flash out before it was ever shown.
    if (this.fresh) this.fresh = false;
    else this.strength = Math.max(0, this.strength - frameDelta / Config.vfx.damageFlashTime);
    this.element.style.opacity = this.strength.toFixed(3);
  }
}
