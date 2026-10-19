import { Button, Icon, Text, type BottomSheetProps } from '@expo/ui';
import { controlSize, frame, interactiveDismissDisabled } from '@expo/ui/swift-ui/modifiers';

import type { SheetButtonProps, SheetIconProps } from './sheet-parts';

/** Full-width large button, like system sheets on iOS. */
export function SheetButton({ label, onPress, disabled }: SheetButtonProps) {
  return (
    <Button onPress={onPress} disabled={disabled} modifiers={[controlSize('large')]}>
      <Text modifiers={[frame({ maxWidth: Infinity })]}>{label}</Text>
    </Button>
  );
}

/** Stops swiping the sheet away while the update is required. */
export function sheetModifiers(required: boolean): BottomSheetProps['modifiers'] {
  return required ? [interactiveDismissDisabled()] : undefined;
}

export function SheetIcon({ type }: SheetIconProps) {
  return (
    <Icon
      name={type === 'store' ? 'arrow.up.circle.fill' : 'arrow.down.circle.fill'}
      size={56}
      // SwiftUI's own blue, which adjusts to light and dark mode.
      color="blue"
    />
  );
}
