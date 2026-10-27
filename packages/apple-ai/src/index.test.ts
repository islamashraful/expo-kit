import { beforeEach, describe, expect, mock, test } from 'bun:test';

import type { NativeAvailability, NativeGenerationOptions } from './native';

let status: NativeAvailability = 'available';
const calls: { prompt: string; options: NativeGenerationOptions }[] = [];
let nativeError: unknown = null;
let released = 0;

class FakeSession {
  constructor(readonly options: { instructions?: string }) {}
  isResponding = false;
  async respond(prompt: string, options: NativeGenerationOptions) {
    calls.push({ prompt, options });
    if (nativeError) throw nativeError;
    return `answer ${calls.length}`;
  }
  release() {
    released += 1;
  }
}

const fakeModule = {
  availability: () => status,
  async generateText(prompt: string, options: NativeGenerationOptions) {
    calls.push({ prompt, options });
    if (nativeError) throw nativeError;
    return 'answer';
  },
  ModelSession: FakeSession,
};

const platform = { OS: 'ios' };

mock.module('react-native', () => ({ Platform: platform }));
mock.module('@expo-kit/core', () => ({ useOnForeground: () => {} }));
mock.module('expo', () => ({ requireOptionalNativeModule: () => fakeModule, SharedObject: class {} }));

const { AppleAIError, createSession, generateText, getAppleAIAvailability, isAppleAIAvailable } = await import('./index');

function nativeException(code: string, message: string) {
  return Object.assign(new Error(message), { code });
}

beforeEach(() => {
  platform.OS = 'ios';
  status = 'available';
  calls.length = 0;
  nativeError = null;
  released = 0;
});

describe('getAppleAIAvailability', () => {
  test('available', () => {
    expect(getAppleAIAvailability()).toEqual({ available: true });
    expect(isAppleAIAvailable()).toBe(true);
  });

  test('passes the native reason through', () => {
    for (const reason of ['deviceNotEligible', 'appleIntelligenceNotEnabled', 'modelNotReady', 'unsupportedOS', 'unknown'] as const) {
      status = reason;
      expect(getAppleAIAvailability()).toEqual({ available: false, reason });
    }
    expect(isAppleAIAvailable()).toBe(false);
  });

  test('Android and web are unsupported without asking native', () => {
    for (const os of ['android', 'web']) {
      platform.OS = os;
      expect(getAppleAIAvailability()).toEqual({ available: false, reason: 'unsupportedPlatform' });
    }
  });
});

describe('generateText', () => {
  test('passes the prompt and options to native', async () => {
    const answer = await generateText('Hi', { instructions: 'Be short.', temperature: 0.2, maxTokens: 50 });
    expect(answer).toBe('answer');
    expect(calls).toEqual([{ prompt: 'Hi', options: { instructions: 'Be short.', temperature: 0.2, maxTokens: 50 } }]);
  });

  test('throws unavailable with the reason, without asking native', async () => {
    status = 'appleIntelligenceNotEnabled';
    const error = await generateText('Hi').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppleAIError);
    expect(error).toMatchObject({ code: 'unavailable', reason: 'appleIntelligenceNotEnabled' });
    expect(calls).toEqual([]);
  });

  test('keeps the native error code', async () => {
    nativeError = nativeException('exceededContextWindowSize', 'Too long');
    await expect(generateText('Hi')).rejects.toMatchObject({ code: 'exceededContextWindowSize', message: 'Too long' });
  });

  test('unknown native codes become unknown', async () => {
    nativeError = nativeException('ERR_SOMETHING_NEW', 'New');
    await expect(generateText('Hi')).rejects.toMatchObject({ code: 'unknown', message: 'New' });
  });
});

describe('createSession', () => {
  test('answers in order and can be released', async () => {
    const session = createSession({ instructions: 'Be short.' });
    expect(await session.respond('One')).toBe('answer 1');
    expect(await session.respond('Two', { temperature: 1 })).toBe('answer 2');
    expect(calls.map((c) => c.prompt)).toEqual(['One', 'Two']);
    expect(calls[1]!.options).toEqual({ temperature: 1 });
    expect(session.isResponding).toBe(false);
    session.release();
    expect(released).toBe(1);
  });

  test('throws unavailable when the model can not be used', () => {
    status = 'deviceNotEligible';
    expect(() => createSession()).toThrow(AppleAIError);
  });

  test('maps errors from respond', async () => {
    nativeError = nativeException('guardrailViolation', 'Blocked');
    await expect(createSession().respond('Hi')).rejects.toMatchObject({ code: 'guardrailViolation' });
  });
});
