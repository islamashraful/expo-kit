import { Host, List, ListItem, Text } from '@expo/ui';
import { useCloudStatus, useCollection } from '@expo-kit/swiftdata';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Share } from 'react-native';

import { buildReport, runAction, store, type Action } from '../cloud/swiftdata-notes';

const BUTTONS: { action: Action; label: string }[] = [
  { action: 'add', label: 'Add note' },
  { action: 'add100', label: 'Add 100 notes' },
  { action: 'big', label: 'Add 2 MB note' },
  { action: 'shared', label: 'Edit shared note' },
  { action: 'dup', label: 'Create duplicate-test note' },
  { action: 'clear', label: 'Delete all notes' },
];

const handledLinks = new Set<string>();

export default function SwiftDataScreen() {
  const status = useCloudStatus();
  const { data: notes, loading } = useCollection(store.notes);
  const [last, setLast] = useState('–');
  // playground://swiftdata?action=add&id=<anything new> runs a step without tapping.
  const params = useLocalSearchParams<{ action?: Action; id?: string }>();

  const run = (action: Action) =>
    runAction(action).then(setLast, (error: unknown) => setLast(`${action} failed: ${String(error)}`));

  useEffect(() => {
    if (!params.action) return;
    // A re-render or Fast Refresh must not run the same link twice.
    const link = `${params.action}:${params.id ?? ''}`;
    if (handledLinks.has(link)) return;
    handledLinks.add(link);
    if (params.action === 'report') void buildReport().then(() => setLast('report sent to Metro'));
    else void run(params.action);
  }, [params.action, params.id]);

  const summary = !status.supported
    ? 'Not supported here (needs a dev build on iOS)'
    : `${status.account} · ${status.restoring ? 'restoring · ' : ''}${status.syncing ? 'syncing · ' : ''}last download ${status.lastSyncedAt?.toLocaleTimeString() ?? '–'}${status.error ? ` · error: ${status.error}` : ''}`;

  return (
    <Host style={{ flex: 1 }}>
      <List>
        <ListItem supportingText={summary}>
          <Text>{loading ? 'Notes: loading…' : `Notes: ${notes.length}`}</Text>
        </ListItem>
        <ListItem supportingText={last}>
          <Text>Last step</Text>
        </ListItem>
        {BUTTONS.map(({ action, label }) => (
          <ListItem key={action} onPress={() => void run(action)}>
            <Text>{label}</Text>
          </ListItem>
        ))}
        <ListItem
          supportingText="Plain text of everything on this device. Also sent to the Mac."
          onPress={() => void buildReport().then((message) => Share.share({ message }))}
        >
          <Text>Share report</Text>
        </ListItem>
      </List>
    </Host>
  );
}
