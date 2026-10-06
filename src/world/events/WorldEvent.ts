/** A named place an event can happen. `y` is the altitude the action is at. */
export interface EventSite {
  name: string;
  x: number;
  y: number;
  z: number;
}

export type EventProgress = 'running' | 'success' | 'failure';

/**
 * One kind of dynamic event (spec section 24). The manager owns the lifecycle
 * and the clock; an event only knows how to set itself up, report whether its
 * goal is met, and clean up after itself.
 */
export interface WorldEvent {
  readonly type: string;
  readonly title: string;
  readonly site: EventSite;
  /** Puts the event's actors into the world. Returns false if it cannot start. */
  start(): boolean;
  /** Called every step while the event is live. */
  update(dt: number): EventProgress;
  /** Short status for the HUD, e.g. "3 drones left". */
  status(): string;
  /** Points for finishing it, before any time bonus. */
  reward(): number;
  /** Removes whatever the event put into the world. */
  cleanup(): void;
}

/** Sites around Nova City where events can take place. */
export const EVENT_SITES: readonly EventSite[] = [
  { name: 'Downtown Plaza', x: -50, y: 210, z: 35 },
  { name: 'Harbor', x: 250, y: 95, z: 400 },
  { name: 'Industrial Yard', x: 400, y: 125, z: -200 },
  { name: 'Park', x: -400, y: 85, z: 350 },
  { name: 'Residential West', x: -400, y: 95, z: -200 },
  { name: 'North Highway', x: 0, y: 85, z: -250 },
  { name: 'Ocean Bridge', x: 760, y: 90, z: 200 },
];
