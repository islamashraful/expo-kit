import { Host, List, ListItem, Text } from '@expo/ui';
import { getDeviceInfo, sendEmail } from '@islamashraful/mail';
import { useState } from 'react';

const TEST_ADDRESS = 'hello@example.com';

export default function MailScreen() {
  const [result, setResult] = useState('–');

  const contact = async (includeDeviceInfo: boolean) => {
    const status = await sendEmail({
      to: TEST_ADDRESS,
      subject: 'About the app',
      includeDeviceInfo,
    });
    setResult(status);
  };

  return (
    <Host style={{ flex: 1 }}>
      <List>
        <ListItem supportingText="Opens an email with the address and subject filled in. The simulator has no Mail app, so it may say “unavailable”. Use a real iPhone.">
          <Text>sendEmail</Text>
        </ListItem>
        <ListItem onPress={() => contact(true)}>
          <Text>Contact us (with device info)</Text>
        </ListItem>
        <ListItem onPress={() => contact(false)}>
          <Text>Contact us (without device info)</Text>
        </ListItem>
        <ListItem trailing={<Text>{result}</Text>}>
          <Text>Last result</Text>
        </ListItem>

        <ListItem supportingText={getDeviceInfo()}>
          <Text>Device info added to the email</Text>
        </ListItem>
      </List>
    </Host>
  );
}
