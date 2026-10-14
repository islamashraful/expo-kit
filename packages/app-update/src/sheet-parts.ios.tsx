import { Button, Icon, Text } from '@expo/ui';
import { controlSize, frame } from '@expo/ui/swift-ui/modifiers';

import type { SheetButtonProps, SheetIconProps } from './sheet-parts';

/** Full-width large button, like system sheets on iOS. */
export function SheetButton({ label, onPress, disabled }: SheetButtonProps) {
  return (
    <Button onPress={onPress} disabled={disabled} modifiers={[controlSize('large')]}>
      <Text modifiers={[frame({ maxWidth: Infinity })]}>{label}</Text>
    </Button>
  );
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
