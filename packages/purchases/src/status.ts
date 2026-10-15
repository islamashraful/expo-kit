import { useSyncExternalStore } from 'react';
import type { CustomerInfo } from 'react-native-purchases';

export type ProStatus = {
  /** `false` until RevenueCat has answered once. Use it to avoid showing "free" UI to a pro user at launch. */
  ready: boolean;
  isPro: boolean;
  /** `'lifetime'` for a one-time purchase, `'subscription'` for anything that renews, `null` when free. */
  plan: 'lifetime' | 'subscription' | null;
  /** The App Store product that unlocked pro, e.g. `'app_monthly'`. */
  productId: string | null;
  /** In a free trial right now. */
  isTrial: boolean;
  /** The subscription renews at `expiresAt`. `false` after the user cancels (pro stays until then). */
  willRenew: boolean;
  /** When pro ends. `null` for lifetime and for free users. */
  expiresAt: Date | null;
};

const FREE: ProStatus = {
  ready: false,
  isPro: false,
  plan: null,
  productId: null,
  isTrial: false,
  willRenew: false,
  expiresAt: null,
};

let real = FREE;
let override: boolean | null = null;
let current = FREE;
const listeners = new Set<(status: ProStatus) => void>();

function update() {
  const next = override === null ? real : withOverride(real, override);
  if (sameStatus(current, next)) return;
  current = next;
  listeners.forEach((listener) => listener(current));
}

/** Turns RevenueCat's customer info into a pro status for the given entitlement. */
export function setStatusFromCustomerInfo(info: CustomerInfo, entitlement: string) {
  const active = info.entitlements.active[entitlement];
  real = active
    ? {
        ready: true,
        isPro: true,
        plan: active.expirationDate === null ? 'lifetime' : 'subscription',
        productId: active.productIdentifier,
        isTrial: active.periodType === 'TRIAL',
        willRenew: active.willRenew,
        expiresAt: active.expirationDate ? new Date(active.expirationDate) : null,
      }
    : { ...FREE, ready: true };
  update();
}

/** Marks the status as known (free) when RevenueCat can't answer, so nothing waits forever. */
export function setStatusReady() {
  if (real.ready) return;
  real = { ...real, ready: true };
  update();
}

/** The current pro status, for code outside React (e.g. a sync service). */
export function getProStatus(): ProStatus {
  return current;
}

/** Calls `listener` every time the pro status changes. Returns a function that stops it. */
export function onProChange(listener: (status: ProStatus) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The pro status. Re-renders when it changes (purchase, restore, renewal, expiry). */
export function usePro(): ProStatus {
  return useSyncExternalStore(onProChange, getProStatus, getProStatus);
}

/**
 * Resolves once RevenueCat has answered (or failed), e.g. to wait at startup
 * before something that depends on pro. Needs `initPurchases()` to have been called.
 */
export function waitForProStatus(): Promise<ProStatus> {
  if (current.ready) return Promise.resolve(current);
  return new Promise((resolve) => {
    const stop = onProChange((status) => {
      if (!status.ready) return;
      stop();
      resolve(status);
    });
  });
}

/**
 * Development only: forces pro on (`true`) or off (`false`) to test both sides
 * without the sandbox. `null` goes back to the real status. Does nothing in production.
 */
export function setProOverride(value: boolean | null) {
  if (!__DEV__) return;
  override = value;
  update();
}

function withOverride(status: ProStatus, isPro: boolean): ProStatus {
  if (status.isPro === isPro) return { ...status, ready: true };
  return isPro ? { ...FREE, ready: true, isPro: true, plan: 'lifetime' } : { ...FREE, ready: true };
}

function sameStatus(a: ProStatus, b: ProStatus) {
  return (
    a.ready === b.ready &&
    a.isPro === b.isPro &&
    a.plan === b.plan &&
    a.productId === b.productId &&
    a.isTrial === b.isTrial &&
    a.willRenew === b.willRenew &&
    a.expiresAt?.getTime() === b.expiresAt?.getTime()
  );
}
