import { Host, List, ListItem, Text } from '@expo/ui';
import {
  getReviewState,
  openReviewPage,
  requestReviewIfReady,
  resetReviewState,
  setReviewLimits,
  type ReviewState,
} from '@expo-kit/rating';
import { useCallback, useEffect, useState } from 'react';

// No waiting days, so the popup can be tested right away. Real apps use the defaults.
const TEST_LIMITS = { minEvents: 3, minDays: 0, daysBetween: 0 };
// Kite's App Store ID (the number in its App Store link).
const TEST_APP_STORE_ID = '6779573854';

// A real app calls this once at startup.
setReviewLimits(TEST_LIMITS);

export default function RatingScreen() {
  const [state, setState] = useState<ReviewState | null>(null);
  const [result, setResult] = useState('–');

  const refresh = useCallback(() => getReviewState().then(setState), []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const happyMoment = async () => {
    const asked = await requestReviewIfReady();
    setResult(asked ? 'Asked' : 'Not yet');
    await refresh();
  };

  const reset = async () => {
    await resetReviewState();
    setResult('–');
    await refresh();
  };

  const openPage = async () => {
    const opened = await openReviewPage({ appStoreId: TEST_APP_STORE_ID });
    if (!opened) setResult('App not found');
  };

  return (
    <Host style={{ flex: 1 }}>
      <List>
        <ListItem supportingText="Tap 3 times. The popup shows on the 3rd tap, then not again for this app version.">
          <Text>requestReviewIfReady</Text>
        </ListItem>
        <ListItem onPress={happyMoment}>
          <Text>Happy moment</Text>
        </ListItem>
        <ListItem trailing={<Text>{result}</Text>}>
          <Text>Last result</Text>
        </ListItem>

        <ListItem trailing={<Text>{String(state?.events ?? 0)}</Text>}>
          <Text>Happy moments</Text>
        </ListItem>
        <ListItem trailing={<Text>{formatTime(state?.firstEventAt)}</Text>}>
          <Text>First one</Text>
        </ListItem>
        <ListItem trailing={<Text>{formatTime(state?.lastAskedAt)}</Text>}>
          <Text>Last asked</Text>
        </ListItem>
        <ListItem trailing={<Text>{state?.lastAskedVersion ?? '–'}</Text>}>
          <Text>Asked for version</Text>
        </ListItem>
        <ListItem onPress={reset}>
          <Text>Reset</Text>
        </ListItem>

        <ListItem supportingText="Always opens, no limits. For a “Rate us” button in Settings.">
          <Text>openReviewPage</Text>
        </ListItem>
        <ListItem onPress={openPage}>
          <Text>Open App Store review page</Text>
        </ListItem>
      </List>
    </Host>
  );
}

function formatTime(time: number | null | undefined) {
  return time ? new Date(time).toLocaleTimeString() : '–';
}
