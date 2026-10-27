import { beforeEach, describe, expect, mock, test } from 'bun:test';

import type { NativeAvailability } from './native';

const platform = { OS: 'ios' };
let status: NativeAvailability = 'available';

mock.module('react-native', () => ({ Platform: platform }));
mock.module('@expo-kit/core', () => ({ useOnForeground: () => {} }));
mock.module('expo', () => ({ requireOptionalNativeModule: () => ({ availability: () => status }) }));

const { getAppleAIAvailability, isAppleAIAvailable } = await import('./availability');

describe('getAppleAIAvailability', () => {
  beforeEach(() => {
    platform.OS = 'ios';
    status = 'available';
  });

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
