# @expo-kit/analytics

[![npm](https://img.shields.io/npm/v/@expo-kit/analytics)](https://www.npmjs.com/package/@expo-kit/analytics)

PostHog analytics setup. Part of [expo-kit](https://github.com/islamashraful/expo-kit), small packages for Expo apps. Version 58.x is for Expo SDK 58. Not made by Expo.

## Install

```sh
npx expo install @expo-kit/analytics posthog-react-native expo-application expo-device expo-file-system expo-localization
```

## Usage

- `initAnalytics({ apiKey, host?, enableInDev?, appName?, options? })`: starts PostHog. Call once at startup.
  - Off in development unless `enableInDev: true`, and off when `apiKey` is empty. Every other function is safe to call either way.
  - `host` defaults to the EU server (`https://eu.i.posthog.com`).
  - Every event gets `app`, `app_version`, `environment` and `platform`. `app` is the app's name, unless you set `appName`.
- `useTrackScreens({ name? })`: records a screen view on every route change. Call once in the root layout.
  - `name: 'route'` sends the route file, e.g. `/items/[id]`, instead of the address, e.g. `/items/42`. Keeps IDs out of analytics.
- `capture(event, properties?)`: sends an event.
- `register(properties)`: adds properties to every following event, e.g. `register({ language: 'de' })`.
- `identify(userId, properties?)`: links the following events to a user (e.g. a device ID). Also saves `first_app_version` once.
- `resetAnalytics()`: forgets the user, e.g. after logging out.
- `getPostHog()`: the PostHog client for anything else (e.g. feature flags), or `null` when off.

```tsx
import { capture, initAnalytics, useTrackScreens } from '@expo-kit/analytics';

// Once at startup. The key comes from the app, never from the package.
initAnalytics({
  apiKey: process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '',
  host: process.env.EXPO_PUBLIC_POSTHOG_HOST, // falls back to EU when not set
});

// Root layout
export default function RootLayout() {
  useTrackScreens();
  return <Stack />;
}

// Anywhere
capture('task_saved', { count: 3 });
```

## License

MIT
