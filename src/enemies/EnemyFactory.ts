import { createRng } from '../utils/rng';

export type WeaponType = 'gun' | 'missile';

/** One drone variation (spec section 16). All variations share the base drone model. */
export interface EnemyConfig {
  seed: number;
  bodyScale: number;
  engineCount: number;
  weaponCount: number;
  /** Fraction of incoming damage ignored, 0..0.5. */
  armor: number;
  /** Top speed in m/s. Always below the player's boost speed. */
  speed: number;
  health: number;
  weaponType: WeaponType;
  /** 0xRRGGBB. */
  color: number;
  /** 0..1: fires more often and leads its shots better. */
  aggression: number;
}

const COLORS = [0x8a2f2f, 0x7a3b6a, 0x8a5a24, 0x4f5f7a] as const;

/** Same seed, same drone. */
export function generateEnemy(seed: number): EnemyConfig {
  const rng = createRng(seed);
  const bodyScale = rng.range(0.85, 1.4);
  const armor = rng.range(0, 0.35);
  const weaponType: WeaponType = rng.next() < 0.3 ? 'missile' : 'gun';
  return {
    seed,
    bodyScale,
    engineCount: 2 + Math.floor(rng.next() * 3),
    weaponCount: 1 + Math.floor(rng.next() * 2),
    armor,
    // Bigger, heavier-armoured drones are slower.
    speed: rng.range(55, 80) / (0.75 + bodyScale * 0.25) - armor * 20,
    health: Math.round(rng.range(60, 110) * bodyScale),
    weaponType,
    color: COLORS[Math.floor(rng.next() * COLORS.length)] ?? COLORS[0],
    aggression: rng.range(0.3, 1),
  };
}

/** A drone that holds position and never fights: the training target by the spawn roof. */
export function trainingDummyConfig(): EnemyConfig {
  return {
    seed: 0,
    bodyScale: 1,
    engineCount: 4,
    weaponCount: 0,
    armor: 0,
    speed: 0,
    health: 100,
    weaponType: 'gun',
    color: 0x6a7078,
    aggression: 0,
  };
}
