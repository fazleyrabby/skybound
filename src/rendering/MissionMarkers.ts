import {
  CylinderGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  TorusGeometry,
  type PerspectiveCamera,
  type Scene,
} from 'three';
import type { MissionManager } from '../missions/MissionManager';

const BEACON_HEIGHT = 46;
const BEACON_RADIUS = 1.3;
const MAX_BEACONS = 4;

/**
 * Mission markers in the world: a light pillar at each mission the player can
 * start, a ring to fly through at the current checkpoint, and a flat ring on a
 * spot to reach or land on.
 */
export class MissionMarkers {
  private readonly beacons: Mesh[] = [];
  private readonly ring: Mesh;
  private time = 0;

  constructor(
    scene: Scene,
    private readonly camera: PerspectiveCamera,
    private readonly missions: MissionManager,
  ) {
    const beaconGeometry = new CylinderGeometry(
      BEACON_RADIUS,
      BEACON_RADIUS,
      BEACON_HEIGHT,
      12,
      1,
      true,
    );
    for (let i = 0; i < MAX_BEACONS; i++) {
      const beacon = new Mesh(
        beaconGeometry,
        new MeshBasicMaterial({
          color: 0x6edcff,
          transparent: true,
          opacity: 0.4,
          side: DoubleSide,
          depthWrite: false,
          fog: false,
        }),
      );
      beacon.visible = false;
      this.beacons.push(beacon);
      scene.add(beacon);
    }

    this.ring = new Mesh(
      new TorusGeometry(1, 0.045, 8, 48),
      new MeshBasicMaterial({ color: 0x6edcff, fog: false }),
    );
    this.ring.visible = false;
    scene.add(this.ring);
  }

  update(frameDelta: number): void {
    this.time += frameDelta;
    const pulse = 0.34 + Math.sin(this.time * 3) * 0.1;

    const available = this.missions.available;
    this.beacons.forEach((beacon, index) => {
      const mission = available[index];
      beacon.visible = mission !== undefined;
      if (!mission) return;
      beacon.position.set(mission.beacon.x, mission.beacon.y + BEACON_HEIGHT / 2, mission.beacon.z);
      const material = beacon.material as MeshBasicMaterial;
      material.opacity = pulse;
      // Finished missions stay replayable but read as done.
      material.color.setHex(this.missions.isCompleted(mission.id) ? 0x7dffa0 : 0x6edcff);
    });

    const target = this.missions.target;
    this.ring.visible = target !== null;
    if (!target) return;
    this.ring.position.set(target.x, target.y, target.z);
    this.ring.scale.setScalar(target.radius);
    if (target.kind === 'ring') {
      // Face the player so the opening is always readable.
      this.ring.quaternion.copy(this.camera.quaternion);
    } else {
      this.ring.rotation.set(Math.PI / 2, 0, 0);
    }
  }
}
