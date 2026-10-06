import { DEFAULT_SETTINGS, sanitizeSettings, type Settings } from '../core/Settings';
import type { StorageAdapter } from './LocalStorageAdapter';

export const SAVE_KEY = 'skybound.save';
export const BACKUP_KEY = 'skybound.save.corrupt';
export const SAVE_VERSION = 2;

/** Everything that persists between sessions. Bump `SAVE_VERSION` and add a migration to change it. */
export interface SaveData {
  version: number;
  score: number;
  eventsCompleted: number;
  eventsFailed: number;
  missionsCompleted: string[];
  settings: Settings;
}

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    score: 0,
    eventsCompleted: 0,
    eventsFailed: 0,
    missionsCompleted: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

/**
 * Upgrades an older save one version at a time. Index n holds the step from
 * version n to n + 1.
 */
const MIGRATIONS: Record<number, (data: Record<string, unknown>) => Record<string, unknown>> = {
  // Version 2 added settings; older saves get the defaults.
  1: (data) => ({ ...data, settings: { ...DEFAULT_SETTINGS } }),
};

/**
 * Loads and stores progress (spec section 45). A save that cannot be read is
 * copied to a backup key and replaced with defaults: a bad save must never
 * stop the game from booting, and must not be silently destroyed either.
 */
export class SaveManager {
  constructor(private readonly storage: StorageAdapter) {}

  load(): SaveData {
    const raw = this.storage.get(SAVE_KEY);
    if (raw === null) return defaultSave();
    try {
      return this.parse(JSON.parse(raw));
    } catch {
      this.storage.set(BACKUP_KEY, raw);
      return defaultSave();
    }
  }

  save(data: Omit<SaveData, 'version'>): void {
    this.storage.set(SAVE_KEY, JSON.stringify({ ...data, version: SAVE_VERSION }));
  }

  private parse(value: unknown): SaveData {
    if (typeof value !== 'object' || value === null) throw new Error('save is not an object');
    let data = value as Record<string, unknown>;
    let version = typeof data.version === 'number' ? data.version : NaN;
    if (!Number.isInteger(version) || version < 1 || version > SAVE_VERSION) {
      throw new Error('unknown save version');
    }
    while (version < SAVE_VERSION) {
      const migrate = MIGRATIONS[version];
      if (!migrate) throw new Error(`no migration from version ${version}`);
      data = migrate(data);
      version++;
    }

    const fallback = defaultSave();
    const count = (field: unknown, initial: number): number =>
      typeof field === 'number' && Number.isFinite(field) && field >= 0 ? field : initial;
    return {
      version: SAVE_VERSION,
      score: count(data.score, fallback.score),
      eventsCompleted: count(data.eventsCompleted, fallback.eventsCompleted),
      eventsFailed: count(data.eventsFailed, fallback.eventsFailed),
      missionsCompleted: Array.isArray(data.missionsCompleted)
        ? data.missionsCompleted.filter((id): id is string => typeof id === 'string')
        : fallback.missionsCompleted,
      settings: sanitizeSettings(data.settings),
    };
  }
}
