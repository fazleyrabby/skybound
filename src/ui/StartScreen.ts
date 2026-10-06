import { store, type GamePhase } from '../core/store';

const CONTROLS: ReadonlyArray<readonly [string, string]> = [
  ['Mouse', 'look / steer'],
  ['W / S', 'accelerate / brake'],
  ['A / D', 'strafe, turn in flight'],
  ['Space', 'jump, again to take off, hold to ascend'],
  ['C', 'descend / land'],
  ['Shift', 'boost'],
  ['Left mouse', 'punch, hold then release for heavy punch'],
  ['Right mouse', 'energy blast'],
  ['F', 'dash attack at the target'],
  ['Q', 'lock / unlock target'],
  ['Esc', 'pause'],
  ['F3', 'performance overlay'],
  ['`', 'tuning panel'],
  ['Gamepad', 'sticks, RT / LT throttle, A / B up / down, LB boost, X punch, Y blast, RB dash'],
];

/**
 * "Click to fly" gate (spec section 65). The click is the user gesture that
 * pointer lock needs. Shown again whenever the game is paused.
 */
export class StartScreen {
  private readonly element: HTMLDivElement;
  private readonly title: HTMLHeadingElement;
  private readonly prompt: HTMLParagraphElement;
  private readonly unsubscribe: () => void;

  constructor(parent: HTMLElement, onStart: () => void) {
    this.element = document.createElement('div');
    this.element.id = 'start-screen';
    Object.assign(this.element.style, {
      position: 'fixed',
      inset: '0',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '14px',
      background: 'rgba(8, 12, 24, 0.72)',
      color: '#e8ecf5',
      font: '15px/1.5 system-ui, sans-serif',
      cursor: 'pointer',
      userSelect: 'none',
      zIndex: '5',
    });

    this.title = document.createElement('h1');
    Object.assign(this.title.style, { margin: '0', fontSize: '44px', letterSpacing: '0.2em' });

    this.prompt = document.createElement('p');
    Object.assign(this.prompt.style, { margin: '0 0 10px', fontSize: '18px', color: '#7fd0ff' });

    const controls = document.createElement('dl');
    Object.assign(controls.style, {
      display: 'grid',
      gridTemplateColumns: 'auto auto',
      gap: '4px 18px',
      margin: '0',
    });
    for (const [key, description] of CONTROLS) {
      const term = document.createElement('dt');
      term.textContent = key;
      Object.assign(term.style, { fontWeight: '600', textAlign: 'right' });
      const detail = document.createElement('dd');
      detail.textContent = description;
      Object.assign(detail.style, { margin: '0', color: '#b4bdd0' });
      controls.append(term, detail);
    }

    this.element.append(this.title, this.prompt, controls);
    this.element.addEventListener('click', onStart);
    parent.appendChild(this.element);

    this.render(store.getState().phase);
    this.unsubscribe = store.subscribe((state) => this.render(state.phase));
  }

  dispose(): void {
    this.unsubscribe();
    this.element.remove();
  }

  private render(phase: GamePhase): void {
    this.element.style.display = phase === 'running' ? 'none' : 'flex';
    this.title.textContent = phase === 'paused' ? 'PAUSED' : 'SKYBOUND';
    this.prompt.textContent =
      phase === 'boot' ? 'Loading…' : phase === 'paused' ? 'Click to resume' : 'Click to fly';
  }
}
