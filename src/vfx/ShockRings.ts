import {
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  type PerspectiveCamera,
  type Scene,
  type Vector3,
} from 'three';
import { Config } from '../core/Config';

interface Ring {
  mesh: Mesh;
  material: MeshBasicMaterial;
  age: number;
  duration: number;
  maxRadius: number;
}

/** A small pool of camera-facing rings that expand and fade: explosions and heavy hits. */
export class ShockRings {
  private readonly rings: Ring[];
  private next = 0;

  constructor(
    scene: Scene,
    private readonly camera: PerspectiveCamera,
  ) {
    const geometry = new RingGeometry(0.86, 1, 48);
    this.rings = Array.from({ length: Config.vfx.maxShockRings }, () => {
      const material = new MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: DoubleSide,
        fog: false,
      });
      const mesh = new Mesh(geometry, material);
      mesh.visible = false;
      scene.add(mesh);
      return { mesh, material, age: 0, duration: 1, maxRadius: 1 };
    });
  }

  get active(): number {
    return this.rings.filter((ring) => ring.mesh.visible).length;
  }

  trigger(position: Vector3, maxRadius: number, duration: number, color: number): void {
    const ring = this.rings[this.next];
    this.next = (this.next + 1) % this.rings.length;
    if (!ring) return;
    ring.mesh.position.copy(position);
    ring.mesh.visible = true;
    ring.material.color.setHex(color);
    ring.age = 0;
    ring.duration = duration;
    ring.maxRadius = maxRadius;
  }

  update(frameDelta: number): void {
    for (const ring of this.rings) {
      if (!ring.mesh.visible) continue;
      ring.age += frameDelta;
      const t = ring.age / ring.duration;
      if (t >= 1) {
        ring.mesh.visible = false;
        continue;
      }
      ring.mesh.quaternion.copy(this.camera.quaternion);
      ring.mesh.scale.setScalar(1 + (ring.maxRadius - 1) * (1 - (1 - t) ** 3));
      ring.material.opacity = (1 - t) * 0.85;
    }
  }
}
