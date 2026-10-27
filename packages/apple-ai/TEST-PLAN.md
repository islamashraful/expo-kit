# apple-ai test plan

Manual checks to finish before the first release. `bun test` covers the JavaScript layer; this list covers the native module on simulators and devices.

Simulator and iPhone checks use the playground's apple-ai screen in a development build. The Mac column is `sh native-tests/run.sh`, which runs the module's model code against the real model on a Mac with Apple Intelligence. ✅ passed, ❌ failed, ⬜ not run.

## Availability

| Case | Setup | Expected | Simulator | iPhone |
|---|---|---|---|---|
| Model ready | iOS 26, Apple Intelligence on | Available: Yes | ✅ | ⬜ |
| Device not eligible | Device without Apple Intelligence | `deviceNotEligible` | – | ⬜ |
| Apple Intelligence off | Turned off in Settings | `appleIntelligenceNotEnabled` | – | ⬜ |
| Turned on while running | Turn on in Settings, return to the app | Updates to Yes without a restart | – | ⬜ |
| Model downloading | Right after turning Apple Intelligence on | `modelNotReady` | – | ⬜ |
| Older iOS | iOS 18 | Builds and runs, `unsupportedOS` | ⬜ | ⬜ |
| Android | Any Android device or emulator | `unsupportedPlatform`, no crash | ⬜ | – |

## Text generation

| Case | Steps | Expected | Mac | Simulator | iPhone |
|---|---|---|---|---|---|
| Single prompt | Tap Generate | An answer of one or two sentences | ✅ | ❌ | ⬜ |
| Instructions | Instructions ask for one word in capitals | The answer follows them | ✅ | ⬜ | ⬜ |
| Answer length | `maxTokens: 10` | The answer is cut short | ✅ | ⬜ | ⬜ |
| Conversation | Ask in conversation, then ask "Make it shorter." | The second answer builds on the first | ✅ | ⬜ | ⬜ |
| New conversation | Tap New conversation, then ask a follow-up | No memory of earlier questions | ✅ | ⬜ | ⬜ |
| Model unavailable | Apple Intelligence off, tap Generate | `unavailable` error with the reason | – | – | ⬜ |
| Prompt too long | Paste a very long text | `exceededContextWindowSize` error | ✅ | ⬜ | ⬜ |
| Busy session | Ask again before the answer is back | `concurrentRequests` error | ✅ | – | – |

## Known issues

- **Simulator generation fails** inside Apple's safety check: `GenerationError -1 ← SensitiveContentAnalysisML 15 ← ModelManagerError 1001`. Reproduced with Apple's API directly, outside this package (iOS 26.5 simulator, Xcode 26.6, macOS 27). Recheck with a simulator that matches the macOS version.
