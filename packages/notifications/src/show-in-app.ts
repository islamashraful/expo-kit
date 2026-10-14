import * as Notifications from 'expo-notifications';

/**
 * Shows notifications as banners even while the app is open (by default they're hidden).
 * Call once at app startup, outside any component.
 */
export function showNotificationsInApp({ sound = true }: { sound?: boolean } = {}) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: sound,
      shouldSetBadge: false,
    }),
  });
}
