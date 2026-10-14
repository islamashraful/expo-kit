import { Host, List, ListItem, Text } from '@expo/ui';
import { reportError, setErrorReporter, useOnForeground } from '@islamashraful/core';
import { useEffect, useState } from 'react';

export default function CoreScreen() {
  const [count, setCount] = useState(0);
  const [lastAt, setLastAt] = useState<Date | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  useOnForeground(() => {
    setCount((c) => c + 1);
    setLastAt(new Date());
  });

  // An app would send errors to Sentry here. The playground just shows the last one.
  useEffect(() => {
    setErrorReporter((error, context) => {
      const message = error instanceof Error ? error.message : String(error);
      setLastError(context ? `${message} ${JSON.stringify(context)}` : message);
    });
    return () => setErrorReporter(null);
  }, []);

  return (
    <Host style={{ flex: 1 }}>
      <List>
        <ListItem supportingText="Send the app to the background, then open it again.">
          <Text>useOnForeground</Text>
        </ListItem>
        <ListItem trailing={<Text>{String(count)}</Text>}>
          <Text>Times back in front</Text>
        </ListItem>
        <ListItem trailing={<Text>{lastAt ? lastAt.toLocaleTimeString() : '–'}</Text>}>
          <Text>Last time</Text>
        </ListItem>

        <ListItem supportingText="Tap below to send a test error to the reporter.">
          <Text>reportError</Text>
        </ListItem>
        <ListItem onPress={() => reportError(new Error('Test error'), { screen: 'core' })}>
          <Text>Send test error</Text>
        </ListItem>
        <ListItem supportingText={lastError ?? 'Nothing reported yet'}>
          <Text>Last reported error</Text>
        </ListItem>
      </List>
    </Host>
  );
}
