import {
  AdditiveBlending,
  BoxGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
  type Scene,
} from 'three';

const FORWARD = new Vector3(0, 0, 1);

/** The fields of a pooled shot that drawing needs. */
export interface DrawableShot {
  readonly active: boolean;
  readonly position: Vector3;
  readonly previousPosition: Vector3;
  readonly velocity: Vector3;
}

export interface ShotStyle {
  color: number;
  thickness: number;
  length: number;
}

/** Draws a pool of shots (player blasts, enemy bullets, missiles) as one instanced mesh of bolts. */
export class ProjectileRenderer {
  private readonly mesh: InstancedMesh;
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly direction = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly scale: Vector3;

  constructor(
    scene: Scene,
    private readonly pool: readonly DrawableShot[],
    style: ShotStyle,
  ) {
    this.scale = new Vector3(style.thickness, style.thickness, style.length);
    this.mesh = new InstancedMesh(
      new BoxGeometry(1, 1, 1),
      new MeshBasicMaterial({
        color: style.color,
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
        fog: false,
      }),
      pool.length,
    );
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  update(alpha: number): void {
    let count = 0;
    for (const projectile of this.pool) {
      if (!projectile.active) continue;
      this.position.lerpVectors(projectile.previousPosition, projectile.position, alpha);
      this.direction.copy(projectile.velocity).normalize();
      this.rotation.setFromUnitVectors(FORWARD, this.direction);
      this.mesh.setMatrixAt(count++, this.matrix.compose(this.position, this.rotation, this.scale));
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
