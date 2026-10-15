import { useEffect, useRef, useState } from 'react';

import { purchase, restore, type PurchaseResult, type RestoreResult } from './actions';
import { planList, usePlans, type Plan, type PlanKey } from './plans';
import { track } from './purchases';

export type PaywallOptions = {
  /** The plan selected at first. Falls back to the first available plan (longest first, lifetime last). */
  defaultPlan?: PlanKey;
  /** Where the paywall was opened from, sent with `paywall_viewed`. Default `'direct'`. */
  source?: string;
};

/**
 * Everything a paywall screen needs except the design: plans, the selected plan,
 * buy and restore with busy flags. Sends `paywall_viewed` once.
 * The app decides what to show after (welcome screen, toast, alert).
 */
export function usePaywall({ defaultPlan, source = 'direct' }: PaywallOptions = {}) {
  const { plans, loading, reload } = usePlans();
  const [selectedKey, select] = useState<PlanKey | null>(defaultPlan ?? null);
  const [busy, setBusy] = useState<'purchase' | 'restore' | null>(null);
  const busyRef = useRef(false);

  const sourceRef = useRef(source);
  useEffect(() => {
    track('paywall_viewed', { source: sourceRef.current });
  }, []);

  const available = planList(plans);
  const selected: Plan | null = (selectedKey && plans?.[selectedKey]) || available[0] || null;

  const run = async <T>(kind: 'purchase' | 'restore', action: () => Promise<T>): Promise<T | null> => {
    // A ref, so a fast double tap can't start two App Store sheets.
    if (busyRef.current) return null;
    busyRef.current = true;
    setBusy(kind);
    try {
      return await action();
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  return {
    /** All plans by key, `null` while loading or when loading failed. */
    plans,
    /** The available plans as a list, longest first, lifetime last. */
    available,
    loading,
    /** Loads the plans again, e.g. a "Try again" button after a failure. */
    reload,
    selected,
    select: (key: PlanKey) => select(key),
    /** Buys the selected plan. `null` when nothing is selected or something is already running. */
    buy: (): Promise<PurchaseResult | null> =>
      selected ? run('purchase', () => purchase(selected)) : Promise.resolve(null),
    /** `null` when something is already running. */
    restore: (): Promise<RestoreResult | null> => run('restore', restore),
    purchasing: busy === 'purchase',
    restoring: busy === 'restore',
  };
}
