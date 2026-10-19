import { Button, Icon, Text, type BottomSheetProps } from '@expo/ui';
import { controlSize, frame, interactiveDismissDisabled, tint } from '@expo/ui/swift-ui/modifiers';
import { PlatformColor } from 'react-native';

import type { SheetButtonProps, SheetIconProps } from './sheet-parts';

/** Full-width large button, like system sheets on iOS. */
export function SheetButton({ label, onPress, disabled, tintColor }: SheetButtonProps) {
  return (
    <Button
      onPress={onPress}
      disabled={disabled}
      modifiers={tintColor ? [controlSize('large'), tint(tintColor)] : [controlSize('large')]}>
      <Text modifiers={[frame({ maxWidth: Infinity })]}>{label}</Text>
    </Button>
  );
}

/** Stops swiping the sheet away while the update is required. */
export function sheetModifiers(required: boolean): BottomSheetProps['modifiers'] {
  return required ? [interactiveDismissDisabled()] : undefined;
}

export function SheetIcon({ type, tintColor }: SheetIconProps) {
  return (
    <Icon
      name={type === 'store' ? 'arrow.up.circle.fill' : 'arrow.down.circle.fill'}
      size={56}
      // iOS's own blue, which adjusts to light and dark mode.
      color={tintColor ?? PlatformColor('systemBlue')}
    />
  );
}
