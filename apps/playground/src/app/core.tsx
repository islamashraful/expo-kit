import { Host, List, ListItem, Text } from '@expo/ui';
import { useOnForeground } from '@islamashraful/core';
import { useState } from 'react';

export default function CoreScreen() {
  const [count, setCount] = useState(0);
  const [lastAt, setLastAt] = useState<Date | null>(null);

  useOnForeground(() => {
    setCount((c) => c + 1);
    setLastAt(new Date());
  });

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
      </List>
    </Host>
  );
}
