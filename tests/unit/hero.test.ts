import { Group, Object3D, Quaternion, Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { EventBus } from '../../src/core/EventBus';
import { Config } from '../../src/core/Config';
import type { GameEvents } from '../../src/core/GameEvents';
import { createGaitPose, writeGait, writeIdleLife } from '../../src/player/gait';
import { GroundContacts } from '../../src/player/GroundContacts';
import { HeroRig } from '../../src/player/HeroRig';
import { PlayerView } from '../../src/player/PlayerView';
import {
  JOINTS,
  movementPose,
  POSES,
  POSE_RESPONSE,
  type PoseName,
} from '../../src/player/heroPoses';
import { createTestPlayer, run, takeOff } from './helpers';

/** A stand-in for the loaded model: one node per joint, named as three.js names them. */
function fakeModel(skip: string[] = []): Group {
  const model = new Group();
  for (const joint of JOINTS) {
    if (skip.includes(joint)) continue;
    const node = new Object3D();
    node.name = joint.replace('.', '');
    model.add(node);
  }
  return model;
}

/** A skeleton with the real model's proportions and bone hierarchy, bones unrotated. */
function skeletonModel(): Group {
  const model = new Group();
  const bone = (name: string, parent: Object3D, x: number, y: number, z: number): Object3D => {
    const node = new Object3D();
    node.name = name;
    node.position.set(x, y, z);
    parent.add(node);
    return node;
  };
  const pelvis = bone('torso', model, 0, 0.96, 0);
  const chest = bone('chest', bone('spine', pelvis, 0, 0.12, 0), 0, 0.21, 0);
  bone('head', bone('neck', chest, 0, 0.295, 0), 0, 0.1, 0);
  for (const [tag, side] of [
    ['L', 1],
    ['R', -1],
  ] as const) {
    const forearm = bone(
      `forearm${tag}`,
      bone(`upper_arm${tag}`, chest, side * 0.226, 0.238, 0),
      side * 0.067,
      -0.292,
      0,
    );
    bone(`hand${tag}`, forearm, side * 0.06, -0.261, 0);
    const shin = bone(
      `shin${tag}`,
      bone(`thigh${tag}`, pelvis, side * 0.092, -0.005, 0),
      side * 0.006,
      -0.43,
      0.012,
    );
    bone(`foot${tag}`, shin, side * 0.002, -0.43, -0.027);
  }
  return model;
}

describe('hero poses', () => {
  it('only reference real joints, with sane angles', () => {
    for (const [name, pose] of Object.entries(POSES)) {
      for (const [joint, rotation] of Object.entries(pose)) {
        expect(JOINTS, `${name}.${joint}`).toContain(joint);
        for (const angle of rotation) expect(Math.abs(angle)).toBeLessThanOrEqual(Math.PI);
      }
      expect(POSE_RESPONSE[name as PoseName]).toBeGreaterThan(0);
    }
  });

  it('the flight state picks the pose', () => {
    const player = createTestPlayer();
    const pose = (): PoseName => movementPose(player.state, 0.5);
    expect(pose()).toBe('idle');
    run(player, 0.5, { moveZ: 1 });
    expect(['walkA', 'walkB']).toContain(pose());
    run(player, 0.1, { jumpPressed: true });
    expect(pose()).toBe('jump');
    run(player, 0.5, { jumpPressed: true });
    expect(pose()).toBe('hover');
    run(player, 1, { moveZ: 1 });
    expect(pose()).toBe('fly');
    run(player, 1, { moveZ: 1, boost: true });
    expect(pose()).toBe('boost');
    player.state.diving = true;
    expect(pose()).toBe('dive');
  });

  it('rising and descending with Space / C stay upright, not head-first', () => {
    const player = createTestPlayer();
    takeOff(player);
    run(player, 1);
    run(player, 2.5, { ascend: true });
    expect(movementPose(player.state, 0)).toBe('ascend');
    run(player, 1, { descend: true });
    expect(movementPose(player.state, 0)).toBe('descend');
    // The lean follows forward flight only, so a vertical descent has none.
    expect(player.state.cruise.length()).toBeLessThan(1);
    expect(player.state.velocity.y).toBeLessThan(-15);
  });

  it('walking alternates the two stride poses', () => {
    const player = createTestPlayer();
    run(player, 0.5, { moveZ: 1 });
    expect(movementPose(player.state, 1)).not.toBe(movementPose(player.state, 1 + Math.PI));
  });

  it('sideways flight and a slow coast do not raise the ascent fist', () => {
    const player = createTestPlayer();
    player.state.state = 'FLYING';
    player.state.velocity.set(20, 0, 0);
    expect(movementPose(player.state, 0)).toBe('hover');
    player.state.cruise.set(0, 0, -10);
    player.state.velocity.copy(player.state.cruise);
    expect(movementPose(player.state, 0)).toBe('hover');
  });

  it('rising off a rooftop uses a jump pose before falling', () => {
    const player = createTestPlayer();
    run(player, 0.1, { jumpPressed: true });
    expect(movementPose(player.state, 0)).toBe('jump');
    run(player, 0.35);
    expect(movementPose(player.state, 0)).toBe('fall');
  });

  it('landing shows the crouch', () => {
    const player = createTestPlayer();
    takeOff(player);
    run(player, 1, { ascend: true });
    let landed = false;
    for (let i = 0; i < 600 && !landed; i++) {
      run(player, 1 / 60, { descend: true });
      landed = movementPose(player.state, 0) === 'land';
    }
    expect(landed).toBe(true);
  });
});

describe('PlayerView transitions', () => {
  it('releases the landing pose when jumping again', () => {
    const events = new EventBus<GameEvents>();
    const player = createTestPlayer(0, events);
    const view = new PlayerView(new Scene(), player.state, events, fakeModel());
    player.state.state = 'LANDING';
    events.emit('player:state', { from: 'FLYING', to: 'LANDING' });
    view.update(1, 1 / 60);
    expect(view.debug.pose).toBe('land');
    player.state.state = 'JUMPING';
    player.state.velocity.y = 9;
    events.emit('player:state', { from: 'GROUND', to: 'JUMPING' });
    view.update(1, 1 / 60);
    expect(view.debug.pose).toBe('jump');
  });

  it('lets walking interrupt the held landing crouch', () => {
    const events = new EventBus<GameEvents>();
    const player = createTestPlayer(0, events);
    const view = new PlayerView(new Scene(), player.state, events, fakeModel());
    events.emit('player:state', { from: 'FLYING', to: 'LANDING' });
    player.state.velocity.z = -3;
    view.update(1, 1 / 60);
    expect(['walkA', 'walkB']).toContain(view.debug.pose);
  });

  it('shows a brief damage reaction and then returns to movement', () => {
    const events = new EventBus<GameEvents>();
    const player = createTestPlayer(0, events);
    const view = new PlayerView(new Scene(), player.state, events, fakeModel());
    events.emit('player:damaged', { amount: 10, health: 90 });
    view.update(1, 1 / 60);
    expect(view.debug.pose).toBe('damage');
    for (let i = 0; i < 30; i++) view.update(1, 1 / 60);
    expect(view.debug.pose).toBe('idle');
  });

  it('keeps the lowest foot, knee or fist on the surface without moving the gameplay or camera position', () => {
    const events = new EventBus<GameEvents>();
    const player = createTestPlayer(10, events);
    const model = skeletonModel();
    const scene = new Scene();
    const view = new PlayerView(scene, player.state, events, model);
    const surface = 10 - Config.player.height / 2;
    const measure = new GroundContacts(model, (joint) =>
      model.getObjectByName(joint.replace('.', '')),
    );
    const lowest = (): number => {
      scene.updateMatrixWorld(true);
      return measure.lowest();
    };
    // Standing, then crouched in the landing pose, then mid-stride.
    for (let i = 0; i < 30; i++) view.update(1, 1 / 60);
    expect(lowest()).toBeCloseTo(surface, 4);
    player.state.state = 'LANDING';
    events.emit('player:state', { from: 'FLYING', to: 'LANDING' });
    for (let i = 0; i < 60; i++) view.update(1, 1 / 60);
    expect(view.debug.pose).toBe('land');
    expect(lowest()).toBeCloseTo(surface, 4);
    player.state.state = 'GROUND';
    player.state.velocity.set(0, 0, -6);
    for (let i = 0; i < 180; i++) {
      view.update(1, 1 / 60);
      // Never in the ground, and never more than a step's lift above it.
      expect(lowest()).toBeGreaterThan(surface - 1e-4);
      expect(lowest()).toBeLessThan(surface + 0.08);
    }
    expect(player.state.position.y).toBe(10);
    expect(view.position.y).toBe(10);
  });

  it('the body glides over a stride instead of bouncing', () => {
    const events = new EventBus<GameEvents>();
    const player = createTestPlayer(10, events);
    const model = skeletonModel();
    const scene = new Scene();
    const view = new PlayerView(scene, player.state, events, model);
    const pelvis = model.getObjectByName('torso')!;
    player.state.velocity.set(0, 0, -6);
    let low = Infinity;
    let high = -Infinity;
    const height = new Vector3();
    for (let i = 0; i < 240; i++) {
      view.update(1, 1 / 60);
      if (i < 60) continue;
      scene.updateMatrixWorld(true);
      const y = pelvis.getWorldPosition(height).y;
      low = Math.min(low, y);
      high = Math.max(high, y);
    }
    expect(high - low).toBeLessThan(0.05);
  });
});

describe('HeroRig', () => {
  it('finds every joint by its exported name', () => {
    expect(new HeroRig(fakeModel()).jointCount).toBe(JOINTS.length);
  });

  it('tolerates a model with a joint missing', () => {
    const rig = new HeroRig(fakeModel(['hand.L']));
    expect(rig.jointCount).toBe(JOINTS.length - 1);
    rig.setPose('punch');
    rig.update(1 / 60);
  });

  it('eases joints into a pose instead of snapping, and settles on it', () => {
    const model = fakeModel();
    const rig = new HeroRig(model);
    const arm = model.getObjectByName('upper_armR')!;
    rig.setPose('fly');
    rig.update(1 / 60);
    const afterOneFrame = arm.quaternion.angleTo(new Object3D().quaternion);
    expect(afterOneFrame).toBeGreaterThan(0);
    expect(afterOneFrame).toBeLessThan(1);
    for (let i = 0; i < 240; i++) rig.update(1 / 60);
    expect(arm.quaternion.angleTo(new Object3D().quaternion)).toBeGreaterThan(2.5); // arm overhead
  });

  it('the stride is continuous across a half-cycle instead of switching extremes', () => {
    const model = fakeModel();
    const rig = new HeroRig(model);
    const thigh = model.getObjectByName('thighL')!;
    rig.setWalk(-0.001, 1);
    rig.update(2);
    const before = thigh.quaternion.clone();
    rig.setWalk(0.001, 1);
    rig.update(2);
    expect(thigh.quaternion.angleTo(before)).toBeLessThan(0.003);
  });

  it('small movement fades the stride into idle', () => {
    const model = fakeModel();
    const rig = new HeroRig(model);
    rig.setWalk(Math.PI / 2, 0);
    rig.update(2);
    expect(model.getObjectByName('thighL')!.quaternion.angleTo(new Object3D().quaternion)).toBe(0);
  });

  it('pose easing is consistent at 30, 60 and 144 rendered frames per second', () => {
    const results = [30, 60, 144].map((fps) => {
      const model = fakeModel();
      const rig = new HeroRig(model);
      rig.setPose('fly');
      for (let frame = 0; frame < fps; frame++) rig.update(1 / fps);
      return model.getObjectByName('upper_armR')!.quaternion.clone();
    });
    for (const result of results) expect(result.angleTo(results[0]!)).toBeLessThan(1e-6);
  });

  it('the walk cycle actually swings the legs, opposite to each other, and fades with speed', () => {
    const model = fakeModel();
    const rig = new HeroRig(model);
    const left = model.getObjectByName('thighL')!;
    const right = model.getObjectByName('thighR')!;
    let leftMin = 0;
    let leftMax = 0;
    let opposed = 0;
    for (let i = 0; i < 240; i++) {
      rig.setWalk(i * 0.12, 1);
      rig.update(1 / 60);
      leftMin = Math.min(leftMin, left.rotation.x);
      leftMax = Math.max(leftMax, left.rotation.x);
      if (left.rotation.x * right.rotation.x < 0) opposed++;
    }
    expect(leftMin).toBeLessThan(-0.3); // swings forward
    expect(leftMax).toBeGreaterThan(0.25); // and back
    expect(opposed).toBeGreaterThan(150); // legs are out of phase most of the time

    // At a crawl the stride is small.
    const slow = fakeModel();
    const slowRig = new HeroRig(slow);
    let reach = 0;
    for (let i = 0; i < 240; i++) {
      slowRig.setWalk(i * 0.12, 0.15);
      slowRig.update(1 / 60);
      reach = Math.max(reach, Math.abs(slow.getObjectByName('thighL')!.rotation.x));
    }
    expect(reach).toBeGreaterThan(0.02);
    expect(reach).toBeLessThan(0.15);
  });
});

describe('skeleton with rotated bones', () => {
  /** A leg whose bones point down their own +Y, the way Blender exports them. */
  function rotatedLeg(): { model: Group; thigh: Object3D; foot: Object3D } {
    const model = new Group();
    model.rotation.y = Math.PI;
    const pelvis = new Object3D();
    pelvis.name = 'torso';
    pelvis.position.y = 1;
    const thigh = new Object3D();
    thigh.name = 'thighL';
    thigh.rotation.set(Math.PI, 0.3, 0); // bone axis points down, and is rolled
    const foot = new Object3D();
    foot.name = 'footL';
    foot.position.y = 0.9; // down the bone
    model.add(pelvis);
    pelvis.add(thigh);
    thigh.add(foot);
    return { model, thigh, foot };
  }

  it('leaves the rest pose alone when the pose says nothing', () => {
    const { model, thigh } = rotatedLeg();
    const rest = thigh.quaternion.clone();
    const rig = new HeroRig(model);
    rig.update(1);
    expect(thigh.quaternion.angleTo(rest)).toBeLessThan(1e-6);
  });

  it('swings a limb in the model frame whatever way its bone points', () => {
    const { model, foot } = rotatedLeg();
    const rig = new HeroRig(model);
    const at = (): Vector3 => {
      model.updateMatrixWorld(true);
      return model.worldToLocal(foot.getWorldPosition(new Vector3()));
    };
    expect(at().y).toBeCloseTo(0.1, 5);
    rig.setPose('dive'); // thigh.L: a small swing back
    for (let i = 0; i < 300; i++) rig.update(1 / 60);
    // Negative X swings forward (+Z); the dive pose swings back a little.
    expect(at().z).toBeLessThan(-0.02);
    expect(at().y).toBeGreaterThan(0.1);
    expect(Math.abs(at().x)).toBeLessThan(1e-4);
  });

  it('shares a head rotation between the neck and the head', () => {
    const model = fakeModel();
    const rig = new HeroRig(model);
    rig.setPose('fly');
    for (let i = 0; i < 600; i++) rig.update(1 / 60);
    const neck = model.getObjectByName('neck')!.quaternion;
    const head = model.getObjectByName('head')!.quaternion;
    const still = new Quaternion();
    expect(neck.angleTo(still)).toBeGreaterThan(0.3);
    expect(head.angleTo(still)).toBeGreaterThan(neck.angleTo(still));
    expect(neck.clone().multiply(head).angleTo(still)).toBeCloseTo(1.0, 1);
  });
});

describe('gait', () => {
  const pose = createGaitPose(JOINTS);

  it('opposite arm and leg move together, and the shoulders turn against the hips', () => {
    for (let phase = 0; phase < Math.PI * 2; phase += 0.1) {
      writeGait(pose, phase, 0.3);
      // Left leg forward (negative) goes with left arm back (positive).
      expect(Math.sin(phase) * pose['upper_arm.L'][0]).toBeGreaterThanOrEqual(0);
      if (Math.abs(Math.sin(phase)) > 0.3)
        expect(Math.sin(phase) * (pose['thigh.L'][0] - pose['thigh.R'][0])).toBeLessThan(0);
      expect(pose['upper_arm.L'][0]).toBeCloseTo(-pose['upper_arm.R'][0], 6);
      expect(pose.torso[1] * pose.chest[1]).toBeLessThanOrEqual(0);
    }
  });

  it('bends the knee in the swing, straightens it to strike, and gives a little under load', () => {
    writeGait(pose, -0.4, 0); // left leg passing under the body, moving forward
    const swinging = pose['shin.L'][0];
    writeGait(pose, Math.PI / 2, 0); // reaching forward for the heel strike
    const striking = pose['shin.L'][0];
    writeGait(pose, Math.PI, 0); // planted, body passing over it
    expect(swinging).toBeGreaterThan(0.9);
    expect(striking).toBeLessThan(0.2);
    expect(pose['shin.L'][0]).toBeGreaterThan(striking);
    expect(pose['shin.L'][0]).toBeLessThan(0.6);
  });

  it('a sprint strides longer, bends more and leans in', () => {
    let walk = 0;
    let sprint = 0;
    for (let phase = 0; phase < Math.PI * 2; phase += 0.05) {
      writeGait(pose, phase, 0);
      walk = Math.max(walk, -pose['thigh.L'][0]);
      writeGait(pose, phase, 1);
      sprint = Math.max(sprint, -pose['thigh.L'][0]);
    }
    expect(sprint).toBeGreaterThan(walk * 1.5);
    writeGait(pose, 1, 1);
    expect(pose.torso[0]).toBeGreaterThan(0.2);
    expect(pose['forearm.L'][0]).toBeLessThan(-1);
  });

  it('a resting body breathes, and stops when asked', () => {
    const life = createGaitPose(JOINTS);
    let moved = 0;
    for (let time = 0; time < 8; time += 0.1) {
      writeIdleLife(life, time, 1);
      moved = Math.max(moved, Math.abs(life.chest[0]));
      for (const joint of JOINTS)
        for (const angle of life[joint]) expect(Math.abs(angle)).toBeLessThan(0.12);
    }
    expect(moved).toBeGreaterThan(0.01);
    writeIdleLife(life, 3, 0);
    for (const joint of JOINTS) expect(life[joint].every((angle) => angle === 0)).toBe(true);
  });
});
