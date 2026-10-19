import { usePathname, useSegments } from 'expo-router';
import { useEffect } from 'react';

import { screen } from './analytics';

export type TrackScreensOptions = {
  /**
   * What to send as the screen name.
   * - `'path'` (default): the address, e.g. `/items/42`.
   * - `'route'`: the route file, e.g. `/items/[id]`. Keeps IDs out of analytics and counts
   *   every item as the same screen. Groups like `(tabs)` are left out, like in the path.
   */
  name?: 'path' | 'route';
};

/** Records a screen view every time the route changes. Call once in the root layout. */
export function useTrackScreens({ name = 'path' }: TrackScreensOptions = {}) {
  const pathname = usePathname();
  const segments = useSegments() as string[];
  const screenName = name === 'route' ? routeName(segments) : pathname;

  useEffect(() => {
    screen(screenName);
    // `pathname` too, so going from one item to another still counts as a new view.
  }, [pathname, screenName]);
}

function routeName(segments: string[]) {
  const parts = segments.filter((segment) => !(segment.startsWith('(') && segment.endsWith(')')));
  return `/${parts.join('/')}`;
}
