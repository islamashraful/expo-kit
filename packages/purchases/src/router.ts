import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback } from 'react';

import { usePro } from './status';

type Route = Extract<Href, string>;

export type ProRouteOptions = {
  /** The paywall route. Default `'/paywall'`. */
  paywall?: Route;
};

/**
 * Returns `openPro(route)`: pro users go to `route`, free users go to the paywall,
 * which gets `route` as `?redirect=` so it can continue there after a restore.
 * Pass `{ allowFree: true }` to let a free user through, e.g. while under a free limit.
 */
export function useProRoute({ paywall = '/paywall' }: ProRouteOptions = {}) {
  const router = useRouter();
  const { isPro } = usePro();

  return useCallback(
    (route: Route, { allowFree = false }: { allowFree?: boolean } = {}) => {
      if (isPro || allowFree) {
        router.push(route);
        return;
      }
      router.push(`${paywall}?redirect=${encodeURIComponent(route)}` as Href);
    },
    [isPro, paywall, router],
  );
}

/**
 * For the paywall screen. `redirect` is where the user wanted to go (or `null`).
 * `close()` goes there, or back when there's none.
 */
export function usePaywallRoute() {
  const router = useRouter();
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();

  const close = useCallback(() => {
    if (redirect) router.replace(redirect as Href);
    else router.back();
  }, [redirect, router]);

  return { redirect: redirect ?? null, close };
}
