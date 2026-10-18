# @expo-kit/rating

[![npm](https://img.shields.io/npm/v/@expo-kit/rating)](https://www.npmjs.com/package/@expo-kit/rating)

App Store review prompt with limits. Part of [expo-kit](https://github.com/islamashraful/expo-kit), small packages for Expo apps. Version 58.x is for Expo SDK 58. Not made by Expo.

## Install

```sh
npx expo install @expo-kit/rating expo-store-review expo-application expo-sqlite
```

## Usage

- `requestReviewIfReady(limits?)`: call after a happy moment (e.g. a task was saved). Shows the system "Rate this app" popup only when:
  - there have been at least 3 happy moments (`minEvents`)
  - the first one was at least 3 days ago (`minDays`)
  - it hasn't asked in the last 60 days (`daysBetween`)
  - it hasn't asked for this app version yet
- `setReviewLimits(limits)`: an app with its own limits sets them once at startup, and every `requestReviewIfReady()` call uses them. Anything left out keeps the default.
- `openReviewPage({ appStoreId })`: opens the App Store app on the "Write a review" page, with no limits. For a "Rate us" button in Settings. `appStoreId` is the number in the app's App Store link. Opens the store of the user's own country. On Android it opens the Play Store with the bundle ID. If the store app can't be opened (for example the App Store is blocked by Screen Time), it opens the store's web page instead.

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

## License

MIT
