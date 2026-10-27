import { Host, List, ListItem, Text } from '@expo/ui';
import { useAppleAIAvailability } from '@expo-kit/apple-ai';

export default function AppleAIScreen() {
  const availability = useAppleAIAvailability();

  return (
    <Host style={{ flex: 1 }}>
      <List>
        <ListItem supportingText="Needs a development build on iOS 26 with Apple Intelligence on. The simulator uses the Mac's model. Checks again when the app comes back to the front.">
          <Text>On-device model (Foundation Models)</Text>
        </ListItem>
        <Row label="Available" value={availability.available ? 'Yes' : 'No'} />
        <Row label="Reason" value={availability.available ? '–' : availability.reason} />
      </List>
    </Host>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <ListItem trailing={<Text>{value}</Text>}>
      <Text>{label}</Text>
    </ListItem>
  );
}
