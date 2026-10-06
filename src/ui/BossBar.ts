import { Config } from '../core/Config';
import type { Titan } from '../enemies/boss/Titan';

/**
 * Boss health across the top of the screen, with notches at the phase
 * thresholds, and the name card during the reveal.
 */
export class BossBar {
  private readonly root: HTMLDivElement;
  private readonly fill: HTMLDivElement;
  private readonly label: HTMLDivElement;
  private readonly title: HTMLDivElement;

  constructor(
    parent: HTMLElement,
    private readonly titan: Titan,
  ) {
    this.root = document.createElement('div');
    this.root.id = 'boss-bar';
    Object.assign(this.root.style, {
      position: 'fixed',
      top: '18px',
      left: '50%',
      width: 'min(560px, 60vw)',
      transform: 'translateX(-50%)',
      display: 'none',
      pointerEvents: 'none',
      zIndex: '3',
      font: '700 13px/1.3 system-ui, sans-serif',
      letterSpacing: '0.18em',
      color: '#ffd9cf',
      textAlign: 'center',
    });
    this.label = document.createElement('div');
    const track = document.createElement('div');
    Object.assign(track.style, {
      position: 'relative',
      height: '12px',
      marginTop: '4px',
      background: 'rgba(8, 12, 24, 0.7)',
      border: '1px solid rgba(255, 255, 255, 0.3)',
      borderRadius: '3px',
      overflow: 'hidden',
    });
    this.fill = document.createElement('div');
    Object.assign(this.fill.style, {
      height: '100%',
      background: 'linear-gradient(90deg, #ff5a3c, #ffb347)',
      transformOrigin: 'left',
    });
    track.appendChild(this.fill);
    for (const threshold of [Config.titan.phase2At, Config.titan.phase3At]) {
      const notch = document.createElement('div');
      Object.assign(notch.style, {
        position: 'absolute',
        top: '0',
        bottom: '0',
        left: `${threshold * 100}%`,
        width: '2px',
        background: 'rgba(255, 255, 255, 0.75)',
      });
      track.appendChild(notch);
    }
    this.root.append(this.label, track);

    this.title = document.createElement('div');
    this.title.id = 'boss-title';
    Object.assign(this.title.style, {
      position: 'fixed',
      left: '0',
      right: '0',
      top: '34%',
      display: 'none',
      textAlign: 'center',
      color: '#fff1ec',
      font: '800 72px/1 system-ui, sans-serif',
      letterSpacing: '0.35em',
      textShadow: '0 4px 30px rgba(255, 60, 20, 0.8)',
      pointerEvents: 'none',
      zIndex: '3',
    });
    this.title.textContent = 'TITAN';
    parent.append(this.root, this.title);
  }

  update(): void {
    const titan = this.titan;
    this.root.style.display = titan.alive ? 'block' : 'none';
    this.title.style.display = titan.alive && titan.state === 'INTRO' ? 'block' : 'none';
    if (!titan.alive) return;
    this.fill.style.transform = `scaleX(${titan.healthFraction})`;
    this.root.dataset.phase = String(titan.phase);
    this.label.textContent = `TITAN  ·  PHASE ${titan.phase}`;
  }
}
