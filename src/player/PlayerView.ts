import {
  BoxGeometry,
  CapsuleGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type Scene,
} from 'three';
import { Config } from '../core/Config';
import { clamp } from '../utils/math';
import type { PlayerState } from './PlayerState';

const UP = new Vector3(0, 1, 0);
const TILT_FULL_SPEED = 45;
const MAX_TILT = 0.9;
const ORIENT_RESPONSE = 10;
const MIN_LEAN_SPEED = 1;

/**
 * Placeholder hero: a capsule with a visor so facing is readable. Reads player
 * state, never writes it. Replaced by the Aether model in Phase 11.
 */
export class PlayerView {
  private readonly root = new Group();
  private readonly bodyUp = new Vector3();
  private readonly direction = new Vector3();
  private readonly tilt = new Quaternion();
  private readonly yaw = new Quaternion();
  private readonly target = new Quaternion();

  constructor(
    scene: Scene,
    private readonly state: PlayerState,
  ) {
    const { height, radius } = Config.player;
    const body = new Mesh(
      new CapsuleGeometry(radius, height - radius * 2, 6, 16),
      new MeshStandardMaterial({ color: 0x2f6bff, roughness: 0.45 }),
    );
    const visor = new Mesh(
      new BoxGeometry(radius * 1.2, radius * 0.45, radius * 0.5),
      new MeshStandardMaterial({ color: 0xffd34d, emissive: 0xffa200, emissiveIntensity: 0.6 }),
    );
    visor.position.set(0, height * 0.32, -radius * 0.9);
    this.root.add(body, visor);
    scene.add(this.root);
  }

  /** `alpha` interpolates between the last two fixed steps. */
  update(alpha: number, frameDelta: number): void {
    const state = this.state;
    this.root.position.lerpVectors(state.previousPosition, state.position, alpha);

    this.yaw.setFromAxisAngle(UP, state.heading);

    // In flight the body leans from upright toward lying along the velocity.
    const speed = state.speed;
    const lean = state.flying ? clamp(speed / TILT_FULL_SPEED, 0, 1) * MAX_TILT : 0;
    if (lean > 0 && speed > MIN_LEAN_SPEED) {
      this.direction.copy(state.velocity).divideScalar(speed);
      this.bodyUp.copy(UP).lerp(this.direction, lean).normalize();
    } else {
      this.bodyUp.copy(UP);
    }
    this.tilt.setFromUnitVectors(UP, this.bodyUp);

    this.target.copy(this.tilt).multiply(this.yaw);
    this.root.quaternion.slerp(this.target, 1 - Math.exp(-ORIENT_RESPONSE * frameDelta));
  }
}
