import { reportError } from '@expo-kit/core';
import { Linking } from 'react-native';
import Purchases, { PURCHASES_ERROR_CODE } from 'react-native-purchases';

import type { Plan } from './plans';
import { applyCustomerInfo, getEntitlement, isEntitled, isPurchasesEnabled, track } from './purchases';

export type PurchaseResult = {
  /**
   * - `'success'`: the user is pro now.
   * - `'cancelled'`: the user closed the App Store sheet. Show nothing.
   * - `'pending'`: waiting for approval (e.g. Ask to Buy). Pro turns on by itself when approved.
   * - `'failed'`: something went wrong. The error was already reported.
   */
  status: 'success' | 'cancelled' | 'pending' | 'failed';
  error?: unknown;
};

export type RestoreResult = {
  /** `'restored'`: pro again. `'empty'`: nothing to restore. `'failed'`: error, already reported. */
  status: 'restored' | 'empty' | 'failed';
  error?: unknown;
};

/** Buys a plan. Never throws: check `status`. Sends the purchase events. */
export async function purchase(plan: Plan): Promise<PurchaseResult> {
  const properties = { plan: plan.key, product_id: plan.productId, price_string: plan.price };
  if (!isPurchasesEnabled()) {
    const error = new Error('Purchases are off. Check the iOS API key passed to initPurchases().');
    reportError(error, { fn: 'purchase' });
    return { status: 'failed', error };
  }

  track('purchase_attempted', properties);
  try {
    const { customerInfo } = await Purchases.purchasePackage(plan.package);
    applyCustomerInfo(customerInfo);
    if (!isEntitled(customerInfo)) {
      // Paid, but the product isn't linked to the entitlement in the RevenueCat dashboard.
      throw new Error(`Purchase finished but entitlement "${getEntitlement()}" is not active.`);
    }
    track('purchase_completed', properties);
    return { status: 'success' };
  } catch (error) {
    if (isCancelled(error)) {
      track('purchase_cancelled', properties);
      return { status: 'cancelled' };
    }
    if (errorCode(error) === PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) {
      track('purchase_pending', properties);
      return { status: 'pending' };
    }
    track('purchase_failed', { ...properties, error: errorMessage(error) });
    reportError(error, { fn: 'purchase', ...properties });
    return { status: 'failed', error };
  }
}

/** Restores earlier purchases, e.g. on a new phone. Never throws: check `status`. */
export async function restore(): Promise<RestoreResult> {
  if (!isPurchasesEnabled()) {
    const error = new Error('Purchases are off. Check the iOS API key passed to initPurchases().');
    reportError(error, { fn: 'restore' });
    return { status: 'failed', error };
  }

  try {
    const customerInfo = await Purchases.restorePurchases();
    applyCustomerInfo(customerInfo);
    if (!isEntitled(customerInfo)) {
      track('purchase_restore_empty');
      return { status: 'empty' };
    }
    track('purchase_restored');
    return { status: 'restored' };
  } catch (error) {
    track('purchase_restore_failed', { error: errorMessage(error) });
    reportError(error, { fn: 'restore' });
    return { status: 'failed', error };
  }
}

const MANAGE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions';

/** Opens Apple's "Manage subscription" page, e.g. from Settings. Returns `false` if it couldn't. */
export async function manageSubscription(): Promise<boolean> {
  if (isPurchasesEnabled()) {
    try {
      await Purchases.showManageSubscriptions();
      return true;
    } catch {
      // Not available everywhere (e.g. Expo Go). Apple's link below opens the same page.
    }
  }
  try {
    await Linking.openURL(MANAGE_SUBSCRIPTIONS_URL);
    return true;
  } catch (error) {
    reportError(error, { fn: 'manageSubscription' });
    return false;
  }
}

function isCancelled(error: unknown) {
  return (
    (typeof error === 'object' && error !== null && 'userCancelled' in error && error.userCancelled === true) ||
    errorCode(error) === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR
  );
}

function errorCode(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : null;
}

// RevenueCat errors are plain objects with a `message`, not always `Error`s.
function errorMessage(error: unknown) {
  return typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : String(error);
}
