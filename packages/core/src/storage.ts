import { SQLiteStorage } from 'expo-sqlite/kv-store';

import { reportError } from './error-reporter';

// Own database file, so kit keys never mix with the app's own storage.
const store = new SQLiteStorage('expo-kit.db');

/**
 * Small saved values for kit packages (e.g. "update dismissed at").
 * Stays on the device after the app closes. Needs `expo-sqlite` in the app.
 * Keys should start with the package name, e.g. `app-update.dismissedAt`.
 */
export const kitStorage = {
  async getNumber(key: string): Promise<number | null> {
    try {
      const value = await store.getItemAsync(key);
      const number = value == null ? NaN : Number(value);
      return Number.isFinite(number) ? number : null;
    } catch (error) {
      reportError(error, { fn: 'kitStorage.getNumber', key });
      return null;
    }
  },

  async setNumber(key: string, value: number): Promise<void> {
    try {
      await store.setItemAsync(key, String(value));
    } catch (error) {
      reportError(error, { fn: 'kitStorage.setNumber', key });
    }
  },

  async getString(key: string): Promise<string | null> {
    try {
      return await store.getItemAsync(key);
    } catch (error) {
      reportError(error, { fn: 'kitStorage.getString', key });
      return null;
    }
  },

  async setString(key: string, value: string): Promise<void> {
    try {
      await store.setItemAsync(key, value);
    } catch (error) {
      reportError(error, { fn: 'kitStorage.setString', key });
    }
  },

  async remove(key: string): Promise<void> {
    try {
      await store.removeItemAsync(key);
    } catch (error) {
      reportError(error, { fn: 'kitStorage.remove', key });
    }
  },
};
