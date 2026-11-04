# @expo-kit/swiftdata: design

Status: **built** (branch `swiftdata`), from the spike on branch `spike/swiftdata` (2026-11-04).

## Goal

iCloud backup and sync for any of my apps with almost no setup. Apple's sync (SwiftData on top of Core Data's
`NSPersistentCloudKitContainer`) decides when to upload, download and retry. The app only reads and writes
typed data in TypeScript.

Compared to `@expo-kit/cloudkit`: no schema in CloudKit per app, no sync scheduling, no apply handlers. In
exchange: less control (no "sync now", conflicts are Apple's), and the package is the app's database for this
data.

## Spike results

Tested on an iPhone 17 Pro Max (iOS 27.2) and an iPhone 18 Pro simulator, same Apple ID, CloudKit development
environment, Debug build, Expo SDK 58.

| Question | Result |
|---|---|
| SwiftData with CloudKit inside an Expo module pod | Works. `@Model` and `@ModelActor` macros compile in the pod. |
| Container from the bundle ID (`iCloud.<bundleId>`) | Works. |
| Sync status for JS | `NSPersistentCloudKitContainer.eventChangedNotification` is posted with SwiftData too: setup, import, export, each with start, end, success and error. |
| Upload | Starts within about 10 ms of a save. 1,000 items (about 250 bytes each) in 7.7 s. |
| Fresh install restore | 1,001 items in about 7 s (setup 2.3 s, then import 4.8 s). The first `import` ending is a usable "restore done" signal. |
| Launch and foreground | An import runs on every launch and every return to the foreground, about 1 s. |
| Live push while the app is open | **Not seen.** Simulator → iPhone: nothing in 4 min with the app open; reopening the app imported it at once. iPhone → simulator: also nothing (simulator push is unreliable anyway). Retest with two real devices on TestFlight (production environment). |
| `NSPersistentStoreRemoteChange` | Fires for this device's own saves too, 4 to 18 times per save or import. Not a "changed on another device" signal. |
| Two offline devices create the same key | **Two rows.** No unique constraints with CloudKit, so duplicates are real. |
| Two devices edit the same row, one offline | **The last upload wins, not the last edit.** The offline phone's older edit (14:06:06, uploaded 14:06:59) replaced the simulator's newer one (14:06:30). |
| iCloud sign-out | **Local data is deleted** (1,004 → 0 rows), even with "keep data" chosen in Settings. Events: `account → noAccount`, then setup fails with Cocoa error 134405 ("Unable to initialize without an iCloud account"). |
| Sign back in (same Apple ID) | All rows restored in about 6 s, no new duplicates. A row created while signed out was kept and uploaded. |
| "Fresh install" detection | First iPhone run reported "not fresh". Must be decided once per process, not per module instance. |

## Native model

One model for every app, so the CloudKit schema never changes (record type `CD_StoredItem`):

```swift
@Model final class StoredItem {
  var collection: String = ""
  var key: String = ""
  var updatedAt: Date = .distantPast
  var deviceId: String = ""
  @Attribute(.externalStorage) var payload: Data = Data()   // JSON; large payloads become a CKAsset
}
```

CloudKit rules: no unique constraints, every property has a default. After the first App Store release,
fields can only be added, never renamed or removed. Decide them now.

## Write strategy: Apple's default

Decision: keep Apple's behaviour, for simplicity.

- **Save** updates the item's row in place (or inserts it), and sets `updatedAt = now` and `deviceId`.
- **Delete** deletes the row(s).
- **Conflicts:** when the same item is changed on two devices, **the change that reaches iCloud last wins**,
  even if it was made earlier (an offline device can overwrite a newer change). There is no setting for this.
  Accepted: it only happens when one item is edited on two devices and one of them was offline.

Duplicates still need handling, because they don't come from conflicts: two offline devices that each
**create** the same key end up with two rows.

- **Read** returns, per key, the row with the newest `updatedAt`. Ties are broken by `deviceId`, so every
  device picks the same one.
- **Cleanup** runs after each import: for every key with more than one row, delete all but the newest.
- **Delete** removes every row of the key, so no copy is left behind on this device.

Known edge case, accepted: a device that deletes an item while another device is offline with a duplicate
copy of it can see the item come back. Rare (needs a duplicate first), and nothing is lost.

Rejected alternative: a new row per save with tombstones for deletes, so the newest *edit* always wins. More
work and more rows, for a case that's rare in personal data.

## TypeScript API (sketch)

```ts
export const store = defineStore({
  notes: collection<Note>({ version: 2, migrate: { 2: (old) => ({ ...old, tags: [] }) } }),
  settings: collection(SettingsSchema), // optional Standard Schema (zod, valibot) for runtime checks
});

await store.notes.set(id, note);
await store.notes.setMany([{ key, value, updatedAt? }]); // updatedAt: for imports, see below
const note = await store.notes.get(id);        // Note | null
const notes = await store.notes.getAll();      // Note[]
await store.notes.remove(id);
const unsubscribe = store.notes.subscribe(reload); // merged: at most one call per ~250 ms

const { data: notes, loading } = useCollection(store.notes); // React hook, re-reads on change
const status = useCloudStatus();
// { supported, account, restoring, syncing, lastSyncedAt, error }
```

- Every item is saved with its collection `version`. Older items are migrated on read; items from a newer
  app version are left untouched and skipped.
- `restoring` is `true` from a fresh install or sign-in until the first import ends. Apps should wait before
  writing default data, or they create rows that compete with the restore.
- `syncing` comes from the import and export events. There is no `syncNow()`; Apple doesn't offer one.
- On Android, web and Expo Go, `supported` is `false` and every call is a safe no-op or returns empty.

## Moving existing data in

The store is its own Core Data SQLite file. It can't find an app's existing data (expo-sqlite tables,
AsyncStorage, files) by itself, because every app's tables are different. The app moves it once, and the
package makes that short and safe:

```ts
await importOnce('from-sqlite-v1', async () => {
  const rows = db.getAllSync<NoteRow>('SELECT * FROM notes');
  await store.notes.setMany(
    rows.map((r) => ({
      key: r.id,                         // the old primary key
      value: { title: r.title, body: r.body },
      updatedAt: new Date(r.updated_at), // the real edit time, if the table has one
    })),
  );
});
// From here on the app reads and writes only through the store.
```

- `importOnce(id, fn)` runs `fn` once per device and id. The "done" flag is stored on the device only (not
  synced), because every device has its own old data to move. A new id runs a new import.
- It waits until `restoring` is `false`, so the device first has what's already in iCloud.
- If `fn` throws, nothing is marked done and it runs again on the next launch. Saves before the throw stay;
  running the import twice is harmless because the keys are the same.
- `set` and `setMany` take an optional `updatedAt`. Imports pass the row's real edit time, so when two
  devices import the same row, the duplicate cleanup keeps the version that was really edited last.
- Keys must be the old primary keys. If two devices import the same row, the duplicate cleanup turns them
  into one item instead of two.
- After the import, the old tables are no longer used. The app can delete them in a later version.
- The import code can stay in the app forever: after the first run it's only a flag check, and users who
  update from a very old version still get their data moved. A reinstall clears the flag, but the old SQLite
  file is gone too, so the import finds nothing and marks itself done.
- `fn` must return without error when the old tables don't exist (deleted in a later version, or a fresh
  install), e.g. check `sqlite_master` first. Otherwise it is never marked done and runs on every launch.
