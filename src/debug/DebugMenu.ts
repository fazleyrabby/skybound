/** One entry of the debug menu: a digit key, a label, and what it does. */
export interface DebugAction {
  key: string;
  label: string;
  run(): void;
}

/**
 * Developer menu (spec section 46). Backquote opens it; while it is open the
 * number keys run its actions. F-keys are not used: the browser owns most of them.
 */
export class DebugMenu {
  private readonly element: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private visible = false;

  constructor(
    parent: HTMLElement,
    private readonly actions: readonly DebugAction[],
  ) {
    this.element = document.createElement('div');
    this.element.id = 'debug-menu';
    Object.assign(this.element.style, {
      position: 'fixed',
      left: '8px',
      bottom: '8px',
      padding: '10px 14px',
      background: 'rgba(8, 12, 24, 0.9)',
      color: '#dbe4f5',
      font: '12px/1.6 ui-monospace, Menlo, Consolas, monospace',
      borderRadius: '4px',
      display: 'none',
      zIndex: '20',
      pointerEvents: 'none',
    });
    const heading = document.createElement('div');
    heading.textContent = 'DEBUG  (` to close)';
    heading.style.color = '#7fd0ff';
    this.element.appendChild(heading);
    for (const action of actions) {
      const row = document.createElement('div');
      row.textContent = `${action.key}  ${action.label}`;
      this.element.appendChild(row);
    }
    this.status = document.createElement('div');
    this.status.id = 'debug-status';
    this.status.style.color = '#ffc24d';
    this.element.appendChild(this.status);
    parent.appendChild(this.element);
    window.addEventListener('keydown', this.onKeyDown);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.element.remove();
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Backquote') {
      event.preventDefault();
      this.visible = !this.visible;
      this.element.style.display = this.visible ? 'block' : 'none';
      return;
    }
    if (!this.visible || !event.code.startsWith('Digit')) return;
    const action = this.actions.find((candidate) => candidate.key === event.code.slice(5));
    if (!action) return;
    event.preventDefault();
    action.run();
    this.status.textContent = `> ${action.label}`;
  };
}
