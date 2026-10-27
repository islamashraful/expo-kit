export {
  getAppleAIAvailability,
  isAppleAIAvailable,
  useAppleAIAvailability,
  type AppleAIAvailability,
  type UnavailableReason,
} from './availability';
export { AppleAIError, type AppleAIErrorCode } from './errors';
export {
  createSession,
  generateObject,
  generateText,
  type AppleAISession,
  type GenerateObjectOptions,
  type GenerateTextOptions,
  type GenerationOptions,
  type ObjectOptions,
  type SessionOptions,
} from './generate';
export { schema, type Schema, type SchemaValue } from './schema';
