import { beforeEach, describe, expect, mock, test } from 'bun:test';

import type { NativeEvents, NativeItem, NativeStatus } from './native';

const reported: { error: unknown; context: unknown }[] = [];
mock.module('@expo-kit/core', () => ({ reportError: (error: unknown, context: unknown) => reported.push({ error, context }) }));

/** An in-memory stand-in for the Swift store: newest wins per key, like ItemStore. */
class FakeNative {
  items = new Map<string, Map<string, NativeItem>>();
  done = new Set<string>();
  current: NativeStatus = { account: 'available', restoring: false, syncing: false, lastSyncedAt: null, error: null };
  listeners = new Map<string, ((...args: unknown[]) => void)[]>();
  now = 1_000;

  status() { return this.current; }
  private collection(name: string) {
    let map = this.items.get(name);
    if (!map) this.items.set(name, (map = new Map()));
    return map;
  }
  async set(collection: string, key: string, json: string, updatedAt: number | null) {
    this.collection(collection).set(key, { key, json, updatedAt: updatedAt ?? ++this.now });
  }
  async setMany(collection: string, items: { key: string; json: string; updatedAt: number | null }[]) {
    for (const item of items) await this.set(collection, item.key, item.json, item.updatedAt);
  }
  async get(collection: string, key: string) { return this.collection(collection).get(key) ?? null; }
  async getAll(collection: string) { return [...this.collection(collection).values()].sort((a, b) => b.updatedAt - a.updatedAt); }
  async remove(collection: string, key: string) { this.collection(collection).delete(key); }
  async clear(collection: string) { this.collection(collection).clear(); }
  isImportDone(id: string) { return this.done.has(id); }
  markImportDone(id: string) { this.done.add(id); }
  addListener<E extends keyof NativeEvents>(event: E, listener: NativeEvents[E]) {
    const list = this.listeners.get(event) ?? [];
    list.push(listener as (...args: unknown[]) => void);
    this.listeners.set(event, list);
    return { remove: () => {} };
  }
  emit<E extends keyof NativeEvents>(event: E, ...args: Parameters<NativeEvents[E]>) {
    for (const listener of this.listeners.get(event) ?? []) listener(...args);
  }
  /** What another device or an old app version would have saved. */
  raw(collection: string, key: string, json: string, updatedAt = ++this.now) {
    this.collection(collection).set(key, { key, json, updatedAt });
  }
}

const fake = new FakeNative();
mock.module('expo', () => ({ requireOptionalNativeModule: () => fake }));

const { collection, defineStore, importOnce, getCloudStatus, subscribeCloudStatus } = await import('./index');

type Note = { title: string; tags: string[] };

/** A tiny Standard Schema, like zod or valibot would provide. */
const NoteSchema = {
  '~standard': {
    version: 1 as const,
    vendor: 'test',
    validate: (value: unknown) =>
      typeof value === 'object' && value !== null && typeof (value as Note).title === 'string'
        ? { value: value as Note }
        : { issues: [{ message: 'title must be a string' }] },
    types: undefined as unknown as { input: unknown; output: Note },
  },
};

beforeEach(() => {
  fake.items.clear();
  fake.done.clear();
  fake.current = { account: 'available', restoring: false, syncing: false, lastSyncedAt: null, error: null };
  reported.length = 0;
});

describe('collections', () => {
  test('save, read, list, remove, clear', async () => {
    const store = defineStore({ notes: collection<Note>(), other: collection<string>() });
    await store.notes.set('a', { title: 'A', tags: [] });
    await store.notes.set('b', { title: 'B', tags: ['x'] });
    await store.other.set('a', 'not a note');

    expect(await store.notes.get('a')).toEqual({ title: 'A', tags: [] });
    expect(await store.notes.get('missing')).toBeNull();
    expect(await store.notes.getAll()).toEqual([{ title: 'B', tags: ['x'] }, { title: 'A', tags: [] }]);
    expect((await store.notes.entries()).map((entry) => entry.key)).toEqual(['b', 'a']);

    await store.notes.remove('a');
    expect(await store.notes.get('a')).toBeNull();
    await store.notes.clear();
    expect(await store.notes.getAll()).toEqual([]);
    expect(await store.other.get('a')).toBe('not a note');
  });

  test('items are saved with their version', async () => {
    const store = defineStore({ notes: collection<Note>({ version: 3, migrate: { 2: (o) => o, 3: (o) => o } }) });
    await store.notes.set('a', { title: 'A', tags: [] });
    expect(JSON.parse((await fake.get('notes', 'a'))!.json)).toEqual({ v: 3, d: { title: 'A', tags: [] } });
  });

  test('setMany keeps the given edit times', async () => {
    const store = defineStore({ notes: collection<Note>() });
    await store.notes.setMany([
      { key: 'a', value: { title: 'A', tags: [] }, updatedAt: new Date(500) },
      { key: 'b', value: { title: 'B', tags: [] } },
    ]);
    const entries = await store.notes.entries();
    expect(entries.find((entry) => entry.key === 'a')!.updatedAt).toEqual(new Date(500));
    expect(entries).toHaveLength(2);
  });

  test('an empty key is refused', async () => {
    const store = defineStore({ notes: collection<Note>() });
    await expect(store.notes.set('', { title: 'A', tags: [] })).rejects.toThrow('non-empty string');
  });
});

