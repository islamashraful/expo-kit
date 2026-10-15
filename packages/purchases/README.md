# @expo-kit/purchases

RevenueCat in-app purchases: pro status, plans with prices and trials, buy, restore and paywall logic. Part of expo-kit, small packages for Expo apps. Not made by Expo or RevenueCat.

The app draws its own paywall; this package does everything behind it.

## Install

```sh
npx expo install @expo-kit/purchases react-native-purchases
```

Needs a development build for real purchases. In Expo Go, RevenueCat runs in Preview mode and needs a Test Store key (`test_…`).

## Setup

```tsx
import { capture } from '@expo-kit/analytics';
import { initPurchases } from '@expo-kit/purchases';

// Once at startup, outside a component.
initPurchases({
  iosApiKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY, // the key comes from the app
  entitlement: 'premium', // entitlement ID from the RevenueCat dashboard
  onEvent: capture, // optional: purchase events to analytics
});
```

iOS only. Without a key (or on another platform) everyone is free, and every function is still safe to call.

## Pro status

- `usePro()`: `{ ready, isPro, plan, productId, isTrial, willRenew, expiresAt }`. Updates by itself after purchases, restores, renewals and expiries.
  - `ready` is `false` until RevenueCat answers. RevenueCat keeps the last answer on the device, so this is quick, also offline.
  - `plan`: `'lifetime'`, `'subscription'` or `null`.
- `getProStatus()`: the same, outside React.
- `onProChange(listener)`: called on every change. Returns a function that stops it.
- `waitForProStatus()`: resolves once `ready`, e.g. to wait at startup before something that depends on pro.
- `setProOverride(true | false | null)`: development only. Forces pro on or off to test both sides.

## Paywall

```tsx
import { pricePer, savingsPercent, usePaywall } from '@expo-kit/purchases';
import { usePaywallRoute } from '@expo-kit/purchases/router';

export default function Paywall() {
  const { redirect, close } = usePaywallRoute();
  const paywall = usePaywall({ defaultPlan: 'annual', source: redirect ?? 'direct' });
  const { annual, monthly } = paywall.plans ?? {};

  const buy = async () => {
    const result = await paywall.buy();
    if (result?.status === 'success') router.push('/pro-welcome');
    if (result?.status === 'pending') Alert.alert('Waiting for approval');
    if (result?.status === 'failed') Alert.alert('Purchase failed', 'Please try again.');
  };

  const restore = async () => {
    const result = await paywall.restore();
    if (result?.status === 'restored') close();
    if (result?.status === 'empty') Alert.alert('Nothing to restore');
    if (result?.status === 'failed') Alert.alert('Restore failed', 'Please try again.');
  };

  // monthly?.trial?.title → '3-Day Trial'
  // savingsPercent(annual, monthly) → 40
  // pricePer(annual, 'month') → '$2.50'
  // pricePer(monthly, 'year') → '$59.88' (for a crossed-out price)
}
```

- `usePaywall({ defaultPlan?, source? })`: `plans`, `available` (a list, longest first, lifetime last), `loading`, `reload()`, `selected`, `select(key)`, `buy()`, `restore()`, `purchasing`, `restoring`. Sends `paywall_viewed` once. `buy()` and `restore()` return `null` if something is already running.
- `purchase(plan)` / `restore()`: the same without the hook. They never throw.
  - `purchase` → `status`: `'success'`, `'cancelled'` (show nothing), `'pending'` (Ask to Buy; pro turns on by itself when approved), `'failed'`.
  - `restore` → `status`: `'restored'`, `'empty'`, `'failed'`.
  - Errors go to `reportError` from `@expo-kit/core`.
- `usePlans()` / `loadPlans({ refresh? })`: plans by key: `weekly`, `monthly`, `two_month`, `three_month`, `six_month`, `annual`, `lifetime` (`null` when not in the offering). Each has `price`, `priceAmount`, `currencyCode`, `productId`, `trial` and RevenueCat's `package`. Loaded once and shared.
  - `trial` is `{ free, title, label, price }`, and only set when the user can still get it.
- `planList(plans)`, `savingsPercent(plan, comparedTo)`, `pricePer(plan, 'week' | 'month' | 'year')`, `formatPrice(amount, currencyCode)`.
- `manageSubscription()`: opens Apple's "Manage subscription" page.

## Gate pro screens

From `@expo-kit/purchases/router` (needs `expo-router`):

```tsx
const openPro = useProRoute(); // or useProRoute({ paywall: '/upgrade' })

openPro('/goals'); // pro → /goals, free → /paywall?redirect=/goals
openPro('/items/new', { allowFree: count < 5 }); // free limit
```

- `usePaywallRoute()`: for the paywall screen. `{ redirect, close }`: `close()` goes to `redirect`, or back.

## Events

Sent to `onEvent` with the plan, product ID and price where it applies:

`paywall_viewed`, `purchase_attempted`, `purchase_completed`, `purchase_cancelled`, `purchase_pending`, `purchase_failed`, `purchase_restored`, `purchase_restore_empty`, `purchase_restore_failed`.

## License

MIT
