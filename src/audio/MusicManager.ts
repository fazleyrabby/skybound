import { Config } from '../core/Config';
import { damp } from '../utils/math';
import type { AudioManager } from './AudioManager';

export type MusicNote = { layer: 'pad' | 'bass' | 'arp' | 'kick' | 'hat'; midi: number };

const STEPS_PER_BAR = 16;
/** Seconds of music scheduled ahead of the audio clock. */
const LOOKAHEAD = 0.2;

/** Triads as MIDI notes. Exploring: A minor, F, C, G. Boss: D minor, B flat, G minor, A. */
const CALM: readonly (readonly [number, number, number])[] = [
  [57, 60, 64],
  [53, 57, 60],
  [48, 52, 55],
  [55, 59, 62],
];
const BOSS: readonly (readonly [number, number, number])[] = [
  [50, 53, 57],
  [46, 50, 53],
  [43, 46, 50],
  [45, 49, 52],
];

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function chordFor(bar: number, boss: boolean): readonly [number, number, number] {
  const chords = boss ? BOSS : CALM;
  return chords[((bar % chords.length) + chords.length) % chords.length] ?? CALM[0]!;
}

/**
 * What plays on one sixteenth-note step. The arrangement thickens with
 * intensity: a pad alone while exploring, bass and arpeggio once a fight
 * starts, drums when it is intense. Pure, so it can be tested.
 */
export function notesForStep(
  step: number,
  bar: number,
  intensity: number,
  boss: boolean,
): MusicNote[] {
  const [root, third, fifth] = chordFor(bar, boss);
  const notes: MusicNote[] = [];
  if (step === 0) {
    notes.push(
      { layer: 'pad', midi: root },
      { layer: 'pad', midi: third },
      { layer: 'pad', midi: fifth },
    );
  }
  if (intensity >= 0.35) {
    if (step === 0 || step === 6 || step === 8 || step === 14)
      notes.push({ layer: 'bass', midi: root - 12 });
    if (step % 2 === 0) {
      const tones = [root, third, fifth, third];
      notes.push({ layer: 'arp', midi: (tones[(step / 2) % tones.length] ?? root) + 12 });
    }
  }
  if (intensity >= 0.7) {
    if (step % 4 === 0) notes.push({ layer: 'kick', midi: 36 });
    if (step % 4 === 2) notes.push({ layer: 'hat', midi: 0 });
  }
  return notes;
}

/**
 * Generative music that follows the action (spec section 40). `setIntensity`
 * takes 0 (free flight) to 1 (boss); the arrangement follows it smoothly.
 * Notes are scheduled a fraction of a second ahead on the audio clock, so
 * timing does not depend on frame rate.
 */
export class MusicManager {
  /** Smoothed intensity actually driving the arrangement. */
  intensity = 0;
  private target = 0;
  private boss = false;
  private step = 0;
  private bar = 0;
  private nextStepTime = 0;
  private started = false;

  constructor(private readonly audio: AudioManager) {}

  setIntensity(intensity: number, boss: boolean): void {
    this.target = intensity;
    this.boss = boss;
  }

  /** Call once per rendered frame. */
  update(frameDelta: number): void {
    const context = this.audio.context;
    const destination = this.audio.music;
    if (!context || !destination || !this.audio.running) return;
    this.intensity = damp(this.intensity, this.target, Config.audio.musicResponse, frameDelta);

    if (!this.started || this.nextStepTime < context.currentTime - 1) {
      // First run, or the tab was away: start again from the present.
      this.started = true;
      this.nextStepTime = context.currentTime + 0.05;
    }
    const tempo = this.boss ? Config.audio.musicBossTempo : Config.audio.musicTempo;
    const stepSeconds = 60 / tempo / 4;

    while (this.nextStepTime < context.currentTime + LOOKAHEAD) {
      const when = this.nextStepTime - context.currentTime;
      for (const note of notesForStep(this.step, this.bar, this.intensity, this.boss)) {
        this.play(destination, note, when, stepSeconds);
      }
      this.nextStepTime += stepSeconds;
      this.step++;
      if (this.step >= STEPS_PER_BAR) {
        this.step = 0;
        this.bar++;
      }
    }
  }

  private play(destination: GainNode, note: MusicNote, when: number, stepSeconds: number): void {
    const audio = this.audio;
    switch (note.layer) {
      case 'pad':
        audio.note(destination, midiToHz(note.midi), when, stepSeconds * 17, 0.07, 'triangle', 900);
        break;
      case 'bass':
        audio.note(
          destination,
          midiToHz(note.midi),
          when,
          stepSeconds * 2.2,
          0.16,
          'sawtooth',
          320,
        );
        break;
      case 'arp':
        audio.note(
          destination,
          midiToHz(note.midi),
          when,
          stepSeconds * 1.6,
          0.045,
          'square',
          1800,
        );
        break;
      case 'kick':
        audio.sweep(destination, 130, 40, 0.18, 0.5, when);
        break;
      case 'hat':
        // The noise burst goes to the effects bus; quiet enough not to matter for the mix.
        audio.noiseBurst(0.05, 9000, 5000, 0.04, when);
        break;
    }
  }
}

/** What is going on, as far as the music is concerned. */
export interface MusicCues {
  boss: boolean;
  /** An enemy is chasing or attacking the player. */
  fighting: boolean;
  /** A mission or world event is in progress. */
  objective: boolean;
}

/** Maps the situation to a music intensity. */
export function intensityFor(cues: MusicCues): number {
  if (cues.boss) return 1;
  if (cues.fighting) return 0.75;
  if (cues.objective) return 0.45;
  return 0;
}
