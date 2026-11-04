# @expo-kit/swiftdata

iCloud backup and sync for Expo apps. Your data is saved in a SwiftData store on the device and synced through the user's private iCloud; Apple decides when to upload, download and retry. You describe your data once in TypeScript, and every call is typed from that. Part of [expo-kit](https://github.com/islamashraful/expo-kit), small packages for Expo apps. Not made by Expo or Apple.

- No CloudKit schema to design, no sync code: save and read items, Apple does the rest.
- A fresh install or a new device gets the user's data back from iCloud.
- Any JSON data, typed per collection, with versions and migrations. Optional zod/valibot checks.
- Native Swift on JSI (Expo Modules API).

iOS 17+ only. Needs a development build (not Expo Go). On Android and web every call is a safe no-op.

Use either this package or [`@expo-kit/cloudkit`](../cloudkit) in an app, not both.

## Install

```sh
npx expo install @expo-kit/swiftdata
```

`app.json`:

```json
{
  "expo": {
    "ios": { "bundleIdentifier": "com.example.app" },
    "plugins": ["@expo-kit/swiftdata"]
  }
}
```

- The iCloud container is `iCloud.` + your bundle ID (`iCloud.com.example.app`). To use another one: `["@expo-kit/swiftdata", { "container": "iCloud.com.example.other" }]`.
- The plugin adds the iCloud entitlements, background pushes, and sets iOS 17 as the minimum.
- The first signed build registers the container on your Apple team (Xcode automatic signing does this).

## 1. Describe the data

```ts
import { collection, defineStore } from '@expo-kit/swiftdata';

type Note = { title: string; body: string; pinned: boolean; createdAt: number };
type Settings = { theme: 'light' | 'dark' | 'auto' };

export const store = defineStore({
  notes: collection<Note>(),
  settings: collection<Settings>(),
});
```

Items are saved as JSON: use numbers or strings for dates (`Date.now()`), not `Date` objects. Never rename a collection after release; its items are stored under its name.

## 2. Use it

```ts
await store.notes.set(id, { title: 'Hi', body: '', pinned: false, createdAt: Date.now() }); // typed
const note = await store.notes.get(id);   // Note | null
const notes = await store.notes.getAll(); // Note[], most recently changed first
await store.notes.remove(id);

const stop = store.notes.subscribe(() => reload()); // after every change, here or from another device
```

In React:

```tsx
const { data: notes, loading } = useCollection(store.notes); // re-renders after every change
```

`entries()` returns `{ key, value, updatedAt }[]` when you need the keys. `setMany()` saves many items at once.

## Changing the shape later

Give the collection a `version` and one `migrate` step per version. Items are saved with their version and migrated when read:

```ts
notes: collection<Note>({
  version: 2,
  migrate: { 2: (old) => ({ ...old, pinned: false }) }, // v1 had no pinned
}),
```

An item saved by a newer app version (another device updated first) is skipped, not changed, until this device updates too.

To also check items at runtime, pass a [Standard Schema](https://standardschema.dev) (zod, valibot, arktype) instead of a type. The type comes from the schema; items are checked when saved and when read:

```ts
notes: collection(NoteSchema, { version: 2, migrate: { 2: (old) => ({ ...old, pinned: false }) } }),
```

Items that fail a check or a migration are skipped and sent to the error reporter of `@expo-kit/core`, once per launch.

## Status

```tsx
const { supported, account, restoring, syncing, lastSyncedAt, error } = useCloudStatus();
```

- `restoring`: `true` after a fresh install or an iCloud sign-in, until the first download finished (about 5–10 s for 1,000 items). Show "Restoring from iCloud…", and don't write default data (sample notes, first-run settings) until it's `false`.
- `account: 'noAccount'`: signed out of iCloud. iOS removed the synced data from the device; it comes back after signing in. Say so, so an empty screen doesn't look like data loss.
- There is no "sync now": Apple syncs on launch, when the app comes to the front, and when another device pushes a change.

## Moving existing data in

An app that already keeps data in expo-sqlite (or AsyncStorage, files) moves it once per device:

```ts
import { importOnce } from '@expo-kit/swiftdata';

await importOnce('from-sqlite-v1', async () => {
  const exists = db.getFirstSync("SELECT name FROM sqlite_master WHERE type='table' AND name='notes'");
  if (!exists) return; // nothing to move: marked done
  const rows = db.getAllSync<NoteRow>('SELECT * FROM notes');
  await store.notes.setMany(
    rows.map((row) => ({
      key: row.id, // keep the old primary key
      value: { title: row.title, body: row.body, pinned: row.pinned === 1, createdAt: row.created_at },
      updatedAt: new Date(row.updated_at), // keep the real edit time
    })),
  );
});
// From here on, read and write only through the store.
```

- Runs once per device and ID; the "done" flag stays on the device. It first waits for the iCloud download (`restoring`, at most 30 s).
- If it throws, the error goes to the error reporter and it runs again on the next launch. So it must return without error when there's nothing to move, like the table check above.
- Keep the old keys and edit times: when two devices import the same row, they end up with one item, the one edited last.
- It can stay in the app forever: after the first run it's only a flag check.

## How sync behaves

- **Conflicts:** when the same item is changed on two devices, the change that reaches iCloud last wins. A device that was offline can overwrite a newer change from another device when it comes back online. This is Apple's behaviour and can't be changed.
- **Duplicates:** two offline devices that create the same key both keep their copy. You never see two: reads return the newest, and the older copy is removed after the next download.
- **Signing out** of iCloud removes this data from the device; signing in brings it back. While signed out, new data saves on the device and uploads to whichever account signs in next, which could be a different Apple ID.
- **When:** changes from other devices arrive when the app launches or comes to the front. While the app is open, Apple's pushes usually bring them in about a second, but Apple doesn't guarantee pushes.
- **Size:** items are read per collection, so it's meant for settings, lists and notes (up to a few thousand items per collection), not large data you search through. Large items (over about 1 MB) are stored as iCloud files automatically.

## Release checklist

- In the [CloudKit Console](https://icloud.developer.apple.com), deploy the schema to production before the App Store release, once per app. In development, the record type (`CD_StoredItem`) is created automatically on first save.
- If items can be large (over about 1 MB), save one large item in a development build first, so the field for large items (`CD_payload_ckAsset`) exists when you deploy. Otherwise large items won't sync in production. You can deploy again later; fields can be added, never removed.

## What's tested

- On real devices with TestFlight (production environment): live updates while the app is open (about 1 s), fresh install restore, signing out and back in, and items up to 2 MB.
- In development: offline edits and duplicates, `importOnce` on two devices, and the restore after a fresh install.
- Automated tests: the Swift store (newest copy, duplicates, cleanup), the status (restoring, sign-out, errors), versions, migrations, schema checks, `importOnce`, and the config plugin.

Times, devices and exact results: [DESIGN.md](DESIGN.md#test-results).

## License

MIT
