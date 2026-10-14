import { Button } from '@expo/ui';

import type { AppUpdateType } from './use-app-update';

export type SheetButtonProps = { label: string; onPress: () => void; disabled?: boolean };
export type SheetIconProps = { type: AppUpdateType | null };

export function SheetButton({ label, onPress, disabled }: SheetButtonProps) {
  return <Button label={label} onPress={onPress} disabled={disabled} />;
}

/** Android has no SF Symbols, so the sheet shows no icon there. */
export function SheetIcon(_props: SheetIconProps) {
  return null;
}
