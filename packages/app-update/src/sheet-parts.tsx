import { Button, type BottomSheetProps } from '@expo/ui';
import type { ColorValue } from 'react-native';

import type { AppUpdateType } from './use-app-update';

export type SheetButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tintColor?: ColorValue;
};
export type SheetIconProps = { type: AppUpdateType | null; tintColor?: ColorValue };

export function SheetButton({ label, onPress, disabled }: SheetButtonProps) {
  return <Button label={label} onPress={onPress} disabled={disabled} />;
}

/** On Android the sheet uses its `shouldDismissOn…` props instead. */
export function sheetModifiers(_required: boolean): BottomSheetProps['modifiers'] {
  return undefined;
}

/** Android has no SF Symbols, so the sheet shows no icon there. */
export function SheetIcon(_props: SheetIconProps) {
  return null;
}
