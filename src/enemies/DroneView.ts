import { BoxGeometry, Color, Group, Mesh, MeshStandardMaterial, Vector3, type Scene } from 'three';
import type { Drone } from './Drone';

const FLASH_COLOR = new Color(0xffffff);
const FLASH_TIME = 0.12;
const BAR_WIDTH = 3.2;
const TURN_RESPONSE = 8;

const bodyGeometry = new BoxGeometry(2.4, 0.8, 2.4);
const armGeometry = new BoxGeometry(4.4, 0.2, 0.4);
const eyeGeometry = new BoxGeometry(0.9, 0.3, 0.2);
const podGeometry = new BoxGeometry(0.5, 0.5, 1.8);
const barGeometry = new BoxGeometry(BAR_WIDTH, 0.18, 0.18);

/**
 * Graybox drone built from its config: scale, colour, rotor arm count and a
 * missile pod where it has one. The eye brightens while it telegraphs.
 */
export class DroneView {
  private readonly root = new Group();
  private readonly body = new Group();
  private readonly material: MeshStandardMaterial;
  private readonly eyeMaterial: MeshStandardMaterial;
  private readonly baseColor: Color;
  private readonly bar: Mesh;
  private readonly lookTarget = new Vector3();
  private readonly facing = new Vector3(0, 0, -1);

  constructor(
    scene: Scene,
    private readonly drone: Drone,
  ) {
    const { config } = drone;
    this.baseColor = new Color(config.color);
    this.material = new MeshStandardMaterial({ color: this.baseColor, roughness: 0.6 });
    this.eyeMaterial = new MeshStandardMaterial({
      color: 0xff5533,
      emissive: 0xff2200,
      emissiveIntensity: 1,
    });

    this.body.add(new Mesh(bodyGeometry, this.material));
    for (let i = 0; i < config.engineCount; i++) {
      const arm = new Mesh(armGeometry, this.material);
      arm.rotation.y = (i / config.engineCount) * Math.PI + Math.PI / 4;
      this.body.add(arm);
    }
    const eye = new Mesh(eyeGeometry, this.eyeMaterial);
    eye.position.set(0, 0, -1.25);
    this.body.add(eye);
    if (config.weaponType === 'missile' && config.weaponCount > 0) {
      for (const side of [-1, 1]) {
        const pod = new Mesh(podGeometry, this.material);
        pod.position.set(side * 1.5, -0.4, -0.2);
        this.body.add(pod);
      }
    }
    this.body.scale.setScalar(config.bodyScale);

    this.bar = new Mesh(
      barGeometry,
      new MeshStandardMaterial({ color: 0x5dff7a, emissive: 0x2fbf4a, emissiveIntensity: 1 }),
    );
    this.bar.position.y = 1.6 * config.bodyScale;
    this.root.add(this.body, this.bar);
    scene.add(this.root);
  }

  update(alpha: number, frameDelta: number): void {
    const drone = this.drone;
    this.root.visible = drone.alive;
    if (!drone.alive) return;
    this.root.position.lerpVectors(drone.previousPosition, drone.position, alpha);

    // Turn smoothly toward where the drone is facing; the AI updates that in steps.
    this.facing.lerp(drone.facing, 1 - Math.exp(-TURN_RESPONSE * frameDelta)).normalize();
    this.lookTarget.copy(this.root.position).sub(this.facing); // lookAt points +Z; the eye is at -Z
    this.body.lookAt(this.lookTarget);

    const flash = Math.max(0, 1 - drone.sinceHit / FLASH_TIME);
    this.material.color.copy(this.baseColor).lerp(FLASH_COLOR, flash);
    this.material.emissive.copy(FLASH_COLOR).multiplyScalar(flash * 0.8);
    this.eyeMaterial.emissiveIntensity = 1 + drone.telegraph * 6;

    const ratio = drone.health / drone.maxHealth;
    this.bar.visible = ratio < 1;
    this.bar.scale.x = Math.max(ratio, 0.001);
    this.bar.position.x = (-BAR_WIDTH * (1 - ratio)) / 2;
  }
}
