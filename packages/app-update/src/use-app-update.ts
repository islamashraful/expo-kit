import { reportError, useOnForeground } from '@expo-kit/core';
import { kitStorage } from '@expo-kit/core/storage';
import * as Application from 'expo-application';
import * as Updates from 'expo-updates';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform } from 'react-native';

import { isNewerMajor, isNewerVersion } from './is-newer-version';

export type AppUpdateType = 'store' | 'ota';

export type AppUpdateOptions = {
  /** Wait until the app is ready (e.g. after onboarding) before checking. Default `true`. */
  enabled?: boolean;
  /** App Store country to look up. Default `'us'`. */
  country?: string;
  /** After "Later" on an App Store update, wait this many days before asking again. Default `3`. */
  remindAfterDays?: number;
  /**
   * Makes an App Store update with a higher major version (e.g. 2.x → 3.0) required:
   * `required` is true, "Later" is ignored and it's shown again on every check. Default `false`.
   */
  forceOnMajor?: boolean;
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
  /** True when the App Store update must be installed (see `forceOnMajor`). The sheet then has no "Later". */
  required?: boolean;
  /** True while checking the App Store and EAS Update. */
  checking?: boolean;
  /** True while an EAS Update downloads, including the one Expo downloads by itself on launch. */
  downloading?: boolean;
  /** Download progress from 0 to 1 while `downloading`, or `null` when unknown. */
  downloadProgress?: number | null;
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
   * Does nothing while the update is `required`.
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
  forceOnMajor = false,
  bundleId = Application.applicationId ?? undefined,
  currentVersion = Application.nativeApplicationVersion ?? undefined,
}: AppUpdateOptions = {}): AppUpdate {
  const [type, setType] = useState<AppUpdateType | null>(null);
  const [storeVersion, setStoreVersion] = useState<string | null>(null);
  const [storeUrl, setStoreUrl] = useState<string | null>(null);
  const [required, setRequired] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const { isDownloading, downloadProgress } = Updates.useUpdates();
  const dismissed = useRef(false);
  const checking = useRef(false);

  const run = useCallback(async ({ ignoreSnooze }: { ignoreSnooze: boolean }): Promise<AppUpdateType | null> => {
    if (checking.current) return null;
    checking.current = true;
    setIsChecking(true);
    try {
      if (Platform.OS === 'ios' && bundleId && currentVersion) {
        const store = await lookUpAppStore(bundleId, country);
        if (store && isNewerVersion(store.version, currentVersion)) {
          const isRequired = forceOnMajor && isNewerMajor(store.version, currentVersion);
          if (!isRequired && !ignoreSnooze && (await isSnoozed(remindAfterDays))) return null;
          setStoreVersion(store.version);
          setStoreUrl(store.url);
          setRequired(isRequired);
          setType('store');
          return 'store';
        }
      }

      // EAS Update is off in Expo Go and development builds.
      if (Updates.isEnabled) {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) {
          setRequired(false);
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
      setIsChecking(false);
    }
  }, [bundleId, currentVersion, country, remindAfterDays, forceOnMajor]);

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
    if (required) return;
    dismissed.current = true;
    if (type === 'store') void kitStorage.setNumber(DISMISSED_AT_KEY, Date.now());
    setType(null);
  }, [type, required]);

  return {
    type,
    currentVersion: currentVersion ?? null,
    storeVersion,
    required,
    checking: isChecking,
    downloading: isDownloading,
    downloadProgress: isDownloading ? (downloadProgress ?? null) : null,
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
  const url = `https://itunes.apple.com/lookup?bundleId=${encodeURIComponent(bundleId)}&country=${encodeURIComponent(country)}&t=${Date.now()}`;
  const response = await fetch(url);
  const json = await response.json();
  const result = json?.results?.[0];
  if (!result?.version || !result?.trackViewUrl) return null;
  return { version: String(result.version), url: String(result.trackViewUrl) };
}
