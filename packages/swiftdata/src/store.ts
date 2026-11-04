import { reportError } from '@expo-kit/core';

import { check, decode, encode, type CollectionDefinition } from './collection';
import { native, type NativeItem } from './native';
import { waitForRestore } from './status';

export type Entry<T> = { key: string; value: T; updatedAt: Date };

export type Collection<T> = {
  readonly name: string;
  /** Saves the item under `key`, replacing what was there. `updatedAt`: the edit time, default now (for imports). */
  set(key: string, value: T, options?: { updatedAt?: Date }): Promise<void>;
  /** Saves many items in one go, e.g. an import. */
  setMany(items: { key: string; value: T; updatedAt?: Date }[]): Promise<void>;
  get(key: string): Promise<T | null>;
  /** Every item, most recently changed first. */
  getAll(): Promise<T[]>;
  /** Every item with its key and edit time, most recently changed first. */
  entries(): Promise<Entry<T>[]>;
  remove(key: string): Promise<void>;
  /** Removes every item of this collection, on all devices. */
  clear(): Promise<void>;
  /** Calls `listener` after a change, here or from another device. Returns a function that stops it. */
  subscribe(listener: () => void): () => void;
};

export type Store<D extends Record<string, CollectionDefinition<any>>> = {
  readonly [K in keyof D]: D[K] extends CollectionDefinition<infer T> ? Collection<T> : never;
};

const listeners = new Map<string, Set<() => void>>();
let listeningForChanges = false;
const reportedKeys = new Set<string>();

/**
 * Describes the app's data, once. Every call on the result is typed from it.
 *
 * ```ts
 * export const store = defineStore({
 *   notes: collection<Note>(),
 *   settings: collection<Settings>({ version: 2, migrate: { 2: (old) => ({ ...old, theme: 'auto' }) } }),
 * });
 * ```
 *
 * After the first release, never rename a collection: its items are stored under its name.
 */
export function defineStore<D extends Record<string, CollectionDefinition<any>>>(definitions: D): Store<D> {
  const store: Record<string, Collection<unknown>> = {};
  for (const [name, definition] of Object.entries(definitions)) {
    if (!name) throw new Error('@expo-kit/swiftdata: a collection needs a name');
    store[name] = createCollection(name, definition);
  }
  return store as Store<D>;
}

function createCollection<T>(name: string, definition: CollectionDefinition<T>): Collection<T> {
  async function toJson(key: string, value: T) {
    assertKey(key);
    const checked = await check(definition, value);
    if (!checked.ok) throw new Error(`@expo-kit/swiftdata: ${name}/${key} doesn't match the schema: ${checked.message}`);
    return encode(definition as CollectionDefinition<unknown>, checked.value);
  }

  async function read(item: NativeItem): Promise<Entry<T> | null> {
    try {
      const decoded = await decode(definition, item.json);
      if (decoded.ok) return { key: item.key, value: decoded.value, updatedAt: new Date(item.updatedAt) };
      // Items from a newer app version are expected (another device updated first); skip them quietly.
      if (decoded.reason === 'invalid') reportOnce(name, item.key, new Error(decoded.message));
    } catch (error) {
      reportOnce(name, item.key, error);
    }
    return null;
  }

  async function write(run: () => Promise<void>) {
    await run();
    notify(name);
  }

  async function entries(): Promise<Entry<T>[]> {
    if (!native) return [];
    const items = await native.getAll(name);
    const decoded = await Promise.all(items.map(read));
    return decoded.filter((entry): entry is Entry<T> => entry !== null);
  }

  return {
    name,
    async set(key, value, options) {
      if (!native) return;
      const json = await toJson(key, value);
      await write(() => native!.set(name, key, json, options?.updatedAt?.getTime() ?? null));
    },
    async setMany(items) {
      if (!native || items.length === 0) return;
      const encoded = await Promise.all(
        items.map(async (item) => ({ key: item.key, json: await toJson(item.key, item.value), updatedAt: item.updatedAt?.getTime() ?? null })),
      );
      await write(() => native!.setMany(name, encoded));
    },
    async get(key) {
      if (!native) return null;
      const item = await native.get(name, key);
      return item ? ((await read(item))?.value ?? null) : null;
    },
    async getAll() {
      return (await entries()).map((entry) => entry.value);
    },
    entries,
    async remove(key) {
      if (!native) return;
      await write(() => native!.remove(name, key));
    },
    async clear() {
      if (!native) return;
      await write(() => native!.clear(name));
    },
    subscribe(listener) {
      if (!native) return () => {};
      listenForChanges();
      const set = listeners.get(name) ?? new Set();
      set.add(listener);
      listeners.set(name, set);
      return () => {
        set.delete(listener);
      };
    },
  };
}

function assertKey(key: string) {
  if (typeof key !== 'string' || key.length === 0) throw new Error('@expo-kit/swiftdata: a key must be a non-empty string');
}

/** A change in iCloud doesn't say which collection, so every listener re-reads. */
function listenForChanges() {
  if (listeningForChanges || !native) return;
  listeningForChanges = true;
  native.addListener('change', () => {
    for (const name of listeners.keys()) notify(name);
  });
}

function notify(name: string) {
  for (const listener of listeners.get(name) ?? []) {
    try {
      listener();
    } catch (error) {
      reportError(error, { fn: 'swiftdata.subscribe', collection: name });
    }
  }
}

/** A broken item is reported once per launch, not on every read. */
function reportOnce(collection: string, key: string, error: unknown) {
  const id = `${collection}\u001f${key}`;
  if (reportedKeys.has(id)) return;
  reportedKeys.add(id);
  reportError(error, { fn: 'swiftdata.read', collection, key });
}

const importsThisLaunch = new Set<string>();

/**
 * Moves existing data (e.g. expo-sqlite tables) into the store, once per device.
 *
 * - Waits until the first iCloud download finished (`restoring`), at most `waitForRestoreMs` (default 30 s).
 * - When `run` finishes, the import is marked done on this device and never runs again. When it throws, the
 *   error goes to the error reporter and it runs again on the next launch.
 * - `run` must return without error when there's nothing to move (e.g. the old table doesn't exist), or it
 *   runs on every launch.
 * - Keep the old primary keys and edit times (`updatedAt`), so two devices importing the same row end up with one item.
 *
 * Resolves `true` when the import ran and finished now.
 */
export async function importOnce(
  id: string,
  run: () => Promise<void> | void,
  options?: { waitForRestoreMs?: number },
): Promise<boolean> {
  if (!native || importsThisLaunch.has(id)) return false;
  importsThisLaunch.add(id);
  if (native.isImportDone(id)) return false;
  await waitForRestore(options?.waitForRestoreMs ?? 30_000);
  try {
    await run();
  } catch (error) {
    reportError(error, { fn: 'swiftdata.importOnce', id });
    return false;
  }
  native.markImportDone(id);
  return true;
}
