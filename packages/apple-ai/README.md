# @expo-kit/apple-ai

Apple's on-device language model for Expo apps, through Apple's Foundation Models framework in Swift. Part of [expo-kit](https://github.com/islamashraful/expo-kit), small packages for Expo apps. Not made by Expo or Apple.

The model runs on the device: free, offline, and the text never leaves the phone. It's small, so it's good for summaries, rewriting, tagging and pulling details out of text, not for general knowledge or hard reasoning.

**Work in progress, not on npm yet.** So far: the availability check, text generation, conversations and streaming. Structured output comes next.

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

## Generate text

```ts
import { generateText } from '@expo-kit/apple-ai';

const summary = await generateText(`Summarize in one sentence: ${note}`, {
  instructions: 'You write short, plain summaries.',
});
```

Each call starts fresh. Options: `instructions` (how the model should behave), `temperature` (0 to 2, higher is more varied), `maxTokens` (cuts the answer off).

## Conversations

```ts
import { createSession } from '@expo-kit/apple-ai';

const session = createSession({ instructions: 'You help plan trips.' });
await session.respond('Three things to do in Lisbon?');
await session.respond('Which one is free?'); // knows what "one" refers to

session.release(); // when done
```

One question at a time per session. A long conversation eventually fails with `exceededContextWindowSize`; start a new session then.

## Streaming and stopping

```tsx
const controller = new AbortController();

const answer = await generateText(prompt, {
  onText: (text) => setAnswer(text), // the whole answer so far, each time it grows
  signal: controller.signal,
});

controller.abort(); // e.g. from a Stop button: the call rejects with code `cancelled`
```

`onText` and `signal` work the same on `session.respond`.

## Errors

Everything throws an `AppleAIError` with a `code`:

```ts
import { AppleAIError } from '@expo-kit/apple-ai';

try {
  await generateText(prompt);
} catch (error) {
  if (error instanceof AppleAIError && error.code === 'unavailable') {
    // error.reason says why, same values as the availability check
  }
}
```

| `code` | Meaning |
|---|---|
| `unavailable` | The model can't be used; see `reason` |
| `exceededContextWindowSize` | Prompt, instructions and conversation are too long |
| `guardrailViolation` | Apple's safety check blocked the prompt or the answer |
| `refusal` | The model declined to answer |
| `cancelled` | Stopped with `signal` |
| `unsupportedLanguageOrLocale` | The model doesn't support this language |
| `concurrentRequests` | The session is still answering an earlier question |
| `rateLimited` | Too many requests, mostly in the background |
| `assetsUnavailable` | The model is updating or was removed. Try again later |
| `unsupportedGuide`, `decodingFailure` | Structured output failed |
| `unknown` | Anything else. The message lists Apple's underlying errors |

## What's tested

- Simulator (iOS 26.5, Mac with Apple Intelligence): reports `available`
- Simulator: generation fails inside Apple's safety check (`GenerationError -1 ← SensitiveContentAnalysisML 15 ← ModelManagerError 1001`), also with Apple's own sample code outside this package. Likely the iOS 26.5 simulator on a macOS 27 Mac. The same prompt works when run on the Mac directly
- Mac, real model (`sh native-tests/run.sh`): single prompts, instructions, `maxTokens`, conversation memory, streaming, stopping (while streaming and while waiting), `exceededContextWindowSize` and `concurrentRequests` errors
- Automated tests: availability reasons, errors keep their code, options reach native, sessions answer in order
- Not tested yet: text generation on a real iPhone, including streamed text reaching JS

## License

MIT
