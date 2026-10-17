# @expo-kit/cloudkit

[![npm](https://img.shields.io/npm/v/@expo-kit/cloudkit)](https://www.npmjs.com/package/@expo-kit/cloudkit)

Typed iCloud sync for Expo apps. Your app keeps its own database; this package syncs its records between the user's devices through their private iCloud, using Apple's `CKSyncEngine` in Swift. Part of [expo-kit](https://github.com/islamashraful/expo-kit), small packages for Expo apps. Not made by Expo or Apple.

- Works with any data: you describe your records once in TypeScript, and every call is typed from that.
- Native Swift on JSI (Expo Modules API), no old bridge.
- Offline-safe: changes wait on the device (in the module's own SQLite file) and upload later, also after the app was killed.
- A fresh install downloads first, so it never overwrites what's already in iCloud.
- Files (assets) keep their file type.

iOS 17+ only. Needs a development build (not Expo Go).

## Install

```sh
npx expo install @expo-kit/cloudkit
```

`app.json`:

```json
{
  "expo": {
    "ios": { "bundleIdentifier": "com.example.app" },
    "plugins": [
      ["@expo-kit/cloudkit", { "containers": ["iCloud.com.example.app"] }]
    ]
  }
}
```

- The plugin adds the iCloud entitlements, background pushes, and sets iOS 17 as the minimum.
- The first signed build registers the container on your Apple team (Xcode automatic signing does this).

## 1. Describe the data

```ts
import { defineCloudSchema, field, type CloudRecord } from '@expo-kit/cloudkit';

export const schema = defineCloudSchema({
  Venue: { name: field.string() },
  Shift: {
    date: field.date(),
    tips: field.double(),
    hours: field.int(),
    paid: field.bool(),
    note: field.string().optional(),
    tags: field.stringList(),
    venue: field.reference('Venue'),
    photo: field.asset().optional(),
  },
});

export type Shift = CloudRecord<typeof schema, 'Shift'>;
// { id: string; date: Date; tips: number; hours: number; paid: boolean; tags: string[]; venue: string;
//   note?: string | null; photo?: string | null }
```

Field kinds: `string`, `int`, `double`, `bool`, `date`, `stringList`, `intList`, `doubleList`, `reference(type)` (the linked record's `id`), `asset` (a local file path). Add `.optional()` for a field that can be empty.

Every record has a string `id`, unique within its type (ASCII). After release, only **add** types and fields; never rename or remove one.

## 2. Connect your database

```ts
import { createCloudSync } from '@expo-kit/cloudkit';

export const sync = createCloudSync({
  container: 'iCloud.com.example.app',
  schema,
  apply: {
    // Changes from other devices. Insert-or-update, and delete.
    Shift: { save: (shifts) => db.upsertShifts(shifts), delete: (ids) => db.deleteShifts(ids) },
    Venue: { save: (venues) => db.upsertVenues(venues), delete: (ids) => db.deleteVenues(ids) },
  },
  conflict: 'newest', // or 'server' | 'device'
  onAccountChange: ({ change }) => {
    // 'signOut' | 'switchAccounts' | 'cloudDataDeleted': sync state was reset.
    // Keep or clear local data; to upload it to the new account, call importAll.
  },
});

// Once, when the app's database is ready:
await sync.start();
```

`apply` handlers may throw (e.g. a foreign key isn't there yet): that group is retried after the others, and nothing is lost.

## 3. Tell it about your own writes

```ts
await db.insertShift(shift);
sync.save('Shift', shift); // typed: a wrong field or type doesn't compile

await db.deleteVenue(id);
sync.delete('Venue', id);
```

First time sync is turned on for existing data: `sync.importAll('Shift', allShifts)`.

## Status

```tsx
const { supported, account, syncing, initialSyncDone, pendingUploads, pendingChanges, lastSyncedAt, error } = useCloudSync(sync);
```

`sync.syncNow()` syncs right away (e.g. pull to refresh). It also syncs when the app comes back to the front, and when another device pushes a change.

## Conflicts

- `'newest'` (default): the later edit wins. A delete from another device wins over a local edit.
- `'server'`: iCloud's version wins.
- `'device'`: this device's version wins, also over a delete.

Fields your app doesn't know (e.g. added by a newer app version on another device) are never removed from iCloud.

## Release checklist

- In the [CloudKit Console](https://icloud.developer.apple.com), deploy the schema to production before the App Store release. In development, record types and fields are created automatically on first save.
- Reserved field names: `id`, `ekModifiedAt`, anything starting with `ek_`, and CloudKit's own (`recordName`, `createdAt`, …).

## What's tested

Tested on a real iPhone (iOS 27, Xcode 27, Expo SDK 57):

- Upload, and download on a fresh install (103 records + links between them)
- Records arriving in any order (a note before its folder)
- Files: upload and download, file type kept

Tested with automated tests only:

- Waiting changes survive an app kill (the module's SQLite store)
- Value checks and conversions for every field kind
- Typed API: wrong records don't compile

Built but not tested yet:

- Two devices editing the same record (conflict rules `newest`, `server`, `device`)
- Push: a change on one device showing up on another without opening the app
- Signing out of iCloud, switching accounts, deleting the app's iCloud data

## License

MIT
