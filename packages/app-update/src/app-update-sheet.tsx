import { BottomSheet, Button, Column, Text } from '@expo/ui';
import { useState } from 'react';

import { SheetButton, SheetIcon } from './sheet-parts';

import type { AppUpdate } from './use-app-update';

export type AppUpdateSheetLabels = {
  title: string;
  storeMessage: string;
  otaMessage: string;
  storeButton: string;
  otaButton: string;
  installing: string;
  later: string;
  installFailed: string;
};

export type AppUpdateSheetProps = {
  update: AppUpdate;
  /** Used in the default message, e.g. "A new version of Kite is available". */
  appName?: string;
  /** Override any text, e.g. for translations. */
  labels?: Partial<AppUpdateSheetLabels>;
};

/** Native bottom sheet that shows when `useAppUpdate` finds an update. */
export function AppUpdateSheet({ update, appName = 'the app', labels }: AppUpdateSheetProps) {
  const [installing, setInstalling] = useState(false);
  const [failed, setFailed] = useState(false);

  const text: AppUpdateSheetLabels = {
    title: 'Update available',
    storeMessage: `A new version of ${appName} is available on the App Store.`,
    otaMessage: `A new update for ${appName} is ready to install. The app will restart.`,
    storeButton: 'Update on App Store',
    otaButton: 'Install now',
    installing: 'Installing…',
    later: 'Later',
    installFailed: "Couldn't install the update. Please try again later.",
    ...labels,
  };

  const isStore = update.type === 'store';
  const versionLine = isStore
    ? `${update.currentVersion ?? '?'}  →  ${update.storeVersion ?? '?'}`
    : null;

  async function onUpdate() {
    if (isStore) {
      await update.openStore();
      return;
    }
    setInstalling(true);
    setFailed(false);
    try {
      await update.installOta(); // restarts the app on success
    } catch {
      setFailed(true);
      setInstalling(false);
    }
  }

  return (
    <BottomSheet
      isPresented={update.type !== null}
      onDismiss={update.dismiss}
      contentPadding={{ top: 32, bottom: 16, left: 24, right: 24 }}>
      <Column alignment="center" spacing={12}>
        <SheetIcon type={update.type} />
        <Text textStyle={{ fontSize: 22, fontWeight: 'bold', textAlign: 'center' }}>{text.title}</Text>
        <Text textStyle={{ textAlign: 'center' }}>{failed ? text.installFailed : isStore ? text.storeMessage : text.otaMessage}</Text>
        {versionLine ? <Text textStyle={{ fontWeight: '600' }}>{versionLine}</Text> : null}
        <SheetButton
          label={installing ? text.installing : isStore ? text.storeButton : text.otaButton}
          onPress={onUpdate}
          disabled={installing}
        />
        <Button label={text.later} variant="text" onPress={update.dismiss} disabled={installing} />
      </Column>
    </BottomSheet>
  );
}
