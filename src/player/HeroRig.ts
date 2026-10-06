import { Euler, Quaternion, type Object3D } from 'three';
import { clamp } from '../utils/math';
import { JOINTS, POSES, POSE_RESPONSE, type Joint, type PoseName } from './heroPoses';

const REST = [0, 0, 0] as const;

/**
 * Poses the hero model by rotating its joint nodes toward a named pose, eased
 * per joint. Animation is blended poses in code rather than authored clips:
 * flight needs a handful of strong silhouettes more than it needs cycles.
 */
export class HeroRig {
  private readonly joints = new Map<Joint, Object3D>();
  private readonly targets = new Map<Joint, Quaternion>();
  private readonly euler = new Euler();
  private readonly strideA = new Quaternion();
  private readonly strideB = new Quaternion();
  private readonly rest = new Quaternion();
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
      target.setFromEuler(this.euler.set(x, y, z, 'XYZ'));
    }
  }

  /** Continuous, distance-driven stride, fading to idle for small stick inputs. */
  setWalk(stridePhase: number, strength: number): void {
    const blend = (Math.sin(stridePhase) + 1) / 2;
    this.pose = blend > 0.5 ? 'walkA' : 'walkB';
    for (const [joint, target] of this.targets) {
      const a = POSES.walkA[joint] ?? REST;
      const b = POSES.walkB[joint] ?? REST;
      const idle = POSES.idle[joint] ?? REST;
      this.strideA.setFromEuler(this.euler.set(a[0], a[1], a[2], 'XYZ'));
      this.strideB.setFromEuler(this.euler.set(b[0], b[1], b[2], 'XYZ'));
      this.rest.setFromEuler(this.euler.set(idle[0], idle[1], idle[2], 'XYZ'));
      target.slerpQuaternions(this.strideB, this.strideA, blend);
      target.slerpQuaternions(this.rest, target, clamp(strength, 0, 1));
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
