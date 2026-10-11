import { Vector3, type Object3D } from 'three';
import type { Joint } from './heroPoses';

/**
 * Points on the body that can rest on the ground, in the model's rest pose and
 * frame (+Y up, +Z forward, origin between the feet): heels, toes, knees and
 * knuckles. Right-hand points mirror these.
 */
const LEFT_POINTS: readonly (readonly [Joint, number, number, number])[] = [
  ['foot.L', 0.1, 0, -0.08],
  ['foot.L', 0.1, 0, 0.115],
  ['foot.L', 0.1, 0.004, 0.19],
  ['shin.L', 0.098, 0.525, 0.075],
  ['hand.L', 0.375, 0.845, 0.01],
];

/**
 * Finds the lowest point of the posed body, so the view can stand it on the
 * surface whatever the pose: a planted heel, a toe pushing off, a knee and a
 * fist in the landing crouch. Cheaper and steadier than measuring the mesh.
 */
export class GroundContacts {
  private readonly bones: Object3D[] = [];
  private readonly points: Vector3[] = [];
  private readonly scratch = new Vector3();

  /** `model` must be in its rest pose; `find` resolves a joint to its node. */
  constructor(model: Object3D, find: (joint: Joint) => Object3D | undefined) {
    model.updateWorldMatrix(true, true);
    for (const [joint, x, y, z] of LEFT_POINTS) {
      this.add(model, find(joint), x, y, z);
      this.add(model, find(joint.replace('.L', '.R') as Joint), -x, y, z);
    }
  }

  get count(): number {
    return this.points.length;
  }

  /** World height of the lowest contact point. World matrices must be current. */
  lowest(): number {
    let lowest = Infinity;
    for (let i = 0; i < this.points.length; i++) {
      const bone = this.bones[i];
      const point = this.points[i];
      if (!bone || !point) continue;
      lowest = Math.min(lowest, this.scratch.copy(point).applyMatrix4(bone.matrixWorld).y);
    }
    return lowest;
  }

  private add(model: Object3D, bone: Object3D | undefined, x: number, y: number, z: number): void {
    if (!bone) return;
    this.bones.push(bone);
    this.points.push(bone.worldToLocal(model.localToWorld(new Vector3(x, y, z))));
  }
}
