import {
  BoxGeometry,
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
import { clamp } from '../utils/math';
import { HeroRig } from './HeroRig';
import { movementPose, type PoseName } from './heroPoses';
import type { PlayerState } from './PlayerState';

const UP = new Vector3(0, 1, 0);
const TILT_FULL_SPEED = 45;
/** How far the body leans from upright toward lying along the velocity, 0..1. */
const MAX_TILT = 0.94;
const ORIENT_RESPONSE = 10;
const MIN_LEAN_SPEED = 1;
/** Radians of stride per metre walked. */
const STRIDE_PER_METRE = 2.6;
const PUNCH_HOLD = 0.24;
const BLAST_HOLD = 0.2;
const LAND_HOLD = 0.55;
const CHARGE_SHOWN_ABOVE = 0.35;

/**
 * The hero as drawn: the Aether model posed by `HeroRig`, or a capsule if the
 * model is missing. Reads player state and listens for attack events; never
 * writes gameplay state, so swapping the model touches no flight or combat code.
 */
export class PlayerView {
  private readonly root = new Group();
  private readonly rig: HeroRig | null;
  private readonly bodyUp = new Vector3();
  private readonly direction = new Vector3();
  private readonly tilt = new Quaternion();
  private readonly yaw = new Quaternion();
  private readonly target = new Quaternion();
  private stridePhase = 0;
  private attackPose: PoseName | null = null;
  private attackTime = 0;

  constructor(
    scene: Scene,
    private readonly state: PlayerState,
    events: EventBus<GameEvents>,
    model: Object3D | null,
  ) {
    if (model) {
      // Blender exports the hero facing +Z with its origin at the feet; the game
      // faces -Z at yaw 0 and positions the capsule centre.
      model.rotation.y = Math.PI;
      model.position.y = -Config.player.height / 2;
      this.root.add(model);
      this.rig = new HeroRig(model);
    } else {
      this.root.add(...createPlaceholder());
      this.rig = null;
    }
    scene.add(this.root);

    events.on('combat:hit', ({ kind }) => {
      if (kind !== 'blast') this.showAttack('punch', PUNCH_HOLD);
    });
    events.on('combat:whiff', () => this.showAttack('punch', PUNCH_HOLD));
    events.on('combat:blastFired', () => this.showAttack('blast', BLAST_HOLD));
    // Hold the landing crouch a beat longer than the gameplay state lasts.
    events.on('player:state', ({ from, to }) => {
      if (to === 'LANDING' && from !== 'JUMPING') this.showAttack('land', LAND_HOLD);
    });
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
    this.root.position.lerpVectors(state.previousPosition, state.position, alpha);
    this.yaw.setFromAxisAngle(UP, state.heading);

    // In flight the body leans from upright toward lying along the direction of
    // forward flight. Only the cruise channel counts: rising or descending with
    // Space / C keeps the hero upright, like a hover landing, not a nose dive.
    const speed = state.cruise.length();
    const lean = state.flying ? clamp(speed / TILT_FULL_SPEED, 0, 1) * MAX_TILT : 0;
    if (lean > 0 && speed > MIN_LEAN_SPEED) {
      this.direction.copy(state.cruise).divideScalar(speed);
      this.bodyUp.copy(UP).lerp(this.direction, lean).normalize();
    } else {
      this.bodyUp.copy(UP);
    }
    this.tilt.setFromUnitVectors(UP, this.bodyUp);
    this.target.copy(this.tilt).multiply(this.yaw);
    this.root.quaternion.slerp(this.target, 1 - Math.exp(-ORIENT_RESPONSE * frameDelta));

    if (this.rig) this.updatePose(frameDelta);
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
        Math.hypot(state.velocity.x, state.velocity.z) * STRIDE_PER_METRE * frameDelta;
    }
    this.attackTime -= frameDelta;
    if (this.attackTime <= 0) this.attackPose = null;

    // Attacks override movement: a lunge in progress, a just-thrown attack, or a charge.
    let pose: PoseName;
    if (state.lungeTime > 0) pose = 'punch';
    else if (this.attackPose) pose = this.attackPose;
    else if (state.punchCharge > CHARGE_SHOWN_ABOVE) pose = 'charge';
    else pose = movementPose(state, this.stridePhase);

    if (pose !== rig.currentPose) rig.setPose(pose);
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
