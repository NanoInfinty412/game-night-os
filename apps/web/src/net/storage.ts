/** JSON helpers for browser storage that never throw (private mode or blocked storage). */
export function load<T>(storage: () => Storage, key: string): T | undefined {
  try {
    const raw = storage().getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

export function save(storage: () => Storage, key: string, value: unknown) {
  try {
    if (value === undefined) storage().removeItem(key);
    else storage().setItem(key, JSON.stringify(value));
  } catch {
    // Not remembered; the game still works for this page load.
  }
}

export const local = () => window.localStorage;
export const session = () => window.sessionStorage;
