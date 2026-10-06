import { Euler, Quaternion, type Object3D } from 'three';
import { JOINTS, POSES, POSE_RESPONSE, type Joint, type PoseName } from './heroPoses';

const euler = new Euler();
const REST = [0, 0, 0] as const;

/**
 * Poses the hero model by rotating its joint nodes toward a named pose, eased
 * per joint. Animation is blended poses in code rather than authored clips:
 * flight needs a handful of strong silhouettes more than it needs cycles.
 */
export class HeroRig {
  private readonly joints = new Map<Joint, Object3D>();
  private readonly targets = new Map<Joint, Quaternion>();
  private pose: PoseName = 'idle';

  constructor(model: Object3D) {
    for (const name of JOINTS) {
      // three.js strips dots from glTF node names ("upper_arm.L" -> "upper_armL").
      const node = model.getObjectByName(name) ?? model.getObjectByName(name.replace('.', ''));
      if (!node) continue;
      this.joints.set(name, node);
      this.targets.set(name, new Quaternion());
    }
    this.setPose('idle');
  }

  /** Joints found in the model. All of `JOINTS` when the asset is intact. */
  get jointCount(): number {
    return this.joints.size;
  }

  get currentPose(): PoseName {
    return this.pose;
  }

  setPose(name: PoseName): void {
    this.pose = name;
    const pose = POSES[name];
    for (const [joint, target] of this.targets) {
      const [x, y, z] = pose[joint] ?? REST;
      target.setFromEuler(euler.set(x, y, z, 'XYZ'));
    }
  }

  update(frameDelta: number): void {
    const t = 1 - Math.exp(-POSE_RESPONSE[this.pose] * frameDelta);
    for (const [joint, node] of this.joints) {
      const target = this.targets.get(joint);
      if (target) node.quaternion.slerp(target, t);
    }
  }
}
