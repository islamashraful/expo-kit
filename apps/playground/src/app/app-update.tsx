import { Host, List, ListItem, Text } from '@expo/ui';
import { AppUpdateSheet, useAppUpdate, type AppUpdate } from '@expo-kit/app-update';
import { kitStorage } from '@expo-kit/core/storage';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

// A real app on the App Store, so the store check has something to find.
// Pretending version 0.0.1 is installed makes the store version count as newer.
const TEST_OPTIONS = { bundleId: 'com.ashislam.kite', currentVersion: '0.0.1' };
const DISMISSED_AT_KEY = 'app-update.storeDismissedAt';

export default function AppUpdateScreen() {
  const [checkResult, setCheckResult] = useState<string | null>(null);
  const [launchCount, setLaunchCount] = useState(0);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const [otaPreview, setOtaPreview] = useState(false);

  // `enabled: false` turns off the automatic check; the button uses checkNow().
  const manual = useAppUpdate({ enabled: false, ...TEST_OPTIONS });

  const refreshDismissedAt = useCallback(async () => {
    setDismissedAt(await kitStorage.getNumber(DISMISSED_AT_KEY));
  }, []);

  useEffect(() => {
    void refreshDismissedAt();
  }, [refreshDismissedAt]);

  async function checkNow() {
    setCheckResult('Checking…');
    const found = await manual.checkNow();
    setCheckResult(found ?? 'Up to date (or offline)');
  }

  async function clearLater() {
    await kitStorage.remove(DISMISSED_AT_KEY);
    await refreshDismissedAt();
  }

  // EAS Update can't run in Expo Go, so this fakes one to preview the sheet.
  const fakeOta: AppUpdate = {
    type: otaPreview ? 'ota' : null,
    currentVersion: '1.0.0',
    storeVersion: null,
    checkNow: async () => 'ota',
    openStore: async () => {},
    installOta: async () => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      throw new Error('Preview only');
    },
    dismiss: () => setOtaPreview(false),
  };

  // The sheets bring their own native container, so they sit next to the list's Host, not inside it.
  return (
    <View style={{ flex: 1 }}>
      <Host style={{ flex: 1 }}>
        <List>
          <ListItem supportingText="Like opening the app. Respects the 3-day wait after Later." onPress={() => setLaunchCount((n) => n + 1)}>
            <Text>Simulate app launch</Text>
          </ListItem>
          <ListItem
            supportingText={dismissedAt ? new Date(dismissedAt).toLocaleString() : 'Never'}
            onPress={clearLater}
            trailing={<Text>Clear</Text>}>
            <Text>Last "Later" tap</Text>
          </ListItem>

          <ListItem supportingText="Ignores the 3-day wait, like a Settings button." onPress={checkNow}>
            <Text>Check now</Text>
          </ListItem>
          <ListItem trailing={<Text>{checkResult ?? '–'}</Text>}>
            <Text>Result</Text>
          </ListItem>

          <ListItem supportingText="Shows the sheet as if an EAS Update was found." onPress={() => setOtaPreview(true)}>
            <Text>Preview update sheet (EAS)</Text>
          </ListItem>
        </List>
      </Host>
      {launchCount > 0 ? <LaunchCheck key={launchCount} onDismiss={refreshDismissedAt} /> : null}
      <AppUpdateSheet update={{ ...manual, dismiss: () => { manual.dismiss(); setTimeout(refreshDismissedAt, 300); } }} appName="Kite" />
      <AppUpdateSheet update={fakeOta} appName="Kite" />
    </View>
  );
}

/** Mounted fresh on every "Simulate app launch", the same way the hook runs when an app opens. */
function LaunchCheck({ onDismiss }: { onDismiss: () => void }) {
  const update = useAppUpdate(TEST_OPTIONS);
  return (
    <AppUpdateSheet
      update={{ ...update, dismiss: () => { update.dismiss(); setTimeout(onDismiss, 300); } }}
      appName="Kite"
    />
  );
}
