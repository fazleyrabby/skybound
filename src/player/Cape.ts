import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  MeshStandardMaterial,
  Vector3,
  type Object3D,
  type Scene,
} from 'three';
import { Config } from '../core/Config';
import { ClothStrip, type ClothCollider } from './ClothStrip';

/** All in the model's rest pose and frame: +Y up, +Z the way the hero faces, origin between the feet. */
const LEFT_SHOULDER = new Vector3(0.15, 1.558, -0.09);
const RIGHT_SHOULDER = new Vector3(-0.15, 1.558, -0.09);
const BEHIND = new Vector3(0, 1.558, -1.09);
const CHEST = { a: new Vector3(0, 1.16, -0.005), b: new Vector3(0, 1.5, -0.005), radius: 0.14 };
const LEGS = { a: new Vector3(0, 1.0, 0.0), b: new Vector3(0, 0.15, 0.0), radius: 0.155 };
/** The suit's accent red (blender/characters/build_aether.py), in linear RGB. */
const CAPE_COLOR = new Color().setRGB(0.36, 0.025, 0.03);

/**
 * The hero's cape: a simulated cloth pinned at the shoulders. It follows the
 * chest bone through every pose, hangs when standing and streams behind in
 * flight because the simulation runs in world space; nothing is keyed to flight state.
 */
export class Cape {
  private readonly cloth = new ClothStrip(Config.hero.cape);
  private readonly mesh: Mesh;
  private readonly left = new Vector3();
  private readonly right = new Vector3();
  private readonly back = new Vector3();
  private readonly localLeft: Vector3;
  private readonly localRight: Vector3;
  private readonly localBehind: Vector3;
  private readonly localChest: readonly [Vector3, Vector3];
  private readonly localLegs: readonly [Vector3, Vector3];
  private readonly colliders: ClothCollider[] = [
    { a: new Vector3(), b: new Vector3(), radius: CHEST.radius },
    { a: new Vector3(), b: new Vector3(), radius: LEGS.radius },
  ];

  /**
   * `model` must be in its rest pose. The cape hangs from `chest`; `pelvis`
   * carries the collider that keeps it off the legs.
   */
  constructor(
    scene: Scene,
    model: Object3D,
    private readonly chest: Object3D,
    private readonly pelvis: Object3D,
  ) {
    model.updateWorldMatrix(true, true);
    const into = (bone: Object3D, point: Vector3): Vector3 =>
      bone.worldToLocal(model.localToWorld(point.clone()));
    this.localLeft = into(chest, LEFT_SHOULDER);
    this.localRight = into(chest, RIGHT_SHOULDER);
    this.localBehind = into(chest, BEHIND);
    this.localChest = [into(chest, CHEST.a), into(chest, CHEST.b)];
    this.localLegs = [into(pelvis, LEGS.a), into(pelvis, LEGS.b)];

    const { columns, rows } = Config.hero.cape;
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.cloth.positions, 3));
    const indices: number[] = [];
    for (let row = 0; row < rows - 1; row++) {
      for (let column = 0; column < columns - 1; column++) {
        const a = row * columns + column;
        const b = a + 1;
        const c = a + columns;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    geometry.setIndex(indices);
    this.mesh = new Mesh(
      geometry,
      new MeshStandardMaterial({ color: CAPE_COLOR, roughness: 0.74, side: DoubleSide }),
    );
    // Vertices are already in world space and move every frame.
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    scene.add(this.mesh);
  }

  /** Vertex positions, for tests and the debug hook. */
  get positions(): Float32Array {
    return this.cloth.positions;
  }

  /** Call after the model has been posed for this frame. `airspeed` is the hero's speed. */
  update(frameDelta: number, airspeed: number): void {
    const { chest, pelvis } = this;
    chest.updateWorldMatrix(true, false);
    pelvis.updateWorldMatrix(true, false);
    chest.localToWorld(this.left.copy(this.localLeft));
    chest.localToWorld(this.right.copy(this.localRight));
    // Straight out behind the midpoint of the shoulders.
    chest.localToWorld(this.back.copy(this.localBehind));
    this.back.addScaledVector(this.left, -0.5).addScaledVector(this.right, -0.5).normalize();
    const [upper, lower] = this.colliders;
    if (upper && lower) {
      chest.localToWorld(upper.a.copy(this.localChest[0]));
      chest.localToWorld(upper.b.copy(this.localChest[1]));
      pelvis.localToWorld(lower.a.copy(this.localLegs[0]));
      pelvis.localToWorld(lower.b.copy(this.localLegs[1]));
    }

    this.cloth.update(frameDelta, this.left, this.right, this.back, airspeed, this.colliders);
    const geometry = this.mesh.geometry;
    geometry.getAttribute('position').needsUpdate = true;
    geometry.computeVertexNormals();
  }
}
