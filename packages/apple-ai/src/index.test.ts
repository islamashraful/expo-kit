import { beforeEach, describe, expect, mock, test } from 'bun:test';

import type { NativeAvailability, NativeGenerationOptions } from './native';

let status: NativeAvailability = 'available';
const calls: { prompt: string; options: NativeGenerationOptions; streamed: boolean }[] = [];
const sessions: FakeSession[] = [];
let nativeError: unknown = null;
// When set, answers wait until cancel() is called, like a long answer being stopped.
let hang = false;

class FakeSession {
  isResponding = false;
  released = false;
  listeners: ((text: string) => void)[] = [];
  private stop: (() => void) | null = null;

  constructor(readonly options: { instructions?: string }) {
    sessions.push(this);
  }
  async respond(prompt: string, options: NativeGenerationOptions) {
    calls.push({ prompt, options, streamed: false });
    return this.answer();
  }
  async streamResponse(prompt: string, options: NativeGenerationOptions) {
    calls.push({ prompt, options, streamed: true });
    for (const text of ['A', 'An', 'An answer']) this.listeners.forEach((listener) => listener(text));
    return this.answer();
  }
  cancel() {
    this.stop?.();
  }
  addListener(_event: 'text', listener: (text: string) => void) {
    this.listeners.push(listener);
    return { remove: () => (this.listeners = this.listeners.filter((l) => l !== listener)) };
  }
  release() {
    this.released = true;
  }
  private answer() {
    if (nativeError) return Promise.reject(nativeError);
    if (hang) return new Promise<string>((_, reject) => (this.stop = () => reject(nativeException('cancelled', 'Cancelled'))));
    return Promise.resolve(`answer ${calls.length}`);
  }
}

const fakeModule = { availability: () => status, ModelSession: FakeSession };

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
  sessions.length = 0;
  nativeError = null;
  hang = false;
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
  test('asks a fresh session and releases it', async () => {
    const answer = await generateText('Hi', { instructions: 'Be short.', temperature: 0.2, maxTokens: 50 });
    expect(answer).toBe('answer 1');
    expect(calls).toEqual([{ prompt: 'Hi', options: { temperature: 0.2, maxTokens: 50 }, streamed: false }]);
    expect(sessions.map((s) => [s.options, s.released])).toEqual([[{ instructions: 'Be short.' }, true]]);
  });

  test('releases the session after an error too', async () => {
    nativeError = nativeException('refusal', 'No');
    await generateText('Hi').catch(() => {});
    expect(sessions[0]!.released).toBe(true);
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

describe('streaming and cancelling', () => {
  test('onText gets the answer so far, then the listener is removed', async () => {
    const texts: string[] = [];
    const session = createSession();
    const answer = await session.respond('Hi', { onText: (text) => texts.push(text), temperature: 1 });
    expect(texts).toEqual(['A', 'An', 'An answer']);
    expect(answer).toBe('answer 1');
    expect(calls).toEqual([{ prompt: 'Hi', options: { temperature: 1 }, streamed: true }]);
    expect(sessions[0]!.listeners).toEqual([]);
  });

  test('aborting the signal cancels the native answer', async () => {
    hang = true;
    const controller = new AbortController();
    const answer = createSession().respond('Hi', { signal: controller.signal });
    controller.abort();
    await expect(answer).rejects.toMatchObject({ code: 'cancelled' });
  });

  test('an already aborted signal never reaches native', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(generateText('Hi', { signal: controller.signal })).rejects.toMatchObject({ code: 'cancelled' });
    expect(calls).toEqual([]);
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
    expect(sessions[0]!.released).toBe(true);
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
