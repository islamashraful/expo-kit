# @expo-kit/swiftdata: design

Why the package works the way it does, and what Apple's sync was measured to do. How to use it is in the
[README](README.md).

## Goal

iCloud backup and sync with almost no setup. Apple's sync (SwiftData on top of Core Data's
`NSPersistentCloudKitContainer`) decides when to upload, download and retry. The app only reads and writes
typed data in TypeScript.

Compared to `@expo-kit/cloudkit`: no CloudKit schema per app, no sync scheduling, no apply handlers. In
exchange: less control (no "sync now", conflicts are Apple's), and the package is the app's database for this
data.

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

CloudKit rules: no unique constraints, and every property has a default. Once a schema is in production,
fields can only be added, never renamed or removed.

## Write strategy: Apple's default

- **Save** updates the item's row in place (or inserts it), and sets `updatedAt = now` and `deviceId`.
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

## Decisions

- Name: `@expo-kit/swiftdata`, matching `@expo-kit/cloudkit`.
- Config plugin: reuses `@expo-kit/cloudkit`'s (iCloud entitlements, `aps-environment`, `remote-notification`
  background mode, iOS 17 minimum). The container defaults to `iCloud.<bundleIdentifier>`.
- `importOnce` keeps its "done" flag on the device only (not synced), because every device has its own old
  data to move. Imports pass the old primary keys and edit times, so two devices importing the same rows end
  up with one item each, through the duplicate cleanup.
- One sync package per app: `@expo-kit/swiftdata` or `@expo-kit/cloudkit`, not both. Running both in one
  container isn't tested or supported.
- `@expo-kit/cloudkit` is retired once this package runs in a real app: `npm deprecate` it (no unpublish) and
  remove it from the repo, playground and README. Apps already shipping it move their data with a one-time
  `importOnce` from their own database; its iCloud data doesn't carry over.

## Test results

### Spike (development environment)

iPhone 17 Pro Max (iOS 27.2) and an iPhone 18 Pro simulator, same Apple ID, Debug build, Expo SDK 58.

| Question | Result |
|---|---|
| SwiftData with CloudKit inside an Expo module pod | Works. `@Model` and `@ModelActor` macros compile in the pod. |
| Container from the bundle ID (`iCloud.<bundleId>`) | Works. |
| Sync status for JS | `NSPersistentCloudKitContainer.eventChangedNotification` is posted with SwiftData too: setup, import, export, each with start, end, success and error. |
| Upload | Starts within about 10 ms of a save. 1,000 items (about 250 bytes each) in 7.7 s. |
| Fresh install restore | 1,001 items in about 7 s (setup 2.3 s, then import 4.8 s). The first `import` ending is a usable "restore done" signal. |
| Launch and foreground | An import runs on every launch and every return to the foreground, about 1 s. |
| Live push with a simulator | Nothing arrived in 4 min; reopening the app imported it at once. Simulator push is unreliable (on real devices it works, see TestFlight). |
| `NSPersistentStoreRemoteChange` | Fires for this device's own saves too, 4 to 18 times per save or import. Not a "changed on another device" signal. |
| Two offline devices create the same key | **Two rows.** No unique constraints with CloudKit, so duplicates are real. |
| Two devices edit the same row, one offline | **The last upload wins, not the last edit.** The offline phone's older edit (14:06:06, uploaded 14:06:59) replaced the simulator's newer one (14:06:30). |
| iCloud sign-out | **Local data is deleted** (1,004 → 0 rows), even with "keep data" chosen in Settings. Events: `account → noAccount`, then setup fails with Cocoa error 134405 ("Unable to initialize without an iCloud account"). |
| Sign back in (same Apple ID) | All rows restored in about 6 s, no new duplicates. A row created while signed out was kept and uploaded. |
| "Fresh install" detection | First iPhone run reported "not fresh". Must be decided once per process, not per module instance. |

### Package (development environment)

The built package through the playground, on a real iPhone and a simulator (iOS 27, Xcode 27, Expo SDK 58).

| Question | Result |
|---|---|
| Save and upload | A note in under 1 s. |
| Fresh install restore | `restoring` until the download finished (about 6 s), then the data is there. |
| `importOnce` | Waits for the restore and runs once per device. Two devices importing the same rows end up with one copy each. |
| Change from another device | Arrives when the app comes to the front, about 2 s. |
| One device offline, same new key on both | Shows as one item on both devices. |
| One device offline, same item edited on both | Ends the same on both (last upload wins). |

### TestFlight (production environment)

iPhone 17 Pro Max and iPad Air (5th gen), same Apple ID, 2026-11-04.

| Question | Result |
|---|---|
| Live push while the app is open | **Works.** iPhone → iPad and iPad → iPhone each arrived about 1 s after the save, with the other app open and untouched. |
| Same import on two devices | Both ran `importOnce` with the same 3 old notes: 3 notes on each afterwards, not 6. |
| Fresh install restore | All notes were back before the screen's first status reading. The reinstall reset `importOnce`, so it imported again: still no duplicates. |
| Sign-out and sign-in | Signed out: `noAccount`, 0 notes, a new note saved fine. Signed back in: `restoring` for 13 s, then everything restored plus the new note, which the other device received too. |
| 2 MB item | Arrived complete on the other device about 4 s after the save, as an asset (`CD_payload_ckAsset`). |

## Notes for the playground

- The playground's production schema has an unused `CD_writtenBy` field on `CD_StoredItem`, left over from
  the spike. Production fields can't be removed; it's harmless.
- A field only appears in the development schema after something uses it. `CD_payload_ckAsset` appeared
  after saving a 2 MB item from a debug build, and was then deployed again. Do the same for a new app before
  its release, or large items won't sync in production.
- TestFlight builds: `cd apps/playground && npx eas-cli@latest build -p ios --profile testflight --auto-submit`
  (or `--local`, then upload the `.ipa` with Transporter). Run it from `apps/playground`: anywhere else EAS
  creates a stray `eas.json` and fails. EAS reports a submission as finished even when Apple rejects the
  build afterwards; check App Store Connect or Apple's email.
