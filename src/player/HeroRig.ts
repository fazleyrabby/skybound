import { Euler, Quaternion, type Object3D } from 'three';
import { clamp, damp } from '../utils/math';
import { createGaitPose, writeGait, writeIdleLife } from './gait';
import { JOINTS, POSES, POSE_RESPONSE, type Joint, type PoseName } from './heroPoses';

const REST = [0, 0, 0] as const;
/** Share of a head rotation taken by the neck, so the head does not hinge at one point. */
const NECK_SHARE = 0.4;
/** Poses in which the body is at rest enough to breathe and shift its weight. */
const AT_REST: ReadonlySet<PoseName> = new Set(['idle', 'hover', 'ascend', 'descend']);
const LIFE_RESPONSE = 4;

/**
 * Poses the hero's skeleton. A pose is one rotation per joint in the model's
 * own frame (see `heroPoses`); the rig converts it through each bone's rest
 * orientation, so the pose tables do not depend on how the bones were drawn.
 *
 * Standing, flying and fighting are blended poses eased per joint. Walking and
 * running are generated continuously by `gait`, and a resting body breathes.
 */
export class HeroRig {
  private readonly joints = new Map<Joint, Object3D>();
  private readonly targets = new Map<Joint, Quaternion>();
  /** Inverse of the parent's rest orientation, and the bone's own, both in the model frame. */
  private readonly fromParent = new Map<Joint, Quaternion>();
  private readonly toBone = new Map<Joint, Quaternion>();
  private readonly gait = createGaitPose(JOINTS);
  private readonly life = createGaitPose(JOINTS);
  private readonly euler = new Euler();
  private readonly rest = new Quaternion();
  private readonly stride = new Quaternion();
  private readonly offset = new Quaternion();
  private readonly local = new Quaternion();
  private readonly identity = new Quaternion();
  private pose: PoseName = 'idle';
  private time = 0;
  private lifeAmount = 1;

  /** `model` must be in its rest pose. */
  constructor(model: Object3D) {
    model.updateWorldMatrix(true, true);
    const modelInverse = model.getWorldQuaternion(new Quaternion()).invert();
    for (const name of JOINTS) {
      // three.js strips dots from glTF node names ("upper_arm.L" -> "upper_armL").
      const node = model.getObjectByName(name) ?? model.getObjectByName(name.replace('.', ''));
      if (!node) continue;
      this.joints.set(name, node);
      this.targets.set(name, new Quaternion());
      const own = node.getWorldQuaternion(new Quaternion()).premultiply(modelInverse);
      const parent = new Quaternion();
      if (node.parent) node.parent.getWorldQuaternion(parent).premultiply(modelInverse);
      this.fromParent.set(name, parent.invert());
      this.toBone.set(name, own);
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

  /** The node for a joint, if the model has it. */
  joint(name: Joint): Object3D | undefined {
    return this.joints.get(name);
  }

  setPose(name: PoseName): void {
    this.pose = name;
    const pose = POSES[name];
    for (const [joint, target] of this.targets) this.poseQuaternion(target, pose[joint]);
    this.shareHeadWithNeck();
  }

  /**
   * Continuous stride at `stridePhase` (2π per two steps). `strength` (0..1)
   * fades it in from standing; `run` (0..1) takes the walk up to a sprint.
   */
  setWalk(stridePhase: number, strength: number, run = 0): void {
    const sprint = clamp(run, 0, 1);
    const leading = Math.sin(stridePhase) > 0;
    this.pose = leading ? (sprint > 0.5 ? 'runA' : 'walkA') : sprint > 0.5 ? 'runB' : 'walkB';
    writeGait(this.gait, stridePhase, sprint);
    const amount = clamp(strength, 0, 1);
    for (const [joint, target] of this.targets) {
      this.poseQuaternion(this.stride, this.gait[joint]);
      this.poseQuaternion(this.rest, POSES.idle[joint]);
      // slerpQuaternions overwrites its receiver before reading the second argument,
      // so the two inputs must never be the receiver itself.
      target.slerpQuaternions(this.rest, this.stride, amount);
    }
    this.shareHeadWithNeck();
  }

  update(frameDelta: number): void {
    this.time += frameDelta;
    this.lifeAmount = damp(
      this.lifeAmount,
      AT_REST.has(this.pose) ? 1 : 0,
      LIFE_RESPONSE,
      frameDelta,
    );
    writeIdleLife(this.life, this.time, this.lifeAmount);
    const t = 1 - Math.exp(-POSE_RESPONSE[this.pose] * frameDelta);
    for (const [joint, node] of this.joints) {
      const target = this.targets.get(joint);
      const fromParent = this.fromParent.get(joint);
      const toBone = this.toBone.get(joint);
      if (!target || !fromParent || !toBone) continue;
      this.poseQuaternion(this.offset, this.life[joint]);
      this.local.copy(fromParent).multiply(target).multiply(this.offset).multiply(toBone);
      node.quaternion.slerp(this.local, t);
    }
  }

  /** A head rotation is spread over the neck and the head. */
  private shareHeadWithNeck(): void {
    const head = this.targets.get('head');
    const neck = this.targets.get('neck');
    if (!head || !neck) return;
    this.stride.copy(head);
    neck.slerpQuaternions(this.identity, this.stride, NECK_SHARE);
    head.slerpQuaternions(this.identity, this.stride, 1 - NECK_SHARE);
  }

  private poseQuaternion(
    out: Quaternion,
    rotation: readonly [number, number, number] = REST,
  ): void {
    out.setFromEuler(this.euler.set(rotation[0], rotation[1], rotation[2], 'XYZ'));
  }
}
