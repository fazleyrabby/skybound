import { Vector3 } from 'three';

export interface ClothShape {
  columns: number;
  rows: number;
  /** Width at the pinned top edge and at the free bottom edge, metres. */
  topWidth: number;
  bottomWidth: number;
  length: number;
  gravity: number;
  /** Velocity kept per second. */
  damping: number;
  backPush: number;
  airDrag: number;
  flutter: number;
  iterations: number;
}

/** A capsule the cloth must stay outside of. */
export interface ClothCollider {
  a: Vector3;
  b: Vector3;
  radius: number;
}

const MAX_STEP = 1 / 90;
const MAX_SUBSTEPS = 5;
/** How much longer than its rest length a strand may get. Stops the cape stretching at speed. */
const MAX_STRETCH = 1.03;
/** An anchor jump larger than this is a teleport, not motion. */
const TELEPORT_DISTANCE = 30;

const delta = new Vector3();
const point = new Vector3();
const above = new Vector3();
const closest = new Vector3();
const segment = new Vector3();
const stepLeft = new Vector3();
const stepRight = new Vector3();

/**
 * A cape as a grid of points with the top row pinned: Verlet integration,
 * distance constraints, and a hard length limit so it cannot stretch however
 * fast its anchors move. Simulated in world space, so it trails behind motion
 * by itself: hanging at rest, streaming straight back in flight. Pure maths,
 * no rendering.
 */
export class ClothStrip {
  /** World-space positions, row by row from the pinned top: x, y, z per point. */
  readonly positions: Float32Array;
  private readonly previous: Float32Array;
  private readonly lastLeft = new Vector3();
  private readonly lastRight = new Vector3();
  private initialised = false;
  private time = 0;

  constructor(readonly shape: ClothShape) {
    this.positions = new Float32Array(shape.columns * shape.rows * 3);
    this.previous = new Float32Array(this.positions.length);
  }

