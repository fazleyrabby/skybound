import { Config } from '../core/Config';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/GameEvents';
import { store } from '../core/store';
import type { PlayerInput } from '../player/PlayerState';
import type { WorldEvents } from '../world/WorldEvents';
import type { MissionDefinition } from './Mission';
import type { MissionContext, Objective, ObjectiveTarget } from './Objective';

export interface MissionResult {
  title: string;
  outcome: 'complete' | 'abandoned';
  reward: number;
}

/**
 * Runs missions (spec section 25): offers the ones that are unlocked at their
 * beacons, steps the active mission through its objectives, and settles the
 * reward. One mission at a time. A mission can be abandoned at any moment and
 * retried; the player can also ignore missions entirely.
 */
export class MissionManager {
  active: MissionDefinition | null = null;
  /** The last mission's result, shown for a few seconds. */
  result: MissionResult | null = null;

  private objectives: Objective[] = [];
  private index = 0;
  private resultTime = 0;

  constructor(
    private readonly missions: readonly MissionDefinition[],
    private readonly context: MissionContext,
    private readonly worldEvents: WorldEvents,
    private readonly events: EventBus<GameEvents>,
  ) {}

  /** Every mission, in order, for the mission list. */
  get all(): readonly MissionDefinition[] {
    return this.missions;
  }

  /** Whether a mission's prerequisite has been completed. */
  isUnlocked(mission: MissionDefinition): boolean {
    return !mission.requires || store.getState().missionsCompleted.includes(mission.requires);
  }

  get objective(): Objective | null {
    return this.active ? (this.objectives[this.index] ?? null) : null;
  }

  /** "2 / 4": which step of the mission this is. */
  get stepText(): string {
    return this.active ? `${this.index + 1} / ${this.objectives.length}` : '';
  }

  get target(): ObjectiveTarget | null {
    return this.objective?.target() ?? null;
  }

  /** Missions the player may start now: prerequisites met, none running. */
  get available(): MissionDefinition[] {
    if (this.active) return [];
    const done = store.getState().missionsCompleted;
    return this.missions.filter((mission) => !mission.requires || done.includes(mission.requires));
  }

  /** The available mission whose beacon the player is standing at, if any. */
  get offered(): MissionDefinition | null {
    const { position } = this.context.player;
    const range = Config.missions.beaconRange;
    return (
      this.available.find(
        ({ beacon }) =>
          Math.hypot(position.x - beacon.x, position.z - beacon.z) < range &&
          Math.abs(position.y - beacon.y) < range,
      ) ?? null
    );
  }

  isCompleted(id: string): boolean {
    return store.getState().missionsCompleted.includes(id);
  }

  start(id: string): boolean {
    const mission = this.available.find((candidate) => candidate.id === id);
    if (!mission) return false;
    // Missions and world events share the drone reserve; one at a time.
    this.worldEvents.abort();
    this.worldEvents.suspended = true;
    this.active = mission;
    this.objectives = mission.createObjectives();
    this.index = 0;
    this.result = null;
    this.events.emit('mission:started', { id: mission.id, title: mission.title });
    this.announceObjective();
    return true;
  }

  abandon(): void {
    if (this.active) this.finish('abandoned');
  }

  fixedUpdate(input: PlayerInput, dt: number): void {
    if (this.result) {
      this.resultTime -= dt;
      if (this.resultTime <= 0) this.result = null;
    }

    const mission = this.active;
    if (!mission) {
      const offered = input.interactPressed ? this.offered : null;
      if (offered) this.start(offered.id);
      return;
    }
    if (input.abandonPressed) {
      this.abandon();
      return;
    }

    // An objective can complete on the step it becomes current (already airborne, say).
    while (this.objectives[this.index]?.update(this.context, dt)) {
      this.objectives[this.index]?.cleanup?.(this.context);
      this.index++;
      if (this.index >= this.objectives.length) {
        this.finish('complete');
        return;
      }
      this.announceObjective();
    }
  }

  private announceObjective(): void {
    const objective = this.objective;
    if (this.active && objective) {
      this.events.emit('mission:objective', {
        id: this.active.id,
        index: this.index,
        label: objective.label,
      });
    }
  }

  private finish(outcome: 'complete' | 'abandoned'): void {
    const mission = this.active;
    if (!mission) return;
    for (const objective of this.objectives.slice(this.index)) objective.cleanup?.(this.context);
    const reward = outcome === 'complete' ? mission.reward : 0;
    if (outcome === 'complete') store.getState().completeMission(mission.id, reward);

    this.active = null;
    this.objectives = [];
    this.index = 0;
    this.result = { title: mission.title, outcome, reward };
    this.resultTime = Config.missions.resultHold;
    this.worldEvents.suspended = false;
    this.events.emit('mission:ended', { id: mission.id, outcome, reward });
  }
}
