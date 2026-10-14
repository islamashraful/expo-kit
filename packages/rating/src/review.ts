import { reportError } from '@expo-kit/core';
import { kitStorage } from '@expo-kit/core/storage';
import * as Application from 'expo-application';
import * as StoreReview from 'expo-store-review';
import { Linking, Platform } from 'react-native';

export type ReviewLimits = {
  /** Happy moments needed before the first ask. Default `3`. */
  minEvents?: number;
  /** Days since the first happy moment before the first ask. Default `3`. */
  minDays?: number;
  /** Days to wait between asks. Default `60`. */
  daysBetween?: number;
  /** Overrides the installed app's version. Mainly for testing. */
  currentVersion?: string;
};

export type ReviewState = {
  events: number;
  firstEventAt: number | null;
  lastAskedAt: number | null;
  lastAskedVersion: string | null;
};

const KEYS = {
  events: 'rating.events',
  firstEventAt: 'rating.firstEventAt',
  lastAskedAt: 'rating.lastAskedAt',
  lastAskedVersion: 'rating.lastAskedVersion',
};
const DAY_MS = 24 * 60 * 60 * 1000;

const DEFAULT_LIMITS = { minEvents: 3, minDays: 3, daysBetween: 60 };
let appLimits: ReviewLimits = {};

/**
 * Sets the app's own limits once, e.g. at startup. Every `requestReviewIfReady()`
 * call uses them. Anything left out keeps the default.
 */
export function setReviewLimits(limits: ReviewLimits): void {
  appLimits = limits;
}

/**
 * Call after a happy moment (e.g. a task was saved). Counts it, and shows the
 * system "Rate this app" popup only when the limits allow. Never asks twice for the
 * same app version. Returns `true` if it asked.
 *
 * Limits come from `setReviewLimits()`, or the defaults. Passing `limits` here
 * overrides them for this one call.
 *
 * Apple decides whether the popup really appears: always in development,
 * never in TestFlight, at most 3 times a year in the App Store.
 */
export async function requestReviewIfReady(limits: ReviewLimits = {}): Promise<boolean> {
  const {
    minEvents,
    minDays,
    daysBetween,
    currentVersion = Application.nativeApplicationVersion ?? undefined,
  } = { ...DEFAULT_LIMITS, ...appLimits, ...limits };
  try {
    const now = Date.now();
    const state = await getReviewState();
    const events = state.events + 1;
    const firstEventAt = state.firstEventAt ?? now;
    await kitStorage.setNumber(KEYS.events, events);
    if (state.firstEventAt == null) await kitStorage.setNumber(KEYS.firstEventAt, now);

    if (events < minEvents) return false;
    if (now - firstEventAt < minDays * DAY_MS) return false;
    if (state.lastAskedAt != null && now - state.lastAskedAt < daysBetween * DAY_MS) return false;
    if (currentVersion && state.lastAskedVersion === currentVersion) return false;
    if (!(await StoreReview.hasAction())) return false;

    await StoreReview.requestReview();
    await kitStorage.setNumber(KEYS.lastAskedAt, now);
    if (currentVersion) await kitStorage.setString(KEYS.lastAskedVersion, currentVersion);
    return true;
  } catch (error) {
    reportError(error, { fn: 'requestReviewIfReady' });
    return false;
  }
}

export type OpenReviewPageOptions = {
  /** The number in the app's App Store link, e.g. `'6779573854'`. */
  appStoreId: string;
  /** Overrides the installed app's bundle ID (used on Android). Mainly for testing. */
  bundleId?: string;
};

/**
 * Opens the store's "Write a review" page. For a "Rate us" button in Settings.
 * No limits, it always opens. Opens the store of the user's own country.
 * Returns `false` if it couldn't open.
 */
export async function openReviewPage({
  appStoreId,
  bundleId = Application.applicationId ?? undefined,
}: OpenReviewPageOptions): Promise<boolean> {
  try {
    if (Platform.OS === 'android') {
      if (!bundleId) return false;
      await Linking.openURL(`market://details?id=${bundleId}`);
      return true;
    }
    // Opens the App Store app directly on the "Write a review" page.
    await Linking.openURL(`itms-apps://itunes.apple.com/app/viewContentsUserReviews/id${appStoreId}?action=write-review`);
    return true;
  } catch (error) {
    reportError(error, { fn: 'openReviewPage' });
    return false;
  }
}

/** What has been saved so far. Useful for testing. */
export async function getReviewState(): Promise<ReviewState> {
  const [events, firstEventAt, lastAskedAt, lastAskedVersion] = await Promise.all([
    kitStorage.getNumber(KEYS.events),
    kitStorage.getNumber(KEYS.firstEventAt),
    kitStorage.getNumber(KEYS.lastAskedAt),
    kitStorage.getString(KEYS.lastAskedVersion),
  ]);
  return { events: events ?? 0, firstEventAt, lastAskedAt, lastAskedVersion };
}

/** Clears all saved counts and dates. Useful for testing. */
export async function resetReviewState(): Promise<void> {
  await Promise.all(Object.values(KEYS).map((key) => kitStorage.remove(key)));
}
