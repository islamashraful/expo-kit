import { Host, List, ListItem, Text } from '@expo/ui';
import {
  cancelNotifications,
  scheduleNotification,
  useNotificationPermission,
  useNotificationTap,
} from '@expo-kit/notifications';
import { useState } from 'react';
import { Linking } from 'react-native';

const DELAY_SECONDS = 5;

export default function NotificationsScreen() {
  const { granted, status, canAskAgain, request } = useNotificationPermission();
  const [scheduledId, setScheduledId] = useState<string | null>(null);
  const [lastTap, setLastTap] = useState<string | null>(null);

  useNotificationTap((response) => {
    const { title, data } = response.notification.request.content;
    setLastTap(`${title} ${JSON.stringify(data)} at ${new Date().toLocaleTimeString()}`);
  });

  const permissionLabel = granted === null ? 'Checking…' : granted ? 'Allowed' : 'Not allowed';

  async function sendTest() {
    if (!granted && !(await request())) return;
    const id = await scheduleNotification({
      title: 'Test notification',
      body: 'Tap me to check useNotificationTap.',
      data: { source: 'playground' },
      at: new Date(Date.now() + DELAY_SECONDS * 1000),
    });
    setScheduledId(id);
  }

  async function cancelTest() {
    if (!scheduledId) return;
    await cancelNotifications([scheduledId]);
    setScheduledId(null);
  }

  return (
    <Host style={{ flex: 1 }}>
      <List>
        <ListItem
          supportingText="Turn it off in Settings, come back, and this should update by itself."
          trailing={<Text>{permissionLabel}</Text>}>
          <Text>Permission</Text>
        </ListItem>
        <ListItem trailing={<Text>{status ?? '–'}</Text>}>
          <Text>Status</Text>
        </ListItem>
        {!granted && canAskAgain ? (
          <ListItem onPress={request}>
            <Text>Ask for permission</Text>
          </ListItem>
        ) : null}
        {granted === false && !canAskAgain ? (
          <ListItem supportingText="You said no before. Turn it on in Settings." onPress={() => Linking.openSettings()}>
            <Text>Open Settings</Text>
          </ListItem>
        ) : null}

        <ListItem supportingText="Go to the home screen to see it as a banner." onPress={sendTest}>
          <Text>{`Send test notification in ${DELAY_SECONDS}s`}</Text>
        </ListItem>
        {scheduledId ? (
          <ListItem onPress={cancelTest}>
            <Text>Cancel it</Text>
          </ListItem>
        ) : null}

        <ListItem supportingText={lastTap ?? 'Nothing tapped yet'}>
          <Text>Last tapped notification</Text>
        </ListItem>
      </List>
    </Host>
  );
}