- An error thrown by `fn` goes to the error reporter in `@expo-kit/core` (once per launch), so a broken import
  doesn't fail silently.

The same path covers apps that ship `@expo-kit/cloudkit` today: they import from their own database, which
has all the synced data.

## Config plugin

Reuse `@expo-kit/cloudkit`'s plugin: iCloud entitlements, `aps-environment`, `remote-notification`
background mode, iOS 17 minimum. The container defaults to `iCloud.<bundleIdentifier>`; an option overrides
it. No Key-Value Storage entitlement.

## Limits for the README

- When the same item is changed on two devices, the change that reaches iCloud last wins. A device that was
  offline can overwrite a newer change from another device.
- Signing out of iCloud removes this data from the device. It comes back on sign-in.
- While signed out, new data saves on the device and uploads to whichever account signs in next, which could
  be a different Apple ID.
- Changes from other devices arrive when the app launches or comes to the front. Live updates while the app is
  open aren't guaranteed (see open points).
- Items are JSON, read per collection: good for settings, lists and notes (up to a few thousand items), not
  for large data with search.
- Before the App Store release, deploy the schema to production in the CloudKit Console, once per app.

## Decisions

- Name: `@expo-kit/swiftdata`, matching `@expo-kit/cloudkit`.
- Conflicts: Apple's default (last upload wins). See "Write strategy".
- One sync package per app. The README says: use `@expo-kit/swiftdata` or `@expo-kit/cloudkit`, not both.
  Running both in one container isn't tested or supported.
