import { getAppleAIAvailability } from './availability';
import { AppleAIError, toAppleAIError } from './errors';
import { nativeModule, type NativeSession } from './native';
import type { Schema, SchemaValue } from './schema';

export type GenerationOptions = {
  /** 0 to 2. Lower is more predictable, higher is more varied. Apple picks a default when unset. */
  temperature?: number;
  /** Stops the answer after about this many tokens (roughly ¾ of a word each). */
  maxTokens?: number;
  /**
   * Streams the answer: called with the whole answer so far each time it grows,
   * so it can go straight into state. The promise still resolves with the full answer.
   */
  onText?: (text: string) => void;
  /** Aborting stops the answer. The call then rejects with code `cancelled`. */
  signal?: AbortSignal;
};

export type GenerateTextOptions = GenerationOptions & {
  /** How the model should behave, e.g. "Answer in one short sentence." Kept apart from the prompt. */
  instructions?: string;
};

export type ObjectOptions<S extends Schema> = Omit<GenerationOptions, 'onText'> & {
  /** The shape of the answer, built with `schema`. */
  schema: S;
};

export type GenerateObjectOptions<S extends Schema> = ObjectOptions<S> & {
  /** How the model should behave, e.g. "Only use facts from the text." Kept apart from the prompt. */
  instructions?: string;
};

export type SessionOptions = {
  /** How the model should behave for the whole conversation. */
  instructions?: string;
};

export type AppleAISession = {
  /** Asks the next question. The model sees the earlier prompts and answers. One at a time. */
  respond(prompt: string, options?: GenerationOptions): Promise<string>;
  /** Like `generateObject`, inside the conversation. */
  respondObject<S extends Schema>(prompt: string, options: ObjectOptions<S>): Promise<SchemaValue<S>>;
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
  const { instructions, ...generationOptions } = options;
  const session = new (requireModel().ModelSession)({ instructions });
  try {
    return await ask(session, prompt, generationOptions);
  } finally {
    session.release();
  }
}

/**
 * An answer in the shape of `schema`, typed from it. One prompt, no memory of earlier calls.
 * Throws an AppleAIError; `code` is `unavailable` when the model can't be used.
 */
export async function generateObject<S extends Schema>(
  prompt: string,
  options: GenerateObjectOptions<S>,
): Promise<SchemaValue<S>> {
  const { instructions, ...objectOptions } = options;
  const session = new (requireModel().ModelSession)({ instructions });
  try {
    return await askObject(session, prompt, objectOptions);
  } finally {
    session.release();
  }
}

/**
 * A conversation that remembers earlier prompts and answers.
 * Throws an AppleAIError with code `unavailable` when the model can't be used.
 */
export function createSession(options: SessionOptions = {}): AppleAISession {
  const session = new (requireModel().ModelSession)(options);
  return {
    respond: (prompt, generationOptions = {}) => ask(session, prompt, generationOptions),
    respondObject: (prompt, objectOptions) => askObject(session, prompt, objectOptions),
    get isResponding() {
      return session.isResponding;
    },
    release() {
      session.release();
    },
  };
}

function ask(session: NativeSession, prompt: string, { onText, signal, ...options }: GenerationOptions) {
  if (!onText) return withSignal(session, signal, () => session.respond(prompt, options));
  const subscription = session.addListener('text', onText);
  return withSignal(session, signal, () => session.streamResponse(prompt, options)).finally(() => subscription.remove());
}

async function askObject<S extends Schema>(session: NativeSession, prompt: string, { schema, signal, ...options }: ObjectOptions<S>) {
  const json = await withSignal(session, signal, () => session.respondObject(prompt, JSON.stringify(schema.spec), options));
  return JSON.parse(json) as SchemaValue<S>;
}

/** Runs a native call that `signal` can stop, and turns its errors into AppleAIError. */
async function withSignal(session: NativeSession, signal: AbortSignal | undefined, call: () => Promise<string>) {
  if (signal?.aborted) throw new AppleAIError('cancelled', 'The answer was cancelled.');
  const cancel = () => session.cancel();
  signal?.addEventListener('abort', cancel);
  try {
    return await call();
  } catch (error) {
    throw toAppleAIError(error);
  } finally {
    signal?.removeEventListener('abort', cancel);
  }
}

function requireModel() {
  const availability = getAppleAIAvailability();
  if (!availability.available || !nativeModule) {
    const reason = availability.available ? 'notLinked' : availability.reason;
    throw new AppleAIError('unavailable', `The on-device model can't be used: ${reason}.`, reason);
  }
  return nativeModule;
}
