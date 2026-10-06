import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
  type Scene,
} from 'three';
import { Config } from '../../core/Config';
import { lerp } from '../../utils/math';
import type { Titan } from './Titan';
import type { TitanAttacks } from './TitanAttacks';

const UP = new Vector3(0, 1, 0);
const HULL_COLOR = new Color(0x3d434e);
const FLASH_COLOR = new Color(0xffffff);
const DANGER_COLOR = new Color(0xff3020);
const FLASH_TIME = 0.1;

/**
 * Graybox Titan: hull, head, engine pods, wings, armour plates that come off
 * in phase 2 and a reactor that shows in phase 3. Weak points glow where they
 * are exposed. Also draws the laser (warning line, then beam) and the pulse.
 */
export class TitanView {
  private readonly root = new Group();
  private readonly hull: MeshStandardMaterial;
  private readonly armor: Mesh[] = [];
  private readonly weakGlows: Mesh[] = [];
  private readonly laser: Mesh;
  private readonly laserMaterial: MeshBasicMaterial;
  private readonly pulse: Mesh;
  private readonly pulseMaterial: MeshBasicMaterial;
  private readonly position = new Vector3();

  constructor(
    scene: Scene,
    private readonly titan: Titan,
    private readonly attacks: TitanAttacks,
  ) {
    this.hull = new MeshStandardMaterial({ color: HULL_COLOR, roughness: 0.55, metalness: 0.4 });
    const plate = new MeshStandardMaterial({ color: 0x8b929e, roughness: 0.4, metalness: 0.5 });
    const dark = new MeshStandardMaterial({ color: 0x1c2027, roughness: 0.6 });
    const eye = new MeshStandardMaterial({
      color: 0xff4020,
      emissive: 0xff2000,
      emissiveIntensity: 3,
    });

    const box = (
      material: MeshStandardMaterial,
      size: [number, number, number],
      at: [number, number, number],
    ): Mesh => {
      const mesh = new Mesh(new BoxGeometry(...size), material);
      mesh.position.set(...at);
      this.root.add(mesh);
      return mesh;
    };

    box(this.hull, [20, 7, 28], [0, 0, 0]);
    box(this.hull, [8, 5, 7], [0, 1, -16.5]); // head
    box(eye, [5, 1.2, 0.6], [0, 1.6, -20.1]);
    box(dark, [7, 3, 9], [0, 5, 6]); // dorsal turret
    box(dark, [1.2, 7, 8], [0, 6, 12]); // tail fin
    for (const side of [-1, 1]) {
      box(this.hull, [6, 6, 13], [side * 15, 1, 9]); // engine pod
      box(dark, [13, 1.2, 10], [side * 14, 2.5, -4]); // wing
      box(dark, [2, 2, 9], [side * 8, -3, -14]); // gun
      // Armour over the vents: blown off when phase 1 breaks.
      this.armor.push(box(plate, [9, 2.4, 10], [side * 8, 5.2, -4]));
    }
    this.armor.push(box(plate, [11, 2.4, 13], [0, -4.6, 0])); // belly plate over the reactor

    // A glow on each weak point, shown only while it is exposed.
    for (const point of titan.weakPoints) {
      const reactor = point.kind === 'reactor';
      const glow = new Mesh(
        new SphereGeometry(point.radius * (reactor ? 1.1 : 0.85), 16, 12),
        new MeshStandardMaterial({
          color: reactor ? 0x9ff4ff : 0xffa030,
          emissive: reactor ? 0x40d0ff : 0xff6a00,
          emissiveIntensity: 2.5,
        }),
      );
      glow.position.copy(point.offset);
      this.weakGlows.push(glow);
      this.root.add(glow);
    }

    this.laserMaterial = new MeshBasicMaterial({
      color: 0xff3020,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      fog: false,
    });
    this.laser = new Mesh(new CylinderGeometry(1, 1, 1, 10, 1, true), this.laserMaterial);
    this.laser.geometry.translate(0, 0.5, 0); // origin at one end, pointing along +Y

    this.pulseMaterial = new MeshBasicMaterial({
      color: 0xff7030,
      transparent: true,
      opacity: 0.2,
      side: DoubleSide,
      depthWrite: false,
      fog: false,
    });
    this.pulse = new Mesh(new SphereGeometry(1, 32, 16), this.pulseMaterial);

    this.root.visible = false;
    this.laser.visible = false;
    this.pulse.visible = false;
    scene.add(this.root, this.laser, this.pulse);
  }

  update(alpha: number): void {
    const titan = this.titan;
    this.root.visible = titan.alive;
    if (!titan.alive) {
      this.laser.visible = false;
      this.pulse.visible = false;
      return;
    }

    this.position.lerpVectors(titan.previousPosition, titan.position, alpha);
    this.root.position.copy(this.position);
    this.root.rotation.set(0, lerp(titan.previousYaw, titan.yaw, alpha), 0);
    if (titan.state === 'DYING') {
      // Shudder and list as it goes down.
      this.root.rotation.z = Math.sin(titan.stateTime * 23) * 0.05 + titan.stateTime * 0.08;
      this.root.rotation.x = Math.sin(titan.stateTime * 17) * 0.04;
    }

    for (const plate of this.armor) plate.visible = titan.phase === 1;
    titan.weakPoints.forEach((point, index) => {
      const glow = this.weakGlows[index];
      if (glow) glow.visible = point.alive;
    });

    // Hull flashes white when hit, and glows red while it winds up a swipe or pulse.
    const flash = Math.max(0, 1 - titan.sinceHit / FLASH_TIME);
    const danger = Math.max(this.attacks.meleeWindup, this.attacks.pulseCharge);
    this.hull.emissive
      .copy(DANGER_COLOR)
      .multiplyScalar(danger * 0.8)
      .lerp(FLASH_COLOR, flash * 0.7);

    this.updateLaser();
    this.updatePulse();
  }

  private updateLaser(): void {
    const attacks = this.attacks;
    this.laser.visible = attacks.laserState !== 'idle';
    if (!this.laser.visible) return;
    const firing = attacks.laserState === 'fire';
    // Thin warning line while charging; full beam when firing.
    const radius = firing ? Config.titan.laserRadius * 0.6 : 0.3;
    this.laser.position.copy(attacks.laserOrigin);
    this.laser.quaternion.setFromUnitVectors(UP, attacks.laserDirection);
    this.laser.scale.set(radius, attacks.laserReach, radius);
    this.laserMaterial.opacity = firing ? 0.9 : 0.4;
    this.laserMaterial.color.setHex(firing ? 0xffd0a0 : 0xff3020);
  }

  private updatePulse(): void {
    const attacks = this.attacks;
    const radius = attacks.pulseRadius;
    this.pulse.visible = radius > 0;
    if (!this.pulse.visible) return;
    this.pulse.position.copy(this.position);
    this.pulse.scale.setScalar(radius);
    this.pulseMaterial.opacity = 0.28 * (1 - radius / Config.titan.pulseMaxRadius) + 0.04;
  }
}
