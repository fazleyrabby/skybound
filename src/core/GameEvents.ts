import type { AttackKind } from '../combat/Damageable';
import type { FlightState } from '../player/PlayerState';

/** Every event that crosses a system boundary. Emitted from the fixed step. */
export interface GameEvents {
  'player:state': { from: FlightState; to: FlightState };
  /** `speed` is the speed into the surface; `headOn` is 0 (glancing) .. 1 (straight in). */
  'player:impact': { speed: number; headOn: number; bounced: boolean };
  'player:damaged': { amount: number; health: number };
  'player:died': Record<string, never>;
  /** A melee attack or blast connected. `speed` is what the hero carried into it. */
  'combat:hit': {
    kind: AttackKind;
    targetId: number;
    damage: number;
    speed: number;
    x: number;
    y: number;
    z: number;
  };
  /** A melee attack hit nothing. */
  'combat:whiff': { kind: AttackKind };
  'combat:blastFired': Record<string, never>;
  /** A blast hit the world rather than a target. */
  'combat:blastImpact': { x: number; y: number; z: number };
  /** A world event (drone attack, ...) began at a site. */
  'world:eventStarted': {
    type: string;
    title: string;
    site: string;
    x: number;
    y: number;
    z: number;
  };
  'world:eventEnded': { type: string; outcome: 'success' | 'failure'; reward: number };
  'enemy:destroyed': { id: number; x: number; y: number; z: number };
  'enemy:fired': { kind: 'bullet' | 'missile'; x: number; y: number; z: number };
  /** Enemy fire or a missile ended against the world, or a missile was shot down. */
  'enemy:shotImpact': { kind: 'bullet' | 'missile'; x: number; y: number; z: number };
}
