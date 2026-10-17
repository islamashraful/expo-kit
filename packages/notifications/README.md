# @expo-kit/notifications

[![npm](https://img.shields.io/npm/v/@expo-kit/notifications)](https://www.npmjs.com/package/@expo-kit/notifications)

Notification permission, scheduling and tap handling. Part of [expo-kit](https://github.com/islamashraful/expo-kit), small packages for Expo apps. Version 58.x is for Expo SDK 58. Not made by Expo.

## Install

```sh
npx expo install @expo-kit/notifications expo-notifications
```

## Usage

- `showNotificationsInApp()`: show notifications as banners even while the app is open. Call once at startup.
- `useNotificationPermission()`: `{ granted, status, canAskAgain, request }`. Checks again when the app comes back to the front.
- `useNotificationTap(onTap)`: runs when the user taps a notification, whether the app was open or closed.
- `scheduleNotification({ title, body, data, at })`: returns the id, or `null` if it failed (the error goes to `reportError`).
- `cancelNotifications(ids)`: cancels scheduled notifications.

```tsx
import {
  scheduleNotification,
  showNotificationsInApp,
  useNotificationTap,
} from '@expo-kit/notifications';

showNotificationsInApp();

// In a component
useNotificationTap((response) => {
  const { itemId } = response.notification.request.content.data;
  router.push(`/items/${itemId}`);
});

const id = await scheduleNotification({
  title: 'Netflix renews soon',
  data: { itemId: '42' },
  at: new Date('2026-11-01T10:00:00'),
});
```

Local notifications work in Expo Go. Push notifications need a development build.

## License

MIT
