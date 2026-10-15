import { Host, List, ListItem, Text } from '@expo/ui';
import { usePro } from '@expo-kit/purchases';

export default function ProOnlyScreen() {
  const { isPro } = usePro();
  return (
    <Host style={{ flex: 1 }}>
      <List>
        <ListItem trailing={<Text>{isPro ? 'Pro' : 'Free'}</Text>}>
          <Text>Pro-only screen</Text>
        </ListItem>
      </List>
    </Host>
  );
}
