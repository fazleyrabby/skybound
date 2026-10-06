import { Vector3 } from 'three';
import { Config } from '../core/Config';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/GameEvents';
import type { ParticleSystem } from './ParticleSystem';
import type { ShockRings } from './ShockRings';

/** Something that leaves a smoke trail while `smoking` is true. */
export interface SmokeSource {
  readonly position: Vector3;
  readonly smoking: boolean;
}

const COLOR = {
  spark: 0xffe08a,
  hero: 0x7fe7ff,
  fire: 0xff8a30,
  ember: 0xffc24d,
  debris: 0x6a6f78,
  smoke: 0x4a4d55,
  muzzle: 0xffb060,
} as const;

const at = new Vector3();
const drift = new Vector3();
const ZERO = new Vector3();

/**
 * Turns combat events into particles and shock rings (spec Phase 7 list):
 * punch impacts, blast hits, explosions with debris, muzzle flashes, enemy fire
 * hitting walls, and smoke behind missiles and crippled drones. Listens only;
 * gameplay does not know it exists.
 */
export class CombatEffects {
  private sinceSmoke = 0;

  constructor(
    private readonly particles: ParticleSystem,
    rings: ShockRings,
    private readonly smokeSources: () => Iterable<SmokeSource>,
    events: EventBus<GameEvents>,
  ) {
    events.on('combat:hit', ({ kind, speed, x, y, z }) => {
      at.set(x, y, z);
      if (kind === 'blast') {
        particles.burst(at, 10, 6, 22, { color: COLOR.hero, life: 0.3, size: 0.35, drag: 3 });
        this.flash(COLOR.hero, 2.2, 0.1);
        return;
      }
      // Melee: sparks thrown harder the faster the hero came in, plus a flash and a ring.
      const heavy = kind !== 'punch';
      const power = 1 + Math.min(speed / 80, 2);
      particles.burst(at, heavy ? 28 : 14, 8, 26 * power, {
        color: COLOR.spark,
        life: heavy ? 0.5 : 0.35,
        size: heavy ? 0.5 : 0.35,
        drag: 2.5,
        gravity: 0.4,
      });
      this.flash(COLOR.spark, heavy ? 5 : 3, 0.12);
      rings.trigger(at, heavy ? 9 * power : 5 * power, heavy ? 0.4 : 0.28, COLOR.spark);
    });

    events.on('combat:blastImpact', ({ x, y, z }) => {
      at.set(x, y, z);
      particles.burst(at, 8, 4, 16, { color: COLOR.hero, life: 0.35, size: 0.3, drag: 3 });
    });

    events.on('enemy:destroyed', ({ x, y, z }) => {
      at.set(x, y, z);
      particles.burst(at, 34, 6, 34, { color: COLOR.fire, life: 0.8, size: 1.1, drag: 2.2 });
      particles.burst(at, 18, 10, 46, { color: COLOR.ember, life: 0.6, size: 0.45, drag: 1.5 });
      // Debris falls; fire and embers do not.
      particles.burst(at, 14, 8, 28, { color: COLOR.debris, life: 1.6, size: 0.7, gravity: 1 });
      particles.burst(at, 8, 1, 5, {
        color: COLOR.smoke,
        life: 2.2,
        size: 2,
        endSize: 3,
        drag: 1,
      });
      this.flash(COLOR.ember, 9, 0.16);
      rings.trigger(at, 22, 0.5, COLOR.fire);
    });

    events.on('enemy:fired', ({ kind, x, y, z }) => {
      at.set(x, y, z);
      particles.emit(at, ZERO, {
        color: COLOR.muzzle,
        life: 0.07,
        size: kind === 'missile' ? 2.2 : 1,
      });
    });

    events.on('enemy:shotImpact', ({ kind, x, y, z }) => {
      at.set(x, y, z);
      if (kind === 'missile') {
        particles.burst(at, 20, 5, 24, { color: COLOR.fire, life: 0.5, size: 0.8, drag: 2.5 });
        this.flash(COLOR.ember, 5, 0.12);
        rings.trigger(at, 9, 0.35, COLOR.fire);
      } else {
        particles.burst(at, 4, 3, 12, { color: COLOR.muzzle, life: 0.25, size: 0.25, drag: 3 });
      }
    });
  }

  /** Call once per rendered frame. */
  update(frameDelta: number): void {
    this.sinceSmoke += frameDelta;
    if (this.sinceSmoke < Config.vfx.smokeInterval) return;
    this.sinceSmoke = 0;
    for (const source of this.smokeSources()) {
      if (!source.smoking) continue;
      drift.set(Math.random() - 0.5, Math.random() * 0.8 + 0.4, Math.random() - 0.5);
      this.particles.emit(source.position, drift, {
        color: COLOR.smoke,
        life: 0.9,
        size: 0.6,
        endSize: 2.4,
        drag: 0.8,
      });
    }
  }

  /** One large, very short-lived particle at the last `at` position. */
  private flash(color: number, size: number, life: number): void {
    this.particles.emit(at, ZERO, { color, life, size, endSize: 1.8 });
  }
}
