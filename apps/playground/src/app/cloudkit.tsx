import { Host, List, ListItem, Text } from '@expo/ui';
import { isCloudKitSupported, useCloudSync } from '@expo-kit/cloudkit';
import { File } from 'expo-file-system';
import { useEffect, useState } from 'react';

import { notes, notesDb, notesSync, onNotesChange, type Folder, type Note } from '../cloud/notes';

export default function CloudKitScreen() {
  const status = useCloudSync(notesSync);
  const [data, setData] = useState(() => ({ folders: notesDb.folders(), notes: notesDb.notes() }));

  useEffect(() => {
    const refresh = () => setData({ folders: notesDb.folders(), notes: notesDb.notes() });
    const stop = onNotesChange(refresh);
    void notesSync.start();
    return stop;
  }, []);

  const folder: Folder | undefined = data.folders[0];

  return (
    <Host style={{ flex: 1 }}>
      <List>
        <ListItem supportingText="Needs a signed development build with the iCloud container, and a device or simulator signed in to iCloud. Two devices on the same account should show the same notes.">
          <Text>iCloud sync (CKSyncEngine)</Text>
        </ListItem>
        <Row label="Native module" value={isCloudKitSupported() ? 'Linked' : 'Not linked (Expo Go)'} />
        <Row label="Account" value={status.account} />
        <Row label="Syncing" value={status.syncing ? 'Yes' : 'No'} />
        <Row label="First download done" value={status.initialSyncDone ? 'Yes' : 'No'} />
        <Row label="Waiting to upload" value={String(status.pendingUploads)} />
        <Row label="Waiting to apply" value={String(status.pendingChanges)} />
        <Row label="Last synced" value={status.lastSyncedAt?.toLocaleTimeString() ?? '–'} />
        <Row label="Error" value={status.error ?? '–'} />

        <ListItem
          supportingText={
            status.lastSyncedAt ? `Last synced ${status.lastSyncedAt.toLocaleTimeString()}` : 'Not synced yet'
          }
          onPress={() => void notesSync.syncNow()}
        >
          <Text>{status.syncing ? 'Syncing…' : status.pendingUploads > 0 ? `Sync now (${status.pendingUploads} to upload)` : 'Sync now ✓'}</Text>
        </ListItem>
        <ListItem onPress={() => notes.addFolder(`Folder ${data.folders.length + 1}`)}>
          <Text>Add folder</Text>
        </ListItem>
        <ListItem onPress={() => (folder ? notes.addNote(folder.id) : notes.addNote(notes.addFolder('Inbox').id))}>
          <Text>Add note</Text>
        </ListItem>
        <ListItem onPress={() => (folder ? notes.addMany(folder.id, 100) : undefined)}>
          <Text>{folder ? 'Add 100 notes' : 'Add 100 notes (add a note first)'}</Text>
        </ListItem>
        {data.notes[0] ? (
          <ListItem onPress={() => notes.attachFile(data.notes[0]!)}>
            <Text>Attach a file to the newest note</Text>
          </ListItem>
        ) : null}
        <ListItem supportingText="Queues every local folder and note for upload." onPress={notes.importAll}>
          <Text>Upload all local data</Text>
        </ListItem>

        <ListItem supportingText="Tap a note to pin or unpin it. Long titles are the newest.">
          <Text>{`Notes (${data.notes.length}) in ${data.folders.length} folders`}</Text>
        </ListItem>
        {data.notes.map((note: Note) => (
          <ListItem
            key={note.id}
            supportingText={[
              `${data.folders.find((f) => f.id === note.folder)?.name ?? '?'} · ${note.updatedAt.toLocaleTimeString()}`,
              note.attachment ? `📎 ${readAttachment(note.attachment)}` : null,
            ]
              .filter(Boolean)
              .join('\n')}
            trailing={<Text>{note.pinned ? '📌' : ''}</Text>}
            onPress={() => notes.togglePin(note)}
          >
            <Text>{note.title}</Text>
          </ListItem>
        ))}
        {data.notes[0] ? (
          <ListItem onPress={() => notes.remove(data.notes[0]!)}>
            <Text>Delete newest note</Text>
          </ListItem>
        ) : null}
      </List>
    </Host>
  );
}

function readAttachment(uri: string) {
  try {
    return new File(uri).textSync();
  } catch {
    return 'file missing';
  }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <ListItem trailing={<Text>{value}</Text>}>
      <Text>{label}</Text>
    </ListItem>
  );
}
