import { requireOptionalNativeModule, type NativeModule } from 'expo';

export type AccountStatus =
  | 'available'
  | 'noAccount'
  | 'restricted'
  | 'temporarilyUnavailable'
  | 'couldNotDetermine'
  | 'unknown';

export type NativeStatus = {
  account: AccountStatus;
  restoring: boolean;
  syncing: boolean;
  /** Milliseconds since 1970. */
  lastSyncedAt: number | null;
  error: string | null;
};

export type NativeItem = {
  key: string;
  json: string;
  /** Milliseconds since 1970. */
  updatedAt: number;
};

export type NativeEvents = {
  status: (status: NativeStatus) => void;
  /** Something in the store changed, here or from iCloud. Merged: at most one per ~250 ms. */
  change: () => void;
};

/** The native store. Everything that touches SwiftData and iCloud runs in Swift. */
export interface SwiftDataNative {
  status(): NativeStatus;
  set(collection: string, key: string, json: string, updatedAt: number | null): Promise<void>;
  setMany(collection: string, items: { key: string; json: string; updatedAt: number | null }[]): Promise<void>;
  get(collection: string, key: string): Promise<NativeItem | null>;
  getAll(collection: string): Promise<NativeItem[]>;
  remove(collection: string, key: string): Promise<void>;
  clear(collection: string): Promise<void>;
  isImportDone(id: string): boolean;
  markImportDone(id: string): void;
  addListener<E extends keyof NativeEvents>(event: E, listener: NativeEvents[E]): { remove(): void };
}

declare class ExpoKitSwiftDataModule extends NativeModule<NativeEvents> implements SwiftDataNative {
  status(): NativeStatus;
  set(collection: string, key: string, json: string, updatedAt: number | null): Promise<void>;
  setMany(collection: string, items: { key: string; json: string; updatedAt: number | null }[]): Promise<void>;
  get(collection: string, key: string): Promise<NativeItem | null>;
  getAll(collection: string): Promise<NativeItem[]>;
  remove(collection: string, key: string): Promise<void>;
  clear(collection: string): Promise<void>;
  isImportDone(id: string): boolean;
  markImportDone(id: string): void;
}

// Null in Expo Go, on Android and on web, where the native module isn't linked.
export const native: SwiftDataNative | null = requireOptionalNativeModule<ExpoKitSwiftDataModule>('ExpoKitSwiftData');
