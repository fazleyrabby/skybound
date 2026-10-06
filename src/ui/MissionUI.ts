import type { PerspectiveCamera, Vector3 } from 'three';
import type { MissionManager } from '../missions/MissionManager';
import { ScreenMarker } from './ScreenMarker';

const REFRESH_INTERVAL = 1 / 10;

/**
 * Mission HUD (spec section 43): the current objective and progress, a marker
 * on where to go, the prompt at a start beacon, and the result.
 */
export class MissionUI {
  private readonly panel: HTMLDivElement;
  private readonly prompt: HTMLDivElement;
  private readonly marker: ScreenMarker;
  private sinceRefresh = REFRESH_INTERVAL;

  constructor(
    parent: HTMLElement,
    private readonly camera: PerspectiveCamera,
    private readonly missions: MissionManager,
    private readonly playerPosition: Vector3,
  ) {
    this.panel = block('mission-panel', {
      top: '9%',
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '8px 18px',
      background: 'rgba(8, 12, 24, 0.72)',
      borderRadius: '4px',
      font: '600 16px/1.45 system-ui, sans-serif',
      textAlign: 'center',
      whiteSpace: 'pre',
    });
    this.prompt = block('mission-prompt', {
      bottom: '22%',
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '8px 16px',
      background: 'rgba(8, 12, 24, 0.78)',
      border: '1px solid rgba(127, 208, 255, 0.6)',
      borderRadius: '4px',
      color: '#e8ecf5',
      font: '15px/1.45 system-ui, sans-serif',
      textAlign: 'center',
      whiteSpace: 'pre',
    });
    parent.append(this.panel, this.prompt);
    this.marker = new ScreenMarker(parent, 'mission-marker', 'rgba(110, 220, 255, 0.92)');
  }

  update(frameDelta: number): void {
    this.updateMarker();
    this.sinceRefresh += frameDelta;
    if (this.sinceRefresh < REFRESH_INTERVAL) return;
    this.sinceRefresh = 0;
    this.updatePanel();
    this.updatePrompt();
  }

  private updatePanel(): void {
    const { active, objective, result, stepText } = this.missions;
    const panel = this.panel;
    if (active && objective) {
      const progress = objective.progress();
      panel.style.display = 'block';
      panel.style.color = '#8fdcff';
      panel.dataset.state = 'active';
      panel.textContent =
        `${active.title.toUpperCase()}  ·  step ${stepText}\n` +
        objective.label +
        (progress ? `  ·  ${progress}` : '');
    } else if (result) {
      panel.style.display = 'block';
      panel.dataset.state = result.outcome;
      if (result.outcome === 'complete') {
        panel.style.color = '#7dffa0';
        panel.textContent = `MISSION COMPLETE  ·  ${result.title}  ·  +${result.reward}`;
      } else {
        panel.style.color = '#c9d1e0';
        panel.textContent = `Mission abandoned  ·  ${result.title}`;
      }
    } else {
      panel.style.display = 'none';
      panel.dataset.state = 'none';
    }
  }

  private updatePrompt(): void {
    const offered = this.missions.offered;
    if (!offered) {
      this.prompt.style.display = 'none';
      return;
    }
    const done = this.missions.isCompleted(offered.id) ? '  ✓' : '';
    this.prompt.style.display = 'block';
    this.prompt.textContent = `${offered.title.toUpperCase()}${done}\n${offered.brief}\nPress E to start`;
  }

  private updateMarker(): void {
    const target = this.missions.target;
    if (!target) {
      this.marker.hide();
      return;
    }
    const distance = Math.round(
      Math.hypot(
        target.x - this.playerPosition.x,
        target.y - this.playerPosition.y,
        target.z - this.playerPosition.z,
      ),
    );
    this.marker.show(this.camera, target.x, target.y, target.z, `◎ ${distance} m`);
  }
}

function block(id: string, style: Partial<CSSStyleDeclaration>): HTMLDivElement {
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
