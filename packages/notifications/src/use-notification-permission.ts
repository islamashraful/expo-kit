import { reportError, useOnForeground } from '@expo-kit/core';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useState } from 'react';

export type NotificationPermission = {
  /** `null` until the first check finishes. */
  granted: boolean | null;
  /** `'undetermined'` = never asked, `'denied'` = said no, `null` until the first check finishes. */
  status: Notifications.PermissionStatus | null;
  /** `false` once the user said no for good. Then only the Settings app can turn it on. */
  canAskAgain: boolean;
  /** Shows the system prompt (if allowed) and returns whether notifications are now allowed. */
  request: () => Promise<boolean>;
};

/**
 * Whether the app may show notifications. Checks again when the app comes back to the front,
 * so it stays right after the user changes it in Settings.
 */
export function useNotificationPermission(): NotificationPermission {
  const [granted, setGranted] = useState<boolean | null>(null);
  const [status, setStatus] = useState<Notifications.PermissionStatus | null>(null);
  const [canAskAgain, setCanAskAgain] = useState(true);

  const apply = useCallback((next: Notifications.NotificationPermissionsStatus) => {
    setGranted(next.granted);
    setStatus(next.status);
    setCanAskAgain(next.canAskAgain);
    return next.granted;
  }, []);

  const check = useCallback(() => {
    Notifications.getPermissionsAsync()
      .then(apply)
      .catch((error) => reportError(error, { fn: 'useNotificationPermission.check' }));
  }, [apply]);

  useEffect(check, [check]);
  useOnForeground(check);

  const request = useCallback(async () => {
    try {
      return apply(await Notifications.requestPermissionsAsync());
    } catch (error) {
      reportError(error, { fn: 'useNotificationPermission.request' });
      return false;
    }
  }, [apply]);

  return { granted, status, canAskAgain, request };
}
