import {
  BufferAttribute,
  BufferGeometry,
  LineBasicMaterial,
  LineSegments,
  Quaternion,
  Vector3,
  type PerspectiveCamera,
} from 'three';
import { Config } from '../core/Config';
import type { PlayerState } from '../player/PlayerState';

/** Half extents of the box of rain kept around the camera, camera space. */
const HALF = new Vector3(26, 20, 34);
const FALL_SPEED = 46;
/** Streak length in seconds of travel relative to the camera. */
const STREAK = 0.035;
const MIN_VISIBLE = 0.02;

/**
 * Rain as streaks in a box that travels with the camera. Each streak moves by
 * the rain's fall minus the hero's own velocity, so flying fast turns the rain
 * into lines rushing at the screen. Cosmetic: `Math.random()` is fine.
 */
export class Rain {
  private readonly lines: LineSegments;
  private readonly material: LineBasicMaterial;
  private readonly positions: Float32Array;
  private readonly points: Vector3[] = [];
  private readonly relative = new Vector3();
  private readonly inverse = new Quaternion();

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly player: PlayerState,
  ) {
    const count = Config.world.rainStreaks;
    for (let i = 0; i < count; i++) {
      this.points.push(new Vector3(spread(HALF.x), spread(HALF.y), spread(HALF.z)));
    }
    this.positions = new Float32Array(count * 6);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.material = new LineBasicMaterial({
      color: 0xb8c8dc,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });
    this.lines = new LineSegments(geometry, this.material);
    this.lines.frustumCulled = false;
    this.lines.visible = false;
    camera.add(this.lines);
  }

  update(frameDelta: number, amount: number): void {
    this.lines.visible = amount > MIN_VISIBLE;
    if (!this.lines.visible) return;
    this.material.opacity = amount * 0.5;
    // The quality preset thins the rain by drawing fewer of the streaks.
    const drawn = Math.round(this.points.length * Config.quality.rain);
    this.lines.geometry.setDrawRange(0, drawn * 2);

    // Rain velocity as the camera sees it.
    this.inverse.copy(this.camera.quaternion).invert();
    this.relative.set(0, -FALL_SPEED, 0).sub(this.player.velocity).applyQuaternion(this.inverse);
    const tailX = this.relative.x * STREAK;
    const tailY = this.relative.y * STREAK;
    const tailZ = this.relative.z * STREAK;

    this.points.forEach((point, index) => {
      point.addScaledVector(this.relative, frameDelta);
      point.x = wrap(point.x, HALF.x);
      point.y = wrap(point.y, HALF.y);
      point.z = wrap(point.z, HALF.z);
      const offset = index * 6;
      this.positions[offset] = point.x;
      this.positions[offset + 1] = point.y;
      this.positions[offset + 2] = point.z;
      this.positions[offset + 3] = point.x - tailX;
      this.positions[offset + 4] = point.y - tailY;
      this.positions[offset + 5] = point.z - tailZ;
    });
    this.lines.geometry.getAttribute('position').needsUpdate = true;
  }
}

function spread(half: number): number {
  return (Math.random() * 2 - 1) * half;
}

/** Keeps a coordinate inside [-half, half], however far it moved this frame. */
function wrap(value: number, half: number): number {
  const size = half * 2;
  return ((((value + half) % size) + size) % size) - half;
}
