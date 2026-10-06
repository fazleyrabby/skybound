import {
  BoxGeometry,
  Box3,
  CapsuleGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type Object3D,
  type Scene,
} from 'three';
import { Config } from '../core/Config';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/GameEvents';
import { clamp, damp } from '../utils/math';
import { HeroRig } from './HeroRig';
import { movementPose, type PoseName } from './heroPoses';
import type { PlayerState } from './PlayerState';

const UP = new Vector3(0, 1, 0);

/**
 * The hero as drawn: the Aether model posed by `HeroRig`, or a capsule if the
 * model is missing. Reads player state and listens for attack events; never
 * writes gameplay state, so swapping the model touches no flight or combat code.
 */
export class PlayerView {
  private readonly root = new Group();
  private readonly appearance = new Group();
  private readonly bounds = new Box3();
  private readonly inverseRoot = new Quaternion();
  private readonly rig: HeroRig | null;
  private readonly bodyUp = new Vector3();
  private readonly direction = new Vector3();
  private readonly tilt = new Quaternion();
  private readonly yaw = new Quaternion();
  private readonly target = new Quaternion();
  private readonly bankRotation = new Quaternion();
  private previousHeading: number;
  private bank = 0;
  private groundOffset = 0;
  private stridePhase = 0;
  private attackPose: PoseName | null = null;
  private attackTime = 0;

  constructor(
    scene: Scene,
    private readonly state: PlayerState,
    events: EventBus<GameEvents>,
    model: Object3D | null,
  ) {
    this.previousHeading = state.heading;
    if (model) {
      // Blender exports the hero facing +Z with its origin at the feet; the game
      // faces -Z at yaw 0 and positions the capsule centre.
      model.rotation.y = Math.PI;
      model.position.y = -Config.player.height / 2;
      model.traverse((node) => {
        node.castShadow = true;
        // Cache bounds once; grounded pose correction must not allocate per frame.
        if (node instanceof Mesh) node.geometry.computeBoundingBox();
      });
      this.appearance.add(model);
      this.rig = new HeroRig(model);
    } else {
      this.appearance.add(...createPlaceholder());
      this.rig = null;
    }
    this.root.add(this.appearance);
    scene.add(this.root);

    events.on('combat:hit', ({ kind }) => {
      if (kind !== 'blast') this.showAttack('punch', Config.hero.punchHold);
    });
    events.on('combat:whiff', () => this.showAttack('punch', Config.hero.punchHold));
    events.on('combat:blastFired', () => this.showAttack('blast', Config.hero.blastHold));
    events.on('player:damaged', () => this.showAttack('damage', Config.hero.damageHold));
    // Hold the landing crouch a beat longer than the gameplay state lasts.
    events.on('player:state', ({ from, to }) => {
      if (to === 'LANDING' && from !== 'JUMPING') this.showAttack('land', Config.hero.landingHold);
      else if (this.attackPose === 'land' && to !== 'GROUND' && to !== 'LANDING') {
        this.attackPose = null;
        this.attackTime = 0;
      }
    });
    events.on('player:died', () => {
      this.attackPose = null;
      this.attackTime = 0;
    });
  }

  /** Where the hero is drawn this frame (interpolated). */
  get position(): Vector3 {
    return this.root.position;
  }

  /** Whether the real model is in use, and the pose it is in. */
  get debug(): { model: boolean; joints: number; pose: PoseName | null } {
    return {
      model: this.rig !== null,
      joints: this.rig?.jointCount ?? 0,
      pose: this.rig?.currentPose ?? null,
    };
  }

