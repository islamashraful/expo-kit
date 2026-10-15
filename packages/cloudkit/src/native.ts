import { requireOptionalNativeModule, SharedObject, type NativeModule } from 'expo';

import type { SchemaSpec } from './schema';

export type AccountStatus =
  | 'available'
  | 'noAccount'
  | 'restricted'
  | 'temporarilyUnavailable'
  | 'couldNotDetermine'
  | 'unknown';

export type NativeStatus = {
  account: AccountStatus;
  syncing: boolean;
  initialSyncDone: boolean;
  pendingUploads: number;
  pendingChanges: number;
  /** Milliseconds since 1970. */
  lastSyncedAt: number | null;
  error: string | null;
};

export type NativeChange = {
  sequence: number;
  type: string;
  id: string;
  operation: 'save' | 'delete';
  fields: Record<string, unknown>;
};

export type AccountChangeKind = 'signIn' | 'signOut' | 'switchAccounts' | 'cloudDataDeleted' | 'unknown';

export type NativeEvents = {
  status: (status: NativeStatus) => void;
  changes: () => void;
  account: (change: { change: AccountChangeKind; account: AccountStatus }) => void;
  error: (error: { message: string; context: string }) => void;
};

export type EngineOptions = {
  containerId: string;
  zoneName: string;
  conflict: 'newest' | 'server' | 'device';
  schema: SchemaSpec;
};

/** The native engine. Everything that touches iCloud runs in Swift. */
export interface NativeEngine {
  start(): Promise<void>;
  syncNow(): Promise<void>;
  stop(): Promise<void>;
  save(input: { type: string; id: string; fields: Record<string, unknown> }): void;
  delete(input: { type: string; id: string }): void;
  pendingChanges(limit: number): Promise<NativeChange[]>;
  ack(sequences: number[]): Promise<void>;
  status(): NativeStatus;
  addListener<E extends keyof NativeEvents>(event: E, listener: NativeEvents[E]): { remove(): void };
}

declare class CloudSyncEngine extends SharedObject<NativeEvents> implements NativeEngine {
  constructor(options: EngineOptions);
  start(): Promise<void>;
  syncNow(): Promise<void>;
  stop(): Promise<void>;
  save(input: { type: string; id: string; fields: Record<string, unknown> }): void;
  delete(input: { type: string; id: string }): void;
  pendingChanges(limit: number): Promise<NativeChange[]>;
  ack(sequences: number[]): Promise<void>;
  status(): NativeStatus;
}

declare class ExpoKitCloudKitModule extends NativeModule {
  isSupported(): boolean;
  CloudSyncEngine: typeof CloudSyncEngine;
}

// Null in Expo Go, on Android and on web, where the native module isn't linked.
export const nativeModule = requireOptionalNativeModule<ExpoKitCloudKitModule>('ExpoKitCloudKit');

export function createNativeEngine(options: EngineOptions): NativeEngine | null {
  return nativeModule ? new nativeModule.CloudSyncEngine(options) : null;
}
