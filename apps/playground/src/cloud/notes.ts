import { createCloudSync, defineCloudSchema, field, type CloudRecord } from '@expo-kit/cloudkit';
import { File, Paths } from 'expo-file-system';
import { openDatabaseSync } from 'expo-sqlite';

// A tiny "real app" for trying @expo-kit/cloudkit: its own SQLite tables, synced through iCloud.

export const schema = defineCloudSchema({
  Folder: { name: field.string() },
  Note: {
    title: field.string(),
    body: field.string().optional(),
    pinned: field.bool(),
    updatedAt: field.date(),
    folder: field.reference('Folder'),
    attachment: field.asset().optional(),
  },
});

export type Folder = CloudRecord<typeof schema, 'Folder'>;
export type Note = CloudRecord<typeof schema, 'Note'>;

const db = openDatabaseSync('cloudkit-notes.db');
db.execSync(`
  CREATE TABLE IF NOT EXISTS folders (id TEXT PRIMARY KEY, name TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT, pinned INTEGER NOT NULL,
    updated_at INTEGER NOT NULL, folder TEXT NOT NULL
  );
`);
try {
  db.execSync('ALTER TABLE notes ADD COLUMN attachment TEXT');
} catch {
  // Already added.
}

type NoteRow = {
  id: string;
  title: string;
  body: string | null;
  pinned: number;
  updated_at: number;
  folder: string;
  attachment: string | null;
};

const listeners = new Set<() => void>();
export function onNotesChange(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
const changed = () => listeners.forEach((listener) => listener());

export const notesDb = {
  folders: () => db.getAllSync<Folder>('SELECT id, name FROM folders ORDER BY name'),
  notes: (): Note[] =>
    db.getAllSync<NoteRow>('SELECT * FROM notes ORDER BY updated_at DESC').map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      pinned: row.pinned === 1,
      updatedAt: new Date(row.updated_at),
      folder: row.folder,
      attachment: row.attachment,
    })),
  putFolders(folders: Folder[]) {
    db.withTransactionSync(() => {
      for (const f of folders) db.runSync('INSERT OR REPLACE INTO folders (id, name) VALUES (?, ?)', f.id, f.name);
    });
    changed();
  },
  putNotes(notes: Note[]) {
    db.withTransactionSync(() => {
      for (const n of notes) {
        db.runSync(
          'INSERT OR REPLACE INTO notes (id, title, body, pinned, updated_at, folder, attachment) VALUES (?, ?, ?, ?, ?, ?, ?)',
          n.id, n.title, n.body ?? null, n.pinned ? 1 : 0, n.updatedAt.getTime(), n.folder, n.attachment ?? null,
        );
      }
    });
    changed();
  },
  removeFolders(ids: string[]) {
    db.withTransactionSync(() => ids.forEach((id) => db.runSync('DELETE FROM folders WHERE id = ?', id)));
    changed();
  },
  removeNotes(ids: string[]) {
    db.withTransactionSync(() => ids.forEach((id) => db.runSync('DELETE FROM notes WHERE id = ?', id)));
    changed();
  },
};

export const notesSync = createCloudSync({
  container: 'iCloud.com.ashislam.expokit.playground',
  schema,
  apply: {
    Folder: {
      save: (folders) => { console.log('[cloudkit] apply Folder.save', folders.map((f) => f.id)); notesDb.putFolders(folders); },
      delete: (ids) => { console.log('[cloudkit] apply Folder.delete', ids); notesDb.removeFolders(ids); },
    },
    Note: {
      save: (list) => { console.log('[cloudkit] apply Note.save', list.map((n) => `${n.id} pinned=${n.pinned}`)); notesDb.putNotes(list); },
      delete: (ids) => { console.log('[cloudkit] apply Note.delete', ids); notesDb.removeNotes(ids); },
    },
  },
  onAccountChange: (event) => console.log('[cloudkit] account change', event),
});

// What the app does on its own writes: write locally, then queue for iCloud.
export const notes = {
  addFolder(name: string) {
    const folder: Folder = { id: newId(), name };
    notesDb.putFolders([folder]);
    notesSync.save('Folder', folder);
    return folder;
  },
  addNote(folder: string) {
    const note: Note = { id: newId(), title: `Note ${new Date().toLocaleTimeString()}`, pinned: false, updatedAt: new Date(), folder };
    notesDb.putNotes([note]);
    notesSync.save('Note', note);
  },
  togglePin(note: Note) {
    const next = { ...note, pinned: !note.pinned, updatedAt: new Date() };
    notesDb.putNotes([next]);
    notesSync.save('Note', next);
  },
  /** Many notes at once, to test batching. */
  addMany(folder: string, count: number) {
    const now = Date.now();
    const list: Note[] = Array.from({ length: count }, (_, i) => ({
      id: newId() + i,
      title: `Bulk ${i + 1}`,
      pinned: false,
      updatedAt: new Date(now + i),
      folder,
    }));
    notesDb.putNotes(list);
    notesSync.importAll('Note', list);
  },
  /** Writes a small text file and attaches it, to test files (assets). */
  attachFile(note: Note) {
    const file = new File(Paths.document, `attachment-${note.id}.txt`);
    if (file.exists) file.delete();
    file.create();
    file.writeSync(`Attached at ${new Date().toISOString()} to ${note.title}`);
    const next: Note = { ...note, attachment: file.uri, updatedAt: new Date() };
    notesDb.putNotes([next]);
    notesSync.save('Note', next);
  },
  remove(note: Note) {
    notesDb.removeNotes([note.id]);
    notesSync.delete('Note', note.id);
  },
  /** Uploads everything stored locally, e.g. the first time sync is turned on. */
  importAll() {
    notesSync.importAll('Folder', notesDb.folders());
    notesSync.importAll('Note', notesDb.notes());
  },
};

function newId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// Playground only: show sync activity in the Metro log.
notesSync.subscribe((status) => console.log('[cloudkit] status', JSON.stringify(status)));
