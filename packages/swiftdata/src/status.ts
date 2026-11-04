import { useSyncExternalStore } from 'react';

import { native, type AccountStatus, type NativeStatus } from './native';

export type CloudStatus = {
  /** `false` in Expo Go, on Android and on web. Everything else is then a no-op. */
  supported: boolean;
  /**
   * The iCloud account on this device. `'noAccount'`: signed out, so the synced data was removed from the
   * device by iOS; it comes back after signing in.
   */
  account: AccountStatus;
  /**
   * `true` after a fresh install or an iCloud sign-in, until the first download finished. Wait before writing
   * default data (e.g. sample notes), so it doesn't compete with what's coming from iCloud.
   */
  restoring: boolean;
  /** Uploading or downloading right now. */
  syncing: boolean;
  /** The end of the last download. */
  lastSyncedAt: Date | null;
  /** The last sync error, cleared by the next successful sync. */
  error: string | null;
};

const UNSUPPORTED: CloudStatus = {
  supported: false,
  account: 'unknown',
  restoring: false,
  syncing: false,
  lastSyncedAt: null,
  error: null,
};

let current: CloudStatus | null = null;
const listeners = new Set<(status: CloudStatus) => void>();
let listening = false;

function toStatus(status: NativeStatus): CloudStatus {
  return {
    supported: true,
    account: status.account,
    restoring: status.restoring,
    syncing: status.syncing,
    lastSyncedAt: status.lastSyncedAt == null ? null : new Date(status.lastSyncedAt),
    error: status.error,
  };
}

function listen() {
  if (listening || !native) return;
  listening = true;
  native.addListener('status', (status) => {
    current = toStatus(status);
    listeners.forEach((listener) => listener(current!));
  });
}

/** The iCloud sync status right now. */
export function getCloudStatus(): CloudStatus {
  if (!native) return UNSUPPORTED;
  listen();
  current ??= toStatus(native.status());
  return current;
}

/** Calls `listener` on every status change. Returns a function that stops it. */
export function subscribeCloudStatus(listener: (status: CloudStatus) => void): () => void {
  if (!native) return () => {};
  listen();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The iCloud sync status. Re-renders when it changes. */
export function useCloudStatus(): CloudStatus {
  return useSyncExternalStore(subscribeCloudStatus, getCloudStatus, getCloudStatus);
}

/** Resolves once `restoring` is `false`, or after `timeoutMs`, whichever comes first. */
export function waitForRestore(timeoutMs: number): Promise<void> {
  if (!getCloudStatus().restoring) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      stop();
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    const stop = subscribeCloudStatus((status) => {
      if (!status.restoring) done();
    });
  });
}
