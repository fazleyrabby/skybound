import { Vector3, type PerspectiveCamera } from 'three';
import { store } from '../core/store';
import type { WorldEvents } from '../world/WorldEvents';

const EDGE = 0.86;
const REFRESH_INTERVAL = 1 / 10;

/**
 * Everything the player sees about world events: a banner with the event,
 * its status and clock; a marker on the site that slides to the screen edge
 * when the site is out of view; the result; and the running score.
 */
export class EventUI {
  private readonly banner: HTMLDivElement;
  private readonly marker: HTMLDivElement;
  private readonly score: HTMLDivElement;
  private readonly projected = new Vector3();
  private sinceRefresh = REFRESH_INTERVAL;

  constructor(
    parent: HTMLElement,
    private readonly camera: PerspectiveCamera,
    private readonly worldEvents: WorldEvents,
    private readonly playerPosition: Vector3,
  ) {
    this.banner = element('event-banner', {
      top: '9%',
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '8px 18px',
      background: 'rgba(8, 12, 24, 0.72)',
      borderRadius: '4px',
      font: '600 16px/1.4 system-ui, sans-serif',
      letterSpacing: '0.04em',
      textAlign: 'center',
      whiteSpace: 'nowrap',
    });
    this.marker = element('event-marker', {
      left: '0',
      top: '0',
      padding: '3px 8px',
      background: 'rgba(255, 120, 40, 0.9)',
      color: '#10141f',
      borderRadius: '10px',
      font: '700 12px/1.3 system-ui, sans-serif',
      whiteSpace: 'nowrap',
    });
    this.score = element('score', {
      top: '18px',
      right: '24px',
      color: '#e8ecf5',
      font: '600 15px/1.3 ui-monospace, Menlo, monospace',
      textShadow: '0 1px 3px rgba(0, 0, 0, 0.7)',
    });
    parent.append(this.banner, this.marker, this.score);
  }

  update(frameDelta: number): void {
    this.updateMarker();
    this.sinceRefresh += frameDelta;
    if (this.sinceRefresh < REFRESH_INTERVAL) return;
    this.sinceRefresh = 0;
    this.updateBanner();
  }

  private updateBanner(): void {
    const events = this.worldEvents;
    const { score } = store.getState();
    this.score.style.display = score > 0 ? 'block' : 'none';
    this.score.textContent = `SCORE ${score}`;

    const banner = this.banner;
    banner.dataset.phase = events.phase;
    if (events.phase === 'IDLE') {
      banner.style.display = 'none';
      return;
    }
    banner.style.display = 'block';
    if (events.phase === 'SUCCESS') {
      banner.style.color = '#7dffa0';
      banner.textContent = `CLEARED  +${events.lastReward}`;
    } else if (events.phase === 'FAILURE') {
      banner.style.color = '#ff8a7a';
      banner.textContent = 'TOO LATE — THEY GOT AWAY';
    } else if (events.current) {
      const event = events.current;
      banner.style.color = '#ffb070';
      const clock = events.phase === 'ENGAGED' ? '' : `  ·  ${formatClock(events.timeLeft)}`;
      banner.textContent = `${event.title.toUpperCase()}  ·  ${event.site.name}  ·  ${event.status()}${clock}`;
    }
  }

  private updateMarker(): void {
    const event = this.worldEvents.current;
    if (!event) {
      this.marker.style.display = 'none';
      return;
    }
    const site = event.site;
    this.projected.set(site.x, site.y, site.z).project(this.camera);
    let { x, y } = this.projected;
    // Behind the camera the projection mirrors; flip it and push it to the edge.
    const behind = this.projected.z > 1;
    if (behind) {
      x = -x;
      y = -y;
    }
    const overflow = Math.max(Math.abs(x), Math.abs(y));
    if (behind || overflow > EDGE) {
      const scale = EDGE / Math.max(overflow, 1e-3);
      x *= scale;
      y *= scale;
    }
    const distance = Math.round(
      Math.hypot(
        site.x - this.playerPosition.x,
        site.y - this.playerPosition.y,
        site.z - this.playerPosition.z,
      ),
    );
    const marker = this.marker;
    marker.style.display = 'block';
    marker.textContent = `◆ ${distance} m`;
    const px = (x * 0.5 + 0.5) * window.innerWidth;
    const py = (-y * 0.5 + 0.5) * window.innerHeight;
    marker.style.transform = `translate(${px}px, ${py}px) translate(-50%, -50%)`;
  }
}

function element(id: string, style: Partial<CSSStyleDeclaration>): HTMLDivElement {
  const node = document.createElement('div');
  node.id = id;
  Object.assign(node.style, {
    position: 'fixed',
    display: 'none',
    pointerEvents: 'none',
    zIndex: '3',
    ...style,
  });
  return node;
}

function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
