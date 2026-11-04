import { native } from './native';

export { collection, type CollectionDefinition, type CollectionOptions, type StandardSchemaV1 } from './collection';
export { defineStore, importOnce, type Collection, type Entry, type Store } from './store';
export { getCloudStatus, subscribeCloudStatus, useCloudStatus, type CloudStatus } from './status';
export { useCollection, type CollectionState } from './use-collection';
export type { AccountStatus } from './native';

/** `true` when the native module is linked (a development or release build on iOS). */
export function isSwiftDataSupported(): boolean {
  return native !== null;
}
