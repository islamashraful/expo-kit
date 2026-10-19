import * as Notifications from 'expo-notifications';

/**
 * Shows notifications as banners even while the app is open, with or without sound.
 * With `banner: false` they only go to Notification Center while the app is open.
 * Call once at app startup, outside any component.
 */
export function showNotificationsInApp({
  sound = true,
  banner = true,
}: { sound?: boolean; banner?: boolean } = {}) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: banner,
      shouldShowList: true,
      shouldPlaySound: sound,
      shouldSetBadge: false,
    }),
  });
}
