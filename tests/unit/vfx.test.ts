import { PerspectiveCamera, Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Config } from '../../src/core/Config';
import { EventBus } from '../../src/core/EventBus';
import type { GameEvents } from '../../src/core/GameEvents';
import { CombatEffects, type SmokeSource } from '../../src/vfx/CombatEffects';
import { ParticleSystem } from '../../src/vfx/ParticleSystem';
import { ShockRings } from '../../src/vfx/ShockRings';

const FRAME = 1 / 60;
const ORIGIN = new Vector3();
const SPARK = { color: 0xffffff, life: 0.5, size: 1 };

function createEffects(sources: SmokeSource[] = []) {
  const scene = new Scene();
  const events = new EventBus<GameEvents>();
  const particles = new ParticleSystem(scene);
  const rings = new ShockRings(scene, new PerspectiveCamera());
  const effects = new CombatEffects(particles, rings, () => sources, events);
  const frames = (count: number): void => {
    for (let i = 0; i < count; i++) {
      effects.update(FRAME);
      particles.update(FRAME);
      rings.update(FRAME);
    }
  };
  return { scene, events, particles, rings, frames };
}

describe('ParticleSystem', () => {
  it('particles live, move, and expire', () => {
    const particles = new ParticleSystem(new Scene());
    particles.emit(ORIGIN, new Vector3(10, 0, 0), SPARK);
    particles.update(FRAME);
    expect(particles.count).toBe(1);
    for (let i = 0; i < 40; i++) particles.update(FRAME);
    expect(particles.count).toBe(0);
  });

  it('is one draw call and never grows past its pool', () => {
    const scene = new Scene();
    const particles = new ParticleSystem(scene);
    expect(scene.children).toHaveLength(1);
    for (let i = 0; i < 20; i++) particles.burst(ORIGIN, 200, 1, 10, SPARK);
    particles.update(FRAME);
    expect(particles.count).toBe(Config.vfx.maxParticles);
    expect(scene.children).toHaveLength(1);
  });

  it('the quality setting scales burst size', () => {
    const count = (scale: number): number => {
      const particles = new ParticleSystem(new Scene());
      const previous = Config.vfx.particleScale;
      Config.vfx.particleScale = scale;
      particles.burst(ORIGIN, 40, 1, 10, SPARK);
      Config.vfx.particleScale = previous;
      particles.update(FRAME);
      return particles.count;
    };
    expect(count(1)).toBe(40);
    expect(count(0.25)).toBe(10);
  });
});

describe('CombatEffects', () => {
  const HIT = { targetId: 1, damage: 25, x: 0, y: 0, z: 0 };

  it('a punch throws sparks and a ring; a faster one throws more ring', () => {
    const slow = createEffects();
    slow.events.emit('combat:hit', { ...HIT, kind: 'punch', speed: 0 });
    slow.frames(1);
    expect(slow.particles.count).toBeGreaterThan(10);
    expect(slow.rings.active).toBe(1);

    const heavy = createEffects();
    heavy.events.emit('combat:hit', { ...HIT, kind: 'heavy', speed: 120 });
    heavy.frames(1);
    expect(heavy.particles.count).toBeGreaterThan(slow.particles.count);
  });

  it('an explosion is the biggest effect and cleans itself up', () => {
    const effects = createEffects();
    effects.events.emit('enemy:destroyed', { id: 1, x: 0, y: 100, z: 0 });
    effects.frames(1);
    expect(effects.particles.count).toBeGreaterThan(60);
    expect(effects.rings.active).toBe(1);
    effects.frames(60 * 3);
    expect(effects.particles.count).toBe(0);
    expect(effects.rings.active).toBe(0);
  });

  it('blasts, wall impacts and enemy fire each produce something', () => {
    const fire = (emit: (events: EventBus<GameEvents>) => void): number => {
      const effects = createEffects();
      emit(effects.events);
      effects.frames(1);
      return effects.particles.count;
    };
    expect(fire((e) => e.emit('combat:hit', { ...HIT, kind: 'blast', speed: 0 }))).toBeGreaterThan(
      5,
    );
    expect(fire((e) => e.emit('combat:blastImpact', { x: 0, y: 0, z: 0 }))).toBeGreaterThan(3);
    expect(fire((e) => e.emit('enemy:fired', { kind: 'bullet', x: 0, y: 0, z: 0 }))).toBe(1);
    expect(
      fire((e) => e.emit('enemy:shotImpact', { kind: 'bullet', x: 0, y: 0, z: 0 })),
    ).toBeGreaterThan(2);
    expect(
      fire((e) => e.emit('enemy:shotImpact', { kind: 'missile', x: 0, y: 0, z: 0 })),
    ).toBeGreaterThan(15);
  });

  it('only smoking sources leave a trail', () => {
    const quiet = createEffects([{ position: new Vector3(), smoking: false }]);
    quiet.frames(30);
    expect(quiet.particles.count).toBe(0);

    const smoking = createEffects([{ position: new Vector3(), smoking: true }]);
    smoking.frames(30);
    expect(smoking.particles.count).toBeGreaterThan(5);
  });
});
