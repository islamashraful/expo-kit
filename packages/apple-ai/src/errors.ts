import type { UnavailableReason } from './availability';

/**
 * - `unavailable`: the model can't be used on this device; see `reason`.
 * - `exceededContextWindowSize`: the prompt, instructions and conversation are too long. Start a new session.
 * - `assetsUnavailable`: the model was removed or is updating. Try again later.
 * - `guardrailViolation`: Apple's safety check blocked the prompt or the answer.
 * - `unsupportedLanguageOrLocale`: the model doesn't support this language.
 * - `rateLimited`: too many requests, mostly while the app is in the background.
 * - `concurrentRequests`: the session is still answering an earlier prompt.
 * - `refusal`: the model declined to answer.
 * - `unsupportedGuide`, `decodingFailure`: structured output failed.
 * - `unknown`: anything else, including errors added by a newer iOS.
 */
export type AppleAIErrorCode =
  | 'unavailable'
  | 'exceededContextWindowSize'
  | 'assetsUnavailable'
  | 'guardrailViolation'
  | 'unsupportedGuide'
  | 'unsupportedLanguageOrLocale'
  | 'decodingFailure'
  | 'rateLimited'
  | 'concurrentRequests'
  | 'refusal'
  | 'unknown';

const CODES = new Set<string>([
  'unavailable',
  'exceededContextWindowSize',
  'assetsUnavailable',
  'guardrailViolation',
  'unsupportedGuide',
  'unsupportedLanguageOrLocale',
  'decodingFailure',
  'rateLimited',
  'concurrentRequests',
  'refusal',
]);

export class AppleAIError extends Error {
  readonly code: AppleAIErrorCode;
  /** Why the model can't be used. Only set when `code` is `unavailable`. */
  readonly reason?: UnavailableReason;

  constructor(code: AppleAIErrorCode, message: string, reason?: UnavailableReason) {
    super(message);
    this.name = 'AppleAIError';
    this.code = code;
    this.reason = reason;
  }
}

/** Turns an error from the native module into an AppleAIError with the same code. */
export function toAppleAIError(error: unknown): AppleAIError {
  if (error instanceof AppleAIError) return error;
  const code = (error as { code?: unknown } | null)?.code;
  const message = error instanceof Error ? error.message : String(error);
  return new AppleAIError(typeof code === 'string' && CODES.has(code) ? (code as AppleAIErrorCode) : 'unknown', message);
}
