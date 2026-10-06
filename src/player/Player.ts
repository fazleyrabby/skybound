import { Vector3 } from 'three';
import { Config } from '../core/Config';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/GameEvents';
import type { CollisionMover } from '../physics/CollisionMover';
import { clamp } from '../utils/math';
import { PlayerController } from './PlayerController';
import { PlayerState, type PlayerInput } from './PlayerState';
import { damagePlayer, restoreVitals, updateVitals } from './PlayerVitals';

/** The player as gameplay sees it: state plus the controller that advances it. */
export class Player {
  readonly state = new PlayerState();
  /** Debug god mode: ignore all damage. */
  invulnerable = false;
  private readonly controller: PlayerController;
  private readonly scratch = new Vector3();

  constructor(
    mover: CollisionMover,
    private readonly spawn: Vector3,
    private readonly events: EventBus<GameEvents>,
  ) {
    this.controller = new PlayerController(this.state, mover, events);
    this.respawn();
  }

  fixedUpdate(input: PlayerInput, dt: number): void {
    this.controller.fixedUpdate(input, dt);
    updateVitals(this.state, dt);
    if (this.state.position.y < Config.player.killPlaneY) this.respawn();
  }

  /**
   * Applies look input in radians; positive pitch looks up. Runs per rendered
   * frame so aiming never lags behind the mouse.
   */
  applyLook(yaw: number, pitch: number): void {
    const { maxPitch, invertY } = Config.input;
    const aim = this.state.aim;
    aim.yaw += yaw;
    aim.pitch = clamp(aim.pitch + pitch * invertY, -maxPitch, maxPitch);
  }

  respawn(): void {
    this.controller.teleport(this.spawn);
    restoreVitals(this.state);
  }

  /**
   * Damages the player. A knock-out in free roam costs nothing: the hero
   * reappears hovering above the spawn roof with full health (spec section 67).
   */
  damage(amount: number): void {
    if (this.invulnerable) return;
    if (!damagePlayer(this.state, amount, this.events)) return;
    this.scratch.copy(this.spawn);
    this.scratch.y += Config.vitals.respawnHeight;
    this.controller.teleport(this.scratch, 'HOVERING');
    restoreVitals(this.state);
  }

  /** Places the player hovering at a point (debug teleport). */
  teleport(x: number, y: number, z: number): void {
    this.controller.teleport(this.scratch.set(x, y, z), 'HOVERING');
  }
}
