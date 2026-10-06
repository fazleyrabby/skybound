import { Vector3, type PerspectiveCamera } from 'three';

const EDGE = 0.86;
const projected = new Vector3();

/**
 * A label pinned to a world position. When the position is off screen or
 * behind the camera the label slides to the nearest screen edge, so it always
 * shows which way to turn.
 */
export class ScreenMarker {
  readonly element: HTMLDivElement;

  constructor(parent: HTMLElement, id: string, background: string) {
    this.element = document.createElement('div');
    this.element.id = id;
    Object.assign(this.element.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      display: 'none',
      padding: '3px 8px',
      background,
      color: '#10141f',
      borderRadius: '10px',
      font: '700 12px/1.3 system-ui, sans-serif',
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
      zIndex: '3',
    });
    parent.appendChild(this.element);
  }

  hide(): void {
    this.element.style.display = 'none';
  }

  show(camera: PerspectiveCamera, x: number, y: number, z: number, text: string): void {
    projected.set(x, y, z).project(camera);
    let screenX = projected.x;
    let screenY = projected.y;
    // Behind the camera the projection mirrors; flip it and push it to the edge.
    const behind = projected.z > 1;
    if (behind) {
      screenX = -screenX;
      screenY = -screenY;
    }
    const overflow = Math.max(Math.abs(screenX), Math.abs(screenY));
    if (behind || overflow > EDGE) {
      const scale = EDGE / Math.max(overflow, 1e-3);
      screenX *= scale;
      screenY *= scale;
    }
    const px = (screenX * 0.5 + 0.5) * window.innerWidth;
    const py = (-screenY * 0.5 + 0.5) * window.innerHeight;
    this.element.style.display = 'block';
    this.element.textContent = text;
    this.element.style.transform = `translate(${px}px, ${py}px) translate(-50%, -50%)`;
  }
}
