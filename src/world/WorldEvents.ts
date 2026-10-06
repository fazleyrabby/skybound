import { Config } from '../core/Config';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/GameEvents';
import { store } from '../core/store';
import { createRng, type Rng } from '../utils/rng';
import { EVENT_SITES, type EventSite, type WorldEvent } from './events/WorldEvent';

/**
 * Lifecycle from spec section 24:
 *   IDLE -> (spawn) -> ACTIVE <-> ENGAGED -> SUCCESS | FAILURE -> (reward, cleanup) -> IDLE
 * SUCCESS and FAILURE are held briefly so the result can be shown.
 */
export type EventPhase = 'IDLE' | 'ACTIVE' | 'ENGAGED' | 'SUCCESS' | 'FAILURE';

export type EventFactory = (site: EventSite, rng: Rng) => WorldEvent;

interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/**
 * Runs one dynamic event at a time: waits, picks a site, starts an event,
 * tracks whether the player has shown up, and settles the outcome. Events are
 * optional; ignoring one costs nothing but the reward.
 */
export class WorldEvents {
  phase: EventPhase = 'IDLE';
  current: WorldEvent | null = null;
  /** Seconds left before an unattended event is lost. Frozen while the player is engaged. */
  timeLeft = 0;
  /** Reward banked by the event that just ended, for the result display. */
  lastReward = 0;

  /** While true no new event starts. Missions set this so the two do not overlap. */
  suspended = false;

  private readonly rng: Rng;
  private wait = Config.events.firstDelay;
  private lastSite: EventSite | null = null;

  constructor(
    private readonly factories: readonly EventFactory[],
    private readonly events: EventBus<GameEvents>,
    seed: number,
    private readonly sites: readonly EventSite[] = EVENT_SITES,
  ) {
    this.rng = createRng(seed + 404);
  }

  fixedUpdate(dt: number, player: Vec3Like): void {
    const cfg = Config.events;

    switch (this.phase) {
      case 'IDLE':
        if (this.suspended) return;
        this.wait -= dt;
        if (this.wait <= 0) this.spawn();
        return;

      case 'ACTIVE':
      case 'ENGAGED': {
        const event = this.current;
        if (!event) return;
        const near = Math.hypot(player.x - event.site.x, player.z - event.site.z) < cfg.engageRange;
        this.phase = near ? 'ENGAGED' : 'ACTIVE';
        // The clock only runs while the player is elsewhere.
        if (!near) this.timeLeft -= dt;

        const progress = event.update(dt);
        if (progress === 'success') this.finish('success');
        else if (progress === 'failure' || this.timeLeft <= 0) this.finish('failure');
        return;
      }

      case 'SUCCESS':
      case 'FAILURE':
        this.wait -= dt;
        if (this.wait > 0) return;
        this.phase = 'IDLE';
        this.wait = this.rng.range(cfg.minGap, cfg.maxGap);
        return;
    }
  }

  /** Ends the current event quietly: no result, no reward. */
  abort(): void {
    this.current?.cleanup();
    this.current = null;
    this.phase = 'IDLE';
    this.wait = Config.events.minGap;
  }

  /** Starts an event now, optionally at a given site. For the debug menu and tests. */
  trigger(siteIndex?: number): boolean {
    if (this.current) return false;
    return this.spawn(siteIndex === undefined ? undefined : this.sites[siteIndex]);
  }

  private spawn(site: EventSite | undefined = this.pickSite()): boolean {
    const factory = this.factories[Math.floor(this.rng.next() * this.factories.length)];
    const event = site && factory ? factory(site, this.rng) : null;
    if (!event || !event.start()) {
      // Nothing could start (no actors free); try again shortly.
      this.wait = Config.events.minGap;
      return false;
    }
    this.current = event;
    this.lastSite = event.site;
    this.phase = 'ACTIVE';
    this.timeLeft = Config.events.timeLimit;
    const { x, y, z, name } = event.site;
    this.events.emit('world:eventStarted', {
      type: event.type,
      title: event.title,
      site: name,
      x,
      y,
      z,
    });
    return true;
  }

  /** A random site, never the same one twice running. */
  private pickSite(): EventSite | undefined {
    const options = this.sites.filter((site) => site !== this.lastSite);
    return options[Math.floor(this.rng.next() * options.length)];
  }

  private finish(outcome: 'success' | 'failure'): void {
    const event = this.current;
    if (!event) return;
    const reward =
      outcome === 'success'
        ? Math.round(event.reward() + Math.max(0, this.timeLeft) * Config.events.rewardPerSecond)
        : 0;
    event.cleanup();
    this.current = null;
    this.lastReward = reward;
    this.phase = outcome === 'success' ? 'SUCCESS' : 'FAILURE';
    this.wait = Config.events.resultHold;
    store.getState().recordEvent(outcome, reward);
    this.events.emit('world:eventEnded', { type: event.type, outcome, reward });
  }
}
