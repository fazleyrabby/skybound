import {
  AdditiveBlending,
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
import { smoothstep } from '../utils/math';

/** Half extents of the box around the camera that streaks live in, camera space. */
const HALF_WIDTH = 16;
const NEAR_Z = 4;
const FAR_Z = -70;
/** Streaks closer to the view axis than this are hidden so they do not cover the hero. */
const CLEAR_RADIUS = 2.5;

/**
 * Streaks rushing past the camera, aligned to the velocity. They carry most of
 * the sense of speed in open sky, where there is no nearby geometry to judge by.
 * Cosmetic, so `Math.random()` is fine here.
 */
export class SpeedLines {
  private readonly lines: LineSegments;
  private readonly material: LineBasicMaterial;
  private readonly positions: Float32Array;
  private readonly points: Vector3[] = [];
  private readonly localVelocity = new Vector3();
  private readonly inverse = new Quaternion();

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly player: PlayerState,
  ) {
    const count = Config.vfx.speedLineCount;
    for (let i = 0; i < count; i++) {
      this.points.push(
        new Vector3(
          randomSpread(HALF_WIDTH),
          randomSpread(HALF_WIDTH),
          randomBetween(FAR_Z, NEAR_Z),
        ),
      );
    }
    this.positions = new Float32Array(count * 6);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3));

    this.material = new LineBasicMaterial({
      color: 0xdff2ff,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.lines = new LineSegments(geometry, this.material);
    this.lines.frustumCulled = false;
    this.lines.visible = false;
    camera.add(this.lines);
  }

  update(frameDelta: number): void {
    const cfg = Config.vfx;
    const speed = this.player.speed;
    const strength = smoothstep(cfg.speedLineMinSpeed, cfg.speedLineFullSpeed, speed);
    this.lines.visible = strength > 0;
    if (!this.lines.visible) return;
    this.material.opacity = strength * cfg.speedLineOpacity;

    // The world streams past opposite to the velocity, seen from the camera.
    this.inverse.copy(this.camera.quaternion).invert();
    this.localVelocity.copy(this.player.velocity).applyQuaternion(this.inverse);
    const tailX = this.localVelocity.x * cfg.speedLineLength;
    const tailY = this.localVelocity.y * cfg.speedLineLength;
    const tailZ = this.localVelocity.z * cfg.speedLineLength;

    this.points.forEach((point, index) => {
      point.addScaledVector(this.localVelocity, -frameDelta);
      if (point.z > NEAR_Z || point.z < FAR_Z) {
        point.set(
          randomSpread(HALF_WIDTH),
          randomSpread(HALF_WIDTH),
          point.z > NEAR_Z ? FAR_Z : NEAR_Z,
        );
      }
      point.x = wrap(point.x, HALF_WIDTH);
      point.y = wrap(point.y, HALF_WIDTH);

      const hidden = Math.hypot(point.x, point.y) < CLEAR_RADIUS;
      const offset = index * 6;
      this.positions[offset] = point.x;
      this.positions[offset + 1] = point.y;
      this.positions[offset + 2] = point.z;
      this.positions[offset + 3] = point.x + (hidden ? 0 : tailX);
      this.positions[offset + 4] = point.y + (hidden ? 0 : tailY);
      this.positions[offset + 5] = point.z + (hidden ? 0 : tailZ);
    });
    this.lines.geometry.getAttribute('position').needsUpdate = true;
  }
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomSpread(half: number): number {
  return randomBetween(-half, half);
}

function wrap(value: number, half: number): number {
  if (value > half) return value - half * 2;
  if (value < -half) return value + half * 2;
  return value;
}
