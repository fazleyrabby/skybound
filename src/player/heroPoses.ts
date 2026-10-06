import { Config } from '../core/Config';
import type { PlayerState } from './PlayerState';

/**
 * Joints of the Aether model, named as exported from Blender
 * (blender/characters/export_aether.py). The model is rigid segments on a
 * node hierarchy, not a skinned mesh, so a pose is one rotation per joint.
 */
export const JOINTS = [
  'torso',
  'head',
  'upper_arm.L',
  'forearm.L',
  'hand.L',
  'upper_arm.R',
  'forearm.R',
  'hand.R',
  'thigh.L',
  'shin.L',
  'foot.L',
  'thigh.R',
  'shin.R',
  'foot.R',
] as const;
export type Joint = (typeof JOINTS)[number];

/**
 * Euler XYZ in radians, in the model's own frame: +Y up, +Z forward (the way
 * the hero faces), +X the hero's left. For a limb hanging down:
 *   negative X swings it forward, positive X swings it back;
 *   Z raises an arm out to the side (positive for the left arm, negative for the right).
 * Joints not listed stay at rest.
 */
export type Pose = Partial<Record<Joint, readonly [x: number, y: number, z: number]>>;

export type PoseName =
  | 'idle'
  | 'walkA'
  | 'walkB'
  | 'jump'
  | 'fall'
  | 'land'
  | 'hover'
  | 'ascend'
  | 'descend'
  | 'fly'
  | 'boost'
  | 'dive'
  | 'charge'
  | 'punch'
  | 'blast'
  | 'damage';

