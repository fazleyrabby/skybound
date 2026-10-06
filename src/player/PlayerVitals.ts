import { Config } from '../core/Config';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/GameEvents';
import type { PlayerState } from './PlayerState';

/**
 * Health and energy (spec section 67). Resources limit spam, not flight:
 * health comes back after a quiet spell, energy is always regenerating except
 * while it is being burned for extreme speed.
 */
export function updateVitals(state: PlayerState, dt: number): void {
  const cfg = Config.vitals;

  state.sinceDamage += dt;
  if (state.sinceDamage >= cfg.healthRegenDelay) {
    state.health = Math.min(cfg.maxHealth, state.health + cfg.healthRegen * dt);
  }

  const burning = state.boostTime > Config.flight.extremeDelay && !state.extremeSpent;
  if (!burning) {
    const rate = state.state === 'BOOSTING' ? cfg.energyRegenBoosting : cfg.energyRegen;
    state.energy = Math.min(cfg.maxEnergy, state.energy + rate * dt);
  }
}

/** Spends energy if there is enough. Returns whether it was spent. */
export function spendEnergy(state: PlayerState, amount: number): boolean {
  if (state.energy < amount) return false;
  state.energy -= amount;
  return true;
}

/** Applies damage. Returns true if this knocked the player out. */
export function damagePlayer(
  state: PlayerState,
  amount: number,
  events: EventBus<GameEvents>,
): boolean {
  if (amount <= 0 || state.health <= 0) return false;
  state.health = Math.max(0, state.health - amount);
  state.sinceDamage = 0;
  events.emit('player:damaged', { amount, health: state.health });
  if (state.health > 0) return false;
  events.emit('player:died', {});
  return true;
}

export function restoreVitals(state: PlayerState): void {
  state.health = Config.vitals.maxHealth;
  state.energy = Config.vitals.maxEnergy;
  state.sinceDamage = Infinity;
}
