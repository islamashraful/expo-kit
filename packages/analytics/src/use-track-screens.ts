import { usePathname } from 'expo-router';
import { useEffect } from 'react';

import { screen } from './analytics';

/** Records a screen view every time the route changes. Call once in the root layout. */
export function useTrackScreens() {
  const pathname = usePathname();
  useEffect(() => {
    screen(pathname);
  }, [pathname]);
}
