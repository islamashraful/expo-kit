import { collection, defineStore, getCloudStatus, importOnce, subscribeCloudStatus, type CloudStatus } from '@expo-kit/swiftdata';
import * as Device from 'expo-device';

// Test setup for @expo-kit/swiftdata: a notes collection, plus a plain-text history of everything the store
// reports, printed to Metro (so it shows up on the Mac) and included in the report.

export type SimpleNote = { title: string; by: string; at: string };

export const store = defineStore({ notes: collection<SimpleNote>() });

export const deviceName = `${Device.isDevice ? 'iPhone' : 'Simulator'} ${Device.modelName ?? ''}`.trim();

const startedAt = Date.now();
const history: string[] = [];

function log(line: string) {
  const entry = `${clock(new Date())} +${((Date.now() - startedAt) / 1000).toFixed(1)}s ${line}`;
  history.push(entry);
  if (history.length > 200) history.shift();
  console.log(`[swiftdata ${deviceName}] ${entry}`);
}

function describe(status: CloudStatus) {
  if (!status.supported) return 'not supported (Expo Go, Android or web)';
  return [
    `account=${status.account}`,
    `restoring=${status.restoring}`,
    `syncing=${status.syncing}`,
    `lastDownload=${status.lastSyncedAt ? clock(status.lastSyncedAt) : '-'}`,
    `error=${status.error ?? '-'}`,
  ].join(' ');
}

log(`launch: ${describe(getCloudStatus())}`);
subscribeCloudStatus((status) => log(`status: ${describe(status)}`));
store.notes.subscribe(() => log('change'));

/** Notes from an imaginary old SQLite table, moved in once per device. Fixed keys and times, so two devices end up with the same 3. */
const OLD_TABLE = [
  { id: 'old-1', title: 'Old note 1', updated_at: Date.UTC(2026, 0, 1) },
  { id: 'old-2', title: 'Old note 2', updated_at: Date.UTC(2026, 0, 2) },
  { id: 'old-3', title: 'Old note 3', updated_at: Date.UTC(2026, 0, 3) },
];

void importOnce('playground-old-notes-v1', () =>
  store.notes.setMany(
    OLD_TABLE.map((row) => ({
      key: row.id,
      value: { title: row.title, by: 'old database', at: new Date(row.updated_at).toISOString() },
      updatedAt: new Date(row.updated_at),
    })),
  ),
).then((ran) => log(ran ? 'import: moved 3 old notes' : 'import: done before'));

export type Action = 'add' | 'add100' | 'shared' | 'dup' | 'clear' | 'report';

/** Every test step. Also reachable as playground://swiftdata?action=<name>, so it can be run without tapping. */
export async function runAction(action: Action): Promise<string> {
  const value = (title: string): SimpleNote => ({ title, by: deviceName, at: new Date().toISOString() });
  const started = Date.now();
  switch (action) {
    case 'add':
      await store.notes.set(`note-${Date.now().toString(36)}`, value('A note'));
      break;
    case 'add100':
      await store.notes.setMany(
        Array.from({ length: 100 }, (_, i) => ({ key: `bulk-${i}`, value: value(`Bulk note ${i}`) })),
      );
      break;
    case 'shared':
      // The same key on every device: for conflicts (edit on two devices, one offline).
      await store.notes.set('shared', value(`Shared, edited on ${deviceName}`));
      break;
    case 'dup':
      // A new fixed key: create it on two devices while one is offline to test duplicates.
      await store.notes.set(`dup-${new Date().toISOString().slice(0, 10)}`, value(`Duplicate test from ${deviceName}`));
      break;
    case 'clear':
      await store.notes.clear();
      break;
    case 'report':
      break;
  }
  const line = `${action}: done in ${Date.now() - started} ms`;
  if (action !== 'report') log(line);
  return line;
}

/** Everything about this device's store as plain text. */
export async function buildReport(): Promise<string> {
  const entries = await store.notes.entries();
  const report = [
    `=== swiftdata report · ${deviceName} · ${new Date().toISOString()} ===`,
    `status: ${describe(getCloudStatus())}`,
    `notes: ${entries.length}`,
    ...entries.slice(0, 15).map((e) => `  ${e.key} · "${e.value.title}" · by ${e.value.by} · edited ${e.updatedAt.toISOString()}`),
    entries.length > 15 ? `  … ${entries.length - 15} more` : null,
    'history:',
    ...history.slice(-60).map((line) => `  ${line}`),
    '=== end ===',
  ]
    .filter((line) => line !== null)
    .join('\n');
  console.log(report);
  return report;
}

function clock(date: Date) {
  return date.toTimeString().slice(0, 8);
}
