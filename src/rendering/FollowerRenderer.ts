import {
  BoxGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type Scene,
} from 'three';
import { FOLLOWER_STRIDE } from '../world/PathFollowers';

const UP = new Vector3(0, 1, 0);

/**
 * Draws vehicles or pedestrians from a packed buffer (x, y, z, yaw, scale per
 * instance) as one instanced mesh of boxes. One draw call per kind.
 */
export class FollowerRenderer {
  /** Shared by every instance; the atmosphere tints it at night. */
  readonly material = new MeshStandardMaterial({ roughness: 0.7 });
  private readonly mesh: InstancedMesh;
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly scale = new Vector3();
  private readonly color = new Color();

  constructor(
    scene: Scene,
    capacity: number,
    /** Box size: width, height, length along the direction of travel. */
    private readonly size: readonly [number, number, number],
  ) {
    this.mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), this.material, Math.max(1, capacity));
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.setColorAt(0, this.color);
    scene.add(this.mesh);
  }

  update(buffer: Float32Array, colors: Uint32Array, count: number): void {
    const [width, height, length] = this.size;
    for (let i = 0; i < count; i++) {
      const base = i * FOLLOWER_STRIDE;
      const fade = buffer[base + 4] ?? 1;
      this.position.set(buffer[base] ?? 0, buffer[base + 1] ?? 0, buffer[base + 2] ?? 0);
      this.rotation.setFromAxisAngle(UP, buffer[base + 3] ?? 0);
      this.scale.set(width * fade, height * fade, length * fade);
      this.mesh.setMatrixAt(i, this.matrix.compose(this.position, this.rotation, this.scale));
      this.mesh.setColorAt(i, this.color.setHex(colors[i] ?? 0xffffff));
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
