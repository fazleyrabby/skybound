import { Vector3 } from 'three';
import { Config } from '../core/Config';
import type { BossFight } from '../enemies/boss/BossFight';
import type { Drone } from '../enemies/Drone';
import type { EnemyManager } from '../enemies/EnemyManager';
import type { PlayerState } from '../player/PlayerState';
import { toDisplaySpeed } from '../ui/speed';

/** What objectives can read and act on. */
export interface MissionContext {
  player: PlayerState;
  enemies: EnemyManager;
  boss: BossFight;
}

export interface Point {
  x: number;
  y: number;
  z: number;
}

/** Where the player should go for the current objective, and how big the target is. */
export interface ObjectiveTarget extends Point {
  radius: number;
  /** A ring to fly through, or a spot to reach or land on. */
  kind: 'ring' | 'spot';
}

/**
 * One step of a mission (spec section 25). Stateful: created fresh each time
 * its mission starts.
 */
export interface Objective {
  /** Instruction shown to the player. */
  readonly label: string;
  /** Returns true once the objective is met. */
  update(context: MissionContext, dt: number): boolean;
  /** Short progress text such as "3 / 8", or empty. */
  progress(): string;
  target(): ObjectiveTarget | null;
  /** Removes anything the objective put into the world. */
  cleanup?(context: MissionContext): void;
}

/** Get airborne: the first thing a new player has to learn. */
export class TakeOffObjective implements Objective {
  readonly label = 'Take off: press Space to jump, then Space again';
  update(context: MissionContext): boolean {
    return context.player.flying;
  }
  progress(): string {
    return '';
  }
  target(): null {
    return null;
  }
}

const segment = new Vector3();
const toPoint = new Vector3();

/** Fly through a course of rings in order. */
export class CheckpointsObjective implements Objective {
  readonly label = 'Fly through the rings';
  private index = 0;

  constructor(private readonly points: ReadonlyArray<Point & { radius?: number }>) {}

  update(context: MissionContext): boolean {
    const point = this.points[this.index];
    if (!point) return true;
    const radius = point.radius ?? Config.missions.checkpointRadius;
    // Test the path flown this step, not just where it ended: at boost speed
    // the hero covers several metres per step and could skip a ring.
    const { previousPosition, position } = context.player;
    segment.copy(position).sub(previousPosition);
    toPoint.set(point.x, point.y, point.z).sub(previousPosition);
    const lengthSq = segment.lengthSq();
    const along = lengthSq > 0 ? Math.min(1, Math.max(0, toPoint.dot(segment) / lengthSq)) : 0;
    const miss = toPoint.addScaledVector(segment, -along).length();
    if (miss <= radius) this.index++;
    return this.index >= this.points.length;
  }

  progress(): string {
    return `${Math.min(this.index, this.points.length)} / ${this.points.length}`;
  }

  target(): ObjectiveTarget | null {
    const point = this.points[this.index];
    if (!point) return null;
    return { ...point, radius: point.radius ?? Config.missions.checkpointRadius, kind: 'ring' };
  }
}

/** Reach a speed, to teach boost. */
export class SpeedObjective implements Objective {
  readonly label: string;
  private best = 0;

  constructor(private readonly speed: number) {
    this.label = `Boost: hold Shift while flying and pass ${Math.round(toDisplaySpeed(speed))} km/h`;
  }

  update(context: MissionContext): boolean {
    this.best = Math.max(this.best, context.player.speed);
    return this.best >= this.speed;
  }

  progress(): string {
    return `${Math.round(toDisplaySpeed(this.best))} km/h`;
  }

  target(): null {
    return null;
  }
}

/** Touch down on a marked spot. */
export class LandObjective implements Objective {
  readonly label = 'Land on the marked rooftop: slow down, then hold C';

  constructor(
    private readonly spot: Point,
    private readonly radius: number,
  ) {}

  update(context: MissionContext): boolean {
    const { state, position } = context.player;
    if (state !== 'GROUND') return false;
    const flat = Math.hypot(position.x - this.spot.x, position.z - this.spot.z);
    return flat <= this.radius && Math.abs(position.y - this.spot.y) < 4;
  }

  progress(): string {
    return '';
  }

  target(): ObjectiveTarget {
    return { ...this.spot, radius: this.radius, kind: 'spot' };
  }
}

/** Destroy a number of drones, sent in waves from the reserve. */
export class DestroyDronesObjective implements Objective {
  readonly label: string;
  private squad: Drone[] = [];
  private deployed = 0;
  private destroyed = 0;

  constructor(
    private readonly total: number,
    private readonly waveSize: number,
    private readonly site: Point,
    private readonly spread: number,
  ) {
    this.label = `Destroy ${total} drones`;
  }

  update(context: MissionContext): boolean {
    // Count the fallen and hand their bodies back to the reserve.
    this.squad = this.squad.filter((drone) => {
      if (drone.alive) return true;
      this.destroyed++;
      drone.dismiss();
      return false;
    });
    if (this.destroyed >= this.total) return true;

    // Top the wave up from the reserve, spread around the site.
    const reserve = context.enemies.reserve;
    while (this.squad.length < this.waveSize && this.deployed < this.total) {
      const drone = reserve.pop();
      if (!drone) break;
      const angle = (this.deployed / this.waveSize) * Math.PI * 2 + this.deployed;
      drone.deploy(
        this.site.x + Math.cos(angle) * this.spread,
        this.site.y + (this.deployed % 3) * 12,
        this.site.z + Math.sin(angle) * this.spread,
      );
      this.squad.push(drone);
      this.deployed++;
    }
    return false;
  }

  progress(): string {
    return `${Math.min(this.destroyed, this.total)} / ${this.total}`;
  }

  target(): ObjectiveTarget {
    return { ...this.site, radius: this.spread, kind: 'spot' };
  }

  cleanup(): void {
    for (const drone of this.squad) drone.dismiss();
    this.squad = [];
  }
}

/** Bring down the boss. Starts the encounter when the objective becomes current. */
export class DefeatBossObjective implements Objective {
  readonly label = 'Defeat Titan: hit the glowing weak points';
  private boss: BossFight | null = null;

  update(context: MissionContext): boolean {
    if (!this.boss) {
      this.boss = context.boss;
      this.boss.start();
    }
    return this.boss.defeated;
  }

  progress(): string {
    const titan = this.boss?.titan;
    return titan?.alive ? `${Math.ceil(titan.healthFraction * 100)}%` : '';
  }

  target(): ObjectiveTarget | null {
    const titan = this.boss?.titan;
    if (!titan?.alive) return null;
    const { x, y, z } = titan.position;
    return { x, y, z, radius: titan.radius, kind: 'spot' };
  }

  cleanup(context: MissionContext): void {
    if (!context.boss.defeated) context.boss.despawn();
  }
}
