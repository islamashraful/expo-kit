import { useSyncExternalStore } from 'react';

import type { CloudSchema } from './schema';
import type { CloudSync, CloudSyncStatus } from './sync';

/** The sync status. Re-renders when it changes. */
export function useCloudSync<S extends CloudSchema>(sync: CloudSync<S>): CloudSyncStatus {
  return useSyncExternalStore(sync.subscribe, sync.getStatus, sync.getStatus);
}
