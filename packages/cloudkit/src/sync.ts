import { reportError } from '@expo-kit/core';
import { AppState } from 'react-native';

import { decodeRecord, encodeFields } from './codec';
import {
  createNativeEngine,
  type AccountChangeKind,
  type AccountStatus,
  type NativeChange,
  type NativeEngine,
  type NativeStatus,
} from './native';
import { toSchemaSpec, type CloudRecord, type CloudSchema, type RecordTypeName } from './schema';

export type ConflictRule = 'newest' | 'server' | 'device';

type MaybePromise = void | Promise<void>;

/** How the app writes changes from iCloud into its own database, per record type. */
export type ApplyHandlers<S extends CloudSchema> = {
  [T in RecordTypeName<S>]: {
    /** New or changed records from another device. Insert or update them. */
    save: (records: CloudRecord<S, T>[]) => MaybePromise;
    /** Records deleted on another device. */
    delete: (ids: string[]) => MaybePromise;
  };
};

export type CloudSyncOptions<S extends CloudSchema> = {
  /** iCloud container ID, also listed in the config plugin, e.g. `'iCloud.com.example.app'`. */
  container: string;
  schema: S;
  apply: ApplyHandlers<S>;
  /**
   * Who wins when the same record changed on two devices. Default `'newest'`: the later edit wins,
   * and a delete from another device wins over a local edit. `'server'`: iCloud wins. `'device'`: this device wins.
   */
  conflict?: ConflictRule;
  /** Default `'AppData'`. Only change it to run two separate syncs in one app. */
  zone?: string;
  /**
   * Called when the iCloud account changes (signed out, switched accounts) or this app's iCloud
   * data was deleted. Sync state is reset; the app decides what to do with its local data,
   * e.g. keep it and call `importAll` to upload it to the new account.
   */
  onAccountChange?: (event: { change: AccountChangeKind; account: AccountStatus }) => void;
  /** Sync when the app comes back to the front. Default `true`. */
  syncOnForeground?: boolean;
};

export type CloudSyncStatus = {
  /** `false` in Expo Go, on Android and on web. Everything else is then a no-op. */
  supported: boolean;
  account: AccountStatus;
  syncing: boolean;
  /** The first download finished. Local changes upload only after that. */
  initialSyncDone: boolean;
  /** Local changes not yet in iCloud. */
  pendingUploads: number;
  /** Changes from iCloud not yet applied to the app's database. */
  pendingChanges: number;
  lastSyncedAt: Date | null;
  /** The last error, if the last sync didn't finish. */
  error: string | null;
};

export type CloudSync<S extends CloudSchema> = {
  /** Starts syncing: downloads first, then uploads. Call once, e.g. after the app's database is ready. */
  start(): Promise<void>;
  /** Queues a new or changed record for upload. Call after every local insert or update. */
  save<T extends RecordTypeName<S>>(type: T, record: CloudRecord<S, T>): void;
  /** Queues a delete. Call after every local delete. */
  delete<T extends RecordTypeName<S>>(type: T, id: string): void;
  /** Queues many records at once, e.g. existing data the first time sync is turned on. */
  importAll<T extends RecordTypeName<S>>(type: T, records: CloudRecord<S, T>[]): void;
  /** Downloads and uploads now, e.g. pull to refresh. */
  syncNow(): Promise<void>;
  getStatus(): CloudSyncStatus;
  /** Calls `listener` on every status change. Returns a function that stops it. */
  subscribe(listener: (status: CloudSyncStatus) => void): () => void;
  /** Stops syncing and releases the native engine. */
  stop(): Promise<void>;
};

const BATCH = 200;

/**
 * Creates the sync for one schema. Create it once (module level) and call `start()`.
 * In Expo Go (no native module) every method is a safe no-op.
 */
export function createCloudSync<S extends CloudSchema>(options: CloudSyncOptions<S>): CloudSync<S> {
  return createCloudSyncWithEngine(options, createNativeEngine);
}