- `@expo-kit/cloudkit` is retired once this package has passed the TestFlight tests and runs in a real app:
  `npm deprecate` it (no unpublish), remove it from the repo, playground and README. Apps already shipping it
  need a one-time import from their own database into this store (see "Moving existing data in"); its iCloud
  data doesn't carry over.

## Next steps

1. [x] Spike (branch `spike/swiftdata`, kept for reference, never merged).
2. [x] Package, tests, playground screen (PR #20). `"private": true`, so merging publishes nothing.
3. [ ] TestFlight test on **two real devices** (iPhone + iPad, same Apple ID): live push while the app is open,
   and the whole flow in the production environment.
   - [x] EAS set up (branch `testflight`): project `@rxjuedu/playground`, profile `testflight` in
     `apps/playground/eas.json` (store build, build number counts up, auto-submit). App Store Connect name
     "expo-kit playground". Apple credentials are stored on EAS.
   - [x] First build started on 2026-11-04 (build 1, `--auto-submit`):
     https://expo.dev/accounts/rxjuedu/projects/playground/builds/6b9d043d-f83d-4df3-a57a-1ba5ace948ce
   - [ ] Check that build 1 reached TestFlight (`cd apps/playground && npx eas-cli@latest submit:list -p ios`, or
     App Store Connect → expo-kit playground → TestFlight). Add yourself as an internal tester there.
   - [ ] CloudKit Console (icloud.developer.apple.com): container `iCloud.com.ashislam.expokit.playground` →
     deploy the development schema to production. Without it, the TestFlight build can't sync.
   - [ ] Install from TestFlight on both devices, then test: live push (device A changes, device B shows it
     with the app open, untouched), fresh install restore, sign-out and sign-in. The build has no Metro: use
     "Share report" for results.
   - Next builds: `cd apps/playground && npx eas-cli@latest build -p ios --profile testflight --auto-submit`
     (run it from `apps/playground`; from the repo root EAS creates a stray `eas.json` and fails).
4. [ ] Release: remove `"private": true` from `package.json`, run `bun run release` once by hand (npm login),
   then add the npm trusted publisher (CONTRIBUTING, "Releasing"). Later versions go through changesets.
5. [ ] Use it in a real app (with `importOnce` if it has data already).
6. [ ] Retire `@expo-kit/cloudkit` (see Decisions).

How to run the tests on devices: CONTRIBUTING, "Testing swiftdata on devices".

## Open points

1. Live push: test with two real devices on a TestFlight build.
2. Payload size limit per item (external storage covers big ones; test a 2 MB payload).
3. Production environment: the whole flow again on TestFlight before the first release.
