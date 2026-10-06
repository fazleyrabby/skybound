import { Config } from '../core/Config';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/GameEvents';
import { clamp } from '../utils/math';
import type { AudioManager } from './AudioManager';

/**
 * Every one-shot sound, as a mapping from game events to synthesis (spec
 * section 40: boost, punch, energy, impact, explosion, enemy, boss, UI).
 * Listens only; gameplay does not know it exists.
 */
export class SoundBank {
  constructor(
    private readonly audio: AudioManager,
    events: EventBus<GameEvents>,
  ) {
    const audioRef = audio;
    const burst = audioRef.noiseBurst.bind(audioRef);
    const tones = audioRef.tones.bind(audioRef);

    // Flight
    events.on('player:state', ({ from, to }) => {
      if (to === 'BOOSTING') this.boom();
      else if (to === 'LANDING') this.thump(from === 'JUMPING' ? 0.25 : 0.6);
      else if (from === 'JUMPING' && to === 'HOVERING') burst(0.2, 900, 2400, 0.25);
    });
    events.on('player:impact', ({ speed }) => this.impact(speed));

    // Combat
    events.on('combat:hit', ({ kind }) => {
      if (kind === 'blast') burst(0.35, 2400, 300, 0.12);
      else this.impact(kind === 'punch' ? 60 : 110);
    });
    events.on('combat:whiff', () => burst(0.12, 1800, 500, 0.1));
    events.on('combat:blastFired', () => {
      burst(0.2, 5000, 900, 0.14);
      if (audioRef.sfx) audioRef.sweep(audioRef.sfx, 1400, 500, 0.12, 0.12);
    });
    events.on('combat:blastImpact', () => burst(0.18, 2000, 400, 0.1));
    events.on('player:damaged', () => burst(0.5, 700, 150, 0.18));
    events.on('player:died', () => tones([330, 262, 196, 131], 0.16));

    // Enemies
    events.on('enemy:destroyed', () => {
      burst(0.8, 1400, 60, 0.7);
      if (audioRef.sfx) audioRef.sweep(audioRef.sfx, 90, 30, 0.6, 0.6);
    });
    events.on('enemy:fired', ({ kind }) => {
      if (kind === 'missile') burst(0.3, 900, 200, 0.4);
      else burst(0.1, 3200, 1200, 0.06);
    });
    events.on('enemy:shotImpact', ({ kind }) => {
      if (kind === 'missile') burst(0.5, 1200, 80, 0.4);
    });

    // Boss
    events.on('boss:spawned', () => tones([110, 98, 82, 65], 0.32, 0.4));
    events.on('boss:phase', () => burst(1, 1600, 50, 1.1));
    events.on('boss:defeated', () => {
      burst(1, 1800, 40, 1.8);
      if (audioRef.sfx) audioRef.sweep(audioRef.sfx, 70, 22, 1.6, 0.9);
    });
    events.on('boss:attack', ({ kind }) => {
      if (kind === 'laserCharge') tones([440, 554, 698, 880], 0.3);
      else if (kind === 'laserFire') burst(0.6, 6000, 1500, 0.5);
      else if (kind === 'salvo') burst(0.4, 800, 150, 0.5);
      else tones([196, 147], 0.18);
    });

    // World and missions
    events.on('world:eventStarted', () => tones([660, 880, 660], 0.12));
    events.on('world:eventEnded', ({ outcome }) =>
      tones(outcome === 'success' ? [523, 659, 784, 1047] : [392, 330, 262], 0.14),
    );
    events.on('mission:started', () => tones([392, 523, 659], 0.13));
    events.on('mission:objective', ({ index }) => {
      if (index > 0) tones([784, 1047], 0.09, 0.2);
    });
    events.on('mission:ended', ({ outcome }) =>
      tones(outcome === 'complete' ? [523, 659, 784, 1047, 1319] : [330, 262], 0.15),
    );
  }

  /** Interface feedback: starting the game, and resuming from pause. */
  ui(kind: 'start' | 'resume'): void {
    this.audio.tones(kind === 'resume' ? [440, 660] : [440, 660, 880], 0.07, 0.18);
  }

  /** Sonic boom: a low thump plus a falling noise sweep. */
  private boom(): void {
    const { sfx } = this.audio;
    const volume = Config.audio.boomVolume;
    if (sfx) this.audio.sweep(sfx, 120, 32, 0.7, volume);
    this.audio.noiseBurst(volume * 0.7, 1800, 90, 0.6);
  }

  private impact(speed: number): void {
    this.audio.noiseBurst(clamp(speed / 80, 0.1, 1) * Config.audio.impactVolume, 500, 120, 0.25);
  }

  private thump(strength: number): void {
    const { sfx } = this.audio;
    if (sfx) this.audio.sweep(sfx, 110, 40, 0.25, strength * 0.7);
    this.audio.noiseBurst(strength * 0.4, 400, 100, 0.2);
  }
}
