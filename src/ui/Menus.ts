import { SETTING_RANGES, type Settings } from '../core/Settings';
import { store, type GamePhase } from '../core/store';
import type { MissionManager } from '../missions/MissionManager';

type PanelName = 'controls' | 'settings' | 'missions' | 'credits';

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
  ['E', 'start the mission at a beacon'],
  ['X', 'abandon mission'],
  ['Esc', 'pause'],
  ['Gamepad', 'sticks, RT / LT throttle, A / B up / down, LB boost, X punch, Y blast, RB dash'],
];

const SLIDERS: ReadonlyArray<readonly [keyof typeof SETTING_RANGES, string, number]> = [
  ['sensitivity', 'Look sensitivity', 0.05],
  ['fov', 'Field of view', 1],
  ['fovKick', 'Speed FOV effect', 0.05],
  ['cameraShake', 'Camera shake', 0.05],
  ['masterVolume', 'Master volume', 0.05],
  ['musicVolume', 'Music volume', 0.05],
  ['sfxVolume', 'Effects volume', 0.05],
];
const TOGGLES: ReadonlyArray<readonly [keyof Settings, string]> = [
  ['invertY', 'Invert vertical look'],
  ['speedEffects', 'Speed lines'],
  ['reduceFlashes', 'Reduce flashes'],
  ['showHints', 'Control hints'],
];
const QUALITY = ['auto', 'MOBILE', 'LOW', 'MEDIUM', 'HIGH', 'ULTRA'] as const;

const CREDITS = [
  'SKYBOUND is a working title.',
  'Built with Three.js, Rapier, Zustand, Vite and TypeScript.',
  'Code, the Aether model, sound and music were made for this project with Claude Code.',
  'No third-party art or audio assets are used.',
];

/**
 * Title and pause screens (spec section 43, Phase 15). Clicking the backdrop
 * or the big prompt starts or resumes: that click is the user gesture pointer
 * lock and audio need. The panels underneath (controls, settings, missions,
 * credits) swallow their own clicks.
 */
export class Menus {
  private readonly root: HTMLDivElement;
  private readonly title: HTMLHeadingElement;
  private readonly prompt: HTMLParagraphElement;
  private readonly panel: HTMLDivElement;
  private readonly tabs = new Map<PanelName, HTMLButtonElement>();
  private current: PanelName = 'controls';

  constructor(
    parent: HTMLElement,
    private readonly missions: MissionManager,
    private readonly onStart: () => void,
  ) {
    this.root = el('div', {
      position: 'fixed',
      inset: '0',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '12px',
      background: 'rgba(8, 12, 24, 0.78)',
      color: '#e8ecf5',
      font: '15px/1.5 system-ui, sans-serif',
      cursor: 'pointer',
      userSelect: 'none',
      zIndex: '5',
    });
    this.root.id = 'start-screen';
    this.root.addEventListener('click', onStart);

    this.title = el('h1', { margin: '0', fontSize: '44px', letterSpacing: '0.2em' });
    this.prompt = el('p', {
      margin: '0 0 6px',
      padding: '6px 22px',
      fontSize: '18px',
      color: '#7fd0ff',
      border: '1px solid rgba(127, 208, 255, 0.5)',
      borderRadius: '4px',
    });
    this.prompt.id = 'start-prompt';

    const nav = el('div', { display: 'flex', gap: '8px', cursor: 'default' });
    nav.addEventListener('click', (event) => event.stopPropagation());
    for (const name of ['controls', 'settings', 'missions', 'credits'] as const) {
      const tab = button(name[0]?.toUpperCase() + name.slice(1), () => this.show(name));
      tab.dataset.tab = name;
      this.tabs.set(name, tab);
      nav.appendChild(tab);
    }

    this.panel = el('div', {
      width: 'min(560px, 88vw)',
      maxHeight: '52vh',
      overflowY: 'auto',
      padding: '14px 18px',
      background: 'rgba(16, 22, 38, 0.9)',
      border: '1px solid #2c3956',
      borderRadius: '6px',
      cursor: 'default',
    });
    this.panel.id = 'menu-panel';
    this.panel.addEventListener('click', (event) => event.stopPropagation());

    this.root.append(this.title, this.prompt, nav, this.panel);
    parent.appendChild(this.root);

    this.renderPhase(store.getState().phase);
    this.show('controls');
    store.subscribe((state, previous) => {
      if (state.phase !== previous.phase) {
        this.renderPhase(state.phase);
        // The mission list changes while playing; refresh it when the menu reappears.
        if (state.phase !== 'running') this.show(this.current);
      }
    });
  }

  private renderPhase(phase: GamePhase): void {
    this.root.style.display = phase === 'running' ? 'none' : 'flex';
    this.title.textContent = phase === 'paused' ? 'PAUSED' : 'SKYBOUND';
    this.prompt.textContent =
      phase === 'boot' ? 'Loading…' : phase === 'paused' ? 'Click to resume' : 'Click to fly';
  }

