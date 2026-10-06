import {
  BoxGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
  type Scene,
} from 'three';
import { Config } from '../core/Config';

export interface ParticleOptions {
  /** 0xRRGGBB. */
  color: number;
  /** Seconds. */
  life: number;
  /** Edge length at birth, metres. */
  size: number;
  /** Size multiplier approached over the life, before the final shrink. Above 1 grows (smoke). */
  endSize?: number;
  /** Fraction of `particleGravity` applied. */
  gravity?: number;
  /** Velocity damping rate, 1/s. */
  drag?: number;
}

interface Particle {
  active: boolean;
  readonly position: Vector3;
  readonly velocity: Vector3;
  readonly color: Color;
  age: number;
  life: number;
  size: number;
  endSize: number;
  gravity: number;
  drag: number;
}

const IDENTITY = new Quaternion();

/**
 * One pooled, instanced particle system shared by every effect (spec sections
 * 33, 36): a single draw call, no allocation after construction. When the pool
 * is full the oldest particle is recycled. Cosmetic only, so it runs on frame
 * time and may use `Math.random()`.
 *
 * Particles are solid colour and vanish by shrinking. Additive blending was
 * tried first and washed every colour out to white against the daytime sky.
 */
export class ParticleSystem {
  private readonly particles: Particle[];
  private readonly mesh: InstancedMesh;
  private readonly matrix = new Matrix4();
  private readonly scale = new Vector3();
  private readonly tint = new Color();
  private readonly spread = new Vector3();
  private cursor = 0;
  private live = 0;
  private emitted = 0;

  constructor(scene: Scene) {
    const capacity = Config.vfx.maxParticles;
    this.particles = Array.from({ length: capacity }, () => ({
      active: false,
      position: new Vector3(),
      velocity: new Vector3(),
      color: new Color(),
      age: 0,
      life: 1,
      size: 1,
      endSize: 0,
      gravity: 0,
      drag: 0,
    }));
    this.mesh = new InstancedMesh(
      new BoxGeometry(1, 1, 1),
      new MeshBasicMaterial({ fog: false }),
      capacity,
    );
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    // Allocate the colour buffer up front so the first burst does not.
    this.mesh.setColorAt(0, this.tint);
    scene.add(this.mesh);
  }

  /** Particles currently alive. */
  get count(): number {
    return this.live;
  }

  /** Total emissions, including expired particles, for timing-independent browser checks. */
  get emittedCount(): number {
    return this.emitted;
  }

  /** `lifeScale` multiplies the life in `options`, so bursts can vary it without copying. */
  emit(position: Vector3, velocity: Vector3, options: ParticleOptions, lifeScale = 1): void {
    const particle = this.particles[this.cursor];
    this.cursor = (this.cursor + 1) % this.particles.length;
    if (!particle) return;
    this.emitted++;
    particle.active = true;
    particle.position.copy(position);
    particle.velocity.copy(velocity);
    particle.color.setHex(options.color);
    particle.age = 0;
    particle.life = options.life * lifeScale;
    particle.size = options.size;
    particle.endSize = options.endSize ?? 1;
    particle.gravity = options.gravity ?? 0;
    particle.drag = options.drag ?? 0;
  }

  /**
   * Emits `count` particles flying outward from a point in random directions,
   * at speeds between `minSpeed` and `maxSpeed`, plus an optional shared drift.
   */
  burst(
    position: Vector3,
    count: number,
    minSpeed: number,
    maxSpeed: number,
    options: ParticleOptions,
    drift?: Vector3,
  ): void {
    const scaled = Math.max(1, Math.round(count * Config.vfx.particleScale));
    for (let i = 0; i < scaled; i++) {
      this.spread
        .set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1)
        .normalize()
        .multiplyScalar(minSpeed + Math.random() * (maxSpeed - minSpeed));
      if (drift) this.spread.add(drift);
      this.emit(position, this.spread, options, 0.6 + Math.random() * 0.4);
    }
  }

  update(frameDelta: number): void {
    const gravity = Config.vfx.particleGravity;
    let drawn = 0;
    for (const particle of this.particles) {
      if (!particle.active) continue;
      particle.age += frameDelta;
      const t = particle.age / particle.life;
      if (t >= 1) {
        particle.active = false;
        continue;
      }
      particle.velocity.y -= gravity * particle.gravity * frameDelta;
      if (particle.drag > 0)
        particle.velocity.multiplyScalar(Math.exp(-particle.drag * frameDelta));
      particle.position.addScaledVector(particle.velocity, frameDelta);

      // Grow or hold toward endSize, then shrink to nothing over the last part of the life.
      const size = particle.size * (1 + (particle.endSize - 1) * t) * (1 - t * t * t);
      this.scale.setScalar(Math.max(size, 0.001));
      this.mesh.setMatrixAt(drawn, this.matrix.compose(particle.position, IDENTITY, this.scale));
      // Cool slightly as it ages.
      this.mesh.setColorAt(drawn, this.tint.copy(particle.color).multiplyScalar(1 - t * 0.45));
      drawn++;
    }
    this.live = drawn;
    this.mesh.count = drawn;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
