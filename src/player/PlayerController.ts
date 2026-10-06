import { Vector3 } from 'three';
import { Config } from '../core/Config';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/GameEvents';
import { MAX_MOVE_HITS, type CollisionMover, type MoveResult } from '../physics/CollisionMover';
import { applyWorldBounds } from '../world/WorldBounds';
import { updateFlight } from './FlightController';
import { updateAirborne, updateGround, updateLanding } from './GroundController';
import type { FlightState, PlayerInput, PlayerState } from './PlayerState';

const desired = new Vector3();

/** Horizontal speed above which the character turns to face its direction of travel. */
const MIN_HEADING_SPEED = 1;

/**
 * Player state machine (spec section 9): picks the movement model for the
 * current state, moves through the collision mover, then applies the collision
 * response and state transitions.
 */
export class PlayerController {
  private readonly result: MoveResult = {
    movement: new Vector3(),
    grounded: false,
    hitCount: 0,
    hitNormals: Array.from({ length: MAX_MOVE_HITS }, () => new Vector3()),
  };

  constructor(
    private readonly state: PlayerState,
    private readonly mover: CollisionMover,
    private readonly events: EventBus<GameEvents>,
  ) {}

  fixedUpdate(input: PlayerInput, dt: number): void {
    const state = this.state;
    state.previousPosition.copy(state.position);
    state.stateTime += dt;
    state.staggerTime = Math.max(0, state.staggerTime - dt);

    this.applyInputTransitions(input);

    if (state.lungeTime > 0) {
      // An attack lunge owns the velocity; it can also pull the hero off the ground.
      if (!state.flying) this.setState('HOVERING');
      state.lungeTime = Math.max(0, state.lungeTime - dt);
      state.cruise.copy(state.lungeVelocity);
      state.nudge.set(0, 0, 0);
      applyWorldBounds(state, dt);
    } else if (state.flying) {
      this.setState(updateFlight(state, input, dt));
      applyWorldBounds(state, dt);
    } else if (state.state === 'GROUND') updateGround(state, input, dt);
    else if (state.state === 'JUMPING') updateAirborne(state, input, dt);
    else updateLanding(state, dt);

    if (Math.hypot(state.velocity.x, state.velocity.z) > MIN_HEADING_SPEED) {
      state.heading = Math.atan2(-state.velocity.x, -state.velocity.z);
    }

    desired.copy(state.velocity).multiplyScalar(dt);
    this.mover.move(desired, !state.airborne, this.result);
    state.position.add(this.result.movement);

    this.respondToHits();
    this.applyContactTransitions(dt);
  }

  /** Places the player at `position` (capsule centre), at rest. */
  teleport(position: Vector3, state: FlightState = 'GROUND'): void {
    const s = this.state;
    s.position.copy(position);
    s.previousPosition.copy(position);
    s.velocity.set(0, 0, 0);
    s.cruise.set(0, 0, 0);
    s.nudge.set(0, 0, 0);
    s.boostTime = 0;
    s.staggerTime = 0;
    s.ungroundedTime = 0;
    s.diving = false;
    s.lungeTime = 0;
    s.extremeSpent = false;
    s.heading = s.aim.yaw;
    this.mover.teleport(position);
    this.setState(state);
  }

  private applyInputTransitions(input: PlayerInput): void {
    const state = this.state;
    if (!input.jumpPressed) return;

    if (state.state === 'GROUND') {
      state.velocity.y = Config.ground.jumpSpeed;
      this.setState('JUMPING');
      // The jump impulse must survive this step's ground update.
      state.ungroundedTime = 0;
    } else if (state.state === 'JUMPING') {
      // Take off: horizontal momentum carries into flight, with a small lift.
      state.cruise.set(state.velocity.x, 0, state.velocity.z);
      state.nudge.set(0, Math.max(state.velocity.y, Config.flight.takeoffKick), 0);
      this.setState('HOVERING');
    }
  }

  /** Slides velocity along whatever was hit; head-on hits at speed bounce (spec section 66). */
  private respondToHits(): void {
    const state = this.state;
    const cfg = Config.flight;

    for (let i = 0; i < this.result.hitCount; i++) {
      const normal = this.result.hitNormals[i];
      if (!normal) continue;
      const into = -state.velocity.dot(normal);
      if (into <= 0) continue;

      const speedBefore = state.velocity.length();
      state.lastImpactSpeed = into;

      if (!state.flying) {
        state.velocity.addScaledVector(normal, into);
        continue;
      }

      const headOn = into / Math.max(speedBefore, 1e-6);
      removeInto(state.cruise, normal);
      removeInto(state.nudge, normal);
      const bounced = headOn > cfg.bounceHeadOn && into > cfg.bounceMinSpeed;
      this.events.emit('player:impact', { speed: into, headOn, bounced });
      if (bounced) {
        state.cruise.addScaledVector(normal, into * cfg.restitution);
        state.staggerTime = cfg.staggerTime;
        state.boostTime = 0;
      } else {
        state.cruise.multiplyScalar(1 - cfg.scrapeLoss * headOn);
      }
      state.velocity.copy(state.cruise).add(state.nudge);
    }
  }

  private applyContactTransitions(dt: number): void {
    const state = this.state;
    const grounded = this.result.grounded;

    switch (state.state) {
      case 'GROUND':
        state.ungroundedTime = grounded ? 0 : state.ungroundedTime + dt;
        if (state.ungroundedTime > Config.ground.coyoteTime) this.setState('JUMPING');
        break;
      case 'JUMPING':
        if (grounded && state.velocity.y <= 0) this.setState('LANDING');
        break;
      case 'HOVERING':
      case 'FLYING':
      case 'BOOSTING':
        if (grounded && state.speed < Config.flight.landMaxSpeed) this.setState('LANDING');
        break;
      case 'LANDING':
        if (state.stateTime >= Config.ground.landingTime) this.setState('GROUND');
        break;
    }
  }

  private setState(next: FlightState): void {
    const state = this.state;
    if (state.state === next) return;
    const wasFlying = state.flying;
    const previous = state.state;
    state.state = next;
    state.stateTime = 0;
    state.ungroundedTime = 0;
    if (wasFlying && !state.flying) {
      state.cruise.set(0, 0, 0);
      state.nudge.set(0, 0, 0);
      state.boostTime = 0;
      state.diving = false;
    }
    this.events.emit('player:state', { from: previous, to: next });
  }
}

/** Removes the component of `vector` that points into the surface with the given normal. */
function removeInto(vector: Vector3, normal: Vector3): void {
  const dot = vector.dot(normal);
  if (dot < 0) vector.addScaledVector(normal, -dot);
}
