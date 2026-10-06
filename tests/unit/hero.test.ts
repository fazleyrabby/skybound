import { Box3, BoxGeometry, Group, Mesh, Object3D, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { EventBus } from '../../src/core/EventBus';
import type { GameEvents } from '../../src/core/GameEvents';
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

  it('keeps a bent leg on the surface without moving the gameplay or camera position', () => {
    const events = new EventBus<GameEvents>();
    const player = createTestPlayer(10, events);
    const model = fakeModel();
    const thigh = model.getObjectByName('thighL')!;
    thigh.position.y = 1;
    const boot = new Mesh(new BoxGeometry(0.1, 0.2, 0.2));
    boot.position.y = -0.9;
    thigh.add(boot);
    const scene = new Scene();
    const view = new PlayerView(scene, player.state, events, model);
    player.state.state = 'LANDING';
    for (let i = 0; i < 60; i++) view.update(1, 1 / 60);
    scene.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(model);
    expect(bounds.min.y).toBeCloseTo(10 - 1.9 / 2, 6);
    expect(player.state.position.y).toBe(10);
    expect(view.position.y).toBe(10);
    boot.geometry.dispose();
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
});
