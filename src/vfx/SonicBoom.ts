import {
  AdditiveBlending,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  Vector3,
  type Scene,
} from 'three';
import { Config } from '../core/Config';
import { aimForward, type PlayerState } from '../player/PlayerState';

const START_RADIUS = 2;
const FORWARD = new Vector3(0, 0, 1);
const MIN_DIRECTION_SPEED = 1;

/** Expanding ring left behind at the moment boost kicks in. One mesh, reused. */
export class SonicBoom {
  private readonly ring: Mesh;
  private readonly material: MeshBasicMaterial;
  private readonly direction = new Vector3();
  private age = Infinity;

  constructor(
    scene: Scene,
    private readonly player: PlayerState,
  ) {
    this.material = new MeshBasicMaterial({
      color: 0xbfe9ff,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
      fog: false,
    });
    this.ring = new Mesh(new RingGeometry(0.82, 1, 64), this.material);
    this.ring.visible = false;
    scene.add(this.ring);
  }

  trigger(): void {
    const player = this.player;
    if (player.speed > MIN_DIRECTION_SPEED) this.direction.copy(player.velocity).normalize();
    else aimForward(player.aim, this.direction);
    this.ring.position.copy(player.position);
    this.ring.quaternion.setFromUnitVectors(FORWARD, this.direction);
    this.age = 0;
    this.ring.visible = true;
  }

  update(frameDelta: number): void {
    if (!this.ring.visible) return;
    const { boomDuration, boomMaxRadius } = Config.vfx;
    this.age += frameDelta;
    const t = this.age / boomDuration;
    if (t >= 1) {
      this.ring.visible = false;
      return;
    }
    const eased = 1 - (1 - t) ** 3;
    this.ring.scale.setScalar(START_RADIUS + (boomMaxRadius - START_RADIUS) * eased);
    this.material.opacity = (1 - t) * 0.8;
  }
}