  /** Hangs the cloth straight down from its anchors, at rest. */
  reset(left: Vector3, right: Vector3): void {
    const { columns, rows, length } = this.shape;
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        this.restPoint(left, right, row, column, point);
        point.y -= (row / (rows - 1)) * length;
        point.toArray(this.positions, (row * columns + column) * 3);
      }
    }
    this.previous.set(this.positions);
    this.lastLeft.copy(left);
    this.lastRight.copy(right);
    this.initialised = true;
  }

  /**
   * Advances the cloth. `left` and `right` are where the top corners are
   * pinned; `back` is the unit direction away from the wearer's back;
   * `airspeed` is how fast the wearer is moving.
   */
  update(
    frameDelta: number,
    left: Vector3,
    right: Vector3,
    back: Vector3,
    airspeed: number,
    colliders: readonly ClothCollider[],
  ): void {
    if (!this.initialised || left.distanceTo(this.lastLeft) > TELEPORT_DISTANCE) {
      this.reset(left, right);
      return;
    }
    const steps = Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil(frameDelta / MAX_STEP)));
    const dt = Math.min(frameDelta / steps, MAX_STEP * 2);
    // Move the anchors a little each sub-step. Jumping them once per frame makes the
    // cloth overshoot on the later sub-steps and fold forward over the shoulders.
    for (let i = 1; i <= steps; i++) {
      stepLeft.lerpVectors(this.lastLeft, left, i / steps);
      stepRight.lerpVectors(this.lastRight, right, i / steps);
      this.step(dt, stepLeft, stepRight, back, airspeed, colliders);
    }
    this.lastLeft.copy(left);
    this.lastRight.copy(right);
  }

  private step(
    dt: number,
    left: Vector3,
    right: Vector3,
    back: Vector3,
    airspeed: number,
    colliders: readonly ClothCollider[],
  ): void {
    const { columns, rows, gravity, damping, backPush, airDrag, flutter, iterations, length } =
      this.shape;
    const positions = this.positions;
    const previous = this.previous;
    const keep = Math.pow(damping, dt * 60);
    const restDown = length / (rows - 1);
    this.time += dt;

    // Integrate the free points.
    for (let row = 1; row < rows; row++) {
      const depth = row / (rows - 1);
      for (let column = 0; column < columns; column++) {
        const i = (row * columns + column) * 3;
        // Flutter: travelling ripples, stronger lower down and with airspeed.
        const ripple =
          Math.sin(this.time * 9 + depth * 7 + column * 0.9) * flutter * airspeed * depth;
        const ax = back.x * backPush + ripple * back.z;
        const ay = -gravity + ripple * 0.35;
        const az = back.z * backPush - ripple * back.x;
        const x = positions[i] ?? 0;
        const y = positions[i + 1] ?? 0;
        const z = positions[i + 2] ?? 0;
        let vx = (x - (previous[i] ?? x)) * keep;
        let vy = (y - (previous[i + 1] ?? y)) * keep;
        let vz = (z - (previous[i + 2] ?? z)) * keep;
        // Drag against still air, growing with the square of speed: negligible on
        // foot, overwhelming in flight, which is what lays the cape out behind.
        const speed = Math.hypot(vx, vy, vz) / dt;
        const slow = 1 / (1 + airDrag * speed * dt);
        vx *= slow;
        vy *= slow;
        vz *= slow;
        positions[i] = x + vx + ax * dt * dt;
        positions[i + 1] = y + vy + ay * dt * dt;
        positions[i + 2] = z + vz + az * dt * dt;
        previous[i] = x;
        previous[i + 1] = y;
        previous[i + 2] = z;
      }
    }

    // Pin the top row to the shoulders.
    for (let column = 0; column < columns; column++) {
      this.restPoint(left, right, 0, column, point);
      point.toArray(positions, column * 3);
      point.toArray(previous, column * 3);
    }

    for (let iteration = 0; iteration < iterations; iteration++) {
      for (let row = 1; row < rows; row++) {
        const across = this.widthAt(row) / (columns - 1);
        for (let column = 0; column < columns; column++) {
          const i = row * columns + column;
          this.constrain(i, i - columns, restDown, row === 1);
          if (column > 0) this.constrain(i, i - 1, across, false);
        }
      }
      this.collide(colliders);
    }

    // Hard limit, top down: no strand longer than its rest length allows.
    const limit = restDown * MAX_STRETCH;
    for (let row = 1; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const i = (row * columns + column) * 3;
        point.fromArray(positions, i);
        above.fromArray(positions, i - columns * 3);
        delta.copy(point).sub(above);
        const distance = delta.length();
        if (distance > limit) {
          point.copy(above).addScaledVector(delta, limit / distance);
          point.toArray(positions, i);
        }
      }
    }
  }

  /** Pulls two points toward their rest distance. `anchored` means `b` is pinned and must not move. */
  private constrain(a: number, b: number, rest: number, anchored: boolean): void {
    const positions = this.positions;
    const ia = a * 3;
    const ib = b * 3;
    delta.set(
      (positions[ia] ?? 0) - (positions[ib] ?? 0),
      (positions[ia + 1] ?? 0) - (positions[ib + 1] ?? 0),
      (positions[ia + 2] ?? 0) - (positions[ib + 2] ?? 0),
    );
    const distance = delta.length();
    if (distance < 1e-6) return;
    const correction = (distance - rest) / distance;
    const shareA = anchored ? 1 : 0.5;
    positions[ia] = (positions[ia] ?? 0) - delta.x * correction * shareA;
    positions[ia + 1] = (positions[ia + 1] ?? 0) - delta.y * correction * shareA;
    positions[ia + 2] = (positions[ia + 2] ?? 0) - delta.z * correction * shareA;
    if (anchored) return;
    positions[ib] = (positions[ib] ?? 0) + delta.x * correction * 0.5;
    positions[ib + 1] = (positions[ib + 1] ?? 0) + delta.y * correction * 0.5;
    positions[ib + 2] = (positions[ib + 2] ?? 0) + delta.z * correction * 0.5;
  }

  /** Pushes free points out of the body capsules. */
  private collide(colliders: readonly ClothCollider[]): void {
    const { columns, rows } = this.shape;
    const positions = this.positions;
    for (let i = columns; i < columns * rows; i++) {
      point.fromArray(positions, i * 3);
      for (const collider of colliders) {
        segment.copy(collider.b).sub(collider.a);
        const lengthSq = segment.lengthSq();
        const t =
          lengthSq > 0
            ? Math.min(1, Math.max(0, delta.copy(point).sub(collider.a).dot(segment) / lengthSq))
            : 0;
        closest.copy(collider.a).addScaledVector(segment, t);
        delta.copy(point).sub(closest);
        const distance = delta.length();
        if (distance < collider.radius && distance > 1e-6) {
          point.copy(closest).addScaledVector(delta, collider.radius / distance);
        }
      }
      point.toArray(positions, i * 3);
    }
  }

  private widthAt(row: number): number {
    const { rows, topWidth, bottomWidth } = this.shape;
    return topWidth + (bottomWidth - topWidth) * (row / (rows - 1));
  }

  /** Where a point sits across the cloth's width at a given row, before it hangs. */
  private restPoint(
    left: Vector3,
    right: Vector3,
    row: number,
    column: number,
    out: Vector3,
  ): void {
    const { columns, topWidth } = this.shape;
    const across = column / (columns - 1) - 0.5;
    const centreX = (left.x + right.x) / 2;
    const centreY = (left.y + right.y) / 2;
    const centreZ = (left.z + right.z) / 2;
    const scale = (this.widthAt(row) / topWidth) * across;
    out.set(
      centreX + (right.x - left.x) * scale,
      centreY + (right.y - left.y) * scale,
      centreZ + (right.z - left.z) * scale,
    );
  }
}
