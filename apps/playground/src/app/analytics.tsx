import { Host, List, ListItem, Text } from '@expo/ui';
import { capture, getPostHog, identify, resetAnalytics } from '@expo-kit/analytics';
import { useState } from 'react';

export default function AnalyticsScreen() {
  const [last, setLast] = useState('–');
  const enabled = getPostHog() !== null;

  return (
    <Host style={{ flex: 1 }}>
      <List>
        <ListItem supportingText="Set EXPO_PUBLIC_POSTHOG_KEY (and EXPO_PUBLIC_POSTHOG_HOST if not EU) in apps/playground/.env.local and restart Metro. Events show up in PostHog's Activity page after a few seconds.">
          <Text>PostHog</Text>
        </ListItem>
        <ListItem trailing={<Text>{enabled ? 'On' : 'Off (no key)'}</Text>}>
          <Text>Status</Text>
        </ListItem>
        <ListItem
          onPress={() => {
            capture('playground_button_tapped', { source: 'analytics_screen' });
            setLast('capture');
          }}
        >
          <Text>Send test event</Text>
        </ListItem>
        <ListItem
          onPress={() => {
            identify('playground-user');
            setLast('identify');
          }}
        >
          <Text>Identify as "playground-user"</Text>
        </ListItem>
        <ListItem
          onPress={() => {
            resetAnalytics();
            setLast('reset');
          }}
        >
          <Text>Reset user</Text>
        </ListItem>
        <ListItem trailing={<Text>{last}</Text>}>
          <Text>Last action</Text>
        </ListItem>
      </List>
    </Host>
  );
}
