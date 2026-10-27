import { useOnForeground } from '@expo-kit/core';
import { useState } from 'react';
import { Platform } from 'react-native';

import { nativeModule, type NativeAvailability } from './native';

/**
 * Why the model can't be used:
 * - `deviceNotEligible`: the device doesn't support Apple Intelligence.
 * - `appleIntelligenceNotEnabled`: the user hasn't turned on Apple Intelligence in Settings.
 * - `modelNotReady`: the model is still downloading or setting up. Try again later.
 * - `unsupportedOS`: older than iOS 26.
 * - `unsupportedPlatform`: Android or web.
 * - `notLinked`: the native module isn't in this build (Expo Go, or not rebuilt after installing).
 * - `unknown`: a reason added by a newer iOS.
 */
export type UnavailableReason = Exclude<NativeAvailability, 'available'> | 'unsupportedPlatform' | 'notLinked';

export type AppleAIAvailability = { available: true } | { available: false; reason: UnavailableReason };

/** Whether the on-device model can be used right now, or why not. */
export function getAppleAIAvailability(): AppleAIAvailability {
  if (Platform.OS !== 'ios') return { available: false, reason: 'unsupportedPlatform' };
  if (!nativeModule) return { available: false, reason: 'notLinked' };
  const status = nativeModule.availability();
  return status === 'available' ? { available: true } : { available: false, reason: status };
}

/** `true` when the on-device model can be used right now. */
export function isAppleAIAvailable(): boolean {
  return getAppleAIAvailability().available;
}

/**
 * The availability, checked again each time the app comes back to the foreground
 * (the user may have turned on Apple Intelligence, or the model finished downloading).
 */
export function useAppleAIAvailability(): AppleAIAvailability {
  const [availability, setAvailability] = useState(getAppleAIAvailability);
  useOnForeground(() => {
    const next = getAppleAIAvailability();
    // Same result: keep the old object, so nothing re-renders.
    setAvailability((current) => (reasonOf(current) === reasonOf(next) ? current : next));
  });
  return availability;
}

function reasonOf(availability: AppleAIAvailability) {
  return availability.available ? null : availability.reason;
}
