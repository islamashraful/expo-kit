import { beforeEach, describe, expect, mock, test } from 'bun:test';

const reported: { error: unknown; context: unknown }[] = [];
mock.module('@expo-kit/core', () => ({ reportError: (error: unknown, context: unknown) => reported.push({ error, context }) }));
mock.module('react-native', () => ({ AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } }));
mock.module('expo', () => ({ requireOptionalNativeModule: () => null, SharedObject: class {} }));

const { createCloudSyncWithEngine } = await import('./sync');
const { defineCloudSchema, field } = await import('./schema');
type NativeChange = import('./native').NativeChange;
type NativeEvents = import('./native').NativeEvents;

const schema = defineCloudSchema({
  Venue: { name: field.string() },
  Shift: { date: field.date(), tips: field.double(), note: field.string().optional(), venue: field.reference('Venue') },
});

class FakeEngine {
  saved: unknown[] = [];
  deleted: unknown[] = [];
  inbox: NativeChange[] = [];
  acked: number[] = [];
  started = 0;
  saveError: Error | null = null;
  listeners = new Map<string, ((...args: unknown[]) => void)[]>();

  async start() { this.started += 1; }
  async syncNow() {}
  async stop() {}
  save(input: unknown) {
    if (this.saveError) throw this.saveError;
    this.saved.push(input);
  }
  delete(input: unknown) { this.deleted.push(input); }
  async pendingChanges(limit: number) { return this.inbox.slice(0, limit); }
  async ack(sequences: number[]) {
    this.acked.push(...sequences);
    this.inbox = this.inbox.filter((change) => !sequences.includes(change.sequence));
  }
  status() {
    return { account: 'available' as const, syncing: false, initialSyncDone: true, pendingUploads: 0, pendingChanges: 0, lastSyncedAt: null, error: null };
  }
  addListener<E extends keyof NativeEvents>(event: E, listener: NativeEvents[E]) {
    const list = this.listeners.get(event) ?? [];
    list.push(listener as (...args: unknown[]) => void);
    this.listeners.set(event, list);
    return { remove: () => {} };
  }
  emit<E extends keyof NativeEvents>(event: E, ...args: Parameters<NativeEvents[E]>) {
    for (const listener of this.listeners.get(event) ?? []) listener(...args);
  }
}

let seq = 0;
const change = (type: string, id: string, operation: 'save' | 'delete', fields: Record<string, unknown> = {}): NativeChange => ({
  sequence: ++seq,
  type,
  id,
  operation,
  fields,
});

function setup(applyOverrides: Partial<Record<'shiftSave' | 'venueSave', (r: unknown[]) => void>> = {}) {
  const engine = new FakeEngine();
  const calls: string[] = [];
  const received: Record<string, unknown[]> = { Shift: [], Venue: [] };
  const accountEvents: unknown[] = [];
  const sync = createCloudSyncWithEngine(
    {
      container: 'iCloud.test',
      schema,
      apply: {
        Shift: {
          save: (records) => { (applyOverrides.shiftSave ?? (() => {}))(records); calls.push(`Shift.save:${records.map((r) => r.id)}`); received.Shift!.push(...records); },
          delete: (ids) => { calls.push(`Shift.delete:${ids}`); },
        },
        Venue: {
          save: (records) => { (applyOverrides.venueSave ?? (() => {}))(records); calls.push(`Venue.save:${records.map((r) => r.id)}`); received.Venue!.push(...records); },
          delete: (ids) => { calls.push(`Venue.delete:${ids}`); },
        },
      },
      onAccountChange: (event) => accountEvents.push(event),
    },
    () => engine as never,
  );
  return { engine, sync, calls, received, accountEvents };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  reported.length = 0;
  (globalThis as { __DEV__?: boolean }).__DEV__ = true;
});

