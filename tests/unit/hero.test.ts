import { Group, Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { HeroRig } from '../../src/player/HeroRig';
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
    expect(pose()).toBe('fall');
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
});
