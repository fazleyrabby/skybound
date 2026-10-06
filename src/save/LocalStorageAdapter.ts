/** Minimal key-value storage, so saving can be tested without a browser. */
export interface StorageAdapter {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

/**
 * localStorage with every access guarded (spec section 45): private browsing,
 * a full quota or disabled storage must never break the game. When storage is
 * unavailable, reads return null and writes are dropped.
 */
export class LocalStorageAdapter implements StorageAdapter {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  set(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // No persistence this session; the game carries on.
    }
  }
}
