import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';

/**
 * Runs `onTap` when the user taps a notification, both while the app is running
 * and when the tap opened the app from closed. Mount it once the app can handle
 * the tap (e.g. after navigation is ready).
 */
export function useNotificationTap(onTap: (response: Notifications.NotificationResponse) => void) {
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;

  useEffect(() => {
    // The same tap can arrive both as the "last response" and as a live event. Handle it once.
    let lastHandledId: string | null = null;
    const handle = (response: Notifications.NotificationResponse) => {
      const id = response.notification.request.identifier;
      if (id === lastHandledId) return;
      lastHandledId = id;
      onTapRef.current(response);
    };

    const launchResponse = Notifications.getLastNotificationResponse();
    if (launchResponse) {
      handle(launchResponse);
      Notifications.clearLastNotificationResponse();
    }

    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    return () => sub.remove();
  }, []);
}
