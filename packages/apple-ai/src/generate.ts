import { getAppleAIAvailability } from './availability';
import { AppleAIError, toAppleAIError } from './errors';
import { nativeModule } from './native';

export type GenerationOptions = {
  /** 0 to 2. Lower is more predictable, higher is more varied. Apple picks a default when unset. */
  temperature?: number;
  /** Stops the answer after about this many tokens (roughly ¾ of a word each). */
  maxTokens?: number;
};

export type GenerateTextOptions = GenerationOptions & {
  /** How the model should behave, e.g. "Answer in one short sentence." Kept apart from the prompt. */
  instructions?: string;
};

export type SessionOptions = {
  /** How the model should behave for the whole conversation. */
  instructions?: string;
};

export type AppleAISession = {
  /** Asks the next question. The model sees the earlier prompts and answers. One at a time. */
  respond(prompt: string, options?: GenerationOptions): Promise<string>;
  /** `true` while an answer is being written. */
  readonly isResponding: boolean;
  /** Frees the conversation. Call it when the screen or feature is done with the session. */
  release(): void;
};

/**
 * One prompt, one answer, no memory of earlier calls.
 * Throws an AppleAIError; `code` is `unavailable` when the model can't be used.
 */
export async function generateText(prompt: string, options: GenerateTextOptions = {}): Promise<string> {
  const model = requireModel();
  try {
    return await model.generateText(prompt, options);
  } catch (error) {
    throw toAppleAIError(error);
  }
}

/**
 * A conversation that remembers earlier prompts and answers.
 * Throws an AppleAIError with code `unavailable` when the model can't be used.
 */
export function createSession(options: SessionOptions = {}): AppleAISession {
  const session = new (requireModel().ModelSession)(options);
  return {
    async respond(prompt, generationOptions = {}) {
      try {
        return await session.respond(prompt, generationOptions);
      } catch (error) {
        throw toAppleAIError(error);
      }
    },
    get isResponding() {
      return session.isResponding;
    },
    release() {
      session.release();
    },
  };
}

function requireModel() {
  const availability = getAppleAIAvailability();
  if (!availability.available || !nativeModule) {
    const reason = availability.available ? 'notLinked' : availability.reason;
    throw new AppleAIError('unavailable', `The on-device model can't be used: ${reason}.`, reason);
  }
  return nativeModule;
}
