import type { PerspectiveCamera } from 'three';
import { Config } from '../core/Config';
import { clamp } from '../utils/math';

/**
 * Trauma-based shake (spec section 12): events add trauma, shake = trauma²,
 * trauma decays over time. Rotation only, so it never moves the view through walls.
 */
export class CameraShake {
  private trauma = 0;
  private time = 0;

  add(amount: number): void {
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }

  /** Applies this frame's shake to a camera that has already been aimed. */
  apply(camera: PerspectiveCamera, frameDelta: number): void {
    const cfg = Config.camera;
    this.trauma = Math.max(0, this.trauma - cfg.shakeDecay * frameDelta);
    this.time += frameDelta * cfg.shakeFrequency;

    const strength = this.trauma * this.trauma * cfg.shakeScale * cfg.shakeMaxAngle;
    if (strength <= 0) return;
    camera.rotateX(strength * wobble(this.time, 1));
    camera.rotateY(strength * wobble(this.time, 2));
    camera.rotateZ(strength * wobble(this.time, 3));
  }
}

/** Smooth pseudo-noise in [-1, 1]; a different `channel` gives an unrelated signal. */
function wobble(time: number, channel: number): number {
  return Math.sin(time + channel * 12.9) * 0.6 + Math.sin(time * 2.3 + channel * 7.1) * 0.4;
}
