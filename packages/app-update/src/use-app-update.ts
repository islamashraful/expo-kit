import { reportError, useOnForeground } from '@expo-kit/core';
import { kitStorage } from '@expo-kit/core/storage';
import * as Application from 'expo-application';
import * as Updates from 'expo-updates';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform } from 'react-native';

import { isNewerVersion } from './is-newer-version';

export type AppUpdateType = 'store' | 'ota';

export type AppUpdateOptions = {
  /** Wait until the app is ready (e.g. after onboarding) before checking. Default `true`. */
  enabled?: boolean;
  /** App Store country to look up. Default `'us'`. */
  country?: string;
  /** After "Later" on an App Store update, wait this many days before asking again. Default `3`. */
  remindAfterDays?: number;
  /** Overrides the installed app's bundle ID. Mainly for testing. */
  bundleId?: string;
  /** Overrides the installed app's version. Mainly for testing. */
  currentVersion?: string;
};

export type AppUpdate = {
  /** `'store'` = newer version on the App Store, `'ota'` = EAS Update ready, `null` = nothing. */
  type: AppUpdateType | null;
  currentVersion: string | null;
  storeVersion: string | null;
  /**
   * Checks right away, even after "Later" and when `enabled` is false.
   * Use it for a "Check for updates" button. Returns what it found.
   */
  checkNow: () => Promise<AppUpdateType | null>;
  openStore: () => Promise<void>;
  /** Downloads the EAS Update and restarts the app with it. */
  installOta: () => Promise<void>;
  /**
   * Hides the sheet. For an App Store update it won't show again for `remindAfterDays`.
   * For an EAS Update it won't show again until the next launch (by then Expo has usually installed it).
   */
  dismiss: () => void;
};

/**
 * Checks for a newer App Store version (iOS), then for an EAS Update.
 * Checks again when the app comes back to the front, unless the user dismissed it.
 */
export function useAppUpdate({
  enabled = true,
  country = 'us',
  remindAfterDays = 3,
  bundleId = Application.applicationId ?? undefined,
  currentVersion = Application.nativeApplicationVersion ?? undefined,
}: AppUpdateOptions = {}): AppUpdate {
  const [type, setType] = useState<AppUpdateType | null>(null);
  const [storeVersion, setStoreVersion] = useState<string | null>(null);
  const [storeUrl, setStoreUrl] = useState<string | null>(null);
  const dismissed = useRef(false);
  const checking = useRef(false);

  const run = useCallback(async ({ ignoreSnooze }: { ignoreSnooze: boolean }): Promise<AppUpdateType | null> => {
    if (checking.current) return null;
    checking.current = true;
    try {
      if (Platform.OS === 'ios' && bundleId && currentVersion) {
        const store = await lookUpAppStore(bundleId, country);
        if (store && isNewerVersion(store.version, currentVersion)) {
          if (!ignoreSnooze && (await isSnoozed(remindAfterDays))) return null;
          setStoreVersion(store.version);
          setStoreUrl(store.url);
          setType('store');
          return 'store';
        }
      }

      // EAS Update is off in Expo Go and development builds.
      if (Updates.isEnabled) {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) {
          setType('ota');
          return 'ota';
        }
      }
      return null;
    } catch {
      // Offline or the store/update server is unreachable. Try again next time.
      return null;
    } finally {
      checking.current = false;
    }
  }, [bundleId, currentVersion, country, remindAfterDays]);

  const autoCheck = useCallback(() => {
    if (enabled && !dismissed.current) void run({ ignoreSnooze: false });
  }, [enabled, run]);

  useEffect(autoCheck, [autoCheck]);
  useOnForeground(autoCheck);

  const checkNow = useCallback(() => {
    dismissed.current = false;
    return run({ ignoreSnooze: true });
  }, [run]);

  const openStore = useCallback(async () => {
    if (!storeUrl) return;
    try {
      await Linking.openURL(storeUrl);
    } catch (error) {
      reportError(error, { fn: 'useAppUpdate.openStore' });
    }
  }, [storeUrl]);

  const installOta = useCallback(async () => {
    try {
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    } catch (error) {
      reportError(error, { fn: 'useAppUpdate.installOta' });
      throw error;
    }
  }, []);

  const dismiss = useCallback(() => {
    dismissed.current = true;
    if (type === 'store') void kitStorage.setNumber(DISMISSED_AT_KEY, Date.now());
    setType(null);
  }, [type]);

  return {
    type,
    currentVersion: currentVersion ?? null,
    storeVersion,
    checkNow,
    openStore,
    installOta,
    dismiss,
  };
}

const DISMISSED_AT_KEY = 'app-update.storeDismissedAt';
const DAY_MS = 24 * 60 * 60 * 1000;

async function isSnoozed(days: number) {
  const dismissedAt = await kitStorage.getNumber(DISMISSED_AT_KEY);
  return dismissedAt != null && Date.now() - dismissedAt < days * DAY_MS;
}

async function lookUpAppStore(bundleId: string, country: string) {
  // The timestamp avoids a cached answer from Apple's servers.
  const url = `https://itunes.apple.com/lookup?bundleId=${encodeURIComponent(bundleId)}&country=${country}&t=${Date.now()}`;
  const response = await fetch(url);
  const json = await response.json();
  const result = json?.results?.[0];
  if (!result?.version || !result?.trackViewUrl) return null;
  return { version: String(result.version), url: String(result.trackViewUrl) };
}
