import { reportError } from '@expo-kit/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import Purchases, {
  INTRO_ELIGIBILITY_STATUS,
  PACKAGE_TYPE,
  type PurchasesIntroPrice,
  type PurchasesPackage,
} from 'react-native-purchases';

import { isPurchasesEnabled } from './purchases';

export type PlanKey = 'weekly' | 'monthly' | 'two_month' | 'three_month' | 'six_month' | 'annual' | 'lifetime';

export type Trial = {
  /** `true` for a free trial, `false` for a cheaper intro price. */
  free: boolean;
  /** Short title, e.g. `'3-Day Trial'`. */
  title: string;
  /** Longer text, e.g. `'3-day free trial'` or `'3 months at $0.99'`. */
  label: string;
  /** The intro price, e.g. `'$0.00'` or `'$0.99'`. */
  price: string;
};

export type Plan = {
  key: PlanKey;
  /** Price in the user's currency, e.g. `'$2.99'`. */
  price: string;
  /** The same price as a number, e.g. `2.99`. */
  priceAmount: number;
  currencyCode: string;
  productId: string;
  /** The trial or intro price, only when this user can still get it. */
  trial: Trial | null;
  /** RevenueCat's package, for anything not covered here. */
  package: PurchasesPackage;
};

/** Every plan of the current offering. A plan not set up in RevenueCat is `null`. */
export type Plans = Record<PlanKey, Plan | null>;

const PLAN_KEYS: Record<string, PlanKey> = {
  [PACKAGE_TYPE.WEEKLY]: 'weekly',
  [PACKAGE_TYPE.MONTHLY]: 'monthly',
  [PACKAGE_TYPE.TWO_MONTH]: 'two_month',
  [PACKAGE_TYPE.THREE_MONTH]: 'three_month',
  [PACKAGE_TYPE.SIX_MONTH]: 'six_month',
  [PACKAGE_TYPE.ANNUAL]: 'annual',
  [PACKAGE_TYPE.LIFETIME]: 'lifetime',
};

const PAYMENTS_PER_YEAR: Record<PlanKey, number | null> = {
  weekly: 52,
  monthly: 12,
  two_month: 6,
  three_month: 4,
  six_month: 2,
  annual: 1,
  lifetime: null,
};

const NO_PLANS: Plans = {
  weekly: null,
  monthly: null,
  two_month: null,
  three_month: null,
  six_month: null,
  annual: null,
  lifetime: null,
};

let loaded: Plans | null = null;
let loading: Promise<Plans | null> | null = null;

/**
 * Loads the plans of RevenueCat's current offering, with prices and trials.
 * Loaded once and shared; pass `refresh: true` to load again.
 * Returns `null` if loading failed (the error goes to `reportError`).
 */
export function loadPlans({ refresh = false }: { refresh?: boolean } = {}): Promise<Plans | null> {
  if (!isPurchasesEnabled()) return Promise.resolve(NO_PLANS);
  if (loaded && !refresh) return Promise.resolve(loaded);
  if (loading && !refresh) return loading;
  const request = fetchPlans()
    .then((plans) => {
      if (loading === request) loaded = plans;
      return plans;
    })
    .catch((error) => {
      reportError(error, { fn: 'loadPlans' });
      return null;
    })
    .finally(() => {
      if (loading === request) loading = null;
    });
  loading = request;
  return request;
}

