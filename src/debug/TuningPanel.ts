import { Config } from '../core/Config';

type Section = Record<string, number>;

const SECTIONS = [
  'flight',
  'camera',
  'ground',
  'hero',
  'vfx',
  'audio',
  'gamepad',
  'world',
  'combat',
  'vitals',
  'enemies',
  'events',
  'missions',
  'titan',
] as const;
const SLIDER_STEPS = 300;

/**
 * Live sliders for every tunable in the listed Config sections (spec section 46).
 * Opened from the debug menu (Backquote, then 9). Opening releases pointer lock, which pauses the game;
 * click the game to resume with the new values. "Copy JSON" exports the result
 * so good values can be pasted back into Config.ts.
 */
export class TuningPanel {
  private readonly element: HTMLDivElement;
  private readonly defaults: Record<string, Section> = {};
  private readonly refreshers: Array<() => void> = [];
  private visible = false;

  constructor(parent: HTMLElement) {
    this.element = document.createElement('div');
    this.element.id = 'tuning-panel';
    Object.assign(this.element.style, {
      position: 'fixed',
      top: '0',
      right: '0',
      bottom: '0',
      width: '340px',
      overflowY: 'auto',
      padding: '10px 12px',
      boxSizing: 'border-box',
      background: 'rgba(8, 12, 24, 0.92)',
      color: '#dbe4f5',
      font: '12px/1.4 ui-monospace, Menlo, Consolas, monospace',
      zIndex: '20',
      display: 'none',
    });

    const header = document.createElement('div');
    Object.assign(header.style, { display: 'flex', gap: '8px', marginBottom: '8px' });
    const status = document.createElement('span');
    Object.assign(status.style, { marginLeft: 'auto', color: '#7fd0ff' });
    header.append(
      button('Copy JSON', () => void this.copy(status)),
      button('Reset', () => this.reset()),
      status,
    );
    this.element.append(header);

    for (const name of SECTIONS) {
      const section = Config[name] as Section;
      this.defaults[name] = { ...section };
      this.element.append(this.buildSection(name, section));
    }

    parent.appendChild(this.element);
  }

  dispose(): void {
    this.element.remove();
  }

  private buildSection(name: string, section: Section): HTMLElement {
    const details = document.createElement('details');
    details.open = name === 'flight' || name === 'camera';
    const summary = document.createElement('summary');
    summary.textContent = name;
    Object.assign(summary.style, { cursor: 'pointer', color: '#7fd0ff', margin: '6px 0' });
    details.append(summary);

    for (const key of Object.keys(section)) {
      const initial = section[key];
      if (typeof initial !== 'number') continue;
      const span = initial === 0 ? 1 : Math.abs(initial) * 3;
      const min = initial < 0 ? -span : 0;
      const max = initial < 0 ? 0 : span;

      const row = document.createElement('label');
      Object.assign(row.style, {
        display: 'grid',
        gridTemplateColumns: '130px 1fr 54px',
        alignItems: 'center',
        gap: '6px',
      });
      const label = document.createElement('span');
      label.textContent = key;
      label.title = key;
      Object.assign(label.style, { overflow: 'hidden', textOverflow: 'ellipsis' });
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = String(min);
      slider.max = String(max);
      slider.step = String((max - min) / SLIDER_STEPS);
      slider.dataset.key = `${name}.${key}`;
      const readout = document.createElement('span');
      readout.style.textAlign = 'right';

      const refresh = (): void => {
        const value = section[key] ?? 0;
        slider.value = String(value);
        readout.textContent = formatValue(value);
      };
      slider.addEventListener('input', () => {
        section[key] = Number(slider.value);
        readout.textContent = formatValue(section[key] ?? 0);
      });
      refresh();
      this.refreshers.push(refresh);

      row.append(label, slider, readout);
      details.append(row);
    }
    return details;
  }

  private reset(): void {
    for (const name of SECTIONS) Object.assign(Config[name], this.defaults[name]);
    for (const refresh of this.refreshers) refresh();
  }

  private async copy(status: HTMLElement): Promise<void> {
    const snapshot = Object.fromEntries(SECTIONS.map((name) => [name, Config[name]]));
    const json = JSON.stringify(snapshot, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      status.textContent = 'copied';
    } catch {
      console.log(json);
      status.textContent = 'see console';
    }
  }

  /** Shows or hides the panel. Opening releases pointer lock: sliders need the cursor. */
  toggle(): void {
    this.visible = !this.visible;
    this.element.style.display = this.visible ? 'block' : 'none';
    if (this.visible) document.exitPointerLock();
  }
}

function button(text: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement('button');
  element.textContent = text;
  Object.assign(element.style, {
    font: 'inherit',
    color: '#dbe4f5',
    background: '#1c2740',
    border: '1px solid #33425f',
    borderRadius: '3px',
    padding: '3px 8px',
    cursor: 'pointer',
  });
  element.addEventListener('click', onClick);
  return element;
}

function formatValue(value: number): string {
  const magnitude = Math.abs(value);
  if (magnitude >= 100) return value.toFixed(0);
  if (magnitude >= 10) return value.toFixed(1);
  if (magnitude >= 1) return value.toFixed(2);
  return value.toFixed(3);
}
