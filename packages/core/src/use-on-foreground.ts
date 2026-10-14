import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

/**
 * Calls `callback` every time the app comes back to the foreground (background/inactive → active).
 * The latest callback is always used, so it doesn't need to be wrapped in useCallback.
 */
export function useOnForeground(callback: () => void) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    let current = AppState.currentState;
    const sub = AppState.addEventListener('change', (next) => {
      if (current !== 'active' && next === 'active') callbackRef.current();
      current = next;
    });
    return () => sub.remove();
  }, []);
}
