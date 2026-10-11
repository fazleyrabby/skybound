import { clamp } from '../utils/math';
import type { Joint } from './heroPoses';

/** A full pose: Euler XYZ per joint, in the same frame as `heroPoses`. */
export type GaitPose = Record<Joint, [x: number, y: number, z: number]>;

export function createGaitPose(joints: readonly Joint[]): GaitPose {
  const pose = {} as GaitPose;
  for (const joint of joints) pose[joint] = [0, 0, 0];
  return pose;
}

function mix(walk: number, sprint: number, run: number): number {
  return walk + (sprint - walk) * run;
}

function writeLeg(
  out: GaitPose,
  thigh: Joint,
  shin: Joint,
  foot: Joint,
  phase: number,
  run: number,
): void {
  const sin = Math.sin(phase);
  // The knee folds while the leg swings forward under the body. While the foot
  // is planted it gives a little as the body passes over it, which is what keeps
  // the hips from pole-vaulting over a stiff leg.
  const swing = Math.max(0, Math.cos(phase + 0.4));
  const stance = Math.max(0, -Math.cos(phase));
  const give = mix(0.34, 0.3, run) * stance * stance;
  out[thigh][0] = mix(-0.05, -0.28, run) - mix(0.4, 0.85, run) * sin - give * 0.5;
  out[shin][0] = mix(0.1, 0.2, run) + mix(0.95, 1.75, run) * swing * swing + give;
  // Toes up at heel strike, pushing off at the back of the stride.
  out[foot][0] = 0.08 - mix(0.3, 0.42, run) * sin - give * 0.5;
}

function writeArm(
  out: GaitPose,
  upper: Joint,
  forearm: Joint,
  side: number,
  phase: number,
  run: number,
): void {
  // Opposite to the leg on the same side: back when that leg is forward.
  const sin = Math.sin(phase);
  out[upper][0] = mix(0.45, 0.95, run) * sin;
  out[upper][2] = side * mix(0.06, 0.14, run);
  // The elbow closes as the arm comes forward.
  out[forearm][0] = -(mix(0.3, 1.3, run) + mix(0.3, 0.4, run) * (0.5 - 0.5 * sin));
}

/**
 * One instant of a walk or run cycle. `phase` advances 2π per full stride (two
 * steps); `run` is 0 for a walk and 1 for a sprint. The whole body takes part:
 * the pelvis turns with the leading leg and dips over the swinging one, the
 * shoulders turn the other way, and the head stays on the direction of travel.
 */
export function writeGait(out: GaitPose, phase: number, run: number): void {
  const sprint = clamp(run, 0, 1);
  const sin = Math.sin(phase);
  const cos = Math.cos(phase);
  for (const joint in out) {
    const rotation = out[joint as Joint];
    rotation[0] = rotation[1] = rotation[2] = 0;
  }
  writeLeg(out, 'thigh.L', 'shin.L', 'foot.L', phase, sprint);
  writeLeg(out, 'thigh.R', 'shin.R', 'foot.R', phase + Math.PI, sprint);
  writeArm(out, 'upper_arm.L', 'forearm.L', 1, phase, sprint);
  writeArm(out, 'upper_arm.R', 'forearm.R', -1, phase + Math.PI, sprint);

  const lean = mix(0.05, 0.3, sprint);
  const hipTurn = mix(0.1, 0.16, sprint);
  const hipDrop = mix(0.045, 0.03, sprint);
  const shoulderTurn = mix(0.1, 0.22, sprint);
  out.torso[0] = lean;
  out.torso[1] = -hipTurn * sin;
  out.torso[2] = -hipDrop * cos;
  // The spine undoes the pelvis so the shoulders can counter-rotate and stay level.
  out.spine[1] = hipTurn * sin * 0.6;
  out.spine[2] = hipDrop * cos * 0.6;
  out.chest[1] = hipTurn * sin * 0.4 + shoulderTurn * sin;
  out.chest[2] = hipDrop * cos * 0.4;
  out.head[0] = -lean * 0.7;
  out.head[1] = -shoulderTurn * sin * 0.8;
}

/**
 * Small involuntary motion for a body that is standing or hovering: breathing,
 * a slow shift of weight, the head drifting. Written as offsets on top of a pose.
 */
export function writeIdleLife(out: GaitPose, time: number, amount: number): void {
  const breath = Math.sin(time * 1.7);
  const shift = Math.sin(time * 0.45);
  out.chest[0] = -0.02 * breath * amount;
  out.spine[0] = 0.008 * breath * amount;
  out.torso[1] = 0.02 * Math.sin(time * 0.31) * amount;
  out.torso[2] = 0.022 * shift * amount;
  out.spine[2] = -0.022 * shift * amount;
  out.head[0] = 0.012 * Math.sin(time * 1.7 + 1) * amount;
  out.head[1] = (0.06 * Math.sin(time * 0.23) + 0.03 * Math.sin(time * 0.61)) * amount;
}