  private show(name: PanelName): void {
    this.current = name;
    for (const [tabName, tab] of this.tabs) {
      tab.style.background = tabName === name ? '#2a3a5e' : '#1c2740';
    }
    this.panel.replaceChildren();
    this.panel.dataset.panel = name;
    if (name === 'controls') this.renderControls();
    else if (name === 'settings') this.renderSettings();
    else if (name === 'missions') this.renderMissions();
    else for (const line of CREDITS) this.panel.appendChild(el('p', { margin: '0 0 8px' }, line));
  }

  private renderControls(): void {
    const list = el('dl', {
      display: 'grid',
      gridTemplateColumns: 'auto 1fr',
      gap: '4px 16px',
      margin: '0',
    });
    for (const [key, description] of CONTROLS) {
      list.append(
        el('dt', { fontWeight: '600', textAlign: 'right' }, key),
        el('dd', { margin: '0', color: '#b4bdd0' }, description),
      );
    }
    this.panel.appendChild(list);
  }

  private renderSettings(): void {
    const settings = store.getState().settings;
    const grid = el('div', {
      display: 'grid',
      gridTemplateColumns: '1fr 1.2fr auto',
      alignItems: 'center',
      gap: '8px 12px',
    });

    for (const [key, label, step] of SLIDERS) {
      const [min, max] = SETTING_RANGES[key];
      const input = el('input', {});
      input.type = 'range';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(settings[key]);
      input.dataset.setting = key;
      const readout = el(
        'span',
        { minWidth: '36px', textAlign: 'right' },
        formatValue(settings[key]),
      );
      input.addEventListener('input', () => {
        store.getState().setSetting(key, Number(input.value));
        readout.textContent = formatValue(Number(input.value));
      });
      grid.append(el('label', {}, label), input, readout);
    }

    for (const [key, label] of TOGGLES) {
      const input = el('input', { justifySelf: 'start' });
      input.type = 'checkbox';
      input.checked = settings[key] === true;
      input.dataset.setting = key;
      input.addEventListener('change', () =>
        store.getState().setSetting(key, input.checked as never),
      );
      grid.append(el('label', {}, label), input, el('span', {}));
    }

    const quality = el('select', { font: 'inherit', padding: '2px 4px' });
    quality.dataset.setting = 'quality';
    for (const choice of QUALITY) {
      const option = el(
        'option',
        {},
        choice === 'auto' ? 'Auto' : choice[0] + choice.slice(1).toLowerCase(),
      );
      option.value = choice;
      quality.appendChild(option);
    }
    quality.value = settings.quality;
    quality.addEventListener('change', () =>
      store.getState().setSetting('quality', quality.value as Settings['quality']),
    );
    grid.append(el('label', {}, 'Graphics quality'), quality, el('span', {}));

    const reset = button('Reset to defaults', () => {
      store.getState().resetSettings();
      this.show('settings');
    });
    reset.dataset.action = 'reset-settings';
    this.panel.append(grid, el('div', { marginTop: '12px' }), reset);
  }

  private renderMissions(): void {
    const { missions } = this;
    if (missions.active) {
      const row = el('div', {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '12px',
      });
      const abandon = button('Abandon', () => {
        missions.abandon();
        this.show('missions');
      });
      abandon.dataset.action = 'abandon';
      row.append(el('span', { flex: '1' }, `In progress: ${missions.active.title}`), abandon);
      this.panel.appendChild(row);
    }

    for (const mission of missions.all) {
      const done = missions.isCompleted(mission.id);
      const unlocked = missions.isUnlocked(mission);
      const required = missions.all.find((other) => other.id === mission.requires);
      const row = el('div', {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '8px 0',
        borderTop: '1px solid #26324c',
        opacity: unlocked ? '1' : '0.55',
      });
      const text = el('div', { flex: '1' });
      text.append(
        el('div', { fontWeight: '600' }, `${mission.title}${done ? '  ✓' : ''}`),
        el(
          'div',
          { color: '#b4bdd0', fontSize: '13px' },
          unlocked
            ? `${mission.brief}  ·  +${mission.reward}`
            : `Locked: complete ${required?.title ?? 'the previous mission'} first`,
        ),
      );
      const start = button(done ? 'Replay' : 'Start', () => {
        if (missions.start(mission.id)) this.onStart();
      });
      start.dataset.mission = mission.id;
      start.disabled = !unlocked || missions.active !== null;
      if (start.disabled) start.style.opacity = '0.5';
      row.append(text, start);
      this.panel.appendChild(row);
    }
  }
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  style: Partial<CSSStyleDeclaration>,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node.style, style);
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(text: string, onClick: () => void): HTMLButtonElement {
  const node = el(
    'button',
    {
      font: 'inherit',
      color: '#e8ecf5',
      background: '#1c2740',
      border: '1px solid #33425f',
      borderRadius: '4px',
      padding: '5px 12px',
      cursor: 'pointer',
    },
    text,
  );
  node.addEventListener('click', (event) => {
    event.stopPropagation();
    onClick();
  });
  return node;
}

function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
