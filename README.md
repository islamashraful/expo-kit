# expo-kit

Reusable packages for my Expo apps. Each feature is its own small package, so an app only installs what it needs.

Built for Expo SDK 57. Not published to npm yet.

## Packages

| Package | What it does |
|---|---|
| `@islamashraful/core` | Shared helpers used by the other packages |
| `@islamashraful/notifications` | Notification permission, scheduling and tap handling |
| `@islamashraful/app-update` | App Store and EAS Update check with a native update sheet |

### `@islamashraful/core`

The main import uses only React Native, no extra native libraries.

- `useOnForeground(callback)`: runs `callback` every time the app comes back to the front.
- `setErrorReporter(fn)`: the app tells the kit where to send errors (e.g. Sentry). Call once at startup.
- `reportError(error, context?)`: used by kit packages to send an error to that place. In development it's also logged to the console.
- `kitStorage` from `@islamashraful/core/storage`: small saved values for kit packages (e.g. when "Later" was tapped). Needs `expo-sqlite` in the app. Uses its own database file, so it never touches the app's data.

```tsx
import { setErrorReporter, useOnForeground } from '@islamashraful/core';
import * as Sentry from '@sentry/react-native';

// Once at app startup. Sentry itself is still set up by the app.
setErrorReporter((error, context) => Sentry.captureException(error, { extra: context }));

// In a component
useOnForeground(() => {
  refreshData();
});
```

### `@islamashraful/notifications`

Install in the app: `npx expo install expo-notifications`

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
} from '@islamashraful/notifications';

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

### `@islamashraful/app-update`

Install in the app: `npx expo install @expo/ui expo-application expo-updates expo-sqlite`

- `useAppUpdate(options?)`: on app start (and when the app comes back to the front) checks the App Store for a newer version (iOS), then for an EAS Update.
  - App Store update + "Later": not asked again for 3 days (`remindAfterDays`).
  - EAS Update + "Later": not asked again until the next launch. Expo downloads updates in the background and uses them on the next launch anyway.
  - `checkNow()`: checks right away and ignores the wait, e.g. for a "Check for updates" button in Settings.
- `<AppUpdateSheet update={...} appName="..." />`: native iOS/Android bottom sheet. Every text can be changed with `labels`.

```tsx
import { AppUpdateSheet, useAppUpdate } from '@islamashraful/app-update';

const update = useAppUpdate({ enabled: appReady });

return (
  <>
    <App />
    <AppUpdateSheet update={update} appName="Kite" />
  </>
);
```

The bundle ID, installed version and App Store link come from the app itself, so there's nothing to configure. The App Store check is iOS only (Google Play has no public lookup). EAS Update only works in real builds, not in Expo Go or development.

### Planned

- `rating`: App Store review prompt with limits
- `mail`: mail composer wrapper
- `cloudkit`, `apple-ai`: native Swift modules
- `purchases`: RevenueCat setup and paywall (brought back when needed)

## Structure

```
apps/playground     Expo app for trying out every package
packages/*          The published packages
```

## Develop

Needs [bun](https://bun.sh).

```sh
bun install                 # installs everything and builds the packages
bun run playground          # starts the playground app
bun run typecheck           # type checks every package and the playground
```

The playground reads package source directly, so edits show up without rebuilding.

## Adding a package

1. Copy `packages/core` to `packages/<name>` and rename it in `package.json`.
2. Native libraries the package uses go in `peerDependencies` (the app installs them with `npx expo install`).
3. To use `core` inside it, add `"@islamashraful/core": "workspace:^"` to its `dependencies`.
4. Add it to `apps/playground/package.json` as `"workspace:*"` and run `bun install`.

## Rules

- No secret keys in packages. Apps pass their own keys in.
- Keep packages in step with the Expo SDK version used by the playground.
- Only put code in `core` when more than one package needs it.
