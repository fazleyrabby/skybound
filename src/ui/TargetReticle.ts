import { Vector3, type PerspectiveCamera } from 'three';
import type { Targeting } from '../combat/Targeting';

const SIZE = 44;

/**
 * Marks the current target: thin brackets for the soft auto-target, solid
 * while locked. Also a small fixed crosshair, so blasts can be aimed.
 */
export class TargetReticle {
  private readonly marker: HTMLDivElement;
  private readonly projected = new Vector3();

  constructor(
    parent: HTMLElement,
    private readonly camera: PerspectiveCamera,
    private readonly targeting: Targeting,
  ) {
    const crosshair = document.createElement('div');
    Object.assign(crosshair.style, {
      position: 'fixed',
      left: '50%',
      top: '50%',
      width: '4px',
      height: '4px',
      margin: '-2px 0 0 -2px',
      borderRadius: '50%',
      background: 'rgba(255, 255, 255, 0.7)',
      pointerEvents: 'none',
      zIndex: '3',
    });

    this.marker = document.createElement('div');
    this.marker.id = 'target-reticle';
    Object.assign(this.marker.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      width: `${SIZE}px`,
      height: `${SIZE}px`,
      margin: `${-SIZE / 2}px 0 0 ${-SIZE / 2}px`,
      borderRadius: '50%',
      boxSizing: 'border-box',
      pointerEvents: 'none',
      display: 'none',
      zIndex: '3',
    });
    parent.append(crosshair, this.marker);
  }

  update(): void {
    const target = this.targeting.current;
    if (!target) {
      this.marker.style.display = 'none';
      return;
    }
    this.projected.copy(target.position).project(this.camera);
    if (this.projected.z > 1) {
      this.marker.style.display = 'none'; // behind the camera
      return;
    }
    const x = (this.projected.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-this.projected.y * 0.5 + 0.5) * window.innerHeight;
    const locked = this.targeting.locked;
    this.marker.style.display = 'block';
    this.marker.dataset.locked = String(locked);
    this.marker.style.border = locked ? '3px solid #ff5d5d' : '2px dashed rgba(255, 255, 255, 0.8)';
    this.marker.style.transform = `translate(${x}px, ${y}px)`;
  }
}