/** The plans, loaded on first use. `plans` is `null` while loading and when loading failed. */
export function usePlans() {
  const [plans, setPlans] = useState<Plans | null>(loaded);
  const [isLoading, setLoading] = useState(loaded === null);
  const mounted = useRef(true);

  const load = useCallback(async (refresh: boolean) => {
    setLoading(true);
    const next = await loadPlans({ refresh });
    if (!mounted.current) return;
    setPlans(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (!loaded) void load(false);
    return () => {
      mounted.current = false;
    };
  }, [load]);

  const reload = useCallback(() => load(true), [load]);
  return { plans, loading: isLoading, reload };
}

/** The available plans as a list, longest first (annual before monthly), lifetime last. */
export function planList(plans: Plans | null): Plan[] {
  if (!plans) return [];
  const order: PlanKey[] = ['annual', 'six_month', 'three_month', 'two_month', 'monthly', 'weekly', 'lifetime'];
  return order.map((key) => plans[key]).filter((plan): plan is Plan => plan !== null);
}

/**
 * How much cheaper `plan` is per year than `comparedTo`, in percent, e.g. annual vs monthly → `40`.
 * `null` when it isn't cheaper or either one is lifetime.
 */
export function savingsPercent(plan: Plan | null, comparedTo: Plan | null): number | null {
  const a = yearlyAmount(plan);
  const b = yearlyAmount(comparedTo);
  if (a === null || b === null || b <= 0) return null;
  const percent = Math.round((1 - a / b) * 100);
  return percent > 0 ? percent : null;
}

/**
 * The plan's price spread over a month or a year, e.g. annual `$29.99` per month → `'$2.50'`,
 * or monthly `$4.99` per year → `'$59.88'`. `null` for lifetime.
 */
export function pricePer(plan: Plan | null, period: 'week' | 'month' | 'year'): string | null {
  const yearly = yearlyAmount(plan);
  if (!plan || yearly === null) return null;
  const amount = period === 'year' ? yearly : period === 'month' ? yearly / 12 : yearly / 52;
  return formatPrice(amount, plan.currencyCode);
}

/** Formats an amount in the given currency for the user's language, e.g. `'$2.50'`. */
export function formatPrice(amount: number, currencyCode: string): string | null {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode }).format(amount);
  } catch {
    return null;
  }
}

async function fetchPlans(): Promise<Plans> {
  const offerings = await Purchases.getOfferings();
  const packages = offerings.current?.availablePackages ?? [];
  const eligibility = await introEligibility(packages);

  const plans: Plans = { ...NO_PLANS };
  for (const pkg of packages) {
    const key = PLAN_KEYS[pkg.packageType];
    if (!key || plans[key]) continue;
    const { product } = pkg;
    plans[key] = {
      key,
      price: product.priceString,
      priceAmount: product.price,
      currencyCode: product.currencyCode,
      productId: product.identifier,
      trial: product.introPrice && eligibility[product.identifier] !== false ? trialOf(product.introPrice) : null,
      package: pkg,
    };
  }
  return plans;
}

/** Product ID → can this user get the intro offer. Unknown counts as yes, as RevenueCat recommends. */
async function introEligibility(packages: PurchasesPackage[]): Promise<Record<string, boolean>> {
  const ids = packages.filter((pkg) => pkg.product.introPrice).map((pkg) => pkg.product.identifier);
  if (ids.length === 0) return {};
  try {
    const result = await Purchases.checkTrialOrIntroductoryPriceEligibility(ids);
    return Object.fromEntries(
      ids.map((id) => [id, result[id]?.status !== INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_INELIGIBLE]),
    );
  } catch (error) {
    // Better to show a trial the store then doesn't give than to hide one the user could get.
    reportError(error, { fn: 'introEligibility' });
    return {};
  }
}

function trialOf(intro: PurchasesIntroPrice): Trial {
  const count = intro.periodNumberOfUnits * Math.max(1, intro.cycles);
  const unit = intro.periodUnit.toLowerCase();
  const title = `${count}-${capitalize(unit)} Trial`;
  if (intro.price === 0) {
    return { free: true, title, label: `${count}-${unit} free trial`, price: intro.priceString };
  }
  const units = count === 1 ? unit : `${unit}s`;
  // A paid intro can repeat, e.g. $0.99 a month for 3 months.
  const label =
    intro.cycles > 1
      ? `${intro.priceString}/${unit} for ${count} ${units}`
      : `${count} ${units} at ${intro.priceString}`;
  return { free: false, title, label, price: intro.priceString };
}

function yearlyAmount(plan: Plan | null): number | null {
  const perYear = plan ? PAYMENTS_PER_YEAR[plan.key] : null;
  return plan && perYear !== null ? plan.priceAmount * perYear : null;
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
