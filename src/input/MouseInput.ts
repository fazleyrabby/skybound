/** Pointer lock and relative mouse movement (spec section 65). */
export class MouseInput {
  private dx = 0;
  private dy = 0;
  private skipNext = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onLockChange: (locked: boolean) => void,
    private readonly onButton: (button: number, down: boolean) => void,
  ) {
    document.addEventListener('pointerlockchange', this.handleLockChange);
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('mousedown', this.handleMouseDown);
    document.addEventListener('mouseup', this.handleMouseUp);
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  get locked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  /**
   * Must be called from a user gesture. Browsers rate-limit re-locking for about
   * a second after Esc, so a failed request is tolerated; the next click retries.
   */
  async requestLock(): Promise<void> {
    try {
      await this.canvas.requestPointerLock();
    } catch {
      // Stay unlocked; the start screen remains visible for another attempt.
    }
  }

  /** Returns accumulated movement in pixels since the last call and resets it. */
  consume(out: { dx: number; dy: number }): void {
    out.dx = this.dx;
    out.dy = this.dy;
    this.dx = 0;
    this.dy = 0;
  }

  dispose(): void {
    document.removeEventListener('pointerlockchange', this.handleLockChange);
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mousedown', this.handleMouseDown);
    document.removeEventListener('mouseup', this.handleMouseUp);
  }

  private readonly handleLockChange = (): void => {
    this.dx = 0;
    this.dy = 0;
    // Some browsers report one large jump on the first event after locking.
    this.skipNext = this.locked;
    this.onLockChange(this.locked);
  };

  // Buttons only count while playing; the click that starts the game is not a punch.
  private readonly handleMouseDown = (event: MouseEvent): void => {
    if (this.locked) this.onButton(event.button, true);
  };

  private readonly handleMouseUp = (event: MouseEvent): void => {
    if (this.locked) this.onButton(event.button, false);
  };

  private readonly handleMouseMove = (event: MouseEvent): void => {
    if (!this.locked) return;
    if (this.skipNext) {
      this.skipNext = false;
      return;
    }
    this.dx += event.movementX;
    this.dy += event.movementY;
  };
}
