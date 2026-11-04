import Foundation

func statusTrackerTests() {
  let t0 = Date(timeIntervalSince1970: 1_000)

  // fresh install: restoring until the first download finished
  do {
    var tracker = StatusTracker(firstImportDone: false)
    check(tracker.status.restoring, "a fresh install starts restoring")
    tracker.account("available")
    check(tracker.status.restoring, "still restoring once the account is known")

    let setup = UUID()
    tracker.event(id: setup, kind: .setup, ended: false, succeeded: false, error: nil, at: t0)
    check(tracker.status.syncing, "syncing while an event runs")
    tracker.event(id: setup, kind: .setup, ended: true, succeeded: true, error: nil, at: t0)
    check(!tracker.status.syncing, "not syncing when no event runs")
    check(tracker.status.restoring, "setup alone doesn't end restoring")

    let download = UUID()
    tracker.event(id: download, kind: .import, ended: false, succeeded: false, error: nil, at: t0)
    let first = tracker.event(id: download, kind: .import, ended: true, succeeded: true, error: nil, at: t0)
    check(first, "the first finished download is reported once, to be saved")
    check(!tracker.status.restoring, "restoring ends with the first download")
    check(tracker.status.lastSyncedAt == t0, "lastSyncedAt is the download's end")

    let next = UUID()
    let again = tracker.event(id: next, kind: .import, ended: true, succeeded: true, error: nil, at: t0)
    check(!again, "later downloads aren't the first")
  }

  // known install: not restoring
  do {
    var tracker = StatusTracker(firstImportDone: true)
    tracker.account("available")
    check(!tracker.status.restoring, "a device that downloaded before isn't restoring")
  }

  // errors
  do {
    var tracker = StatusTracker(firstImportDone: true)
    tracker.account("available")
    let failed = UUID()
    tracker.event(id: failed, kind: .export, ended: true, succeeded: false, error: "network down", at: t0)
    check(tracker.status.error == "network down", "a failed sync sets error")
    tracker.event(id: UUID(), kind: .import, ended: true, succeeded: true, error: nil, at: t0)
    check(tracker.status.error == nil, "the next successful sync clears it")
  }

  // sign-out and sign-in
  do {
    var tracker = StatusTracker(firstImportDone: true)
    tracker.account("available")
    let running = UUID()
    tracker.event(id: running, kind: .import, ended: false, succeeded: false, error: nil, at: t0)
    tracker.account("noAccount")
    check(tracker.status.account == "noAccount", "account follows the change")
    check(!tracker.status.syncing && !tracker.status.restoring, "signed out: not syncing, not restoring")
    tracker.event(id: UUID(), kind: .setup, ended: true, succeeded: false, error: "Unable to initialize without an iCloud account", at: t0)
    check(tracker.status.error == nil, "signed out: sync failures don't show as errors")

    tracker.account("available")
    check(tracker.status.restoring, "signed in again: restoring until the next download")
    tracker.event(id: UUID(), kind: .import, ended: true, succeeded: true, error: nil, at: t0)
    check(!tracker.status.restoring, "the download ends it")
  }

  // no account on a fresh install
  do {
    var tracker = StatusTracker(firstImportDone: false)
    tracker.account("noAccount")
    check(!tracker.status.restoring, "nothing to restore without an account")
  }
}
