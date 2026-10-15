import { reportError } from '@expo-kit/core';
import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL, type CustomerInfo } from 'react-native-purchases';

import { setStatusFromCustomerInfo, setStatusReady } from './status';

export type PurchasesEvent =
  | 'paywall_viewed'
  | 'purchase_attempted'
  | 'purchase_completed'
  | 'purchase_cancelled'
  | 'purchase_pending'
  | 'purchase_failed'
  | 'purchase_restored'
  | 'purchase_restore_empty'
  | 'purchase_restore_failed';

export type PurchasesEventProperties = Record<string, string | number | boolean | null>;

export type PurchasesOptions = {
  /** RevenueCat's public iOS key (`appl_…`, or `test_…` for Expo Go). When empty, purchases are off and the user is free. */
  iosApiKey: string | undefined;
  /** The entitlement ID from the RevenueCat dashboard, e.g. `'premium'`. */
  entitlement: string;
  /** Called for every purchase event, e.g. to send it to analytics. */
  onEvent?: (event: PurchasesEvent, properties: PurchasesEventProperties) => void;
  /** Shows RevenueCat's detailed logs in development. Default `false` (errors only). */
  debugLogs?: boolean;
};

let options: PurchasesOptions | null = null;
let configured = false;

/**
 * Starts RevenueCat and keeps the pro status up to date. Call once at app startup,
 * outside a component. iOS only: on other platforms, or without a key, everyone is free.
 */
export function initPurchases(next: PurchasesOptions) {
  if (options) return;
  options = next;
  if (Platform.OS !== 'ios' || !next.iosApiKey) {
    setStatusReady();
    return;
  }

  try {
    if (__DEV__) Purchases.setLogLevel(next.debugLogs ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR);
    Purchases.configure({ apiKey: next.iosApiKey });
    configured = true;
  } catch (error) {
    reportError(error, { fn: 'initPurchases' });
    setStatusReady();
    return;
  }

  // Fires after purchases, restores, renewals and expiries, also ones made outside the app.
  Purchases.addCustomerInfoUpdateListener(applyCustomerInfo);
  Purchases.getCustomerInfo()
    .then(applyCustomerInfo)
    .catch((error) => {
      reportError(error, { fn: 'initPurchases.getCustomerInfo' });
      setStatusReady();
    });
}

/** `true` when RevenueCat is running, so buying and restoring can work. */
export function isPurchasesEnabled() {
  return configured;
}

export function applyCustomerInfo(info: CustomerInfo) {
  if (options) setStatusFromCustomerInfo(info, options.entitlement);
}

export function isEntitled(info: CustomerInfo) {
  return !!options && info.entitlements.active[options.entitlement] !== undefined;
}

export function getEntitlement() {
  return options?.entitlement ?? null;
}

export function track(event: PurchasesEvent, properties: PurchasesEventProperties = {}) {
  if (!options?.onEvent) return;
  try {
    options.onEvent(event, properties);
  } catch (error) {
    reportError(error, { fn: 'purchases.onEvent', event });
  }
}
