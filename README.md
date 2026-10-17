# expo-kit

Small, typed packages for Expo apps. Each feature is its own package, so an app only installs what it needs. All packages are on npm under [`@expo-kit`](https://www.npmjs.com/org/expo-kit).

Built for Expo SDK 57. Not made by or affiliated with Expo.

## Packages

| Package | npm | What it does |
|---|---|---|
| [`@expo-kit/core`](packages/core) | [![npm](https://img.shields.io/npm/v/@expo-kit/core)](https://www.npmjs.com/package/@expo-kit/core) | Shared helpers used by the other packages |
| [`@expo-kit/notifications`](packages/notifications) | [![npm](https://img.shields.io/npm/v/@expo-kit/notifications)](https://www.npmjs.com/package/@expo-kit/notifications) | Notification permission, scheduling and tap handling |
| [`@expo-kit/app-update`](packages/app-update) | [![npm](https://img.shields.io/npm/v/@expo-kit/app-update)](https://www.npmjs.com/package/@expo-kit/app-update) | App Store and EAS Update check with a native update sheet |
| [`@expo-kit/rating`](packages/rating) | [![npm](https://img.shields.io/npm/v/@expo-kit/rating)](https://www.npmjs.com/package/@expo-kit/rating) | App Store review prompt with limits |
| [`@expo-kit/mail`](packages/mail) | [![npm](https://img.shields.io/npm/v/@expo-kit/mail)](https://www.npmjs.com/package/@expo-kit/mail) | Contact email with device info |
| [`@expo-kit/analytics`](packages/analytics) | [![npm](https://img.shields.io/npm/v/@expo-kit/analytics)](https://www.npmjs.com/package/@expo-kit/analytics) | PostHog events and screen views |
| [`@expo-kit/purchases`](packages/purchases) | [![npm](https://img.shields.io/npm/v/@expo-kit/purchases)](https://www.npmjs.com/package/@expo-kit/purchases) | RevenueCat pro status, plans and paywall logic |
| [`@expo-kit/cloudkit`](packages/cloudkit) | [![npm](https://img.shields.io/npm/v/@expo-kit/cloudkit)](https://www.npmjs.com/package/@expo-kit/cloudkit) | Typed iCloud sync with CKSyncEngine (native Swift) |

## Quick start

Install a package with the Expo libraries it uses:

```sh
npx expo install @expo-kit/rating expo-store-review expo-application expo-sqlite
```

```tsx
import { requestReviewIfReady } from '@expo-kit/rating';

// After a happy moment, e.g. a task was saved
requestReviewIfReady();
```

Every package has its own install line and guide. Open it from the table above.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
