import { describe, expect, it } from 'vitest';
import { closeness } from '../../src/audio/FlightAudio';
import { chordFor, intensityFor, midiToHz, notesForStep } from '../../src/audio/MusicManager';

describe('music arrangement', () => {
  it('converts MIDI notes to pitch', () => {
    expect(midiToHz(69)).toBeCloseTo(440, 6);
    expect(midiToHz(57)).toBeCloseTo(220, 6);
    expect(midiToHz(81)).toBeCloseTo(880, 6);
  });

  it('cycles a four-bar progression, with a different one for the boss', () => {
    expect(chordFor(0, false)).toEqual(chordFor(4, false));
    expect(chordFor(1, false)).not.toEqual(chordFor(0, false));
    expect(chordFor(0, true)).not.toEqual(chordFor(0, false));
  });

  it('is a pad alone while exploring', () => {
    const layers = new Set<string>();
    for (let step = 0; step < 16; step++) {
      for (const note of notesForStep(step, 0, 0, false)) layers.add(note.layer);
    }
    expect([...layers]).toEqual(['pad']);
    expect(notesForStep(0, 0, 0, false)).toHaveLength(3); // a triad on the downbeat
    expect(notesForStep(5, 0, 0, false)).toHaveLength(0);
  });

  it('adds bass and arpeggio in a fight, and drums when it is intense', () => {
    const layersAt = (intensity: number): string[] => {
      const layers = new Set<string>();
      for (let step = 0; step < 16; step++) {
        for (const note of notesForStep(step, 0, intensity, false)) layers.add(note.layer);
      }
      return [...layers].sort();
    };
    expect(layersAt(0.45)).toEqual(['arp', 'bass', 'pad']);
    expect(layersAt(0.75)).toEqual(['arp', 'bass', 'hat', 'kick', 'pad']);
    expect(layersAt(1)).toEqual(layersAt(0.75));
  });

  it('keeps every pitched note inside a sensible range', () => {
    for (const boss of [false, true]) {
      for (let bar = 0; bar < 4; bar++) {
        for (let step = 0; step < 16; step++) {
          for (const note of notesForStep(step, bar, 1, boss)) {
            if (note.layer === 'hat') continue;
            expect(note.midi).toBeGreaterThanOrEqual(28);
            expect(note.midi).toBeLessThanOrEqual(84);
          }
        }
      }
    }
  });

  it('intensity follows the situation: boss over fight over objective over nothing', () => {
    const quiet = { boss: false, fighting: false, objective: false };
    expect(intensityFor(quiet)).toBe(0);
    expect(intensityFor({ ...quiet, objective: true })).toBeGreaterThan(0.35);
    expect(intensityFor({ ...quiet, fighting: true })).toBeGreaterThan(0.7);
    expect(intensityFor({ boss: true, fighting: true, objective: true })).toBe(1);
    expect(intensityFor({ ...quiet, fighting: true })).toBeGreaterThan(
      intensityFor({ ...quiet, objective: true }),
    );
  });
});

describe('proximity whoosh', () => {
  it('is zero with nothing in range and rises as a surface gets closer', () => {
    expect(closeness([-1, -1, -1], 30)).toBe(0);
    expect(closeness([15, -1, -1], 30)).toBeCloseTo(0.5, 6);
    expect(closeness([15, 3, -1], 30)).toBeCloseTo(0.9, 6);
    expect(closeness([0, -1, -1], 30)).toBe(1);
    expect(closeness([45, -1, -1], 30)).toBe(0);
  });
});
