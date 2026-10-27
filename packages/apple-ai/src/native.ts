import { requireOptionalNativeModule, SharedObject, type NativeModule } from 'expo';

export type NativeAvailability =
  | 'available'
  | 'deviceNotEligible'
  | 'appleIntelligenceNotEnabled'
  | 'modelNotReady'
  | 'unsupportedOS'
  | 'unknown';

export type NativeGenerationOptions = {
  instructions?: string;
  temperature?: number;
  maxTokens?: number;
};

/** A conversation with the model. Remembers earlier prompts and answers. */
declare class ModelSession extends SharedObject {
  constructor(options: { instructions?: string });
  readonly isResponding: boolean;
  respond(prompt: string, options: NativeGenerationOptions): Promise<string>;
}

declare class ExpoKitAppleAIModule extends NativeModule {
  availability(): NativeAvailability;
  generateText(prompt: string, options: NativeGenerationOptions): Promise<string>;
  ModelSession: typeof ModelSession;
}

// Null in Expo Go, on Android and on web, where the native module isn't linked.
export const nativeModule = requireOptionalNativeModule<ExpoKitAppleAIModule>('ExpoKitAppleAI');
