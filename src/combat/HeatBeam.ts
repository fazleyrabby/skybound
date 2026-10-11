import { Vector3 } from 'three';
import { Config } from '../core/Config';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/GameEvents';
import type { PlayerState } from '../player/PlayerState';
import type { Damageable } from './Damageable';
import { sphereEntry } from './sweep';
import { angleTo } from './Targeting';

/** Distance along a ray to the first world obstacle, or -1 for none. Implemented by physics. */
export interface WorldRaycaster {
  castRay(origin: Vector3, direction: Vector3, maxDistance: number): number;
}

export type BeamContact = 'none' | 'world' | 'target';

/** Height of the eyes above the capsule centre, and how far in front of it the beam starts. */
const EYE_HEIGHT = 0.82;
const EYE_FORWARD = 0.3;

const direction = new Vector3();
const knockback = new Vector3();

/**
 * The hero's heat beam (spec section 13): held, not fired. It burns whatever it
 * touches for as long as it stays on it, builds heat while it is on, and cuts
 * out when it overheats; it will not light again until it has cooled most of
 * the way down. Hitscan: a ray against the world and a swept sphere against
 * targets, every step. Presentation reads `origin`, `end`, `contact` and `heat`.
 */
export class HeatBeam {
  active = false;
  /** 0 cold .. 1 overheated. */
  heat = 0;
  /** Cut out, and still too hot to fire. */
  overheated = false;
  contact: BeamContact = 'none';
  /** Where the beam starts and where it ends this step. Valid while `active`. */
  readonly origin = new Vector3();
  readonly end = new Vector3();
  private sinceTick = 0;

  constructor(
    private readonly world: WorldRaycaster,
    private readonly events: EventBus<GameEvents>,
  ) {}

  /**
   * `wants`: the fire control is held. `forward`: where the player is looking.
   * `locked`: the current target, which the beam bends onto if it is near the crosshair.
   */
  fixedUpdate(
    dt: number,
    wants: boolean,
    player: PlayerState,
    forward: Vector3,
    locked: Damageable | null,
    targets: readonly Damageable[],
  ): void {
    const cfg = Config.combat;
    const drain = cfg.beamEnergyPerSecond * dt;
    const firing = wants && !this.overheated && player.health > 0 && player.energy >= drain;

    if (!firing) {
      if (this.active) this.stop(false);
      this.heat = Math.max(0, this.heat - dt / cfg.beamCoolTime);
      if (this.overheated && this.heat <= cfg.beamResumeHeat) {
        this.overheated = false;
        this.events.emit('combat:beamReady', {});
      }
      return;
    }

    if (!this.active) {
      this.active = true;
      // The first tick lands at once: touching something with the beam always burns it.
      this.sinceTick = cfg.beamTick;
      this.events.emit('combat:blastFired', {});
    }
    player.energy -= drain;
    this.heat = Math.min(1, this.heat + dt / cfg.beamOverheatTime);

    this.origin.copy(player.position).addScaledVector(forward, EYE_FORWARD);
    this.origin.y += EYE_HEIGHT;
    direction.copy(forward);
    if (locked?.alive && angleTo(this.origin, forward, locked) <= cfg.beamAssistCone) {
      direction.copy(locked.position).sub(this.origin).normalize();
    }

    // Nearest thing along the beam wins: a target or the world.
    let reach = this.world.castRay(this.origin, direction, cfg.beamRange);
    let hit: Damageable | null = null;
    this.contact = reach >= 0 ? 'world' : 'none';
    if (reach < 0) reach = cfg.beamRange;
    for (const target of targets) {
      if (!target.alive) continue;
      const along = sphereEntry(
        this.origin,
        direction,
        cfg.beamRange,
        target.position,
        target.radius + cfg.beamRadius,
      );
      if (along >= 0 && along < reach) {
        reach = along;
        hit = target;
        this.contact = 'target';
      }
    }
    this.end.copy(this.origin).addScaledVector(direction, reach);

    // Damage and impact effects arrive in ticks, so a burn reads as a rapid series of hits.
    this.sinceTick += dt;
    if (this.sinceTick >= cfg.beamTick) {
      this.sinceTick -= cfg.beamTick;
      const { x, y, z } = this.end;
      if (hit) {
        const damage = cfg.beamDamagePerSecond * cfg.beamTick;
        knockback.copy(direction).multiplyScalar(cfg.beamKnockback);
        hit.applyHit(damage, knockback);
        this.events.emit('combat:hit', {
          kind: 'blast',
          targetId: hit.id,
          damage,
          speed: 0,
          x,
          y,
          z,
        });
      } else if (this.contact === 'world') {
        this.events.emit('combat:blastImpact', { x, y, z });
      }
    }

    if (this.heat >= 1) {
      this.overheated = true;
      this.stop(true);
    }
  }

  private stop(overheated: boolean): void {
    this.active = false;
    this.contact = 'none';
    this.events.emit('combat:beamStopped', { overheated });
  }
}
