import { Config } from '../../core/Config';
import type { Drone } from '../../enemies/Drone';
import type { EnemyManager } from '../../enemies/EnemyManager';
import type { Rng } from '../../utils/rng';
import type { EventProgress, EventSite, WorldEvent } from './WorldEvent';

/** A squad of drones turns up at a site. Destroy them all to clear it. */
export class DroneAttackEvent implements WorldEvent {
  readonly type = 'droneAttack';
  readonly title = 'Drone Attack';
  private squad: Drone[] = [];

  constructor(
    readonly site: EventSite,
    private readonly enemies: EnemyManager,
    private readonly rng: Rng,
  ) {}

  start(): boolean {
    const { squadMin, squadMax, squadSpread } = Config.events;
    const wanted = squadMin + Math.floor(this.rng.next() * (squadMax - squadMin + 1));
    const available = this.enemies.reserve;
    if (available.length < squadMin) return false;

    this.squad = available.slice(0, wanted);
    for (const drone of this.squad) {
      drone.deploy(
        this.site.x + this.rng.range(-squadSpread, squadSpread),
        this.site.y + this.rng.range(-15, 25),
        this.site.z + this.rng.range(-squadSpread, squadSpread),
      );
    }
    return true;
  }

  update(): EventProgress {
    return this.remaining === 0 ? 'success' : 'running';
  }

  status(): string {
    const left = this.remaining;
    return `${left} drone${left === 1 ? '' : 's'} left`;
  }

  reward(): number {
    return this.squad.length * Config.events.rewardPerDrone;
  }

  cleanup(): void {
    for (const drone of this.squad) drone.dismiss();
    this.squad = [];
  }

  get squadSize(): number {
    return this.squad.length;
  }

  private get remaining(): number {
    return this.squad.filter((drone) => drone.alive).length;
  }
}