/** Internal: lets tests pass a fake engine. */
export function createCloudSyncWithEngine<S extends CloudSchema>(
  options: CloudSyncOptions<S>,
  makeEngine: typeof createNativeEngine,
): CloudSync<S> {
  const { schema, apply, conflict = 'newest', zone = 'AppData', syncOnForeground = true } = options;
  let engine: NativeEngine | null = null;
  let status: CloudSyncStatus = toStatus(null, false);
  const listeners = new Set<(status: CloudSyncStatus) => void>();
  const subscriptions: { remove(): void }[] = [];
  let draining: Promise<void> | null = null;
  let drainAgain = false;

  try {
    engine = makeEngine({ containerId: options.container, zoneName: zone, conflict, schema: toSchemaSpec(schema) });
  } catch (error) {
    reportError(error, { fn: 'createCloudSync' });
  }
  if (engine) status = toStatus(safeNativeStatus(engine), true);

  function setStatus(next: CloudSyncStatus) {
    status = next;
    listeners.forEach((listener) => listener(status));
  }

  /**
   * Applies changes from iCloud, then confirms them. iCloud doesn't keep any order between
   * records (a note can arrive before its folder), so a group that fails is skipped and tried
   * again after the others. Stops when a full pass makes no progress; the rest waits for the next sync.
   */
  function drain(): Promise<void> {
    if (!engine) return Promise.resolve();
    if (draining) {
      drainAgain = true;
      return draining;
    }
    const current = engine;
    draining = (async () => {
      let progressSinceRetry = false;
      do {
        drainAgain = false;
        let failed = new Set<number>();
        while (true) {
          // Failed changes stay in the inbox; skip them in this pass so later ones get their turn.
          const changes = (await current.pendingChanges(BATCH + failed.size)).filter((change) => !failed.has(change.sequence));
          if (changes.length === 0) {
            if (failed.size === 0 || !progressSinceRetry) break;
            failed = new Set(); // Something else was applied since: try the failed ones again.
            progressSinceRetry = false;
            continue;
          }
          const { done, failedSequences } = await applyInOrder(changes.slice(0, BATCH));
          if (done.length > 0) {
            await current.ack(done);
            progressSinceRetry = true;
          }
          failedSequences.forEach((sequence) => failed.add(sequence));
        }
      } while (drainAgain);
    })()
      .catch((error) => reportError(error, { fn: 'cloudSync.drain' }))
      .finally(() => {
        draining = null;
      });
    return draining;
  }

  /** Groups consecutive changes of the same type and operation, keeping their order. */
  async function applyInOrder(changes: NativeChange[]): Promise<{ done: number[]; failedSequences: number[] }> {
    const done: number[] = [];
    const failedSequences: number[] = [];
    let index = 0;
    while (index < changes.length) {
      const first = changes[index]!;
      const group: NativeChange[] = [];
      while (index < changes.length && changes[index]!.type === first.type && changes[index]!.operation === first.operation) {
        group.push(changes[index]!);
        index += 1;
      }
      const handler = (apply as Record<string, { save: (r: unknown[]) => MaybePromise; delete: (ids: string[]) => MaybePromise }>)[first.type];
      if (!handler) {
        // A type no longer in the schema: nothing to apply it to.
        done.push(...group.map((change) => change.sequence));
        continue;
      }
      try {
        if (first.operation === 'delete') {
          await handler.delete(group.map((change) => change.id));
        } else {
          const records = group
            .map((change) => decodeRecord(schema, change.type, change.id, change.fields))
            .filter((record): record is Record<string, unknown> => record !== null);
          await handler.save(records);
        }
        done.push(...group.map((change) => change.sequence));
      } catch (error) {
        reportError(error, { fn: 'cloudSync.apply', type: first.type, operation: first.operation });
        failedSequences.push(...group.map((change) => change.sequence));
      }
    }
    return { done, failedSequences };
  }

  if (engine) {
    const current = engine;
    subscriptions.push(
      current.addListener('status', (next) => setStatus(toStatus(next, true))),
      current.addListener('changes', () => void drain()),
      current.addListener('account', (event) => {
        try {
          options.onAccountChange?.(event);
        } catch (error) {
          reportError(error, { fn: 'cloudSync.onAccountChange' });
        }
      }),
      current.addListener('error', (event) => reportError(new Error(event.message), { fn: 'cloudSync', context: event.context })),
    );
  }

  let foreground: { remove(): void } | null = null;
  let lastState = AppState.currentState;

  const sync: CloudSync<S> = {
    async start() {
      if (!engine) return;
      try {
        await drain(); // Changes saved before the last app kill.
        await engine.start();
        await drain();
      } catch (error) {
        reportError(error, { fn: 'cloudSync.start' });
      }
      if (syncOnForeground && !foreground) {
        foreground = AppState.addEventListener('change', (next) => {
          if (lastState !== 'active' && next === 'active') void sync.syncNow();
          lastState = next;
        });
      }
    },

    save(type, record) {
      if (!engine) return;
      const current = engine;
      guard(() => current.save({ type, id: record.id, fields: encodeFields(schema, type, record as Record<string, unknown>) }), {
        fn: 'cloudSync.save',
        type,
      });
    },

    delete(type, id) {
      if (!engine) return;
      const current = engine;
      guard(() => current.delete({ type, id }), { fn: 'cloudSync.delete', type });
    },

    importAll(type, records) {
      for (const record of records) sync.save(type, record);
    },

    async syncNow() {
      if (!engine) return;
      try {
        await engine.syncNow();
      } catch (error) {
        reportError(error, { fn: 'cloudSync.syncNow' });
      }
      await drain();
    },

    getStatus: () => status,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    async stop() {
      foreground?.remove();
      foreground = null;
      subscriptions.splice(0).forEach((subscription) => subscription.remove());
      const current = engine;
      engine = null;
      setStatus(toStatus(null, false));
      try {
        await current?.stop();
      } catch (error) {
        reportError(error, { fn: 'cloudSync.stop' });
      }
    },
  };
  return sync;
}

/**
 * A rejected record is a bug in the app: throw in development so it's seen right away,
 * report it in production instead of breaking the app's own save.
 */
function guard(body: () => void, context: Record<string, unknown>) {
  try {
    body();
  } catch (error) {
    if (__DEV__) throw error;
    reportError(error, context);
  }
}

function safeNativeStatus(engine: NativeEngine): NativeStatus | null {
  try {
    return engine.status();
  } catch {
    return null;
  }
}

function toStatus(native: NativeStatus | null, supported: boolean): CloudSyncStatus {
  return {
    supported,
    account: native?.account ?? 'unknown',
    syncing: native?.syncing ?? false,
    initialSyncDone: native?.initialSyncDone ?? false,
    pendingUploads: native?.pendingUploads ?? 0,
    pendingChanges: native?.pendingChanges ?? 0,
    lastSyncedAt: native?.lastSyncedAt != null ? new Date(native.lastSyncedAt) : null,
    error: native?.error ?? null,
  };
}
