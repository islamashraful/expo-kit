import { requireOptionalNativeModule, SharedObject, type NativeModule } from 'expo';

export type NativeAvailability =
  | 'available'
  | 'deviceNotEligible'
  | 'appleIntelligenceNotEnabled'
  | 'modelNotReady'
  | 'unsupportedOS'
  | 'unknown';

export type NativeGenerationOptions = {
  temperature?: number;
  maxTokens?: number;
};

export type NativeSessionEvents = {
  /** The answer so far, each time it grows during streamResponse. */
  text: (text: string) => void;
};

/** A conversation with the model. Remembers earlier prompts and answers. */
declare class ModelSession extends SharedObject<NativeSessionEvents> {
  constructor(options: { instructions?: string });
  readonly isResponding: boolean;
  respond(prompt: string, options: NativeGenerationOptions): Promise<string>;
  streamResponse(prompt: string, options: NativeGenerationOptions): Promise<string>;
  /** Stops the answer being written. Its call rejects with code `cancelled`. */
  cancel(): void;
}

export type NativeSession = ModelSession;

declare class ExpoKitAppleAIModule extends NativeModule {
  availability(): NativeAvailability;
  ModelSession: typeof ModelSession;
}

// Null in Expo Go, on Android and on web, where the native module isn't linked.
export const nativeModule = requireOptionalNativeModule<ExpoKitAppleAIModule>('ExpoKitAppleAI');
