import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CameraRig, type CameraObstacleQuery } from '../../src/camera/CameraRig';
import { Config } from '../../src/core/Config';
import { EventBus } from '../../src/core/EventBus';
import type { GameEvents } from '../../src/core/GameEvents';
import { createTestPlayer, run, takeOff } from './helpers';

const FRAME = 1 / 60;

function createRig(obstacleAt = Infinity) {
  const events = new EventBus<GameEvents>();
  const player = createTestPlayer(0, events);
  const camera = new PerspectiveCamera(Config.render.fov, 16 / 9, 0.1, 8000);
  const obstacles: CameraObstacleQuery = {
    castSphere: (_origin, _direction, maxDistance) => Math.min(maxDistance, obstacleAt),
  };
  const rig = new CameraRig(camera, player.state, obstacles, events);
  const frames = (count: number): void => {
    for (let i = 0; i < count; i++) rig.update(1, FRAME);
  };
  return { rig, camera, player, events, frames };
}

describe('CameraRig', () => {
  it('sits behind the hero along the aim direction', () => {
    const { camera, player, frames } = createRig();
    frames(1);
    expect(camera.position.z - player.state.position.z).toBeCloseTo(Config.camera.distance, 3);
    expect(camera.fov).toBeCloseTo(Config.render.fov, 3);
  });

  it('orbits with the aim without moving the hero', () => {
    const { camera, player, frames } = createRig();
    const before = player.state.position.clone();
    player.state.aim.yaw = Math.PI / 2; // looking toward -X, so the camera sits at +X
    frames(1);
    expect(camera.position.x - player.state.position.x).toBeCloseTo(Config.camera.distance, 3);
    expect(player.state.position.equals(before)).toBe(true);
    expect(player.state.heading).toBe(0);
  });

  it('widens the FOV and pulls back with speed, within the cap', () => {
    const { rig, camera, player, frames } = createRig();
    takeOff(player);
    player.state.velocity.set(0, 0, -Config.flight.extremeSpeed);
    frames(240);
    expect(camera.fov).toBeGreaterThan(Config.render.fov + 20);
    expect(camera.fov).toBeLessThanOrEqual(Config.camera.maxFov);
    expect(rig.debug.distance).toBeCloseTo(Config.camera.distanceMax, 1);
  });

  it('never changes FOV or distance abruptly, even on boost entry', () => {
    const { rig, camera, player, events, frames } = createRig();
    frames(1);
    player.state.velocity.set(0, 0, -Config.flight.extremeSpeed);
    events.emit('player:state', { from: 'FLYING', to: 'BOOSTING' });
    let lastFov = camera.fov;
    let lastDistance = rig.debug.distance;
    for (let i = 0; i < 120; i++) {
      frames(1);
      expect(Math.abs(camera.fov - lastFov)).toBeLessThan(3);
      expect(Math.abs(rig.debug.distance - lastDistance)).toBeLessThan(0.5);
      lastFov = camera.fov;
      lastDistance = rig.debug.distance;
    }
  });

  it('pulls in front of an obstacle and eases back out when it clears', () => {
    const blocked = createRig(2);
    blocked.frames(1);
    expect(blocked.rig.debug.distance).toBeCloseTo(2, 5);

    let obstacleAt = 2;
    const events = new EventBus<GameEvents>();
    const player = createTestPlayer(0, events);
    const camera = new PerspectiveCamera();
    const rig = new CameraRig(
      camera,
      player.state,
      { castSphere: (_o, _d, max) => Math.min(max, obstacleAt) },
      events,
    );
    rig.update(1, FRAME);
    obstacleAt = Infinity;
    rig.update(1, FRAME);
    expect(rig.debug.distance).toBeGreaterThan(2);
    expect(rig.debug.distance).toBeLessThan(3); // eases, does not jump back
    for (let i = 0; i < 300; i++) rig.update(1, FRAME);
    expect(rig.debug.distance).toBeCloseTo(Config.camera.distance, 1);
  });

  it('shake decays to nothing and respects the shake setting', () => {
    const { camera, events, frames } = createRig();
    const rest = new Vector3();
    frames(1);
    camera.getWorldDirection(rest);

    events.emit('player:impact', { speed: 120, headOn: 1, bounced: true });
    frames(1);
    expect(camera.getWorldDirection(new Vector3()).angleTo(rest)).toBeGreaterThan(1e-4);
    frames(120);
    expect(camera.getWorldDirection(new Vector3()).angleTo(rest)).toBeLessThan(1e-6);

    const scale = Config.camera.shakeScale;
    Config.camera.shakeScale = 0;
    events.emit('player:impact', { speed: 120, headOn: 1, bounced: true });
    frames(1);
    expect(camera.getWorldDirection(new Vector3()).angleTo(rest)).toBeLessThan(1e-6);
    Config.camera.shakeScale = scale;
  });

  it('keeps horizon roll within the cap', () => {
    const { rig, player, frames } = createRig();
    player.state.velocity.set(0, 0, -200);
    for (let i = 0; i < 120; i++) {
      player.state.aim.yaw += 0.2; // violent mouse swing
      frames(1);
      expect(Math.abs(rig.debug.roll)).toBeLessThanOrEqual(3.0001);
    }
  });
});

describe('player events', () => {
  it('announces state changes once each', () => {
    const events = new EventBus<GameEvents>();
    const seen: string[] = [];
    events.on('player:state', ({ from, to }) => seen.push(`${from}>${to}`));
    const player = createTestPlayer(0, events);
    takeOff(player);
    run(player, 1, { moveZ: 1 });
    run(player, 1, { moveZ: 1, boost: true });
    expect(seen).toEqual([
      'GROUND>JUMPING',
      'JUMPING>HOVERING',
      'HOVERING>FLYING',
      'FLYING>BOOSTING',
    ]);
  });
});