describe('createCloudSync', () => {
  test('save sends plain fields: dates as ms, no id, no undefined', () => {
    const { engine, sync } = setup();
    sync.save('Shift', { id: 's1', date: new Date(1000), tips: 2.5, venue: 'v1', note: undefined });
    sync.save('Shift', { id: 's2', date: new Date(2000), tips: 1, venue: 'v1', note: null });
    sync.delete('Venue', 'v9');
    expect(engine.saved).toEqual([
      { type: 'Shift', id: 's1', fields: { date: 1000, tips: 2.5, venue: 'v1' } },
      { type: 'Shift', id: 's2', fields: { date: 2000, tips: 1, venue: 'v1', note: null } },
    ]);
    expect(engine.deleted).toEqual([{ type: 'Venue', id: 'v9' }]);
  });

  test('start applies waiting changes in order, grouped, decoded, then acks', async () => {
    const { engine, sync, calls, received } = setup();
    engine.inbox = [
      change('Venue', 'v1', 'save', { name: 'Bar' }),
      change('Shift', 's1', 'save', { date: 5000, tips: 3, note: null, venue: 'v1' }),
      change('Shift', 's2', 'save', { date: 6000, tips: 4, venue: 'v1' }),
      change('Shift', 's3', 'delete'),
      change('Venue', 'v2', 'save', { name: 'Cafe' }),
    ];
    await sync.start();
    expect(calls).toEqual(['Venue.save:v1', 'Shift.save:s1,s2', 'Shift.delete:s3', 'Venue.save:v2']);
    expect(received.Shift![0]).toEqual({ id: 's1', date: new Date(5000), tips: 3, note: null, venue: 'v1' });
    expect((received.Shift![1] as { note: unknown }).note).toBeNull();
    expect(engine.inbox).toEqual([]);
    expect(engine.started).toBe(1);
  });

  test('a failing group is skipped, the rest applied, and it is retried on the next change event', async () => {
    let fail = true;
    const { engine, sync, calls } = setup({ shiftSave: () => { if (fail) throw new Error('db busy'); } });
    engine.inbox = [change('Venue', 'v1', 'save', { name: 'Bar' }), change('Shift', 's1', 'save', { date: 1, tips: 1, venue: 'v1' }), change('Venue', 'v2', 'save', { name: 'X' })];
    await sync.start();
    expect(calls).toEqual(['Venue.save:v1', 'Venue.save:v2']);
    expect(engine.inbox.map((c) => c.id)).toEqual(['s1']);

    fail = false;
    engine.emit('changes');
    await flush();
    await flush();
    expect(calls).toEqual(['Venue.save:v1', 'Venue.save:v2', 'Shift.save:s1']);
    expect(engine.inbox).toEqual([]);
  });

  test('records arriving before what they link to still get applied in one sync', async () => {
    // Like a database with a foreign key: a shift can only be saved once its venue exists.
    const venues = new Set<string>();
    const { engine, sync, calls } = setup({
      shiftSave: (records) => {
        for (const r of records as { venue: string }[]) if (!venues.has(r.venue)) throw new Error('FOREIGN KEY constraint failed');
      },
      venueSave: (records) => (records as { id: string }[]).forEach((r) => venues.add(r.id)),
    });
    engine.inbox = [
      change('Shift', 's1', 'save', { date: 1, tips: 1, venue: 'v1' }),
      change('Shift', 's2', 'save', { date: 1, tips: 1, venue: 'v1' }),
      change('Venue', 'v1', 'save', { name: 'Bar' }),
    ];
    await sync.start();
    expect(calls).toEqual(['Venue.save:v1', 'Shift.save:s1,s2']);
    expect(engine.inbox).toEqual([]);
  });

  test('changes that keep failing stop the pass instead of looping forever', async () => {
    const { engine, sync } = setup({ shiftSave: () => { throw new Error('always'); } });
    engine.inbox = [change('Shift', 's1', 'save', { date: 1, tips: 1, venue: 'v1' })];
    await sync.start();
    expect(engine.inbox.map((c) => c.id)).toEqual(['s1']);
  });

  test('a change that fails while syncing but applies later is never reported', async () => {
    const venues = new Set<string>();
    const { engine, sync, calls } = setup({
      shiftSave: (records) => {
        for (const r of records as { venue: string }[]) if (!venues.has(r.venue)) throw new Error('FOREIGN KEY constraint failed');
      },
      venueSave: (records) => (records as { id: string }[]).forEach((r) => venues.add(r.id)),
    });
    await sync.start();
    engine.emit('status', { ...engine.status(), syncing: true });

    // The shift arrives in one batch, its venue in the next.
    engine.inbox = [change('Shift', 's1', 'save', { date: 1, tips: 1, venue: 'v1' })];
    engine.emit('changes');
    await flush();
    engine.inbox.push(change('Venue', 'v1', 'save', { name: 'Bar' }));
    engine.emit('changes');
    await flush();
    await flush();
    engine.emit('status', { ...engine.status(), syncing: false });
    await flush();
    await flush();

    expect(calls).toEqual(['Venue.save:v1', 'Shift.save:s1']);
    expect(engine.inbox).toEqual([]);
    expect(reported).toEqual([]);
  });

  test('a change still failing after a sync finished is reported once', async () => {
    const { engine, sync } = setup({ shiftSave: () => { throw new Error('FOREIGN KEY constraint failed'); } });
    engine.inbox = [change('Shift', 's1', 'save', { date: 1, tips: 1, venue: 'v1' }), change('Shift', 's2', 'save', { date: 1, tips: 1, venue: 'v1' })];
    await sync.start();
    engine.emit('status', { ...engine.status(), syncing: true });
    engine.emit('changes');
    await flush();
    expect(reported).toEqual([]);

    for (let round = 0; round < 2; round += 1) {
      engine.emit('status', { ...engine.status(), syncing: true });
      engine.emit('status', { ...engine.status(), syncing: false });
      await flush();
      await flush();
    }
    expect(reported.length).toBe(1);
    expect(reported[0]!.context).toEqual({ fn: 'cloudSync.apply', type: 'Shift', operation: 'save' });
    expect(engine.inbox.map((c) => c.id)).toEqual(['s1', 's2']);
  });

  test('changes for a type not in the schema are skipped and acked', async () => {
    const { engine, sync, calls } = setup();
    engine.inbox = [change('Removed', 'x', 'save', { a: 1 }), change('Venue', 'v1', 'save', { name: 'Bar' })];
    await sync.start();
    expect(calls).toEqual(['Venue.save:v1']);
    expect(engine.inbox).toEqual([]);
  });

  test('change events while applying run once more, not in parallel', async () => {
    let active = 0;
    let maxActive = 0;
    const { engine, sync } = setup({
      venueSave: () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        active -= 1;
      },
    });
    await sync.start();
    engine.inbox = [change('Venue', 'v1', 'save', { name: 'A' })];
    engine.emit('changes');
    engine.emit('changes');
    engine.emit('changes');
    await flush();
    await flush();
    expect(maxActive).toBe(1);
    expect(engine.inbox).toEqual([]);
  });

  test('status events update getStatus and subscribers', () => {
    const { engine, sync } = setup();
    const seen: unknown[] = [];
    const stop = sync.subscribe((status) => seen.push(status));
    engine.emit('status', { account: 'available', syncing: true, initialSyncDone: true, pendingUploads: 2, pendingChanges: 1, lastSyncedAt: 1234, error: null });
    expect(sync.getStatus()).toEqual({
      supported: true, account: 'available', syncing: true, initialSyncDone: true, pendingUploads: 2, pendingChanges: 1, lastSyncedAt: new Date(1234), error: null,
    });
    expect(seen.length).toBe(1);
    stop();
    engine.emit('status', { ...engine.status(), syncing: false });
    expect(seen.length).toBe(1);
  });

  test('account events reach onAccountChange', () => {
    const { engine, accountEvents } = setup();
    engine.emit('account', { change: 'signOut', account: 'noAccount' });
    expect(accountEvents).toEqual([{ change: 'signOut', account: 'noAccount' }]);
  });

  test('rejected records throw in development and are reported in production', () => {
    const { engine, sync } = setup();
    engine.saveError = new Error('Shift.tips must be a number.');
    expect(() => sync.save('Shift', { id: 's', date: new Date(), tips: 1, venue: 'v' })).toThrow('Shift.tips must be a number.');
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    expect(() => sync.save('Shift', { id: 's', date: new Date(), tips: 1, venue: 'v' })).not.toThrow();
    expect(reported.at(-1)?.context).toEqual({ fn: 'cloudSync.save', type: 'Shift' });
  });

  test('without the native module everything is a safe no-op', async () => {
    const sync = createCloudSyncWithEngine({ container: 'x', schema, apply: {} as never }, () => null);
    expect(sync.getStatus().supported).toBe(false);
    sync.save('Venue', { id: 'v', name: 'a' });
    sync.delete('Venue', 'v');
    await sync.start();
    await sync.syncNow();
    await sync.stop();
  });
});
