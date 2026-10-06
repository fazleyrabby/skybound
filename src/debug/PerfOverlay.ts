import { Config } from '../core/Config';
import { toDisplaySpeed } from '../ui/speed';
import { store } from '../core/store';

export interface PerfSample {
  simMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  pixelRatio: number;
  bodies: number;
  steps: number;
  /** Player speed in m/s. */
  speed: number;
  flightState: string;
}

/** F3 performance overlay (spec section 39). Refreshes at a low rate. */
export class PerfOverlay {
  private readonly element: HTMLPreElement;
  private readonly unsubscribe: () => void;

  private frames = 0;
  private elapsed = 0;
  private worstFrame = 0;

  constructor(parent: HTMLElement) {
    this.element = document.createElement('pre');
    this.element.id = 'perf-overlay';
    Object.assign(this.element.style, {
      position: 'fixed',
      top: '8px',
      left: '8px',
      margin: '0',
      padding: '8px 10px',
      background: 'rgba(8, 12, 24, 0.75)',
      color: '#b8f7c8',
      font: '12px/1.45 ui-monospace, Menlo, Consolas, monospace',
      borderRadius: '4px',
      pointerEvents: 'none',
      zIndex: '10',
    });
    parent.appendChild(this.element);

    this.setVisible(store.getState().perfOverlayVisible);
    this.unsubscribe = store.subscribe((state) => this.setVisible(state.perfOverlayVisible));
    window.addEventListener('keydown', this.onKeyDown);
  }

  /** Call once per rendered frame. `sample` is only read when the overlay refreshes. */
  update(frameDelta: number, sample: () => PerfSample): void {
    this.frames++;
    this.elapsed += frameDelta;
    this.worstFrame = Math.max(this.worstFrame, frameDelta);

    const s = this.elapsed >= 1 / Config.debug.overlayHz ? sample() : null;
    if (!s) return;

    if (store.getState().perfOverlayVisible) {
      const avgMs = (this.elapsed / this.frames) * 1000;
      this.element.textContent = [
        `FPS: ${(1000 / avgMs).toFixed(0)}   Frame: ${avgMs.toFixed(1)} ms (max ${(this.worstFrame * 1000).toFixed(1)})   Sim: ${s.simMs.toFixed(2)} ms`,
        `Draw Calls: ${s.drawCalls}   Triangles: ${formatCount(s.triangles)}`,
        `Geometries: ${s.geometries}   Textures: ${s.textures}`,
        `Bodies: ${s.bodies}   Steps: ${s.steps}   DPR: ${s.pixelRatio.toFixed(2)}`,
        `Speed: ${s.speed.toFixed(0)} m/s (${toDisplaySpeed(s.speed).toFixed(0)} km/h)   State: ${s.flightState}`,
      ].join('\n');
    }

    this.frames = 0;
    this.elapsed = 0;
    this.worstFrame = 0;
  }

  dispose(): void {
    this.unsubscribe();
    window.removeEventListener('keydown', this.onKeyDown);
    this.element.remove();
  }

  private setVisible(visible: boolean): void {
    this.element.style.display = visible ? 'block' : 'none';
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== 'F3') return;
    event.preventDefault(); // F3 is "find next" in most browsers
    store.getState().togglePerfOverlay();
  };
}

function formatCount(value: number): string {
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
  return String(value);
}
