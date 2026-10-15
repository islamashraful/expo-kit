import { nativeModule } from './native';

export {
  defineCloudSchema,
  field,
  type CloudRecord,
  type CloudSchema,
  type Field,
  type FieldKind,
  type RecordTypeName,
} from './schema';
export {
  createCloudSync,
  type ApplyHandlers,
  type CloudSync,
  type CloudSyncOptions,
  type CloudSyncStatus,
  type ConflictRule,
} from './sync';
export { useCloudSync } from './use-cloud-sync';
export type { AccountChangeKind, AccountStatus } from './native';

/** `true` when the native module is linked (a development or release build on iOS). */
export function isCloudKitSupported(): boolean {
  return nativeModule?.isSupported() ?? false;
}
