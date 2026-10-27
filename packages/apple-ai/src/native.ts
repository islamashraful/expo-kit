import { requireOptionalNativeModule, type NativeModule } from 'expo';

export type NativeAvailability =
  | 'available'
  | 'deviceNotEligible'
  | 'appleIntelligenceNotEnabled'
  | 'modelNotReady'
  | 'unsupportedOS'
  | 'unknown';

declare class ExpoKitAppleAIModule extends NativeModule {
  availability(): NativeAvailability;
}

// Null in Expo Go, on Android and on web, where the native module isn't linked.
export const nativeModule = requireOptionalNativeModule<ExpoKitAppleAIModule>('ExpoKitAppleAI');
