import { BottomSheet, Button, Column, Text } from '@expo/ui';
import { useState } from 'react';

import { SheetButton, SheetIcon, sheetModifiers } from './sheet-parts';

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
  /** Title when the update is required (see `forceOnMajor` in `useAppUpdate`). */
  requiredTitle?: string;
  /** Message when the update is required. */
  requiredMessage?: string;
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
  // Changing it shows the sheet again after Android lets the user swipe a required update away.
  const [sheetKey, setSheetKey] = useState(0);

  const text: Required<AppUpdateSheetLabels> = {
    title: 'Update available',
    storeMessage: `A new version of ${appName} is available on the App Store.`,
    otaMessage: `A new update for ${appName} is ready to install. The app will restart.`,
    storeButton: 'Update on App Store',
    otaButton: 'Install now',
    installing: 'Installing…',
    later: 'Later',
    installFailed: "Couldn't install the update. Please try again later.",
    requiredTitle: 'Update required',
    requiredMessage: `This version of ${appName} is no longer supported. Please update to keep using it.`,
    ...labels,
  };

  const isStore = update.type === 'store';
  const required = isStore && update.required === true;
  const message = failed
    ? text.installFailed
    : required
      ? text.requiredMessage
      : isStore
        ? text.storeMessage
        : text.otaMessage;
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

  function onDismiss() {
    if (required) {
      setSheetKey((key) => key + 1);
      return;
    }
    update.dismiss();
  }

  return (
    <BottomSheet
      key={sheetKey}
      isPresented={update.type !== null}
      onDismiss={onDismiss}
      shouldDismissOnBackPress={!required}
      shouldDismissOnClickOutside={!required}
      modifiers={sheetModifiers(required)}
      contentPadding={{ top: 32, bottom: 16, left: 24, right: 24 }}>
      <Column alignment="center" spacing={12}>
        <SheetIcon type={update.type} />
        <Text textStyle={{ fontSize: 22, fontWeight: 'bold', textAlign: 'center' }}>
          {required ? text.requiredTitle : text.title}
        </Text>
        <Text textStyle={{ textAlign: 'center' }}>{message}</Text>
        {versionLine ? <Text textStyle={{ fontWeight: '600' }}>{versionLine}</Text> : null}
        <SheetButton
          label={installing ? text.installing : isStore ? text.storeButton : text.otaButton}
          onPress={onUpdate}
          disabled={installing}
        />
        {required ? null : (
          <Button label={text.later} variant="text" onPress={update.dismiss} disabled={installing} />
        )}
      </Column>
    </BottomSheet>
  );
}
