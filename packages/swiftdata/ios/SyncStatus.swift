import Foundation

/// What JS sees as `useCloudStatus()`.
struct SyncStatus: Equatable {
  /// `available`, `noAccount`, `restricted`, `temporarilyUnavailable`, `couldNotDetermine` or `unknown`.
  var account = "unknown"
  /// True from a fresh install or an iCloud sign-in until the first download finished.
  var restoring: Bool
  var syncing = false
  var lastSyncedAt: Date?
  var error: String?

  var dictionary: [String: Any] {
    [
      "account": account,
      "restoring": restoring,
      "syncing": syncing,
      "lastSyncedAt": lastSyncedAt.map { $0.timeIntervalSince1970 * 1000 } as Any,
      "error": error as Any,
    ]
  }
}

enum SyncEventKind {
  case setup, `import`, export, other
}

/// Turns Apple's sync events and account changes into a `SyncStatus`. No CloudKit types, so it's testable.
struct StatusTracker {
  private(set) var status: SyncStatus
  private(set) var firstImportDone: Bool
  private var running: Set<UUID> = []

  /// `firstImportDone`: a download finished on this device before (saved across launches).
  init(firstImportDone: Bool) {
    self.firstImportDone = firstImportDone
    status = SyncStatus(restoring: !firstImportDone)
  }

  /// Returns `true` when this was the first download that ever finished on this device,
  /// so the caller can save `firstImportDone`.
  @discardableResult
  mutating func event(id: UUID, kind: SyncEventKind, ended: Bool, succeeded: Bool, error: String?, at date: Date) -> Bool {
    if ended { running.remove(id) } else { running.insert(id) }
    status.syncing = !running.isEmpty
    guard ended else { return false }

    guard succeeded else {
      // Without an account every sync fails; `account` already says why.
      if status.account == "available" || status.account == "unknown" { status.error = error ?? "iCloud sync failed" }
      return false
    }
    status.error = nil
    guard kind == .import else { return false }
    status.lastSyncedAt = date
    status.restoring = false
    if firstImportDone { return false }
    firstImportDone = true
    return true
  }

  /// The store couldn't be opened. Nothing will sync.
  mutating func storeFailed(_ message: String) {
    status.error = message
    status.restoring = false
  }

  mutating func account(_ account: String) {
    let previous = status.account
    status.account = account
    if account != "available" {
      // Nothing can download, so nothing is restoring. Core Data removes the synced data on sign-out.
      status.restoring = false
      status.syncing = false
      status.error = nil
      running.removeAll()
    } else if previous != "available" && previous != "unknown" {
      // Signed in again: the data comes back with the next download.
      status.restoring = true
    } else if previous == "unknown" && !firstImportDone {
      status.restoring = true
    }
  }
}
