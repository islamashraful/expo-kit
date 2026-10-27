# @expo-kit/apple-ai

Apple's on-device language model for Expo apps, through Apple's Foundation Models framework in Swift. Part of [expo-kit](https://github.com/islamashraful/expo-kit), small packages for Expo apps. Not made by Expo or Apple.

The model runs on the device: free, offline, and the text never leaves the phone. It's small, so it's good for summaries, rewriting, tagging and pulling details out of text, not for general knowledge or hard reasoning.

**Work in progress, not on npm yet.** So far it only checks whether the model can be used. Text generation, streaming and structured output come next.

Needs iOS 26 on a device with Apple Intelligence turned on (iPhone 15 Pro or newer). The simulator works when the Mac has Apple Intelligence. Needs a development build (not Expo Go). On Android and web it reports `unsupportedPlatform`.

## Install

```sh
npx expo install @expo-kit/apple-ai
```

No config plugin needed. Apps with a lower iOS minimum still build; the check then reports `unsupportedOS`.

## Is the model available?

```tsx
import { useAppleAIAvailability } from '@expo-kit/apple-ai';

const availability = useAppleAIAvailability();

if (!availability.available) {
  // Hide the feature, or explain why it's missing.
  console.log(availability.reason);
}
```

The hook checks again each time the app comes back to the foreground. Outside React: `getAppleAIAvailability()` or `isAppleAIAvailable()`.

| `reason` | Meaning |
|---|---|
| `deviceNotEligible` | The device doesn't support Apple Intelligence |
| `appleIntelligenceNotEnabled` | Apple Intelligence is off in Settings |
| `modelNotReady` | The model is still downloading. Try again later |
| `unsupportedOS` | Older than iOS 26 |
| `unsupportedPlatform` | Android or web |
| `notLinked` | Not in this build (Expo Go, or not rebuilt after installing) |
| `unknown` | A reason added by a newer iOS |

## What's tested

- Simulator (iOS 26.5, Mac with Apple Intelligence): reports `available`
- Automated tests: reasons are passed through, Android and web report `unsupportedPlatform`

## License

MIT
