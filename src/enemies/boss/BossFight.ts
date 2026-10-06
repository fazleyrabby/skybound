import type { Vector3 } from 'three';
import type { Damageable } from '../../combat/Damageable';
import { Config } from '../../core/Config';
import type { EventBus } from '../../core/EventBus';
import type { GameEvents } from '../../core/GameEvents';
import type { PlayerState } from '../../player/PlayerState';
import { damp } from '../../utils/math';
import { createRng, type Rng } from '../../utils/rng';
import type { WorldQuery } from '../Drone';
import type { EnemyFire } from '../EnemyFire';
import { Titan } from './Titan';
import { TITAN_ENTRY, TitanAI } from './TitanAI';
import { TitanAttacks, type PlayerHooks } from './TitanAttacks';

const WRAP = Math.PI * 2;
const POP_INTERVAL = 0.22;
const NO_TARGETS: readonly Damageable[] = [];

/**
 * The Titan encounter: the reveal, the fight, phase checkpoints, and the
 * destruction sequence. One Titan is created up front and reused.
 */
export class BossFight {
  readonly titan = new Titan();
  readonly attacks: TitanAttacks;
  /** True from the moment Titan is destroyed until the next `start()`. */
  defeated = false;

  private readonly ai = new TitanAI();
  private readonly rng: Rng;
  private popTimer = 0;

  constructor(
    private readonly player: PlayerState,
    fire: EnemyFire,
    world: WorldQuery,
    hooks: PlayerHooks,
    private readonly events: EventBus<GameEvents>,
    seed: number,
  ) {
    this.rng = createRng(seed + 505);
    this.attacks = new TitanAttacks(fire, world, player, hooks, events, this.rng);
    // A knocked-out player resumes the current phase, not the whole fight (spec section 17).
    events.on('player:died', () => this.titan.restoreCheckpoint());
  }

  get active(): boolean {
    return this.titan.alive;
  }

  /** What the player can target: empty when there is no fight. */
  get targets(): readonly Damageable[] {
    return this.titan.alive ? this.titan.targets : NO_TARGETS;
  }

  start(): void {
    this.defeated = false;
    this.ai.reset();
    this.attacks.reset();
    this.titan.spawn(...TITAN_ENTRY);
    this.events.emit('boss:spawned', { name: 'TITAN' });
  }

  /** Removes Titan without ceremony (mission abandoned). */
  despawn(): void {
    this.attacks.cancel();
    this.titan.despawn();
  }

  fixedUpdate(dt: number): void {
    const titan = this.titan;
    if (!titan.alive) return;
    const cfg = Config.titan;
    titan.stateTime += dt;
    titan.sinceHit += dt;

    this.ai.fixedUpdate(titan, this.player.position, dt);
    this.attacks.fixedUpdate(titan, dt);

    if (titan.phaseJustBroke) {
      titan.phaseJustBroke = false;
      const { x, y, z } = titan.position;
      this.events.emit('boss:phase', { phase: titan.phase, x, y, z });
    }

    switch (titan.state) {
      case 'INTRO':
        this.drawCameraToTitan(dt);
        if (titan.stateTime >= cfg.introTime) titan.setState('FIGHT');
        break;
      case 'STAGGER':
        if (titan.stateTime >= cfg.phaseStagger) titan.setState('FIGHT');
        break;
      case 'DYING':
        this.updateDying(dt);
        break;
    }
  }

  /** Eases the player's aim toward Titan for the reveal. Mouse input still adds on top. */
  private drawCameraToTitan(dt: number): void {
    const aim = this.player.aim;
    const dx = this.titan.position.x - this.player.position.x;
    const dy = this.titan.position.y - this.player.position.y;
    const dz = this.titan.position.z - this.player.position.z;
    const wantedYaw = Math.atan2(-dx, -dz);
    const wantedPitch = Math.atan2(dy, Math.hypot(dx, dz));
    let delta = (wantedYaw - aim.yaw) % WRAP;
    if (delta > Math.PI) delta -= WRAP;
    if (delta < -Math.PI) delta += WRAP;
    const response = Config.titan.introAimResponse;
    aim.yaw = damp(aim.yaw, aim.yaw + delta, response, dt);
    aim.pitch = damp(aim.pitch, Math.min(wantedPitch, Config.input.maxPitch), response, dt);
  }

  /** A few seconds of secondary explosions as it sinks, then the big one. */
  private updateDying(dt: number): void {
    const titan = this.titan;
    this.popTimer -= dt;
    if (this.popTimer <= 0) {
      this.popTimer = POP_INTERVAL;
      const spread = titan.radius;
      this.events.emit('enemy:shotImpact', {
        kind: 'missile',
        x: titan.position.x + this.rng.range(-spread, spread),
        y: titan.position.y + this.rng.range(-spread * 0.4, spread * 0.4),
        z: titan.position.z + this.rng.range(-spread, spread),
      });
    }
    if (titan.stateTime < Config.titan.dyingTime) return;
    const { x, y, z } = titan.position;
    titan.despawn();
    this.defeated = true;
    this.events.emit('boss:defeated', { x, y, z });
  }
}

/** Throws the player: an attack lunge in reverse, reusing the same velocity override. */
export function knockPlayer(player: PlayerState, velocity: Vector3, seconds = 0.3): void {
  player.lungeVelocity.copy(velocity);
  player.lungeTime = seconds;
}
