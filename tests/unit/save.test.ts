import { describe, expect, it } from 'vitest';
import type { StorageAdapter } from '../../src/save/LocalStorageAdapter';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../../src/core/Settings';
import {
  BACKUP_KEY,
  defaultSave,
  SAVE_KEY,
  SAVE_VERSION,
  SaveManager,
} from '../../src/save/SaveManager';

function memoryStorage(
  initial: Record<string, string> = {},
): StorageAdapter & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    get: (key) => data.get(key) ?? null,
    set: (key, value) => void data.set(key, value),
  };
}

const PROGRESS = {
  score: 1200,
  eventsCompleted: 3,
  eventsFailed: 1,
  missionsCompleted: ['first-flight'],
  settings: { ...DEFAULT_SETTINGS, sensitivity: 1.6, invertY: true, quality: 'LOW' as const },
};

describe('SaveManager (spec section 45)', () => {
  it('returns defaults when nothing is saved', () => {
    expect(new SaveManager(memoryStorage()).load()).toEqual(defaultSave());
  });

  it('round-trips progress and stamps the version', () => {
    const storage = memoryStorage();
    new SaveManager(storage).save(PROGRESS);
    expect(JSON.parse(storage.data.get(SAVE_KEY)!).version).toBe(SAVE_VERSION);
    expect(new SaveManager(storage).load()).toEqual({ ...PROGRESS, version: SAVE_VERSION });
  });

  it('backs up a save it cannot read and starts fresh, without throwing', () => {
    for (const bad of ['{not json', '"a string"', '{"version":99,"score":5}', '{"score":5}']) {
      const storage = memoryStorage({ [SAVE_KEY]: bad });
      expect(new SaveManager(storage).load()).toEqual(defaultSave());
      expect(storage.data.get(BACKUP_KEY)).toBe(bad);
    }
  });

  it('repairs individual bad fields rather than discarding the whole save', () => {
    const storage = memoryStorage({
      [SAVE_KEY]: JSON.stringify({
        version: 1,
        score: -50,
        eventsCompleted: 'many',
        eventsFailed: 2,
        missionsCompleted: ['first-flight', 7, null],
      }),
    });
    expect(new SaveManager(storage).load()).toEqual({
      version: SAVE_VERSION,
      score: 0,
      eventsCompleted: 0,
      eventsFailed: 2,
      missionsCompleted: ['first-flight'],
      settings: DEFAULT_SETTINGS,
    });
    expect(storage.data.has(BACKUP_KEY)).toBe(false);
  });

  it('survives storage that is unavailable', () => {
    const broken: StorageAdapter = { get: () => null, set: () => undefined };
    const saves = new SaveManager(broken);
    saves.save(PROGRESS);
    expect(saves.load()).toEqual(defaultSave());
  });
});

describe('save migration and settings', () => {
  it('upgrades a version 1 save, keeping progress and adding default settings', () => {
    const storage = memoryStorage({
      [SAVE_KEY]: JSON.stringify({
        version: 1,
        score: 900,
        eventsCompleted: 2,
        eventsFailed: 0,
        missionsCompleted: ['first-flight', 'drone-swarm'],
      }),
    });
    const loaded = new SaveManager(storage).load();
    expect(loaded.version).toBe(SAVE_VERSION);
    expect(loaded.score).toBe(900);
    expect(loaded.missionsCompleted).toEqual(['first-flight', 'drone-swarm']);
    expect(loaded.settings).toEqual(DEFAULT_SETTINGS);
    expect(storage.data.has(BACKUP_KEY)).toBe(false);
  });

  it('clamps out-of-range settings and drops unknown ones, field by field', () => {
    const settings = sanitizeSettings({
      sensitivity: 99,
      fov: 10,
      cameraShake: 0.4,
      invertY: true,
      speedEffects: 'yes',
      quality: 'EXTREME',
      masterVolume: Number.NaN,
      nonsense: 1,
    });
    expect(settings).toEqual({
      ...DEFAULT_SETTINGS,
      sensitivity: 2.5,
      fov: 60,
      cameraShake: 0.4,
      invertY: true,
    });
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('junk')).toEqual(DEFAULT_SETTINGS);
  });
});