  /** `alpha` interpolates between the last two fixed steps. */
  update(alpha: number, frameDelta: number): void {
    const state = this.state;
    const cfg = Config.hero;
    this.root.position.lerpVectors(state.previousPosition, state.position, alpha);
    this.yaw.setFromAxisAngle(UP, state.heading);

    // In flight the body leans from upright toward lying along the direction of
    // forward flight. Only the cruise channel counts: rising or descending with
    // Space / C keeps the hero upright, like a hover landing, not a nose dive.
    const speed = state.cruise.length();
    const lean = state.flying ? clamp(speed / cfg.tiltFullSpeed, 0, 1) * cfg.maxTilt : 0;
    if (lean > 0 && speed > cfg.minLeanSpeed) {
      this.direction.copy(state.cruise).divideScalar(speed);
      this.bodyUp.copy(UP).lerp(this.direction, lean).normalize();
    } else {
      this.bodyUp.copy(UP);
    }
    this.tilt.setFromUnitVectors(UP, this.bodyUp);
    const headingDelta = Math.atan2(
      Math.sin(state.heading - this.previousHeading),
      Math.cos(state.heading - this.previousHeading),
    );
    this.previousHeading = state.heading;
    const turnRate = frameDelta > 0 ? headingDelta / frameDelta : 0;
    const targetBank = state.flying
      ? clamp(turnRate * cfg.bankPerTurnRate, -cfg.bankMax, cfg.bankMax) * lean
      : 0;
    this.bank = damp(this.bank, targetBank, cfg.bankResponse, frameDelta);
    this.bankRotation.setFromAxisAngle(UP, this.bank);
    this.target.copy(this.tilt).multiply(this.yaw).multiply(this.bankRotation);
    this.root.quaternion.slerp(this.target, damp(0, 1, cfg.orientationResponse, frameDelta));

    if (this.rig) {
      this.updatePose(frameDelta);
      this.groundAppearance(frameDelta);
    }
  }

  /** Keep the lowest posed boot/hand on the surface without moving the capsule or camera pivot. */
  private groundAppearance(frameDelta: number): void {
    this.appearance.position.set(0, 0, 0);
    if (this.state.airborne) {
      this.groundOffset = damp(this.groundOffset, 0, Config.hero.groundReleaseResponse, frameDelta);
    } else {
      this.appearance.updateWorldMatrix(true, true);
      this.bounds.setFromObject(this.appearance);
      if (this.bounds.isEmpty()) return;
      const surfaceY = this.root.position.y - Config.player.height / 2;
      this.groundOffset = surfaceY - this.bounds.min.y;
    }
    this.inverseRoot.copy(this.root.quaternion).invert();
    this.appearance.position.set(0, this.groundOffset, 0).applyQuaternion(this.inverseRoot);
  }

  private showAttack(pose: PoseName, seconds: number): void {
    this.attackPose = pose;
    this.attackTime = seconds;
  }

  private updatePose(frameDelta: number): void {
    const state = this.state;
    const rig = this.rig;
    if (!rig) return;

    if (state.state === 'GROUND') {
      this.stridePhase +=
        Math.hypot(state.velocity.x, state.velocity.z) * Config.hero.stridePerMetre * frameDelta;
    }
    this.attackTime -= frameDelta;
    if (this.attackTime <= 0) this.attackPose = null;

    // Attacks override movement: a lunge in progress, a just-thrown attack, or a charge.
    let pose: PoseName;
    if (state.lungeTime > 0) pose = 'punch';
    else if (
      this.attackPose === 'land' &&
      state.state === 'GROUND' &&
      state.speed > Config.hero.walkMinSpeed
    ) {
      this.attackPose = null;
      pose = movementPose(state, this.stridePhase);
    } else if (this.attackPose) pose = this.attackPose;
    else if (state.punchCharge > Config.hero.chargeShownAbove) pose = 'charge';
    else pose = movementPose(state, this.stridePhase);

    if (pose === 'walkA' || pose === 'walkB') {
      rig.setWalk(this.stridePhase, state.speed / Config.ground.walkSpeed);
    } else if (pose !== rig.currentPose) rig.setPose(pose);
    rig.update(frameDelta);
  }
}

/** Capsule with a visor, used when the model fails to load. */
function createPlaceholder(): Mesh[] {
  const { height, radius } = Config.player;
  const body = new Mesh(
    new CapsuleGeometry(radius, height - radius * 2, 6, 16),
    new MeshStandardMaterial({ color: 0x2f6bff, roughness: 0.45 }),
  );
  const visor = new Mesh(
    new BoxGeometry(radius * 1.2, radius * 0.45, radius * 0.5),
    new MeshStandardMaterial({ color: 0xffd34d, emissive: 0xffa200, emissiveIntensity: 0.6 }),
  );
  visor.position.set(0, height * 0.32, -radius * 0.9);
  return [body, visor];
}
