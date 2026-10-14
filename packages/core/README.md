# @islamashraful/core

Shared helpers used by the other packages. Part of expo-kit, small packages for Expo apps. Built for Expo SDK 57.

## Install

```sh
npx expo install @islamashraful/core
```

## Usage

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

## License

MIT
