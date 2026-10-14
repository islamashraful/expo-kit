# @expo-kit/app-update

App Store and EAS Update check with a native update sheet. Part of expo-kit, small packages for Expo apps. Built for Expo SDK 57. Not made by Expo.

## Install

```sh
npx expo install @expo-kit/app-update @expo/ui expo-application expo-updates expo-sqlite
```

## Usage

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

## License

MIT
