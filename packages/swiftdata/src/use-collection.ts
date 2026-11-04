import { reportError } from '@expo-kit/core';
import { useEffect, useState } from 'react';

import type { Collection } from './store';

export type CollectionState<T> = {
  /** Every item, most recently changed first. Empty until the first read finished. */
  data: T[];
  /** `true` until the first read finished. */
  loading: boolean;
};

/** Every item of a collection. Re-reads after every change, here or from another device. */
export function useCollection<T>(collection: Collection<T>): CollectionState<T> {
  const [state, setState] = useState<CollectionState<T>>({ data: [], loading: true });

  useEffect(() => {
    let active = true;
    let reading = 0;
    const load = () => {
      const run = ++reading;
      collection.getAll().then(
        (data) => {
          // Only the newest read counts, when changes come in quickly.
          if (active && run === reading) setState({ data, loading: false });
        },
        (error) => {
          reportError(error, { fn: 'useCollection', collection: collection.name });
          if (active && run === reading) setState((current) => ({ ...current, loading: false }));
        },
      );
    };
    load();
    const stop = collection.subscribe(load);
    return () => {
      active = false;
      stop();
    };
  }, [collection]);

  return state;
}