describe('versions', () => {
  test('older items are migrated step by step when read', async () => {
    const store = defineStore({
      notes: collection<Note>({
        version: 3,
        migrate: {
          2: (old: { text: string }) => ({ title: old.text }),
          3: (old: { title: string }) => ({ ...old, tags: [] }),
        },
      }),
    });
    fake.raw('notes', 'v1', JSON.stringify({ v: 1, d: { text: 'from v1' } }));
    fake.raw('notes', 'v2', JSON.stringify({ v: 2, d: { title: 'from v2' } }));
    expect(await store.notes.get('v1')).toEqual({ title: 'from v1', tags: [] });
    expect(await store.notes.get('v2')).toEqual({ title: 'from v2', tags: [] });
  });

  test('items from a newer app version are skipped quietly and left alone', async () => {
    const store = defineStore({ notes: collection<Note>() });
    const newer = JSON.stringify({ v: 2, d: { title: 'new', tags: [], color: 'red' } });
    fake.raw('notes', 'future', newer);
    await store.notes.set('now', { title: 'now', tags: [] });
    expect(await store.notes.get('future')).toBeNull();
    expect(await store.notes.getAll()).toEqual([{ title: 'now', tags: [] }]);
    expect((await fake.get('notes', 'future'))!.json).toBe(newer);
    expect(reported).toHaveLength(0);
  });

  test('a missing migration step fails at definition', () => {
    expect(() => collection<Note>({ version: 3, migrate: { 2: (o) => o } })).toThrow('needs a step for 3');
    expect(() => collection<Note>({ version: 0 })).toThrow('whole number');
  });

  test('broken items are skipped and reported once', async () => {
    const store = defineStore({ notes: collection<Note>({ version: 2, migrate: { 2: () => { throw new Error('bad'); } } }) });
    fake.raw('notes', 'json', 'not json');
    fake.raw('notes', 'old', JSON.stringify({ v: 1, d: {} }));
    expect(await store.notes.getAll()).toEqual([]);
    expect(await store.notes.getAll()).toEqual([]);
    expect(reported).toHaveLength(2);
  });
});

describe('schema', () => {
  test('checks items when saved and when read', async () => {
    const store = defineStore({ notes: collection(NoteSchema) });
    await store.notes.set('a', { title: 'A', tags: [] });
    await expect(store.notes.set('b', { title: 1 } as unknown as Note)).rejects.toThrow('title must be a string');
    fake.raw('notes', 'c', JSON.stringify({ v: 1, d: { nope: true } }));
    expect(await store.notes.getAll()).toEqual([{ title: 'A', tags: [] }]);
    expect(reported).toHaveLength(1);
  });
});

describe('changes', () => {
  test('own writes notify that collection, iCloud changes notify every collection', async () => {
    const store = defineStore({ notes: collection<Note>(), settings: collection<string>() });
    const calls: string[] = [];
    const stopNotes = store.notes.subscribe(() => calls.push('notes'));
    store.settings.subscribe(() => calls.push('settings'));

    await store.notes.set('a', { title: 'A', tags: [] });
    expect(calls).toEqual(['notes']);

    fake.emit('change');
    expect(calls).toEqual(['notes', 'notes', 'settings']);

    stopNotes();
    fake.emit('change');
    expect(calls).toEqual(['notes', 'notes', 'settings', 'settings']);
  });
});

describe('status', () => {
  test('follows the native status events', () => {
    const seen: boolean[] = [];
    const stop = subscribeCloudStatus((status) => seen.push(status.restoring));
    expect(getCloudStatus().supported).toBe(true);
    fake.emit('status', { account: 'available', restoring: true, syncing: true, lastSyncedAt: 5_000, error: null });
    expect(getCloudStatus()).toEqual({ supported: true, account: 'available', restoring: true, syncing: true, lastSyncedAt: new Date(5_000), error: null });
    fake.emit('status', { account: 'noAccount', restoring: false, syncing: false, lastSyncedAt: 5_000, error: null });
    expect(getCloudStatus().account).toBe('noAccount');
    expect(seen).toEqual([true, false]);
    stop();
  });
});

describe('importOnce', () => {
  test('runs once per device, marks it done', async () => {
    let runs = 0;
    expect(await importOnce('first', () => { runs += 1; })).toBe(true);
    expect(fake.done.has('first')).toBe(true);
    expect(await importOnce('first', () => { runs += 1; })).toBe(false);
    expect(runs).toBe(1);
  });

  test('a done import from an earlier launch is skipped', async () => {
    fake.done.add('earlier');
    let ran = false;
    expect(await importOnce('earlier', () => { ran = true; })).toBe(false);
    expect(ran).toBe(false);
  });

  test('a failed import is reported and not marked done', async () => {
    expect(await importOnce('failing', () => { throw new Error('no table'); })).toBe(false);
    expect(fake.done.has('failing')).toBe(false);
    expect(reported).toHaveLength(1);
    expect(reported[0]!.context).toEqual({ fn: 'swiftdata.importOnce', id: 'failing' });
  });

  test('waits for the restore to finish', async () => {
    fake.emit('status', { account: 'available', restoring: true, syncing: true, lastSyncedAt: null, error: null });
    let ran = false;
    const result = importOnce('after-restore', () => { ran = true; });
    await Bun.sleep(5);
    expect(ran).toBe(false);
    fake.emit('status', { account: 'available', restoring: false, syncing: false, lastSyncedAt: 1, error: null });
    expect(await result).toBe(true);
    expect(ran).toBe(true);
  });

  test('stops waiting after the timeout', async () => {
    fake.emit('status', { account: 'available', restoring: true, syncing: true, lastSyncedAt: null, error: null });
    let ran = false;
    expect(await importOnce('offline', () => { ran = true; }, { waitForRestoreMs: 10 })).toBe(true);
    expect(ran).toBe(true);
    fake.emit('status', { account: 'available', restoring: false, syncing: false, lastSyncedAt: null, error: null });
  });
});