export const POSES: Record<PoseName, Pose> = {
  idle: {
    'upper_arm.L': [0, 0, 0.06],
    'upper_arm.R': [0, 0, -0.06],
    'forearm.L': [-0.12, 0, 0],
    'forearm.R': [-0.12, 0, 0],
  },
  // Two extremes of a stride; the rig swings between them.
  walkA: {
    'thigh.L': [-0.55, 0, 0],
    'shin.L': [0.25, 0, 0],
    'thigh.R': [0.45, 0, 0],
    'shin.R': [0.7, 0, 0],
    'upper_arm.L': [0.45, 0, 0.08],
    'upper_arm.R': [-0.45, 0, -0.08],
    'forearm.L': [-0.5, 0, 0],
    'forearm.R': [-0.7, 0, 0],
  },
  walkB: {
    'thigh.R': [-0.55, 0, 0],
    'shin.R': [0.25, 0, 0],
    'thigh.L': [0.45, 0, 0],
    'shin.L': [0.7, 0, 0],
    'upper_arm.R': [0.45, 0, -0.08],
    'upper_arm.L': [-0.45, 0, 0.08],
    'forearm.R': [-0.5, 0, 0],
    'forearm.L': [-0.7, 0, 0],
  },
  jump: {
    torso: [0.08, 0, 0],
    head: [-0.15, 0, 0],
    'upper_arm.L': [-0.65, 0, 0.2],
    'upper_arm.R': [0.4, 0, -0.2],
    'forearm.L': [-1.1, 0, 0],
    'forearm.R': [-0.75, 0, 0],
    'thigh.L': [-0.65, 0, 0],
    'shin.L': [1.0, 0, 0],
    'thigh.R': [0.2, 0, 0],
    'shin.R': [0.5, 0, 0],
  },
  fall: {
    'upper_arm.L': [-0.2, 0, 0.95],
    'upper_arm.R': [-0.2, 0, -0.95],
    'forearm.L': [-0.5, 0, 0],
    'forearm.R': [-0.5, 0, 0],
    'thigh.L': [-0.45, 0, 0],
    'shin.L': [0.8, 0, 0],
    'thigh.R': [-0.1, 0, 0],
    'shin.R': [0.45, 0, 0],
  },
  // Superhero landing: one knee forward, the other dropped back, a fist to the ground.
  land: {
    torso: [0.5, 0, 0],
    head: [-0.55, 0, 0],
    'thigh.L': [-1.75, 0, 0],
    'shin.L': [1.9, 0, 0],
    'foot.L': [-0.25, 0, 0],
    'thigh.R': [-0.35, 0, 0],
    'shin.R': [1.85, 0, 0],
    'foot.R': [0.9, 0, 0],
    'upper_arm.R': [-0.75, 0, -0.1],
    'forearm.R': [-0.15, 0, 0],
    'upper_arm.L': [0.5, 0, 0.85],
    'forearm.L': [-0.5, 0, 0],
  },
  hover: {
    'upper_arm.L': [0.05, 0, 0.32],
    'upper_arm.R': [0.05, 0, -0.32],
    'forearm.L': [-0.4, 0, 0],
    'forearm.R': [-0.4, 0, 0],
    'thigh.L': [-0.3, 0, 0],
    'shin.L': [0.6, 0, 0],
    'thigh.R': [0.05, 0, 0],
    'shin.R': [0.2, 0, 0],
    'foot.L': [0.5, 0, 0],
    'foot.R': [0.5, 0, 0],
  },
  // Rising straight up: one fist raised, one knee lifted.
  ascend: {
    head: [-0.35, 0, 0],
    'upper_arm.R': [-2.9, 0, 0.12],
    'upper_arm.L': [0.1, 0, 0.18],
    'forearm.L': [-0.5, 0, 0],
    'thigh.L': [-0.75, 0, 0],
    'shin.L': [1.25, 0, 0],
    'thigh.R': [0.05, 0, 0],
    'foot.L': [0.6, 0, 0],
    'foot.R': [0.8, 0, 0],
  },
  // Coming straight down, upright: arms out and low for balance, legs braced to land.
  descend: {
    head: [0.3, 0, 0],
    'upper_arm.L': [-0.1, 0, 0.62],
    'upper_arm.R': [-0.1, 0, -0.62],
    'forearm.L': [-0.25, 0, 0],
    'forearm.R': [-0.25, 0, 0],
    'hand.L': [-0.5, 0, 0],
    'hand.R': [-0.5, 0, 0],
    'thigh.L': [-0.22, 0, 0.06],
    'shin.L': [0.4, 0, 0],
    'thigh.R': [-0.05, 0, -0.06],
    'shin.R': [0.2, 0, 0],
    'foot.L': [0.3, 0, 0],
    'foot.R': [0.3, 0, 0],
  },
  // One fist forward, the other arm back along the body.
  fly: {
    head: [-1.0, 0, 0],
    'upper_arm.R': [-2.95, 0, 0.1],
    'hand.R': [-0.2, 0, 0],
    'upper_arm.L': [0.3, 0, 0.12],
    'forearm.L': [-0.25, 0, 0],
    'thigh.L': [0.08, 0, 0],
    'thigh.R': [0.12, 0, 0],
    'shin.R': [0.12, 0, 0],
    'foot.L': [0.95, 0, 0],
    'foot.R': [0.95, 0, 0],
  },
  // Both arms swept back: the fast silhouette.
  boost: {
    head: [-1.1, 0, 0],
    'upper_arm.L': [0.55, 0, 0.3],
    'upper_arm.R': [0.55, 0, -0.3],
    'forearm.L': [-0.1, 0, 0],
    'forearm.R': [-0.1, 0, 0],
    'thigh.L': [0.1, 0, 0],
    'thigh.R': [0.1, 0, 0],
    'foot.L': [1.0, 0, 0],
    'foot.R': [1.0, 0, 0],
  },
  dive: {
    head: [-0.75, 0, 0],
    'upper_arm.L': [-2.95, 0, -0.08],
    'upper_arm.R': [-2.95, 0, 0.08],
    'thigh.L': [0.05, 0, 0],
    'thigh.R': [0.05, 0, 0],
    'foot.L': [1.0, 0, 0],
    'foot.R': [1.0, 0, 0],
  },
  // Right fist cocked back while a heavy punch charges.
  charge: {
    torso: [0, 0.35, 0],
    'upper_arm.R': [0.85, 0, -0.25],
    'forearm.R': [-2.1, 0, 0],
    'upper_arm.L': [-1.1, 0, 0.2],
    'forearm.L': [-0.7, 0, 0],
  },
  punch: {
    torso: [0, -0.4, 0],
    head: [-0.3, 0.3, 0],
    'upper_arm.R': [-1.6, 0, 0.1],
    'forearm.R': [0, 0, 0],
    'upper_arm.L': [0.6, 0, 0.2],
    'forearm.L': [-1.9, 0, 0],
    'thigh.L': [-0.35, 0, 0],
    'shin.L': [0.5, 0, 0],
    'thigh.R': [0.35, 0, 0],
    'shin.R': [0.3, 0, 0],
  },
  blast: {
    head: [-0.2, 0, 0],
    'upper_arm.R': [-1.55, 0, 0.05],
    'hand.R': [-0.9, 0, 0],
    'upper_arm.L': [0.1, 0, 0.3],
    'forearm.L': [-0.5, 0, 0],
  },
  damage: {
    torso: [-0.18, 0, 0.12],
    head: [0.25, 0, 0],
    'upper_arm.L': [-0.6, 0, 0.5],
    'upper_arm.R': [-0.5, 0, -0.4],
    'forearm.L': [-1.2, 0, 0],
    'forearm.R': [-1.0, 0, 0],
    'thigh.L': [-0.3, 0, 0],
    'shin.L': [0.6, 0, 0],
    'thigh.R': [0.1, 0, 0],
    'shin.R': [0.35, 0, 0],
  },
};

/** How quickly joints move into each pose, 1/s. Attacks snap; flight eases. */
export const POSE_RESPONSE: Record<PoseName, number> = Config.hero.poseResponse;

/** The pose flight and ground state call for, before any attack overrides it. */
export function movementPose(state: PlayerState, stridePhase: number): PoseName {
  switch (state.state) {
    case 'LANDING':
      return 'land';
    case 'GROUND':
      if (Math.hypot(state.velocity.x, state.velocity.z) < Config.hero.walkMinSpeed) return 'idle';
      return Math.sin(stridePhase) > 0 ? 'walkA' : 'walkB';
    case 'JUMPING':
      return state.velocity.y > 0 ? 'jump' : 'fall';
    case 'HOVERING':
      return hoverPose(state);
    case 'BOOSTING':
      return state.diving ? 'dive' : 'boost';
    case 'FLYING':
      // Space or C alone still counts as FLYING by speed; keep the hero upright.
      if (state.cruise.length() < Config.hero.verticalPoseMaxCruise) return hoverPose(state);
      return state.diving ? 'dive' : 'fly';
  }
}

function hoverPose(state: PlayerState): PoseName {
  if (state.cruise.length() < Config.hero.verticalPoseMaxCruise) {
    if (state.velocity.y < -Config.hero.verticalPoseSpeed) return 'descend';
    if (state.velocity.y > Config.hero.verticalPoseSpeed) return 'ascend';
  }
  return 'hover';
}
