# @expo-kit/app-update

[![npm](https://img.shields.io/npm/v/@expo-kit/app-update)](https://www.npmjs.com/package/@expo-kit/app-update)

App Store and EAS Update check with a native update sheet. Part of [expo-kit](https://github.com/islamashraful/expo-kit), small packages for Expo apps. Version 58.x is for Expo SDK 58. Not made by Expo.

## Install

```sh
npx expo install @expo-kit/app-update @expo/ui expo-application expo-updates expo-sqlite
```

## Usage

- `useAppUpdate(options?)`: on app start (and when the app comes back to the front) checks the App Store for a newer version (iOS), then for an EAS Update.
  - App Store update + "Later": not asked again for 3 days (`remindAfterDays`).
  - EAS Update + "Later": not asked again until the next launch. Expo downloads updates in the background and uses them on the next launch anyway.
  - `checkNow()`: checks right away and ignores the wait, e.g. for a "Check for updates" button in Settings.
  - `forceOnMajor: true`: an App Store update with a higher major version (e.g. 2.x → 3.0) is required. `required` is `true`, the sheet has no "Later" and can't be swiped away.
  - `checking`, `downloading` and `downloadProgress` (0 to 1): for showing progress, e.g. in a Settings row.
- `<AppUpdateSheet update={...} appName="..." />`: native iOS/Android bottom sheet. Every text can be changed with `labels`, including `requiredTitle` and `requiredMessage` for a required update.

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
