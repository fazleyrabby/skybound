import RAPIER from '@dimforge/rapier3d-compat';
import type { Vector3 } from 'three';
import { MAX_MOVE_HITS, type CollisionMover, type MoveResult } from './CollisionMover';

export interface CharacterShape {
  radius: number;
  /** Total capsule height including both caps. */
  height: number;
  skin: number;
  maxSlope: number;
}

const IDENTITY_ROTATION = { x: 0, y: 0, z: 0, w: 1 };
const DOWN = { x: 0, y: -1, z: 0 };
/** The ground probe starts this far above the capsule, so it still works after sinking in. */
const GROUND_PROBE_LIFT = 0.6;

/** The only module that imports Rapier. */
export class PhysicsWorld {
  private readonly castBall = new RAPIER.Ball(1);
  private readonly ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
  private characterBody: RAPIER.RigidBody | undefined;

  private constructor(private readonly world: RAPIER.World) {}

  /** Rapier's WASM must be initialised before any world is created. */
  static async create(step: number, gravityY: number): Promise<PhysicsWorld> {
    await RAPIER.init();
    const world = new RAPIER.World({ x: 0, y: gravityY, z: 0 });
    world.timestep = step;
    return new PhysicsWorld(world);
  }

  /** Static box collider centred at (x, y, z) with the given half extents. */
  addStaticCuboid(x: number, y: number, z: number, hx: number, hy: number, hz: number): void {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z));
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz), body);
  }

  /** Kinematic capsule moved by swept casts. `position` is the capsule centre. */
  createCharacterMover(shape: CharacterShape, position: Vector3): CollisionMover {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        position.x,
        position.y,
        position.z,
      ),
    );
    this.characterBody = body;
    const halfCylinder = Math.max(0, shape.height / 2 - shape.radius);
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(halfCylinder, shape.radius),
      body,
    );
    const capsule = new RAPIER.Capsule(halfCylinder, shape.radius);
    const probeOrigin = { x: 0, y: 0, z: 0 };

    const controller = this.world.createCharacterController(shape.skin);
    controller.setUp({ x: 0, y: 1, z: 0 });
    controller.setSlideEnabled(true);
    controller.setMaxSlopeClimbAngle(shape.maxSlope);
    controller.setMinSlopeSlideAngle(shape.maxSlope);
    controller.setApplyImpulsesToDynamicBodies(false);

    // The body only reaches its next translation on world.step(), so the mover
    // tracks the authoritative position itself.
    const current = { x: position.x, y: position.y, z: position.z };

    return {
      move: (desired: Vector3, out: MoveResult): void => {
        controller.computeColliderMovement(collider, desired);
        const moved = controller.computedMovement();
        out.movement.set(moved.x, moved.y, moved.z);
        out.grounded = controller.computedGrounded();

        out.hitCount = 0;
        const count = controller.numComputedCollisions();
        for (let i = 0; i < count && out.hitCount < MAX_MOVE_HITS; i++) {
          const hit = controller.computedCollision(i);
          const normal = out.hitNormals[out.hitCount];
          if (!hit || !normal) continue;
          normal.set(hit.normal2.x, hit.normal2.y, hit.normal2.z);
          if (normal.lengthSq() < 1e-6) continue;
          // Orient the normal against the direction of travel, whatever the engine's convention.
          if (normal.normalize().dot(desired) > 0) normal.negate();
          out.hitCount++;
        }

        current.x += moved.x;
        current.y += moved.y;
        current.z += moved.z;
        body.setNextKinematicTranslation(current);
      },
      // The character controller lets the capsule sink a little into the top of a
      // narrow box when pressed down each step, so standing is handled here instead:
      // cast the capsule down from slightly above and report where it should rest.
      groundOffset: (maxDrop: number): number | null => {
        probeOrigin.x = current.x;
        probeOrigin.y = current.y + GROUND_PROBE_LIFT;
        probeOrigin.z = current.z;
        const hit = this.world.castShape(
          probeOrigin,
          IDENTITY_ROTATION,
          DOWN,
          capsule,
          0,
          GROUND_PROBE_LIFT + maxDrop,
          true,
          undefined,
          undefined,
          undefined,
          body,
        );
        if (!hit) return null;
        // Distance from the capsule's current position to contact, less the gap to keep.
        return -(hit.time_of_impact - GROUND_PROBE_LIFT - shape.skin);
      },
      shiftY: (dy: number): void => {
        current.y += dy;
        body.setNextKinematicTranslation(current);
      },
      teleport: (target: Vector3): void => {
        current.x = target.x;
        current.y = target.y;
        current.z = target.z;
        body.setTranslation(current, true);
        // Colliders only follow their body on the next step; without this the next move
        // would sweep from the old position and could report ground that is not there.
        this.world.propagateModifiedBodyPositionsToColliders();
      },
    };
  }

  /**
   * Sweeps a sphere from `origin` along unit `direction`, ignoring the player.
   * Returns the distance to the first obstacle, or `maxDistance` if the path is clear.
   */
  castSphere(origin: Vector3, direction: Vector3, maxDistance: number, radius: number): number {
    this.castBall.radius = radius;
    const hit = this.world.castShape(
      origin,
      IDENTITY_ROTATION,
      direction,
      this.castBall,
      0,
      maxDistance,
      true,
      undefined,
      undefined,
      undefined,
      this.characterBody,
    );
    return hit ? Math.min(hit.time_of_impact, maxDistance) : maxDistance;
  }

  /** Distance along a ray to the first obstacle, ignoring the player, or -1 for none. */
  castRay(origin: Vector3, direction: Vector3, maxDistance: number): number {
    this.ray.origin = origin;
    this.ray.dir = direction;
    const hit = this.world.castRay(
      this.ray,
      maxDistance,
      true,
      undefined,
      undefined,
      undefined,
      this.characterBody,
    );
    return hit ? hit.timeOfImpact : -1;
  }

  step(): void {
    this.world.step();
  }

  get bodyCount(): number {
    return this.world.bodies.len();
  }

  dispose(): void {
    this.world.free();
  }
}
