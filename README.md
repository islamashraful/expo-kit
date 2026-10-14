# expo-kit

Reusable packages for my Expo apps. Each feature is its own small package, so an app only installs what it needs.

Built for Expo SDK 57. Not made by or affiliated with Expo.

## Packages

| Package | What it does |
|---|---|
| `@expo-kit/core` | Shared helpers used by the other packages |
| `@expo-kit/notifications` | Notification permission, scheduling and tap handling |
| `@expo-kit/app-update` | App Store and EAS Update check with a native update sheet |
| `@expo-kit/rating` | App Store review prompt with limits |
| `@expo-kit/mail` | Contact email with device info |

### `@expo-kit/core`

The main import uses only React Native, no extra native libraries.

- `useOnForeground(callback)`: runs `callback` every time the app comes back to the front.
- `setErrorReporter(fn)`: the app tells the kit where to send errors (e.g. Sentry). Call once at startup.
- `reportError(error, context?)`: used by kit packages to send an error to that place. In development it's also logged to the console.
- `kitStorage` from `@expo-kit/core/storage`: small saved values for kit packages (e.g. when "Later" was tapped). Needs `expo-sqlite` in the app. Uses its own database file, so it never touches the app's data.

```tsx
import { setErrorReporter, useOnForeground } from '@expo-kit/core';
import * as Sentry from '@sentry/react-native';

// Once at app startup. Sentry itself is still set up by the app.
setErrorReporter((error, context) => Sentry.captureException(error, { extra: context }));

// In a component
useOnForeground(() => {
  refreshData();
});
```

### `@expo-kit/notifications`

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

### `@expo-kit/app-update`

Install in the app: `npx expo install @expo/ui expo-application expo-updates expo-sqlite`

- `useAppUpdate(options?)`: on app start (and when the app comes back to the front) checks the App Store for a newer version (iOS), then for an EAS Update.
  - App Store update + "Later": not asked again for 3 days (`remindAfterDays`).
  - EAS Update + "Later": not asked again until the next launch. Expo downloads updates in the background and uses them on the next launch anyway.
  - `checkNow()`: checks right away and ignores the wait, e.g. for a "Check for updates" button in Settings.
- `<AppUpdateSheet update={...} appName="..." />`: native iOS/Android bottom sheet. Every text can be changed with `labels`.

```tsx
import { AppUpdateSheet, useAppUpdate } from '@expo-kit/app-update';

const update = useAppUpdate({ enabled: appReady });

return (
  <>
    <App />
    <AppUpdateSheet update={update} appName="Kite" />
  </>
);
```

The bundle ID, installed version and App Store link come from the app itself, so there's nothing to configure. The App Store check is iOS only (Google Play has no public lookup). EAS Update only works in real builds, not in Expo Go or development.

### `@expo-kit/rating`

Install in the app: `npx expo install expo-store-review expo-application expo-sqlite`

- `requestReviewIfReady(limits?)`: call after a happy moment (e.g. a task was saved). Shows the system "Rate this app" popup only when:
  - there have been at least 3 happy moments (`minEvents`)
  - the first one was at least 3 days ago (`minDays`)
  - it hasn't asked in the last 60 days (`daysBetween`)
  - it hasn't asked for this app version yet
- `setReviewLimits(limits)`: an app with its own limits sets them once at startup, and every `requestReviewIfReady()` call uses them. Anything left out keeps the default.
- `openReviewPage({ appStoreId })`: opens the App Store app on the "Write a review" page, with no limits. For a "Rate us" button in Settings. `appStoreId` is the number in the app's App Store link. Opens the store of the user's own country. On Android it opens the Play Store with the bundle ID.

```tsx
import { openReviewPage, requestReviewIfReady, setReviewLimits } from '@expo-kit/rating';

// Optional, once at startup. Only for apps that want other limits.
setReviewLimits({ minEvents: 10, minDays: 7 });

// After any happy moment
await saveTask();
requestReviewIfReady();

// Settings screen
<Button onPress={() => openReviewPage({ appStoreId: '6779573854' })}>Rate us</Button>
```

The counts are saved on the device. Apple decides whether the popup really appears: always during development, never in TestFlight, and at most 3 times a year from the App Store.

### `@expo-kit/mail`

Install in the app: `npx expo install expo-mail-composer expo-application expo-device`

- `sendEmail({ to, subject?, body?, includeDeviceInfo? })`: opens an email with everything filled in. For a "Contact us" button.
  - Uses the in-app mail screen when the Mail app is set up, otherwise the phone's default mail app (e.g. Gmail).
  - Adds app version, device and OS version at the bottom, so support emails are easier to answer. Turn off with `includeDeviceInfo: false`.
  - Returns `'sent'`, `'saved'`, `'cancelled'`, `'opened'` (another mail app opened) or `'unavailable'` (no mail app; show the address instead).
- `getDeviceInfo()`: the same device text, e.g. for a "Copy debug info" button.

```tsx
import { sendEmail } from '@expo-kit/mail';

const result = await sendEmail({ to: 'hello@example.com', subject: 'About Kite' });
if (result === 'unavailable') showAddress('hello@example.com');
```

### Planned

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

## Releasing

1. After changing a package, run `bun run changeset`. Pick the packages, the kind of change (patch = fix, minor = new feature, major = breaking) and write one line about it. Commit the file it creates and push.
2. GitHub opens (or updates) a "Version packages" pull request with the new version numbers and changelogs.
3. Merge it when you want to release. GitHub publishes the new versions to npm and tags them.

Publishing uses npm trusted publishing, so no npm token is stored anywhere. A new package must be published once by hand (`bun run release`, needs `npm login`) and then get a trusted publisher on npmjs.com (Settings → Trusted publisher → GitHub Actions, workflow `release.yml`).

## Adding a package

1. Copy `packages/core` to `packages/<name>` and rename it in `package.json`.
2. Native libraries the package uses go in `peerDependencies` (the app installs them with `npx expo install`).
3. To use `core` inside it, add `"@expo-kit/core": "workspace:^"` to its `dependencies`.
4. Add it to `apps/playground/package.json` as `"workspace:*"` and run `bun install`.

## Rules

- No secret keys in packages. Apps pass their own keys in.
- Keep packages in step with the Expo SDK version used by the playground.
- Only put code in `core` when more than one package needs it.
