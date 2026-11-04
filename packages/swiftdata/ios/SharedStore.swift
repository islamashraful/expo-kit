import CloudKit
import CoreData
import Foundation
import SwiftData

/// The one store per app process. It lives as long as the process, so a JS reload (which creates the module
/// again) never opens a second sync container on the same file. Two containers on one file block each other.
final class SharedStore {
  static let shared = SharedStore()

  let containerId: String
  let deviceId: String
  /// `nil` when the store couldn't be opened (`status.error` says why).
  private(set) var store: ItemStore?

  private let lock = NSLock()
  private var tracker: StatusTracker
  private var statusListeners: [UUID: (SyncStatus) -> Void] = [:]
  private var changeListeners: [UUID: () -> Void] = [:]
  private var observers: [NSObjectProtocol] = []
  private var pendingChange: DispatchWorkItem?
  private let queue = DispatchQueue(label: "expo-kit.swiftdata")
  private let defaults = UserDefaults.standard
  private let firstImportKey: String

  private init() {
    let bundleId = Bundle.main.bundleIdentifier ?? ""
    containerId = Bundle.main.object(forInfoDictionaryKey: "ExpoKitSwiftDataContainer") as? String ?? "iCloud.\(bundleId)"
    deviceId = Self.loadDeviceId()
    firstImportKey = "ExpoKitSwiftData.firstImportDone.\(containerId)"
    tracker = StatusTracker(firstImportDone: defaults.bool(forKey: firstImportKey))

    // Observers first, so the container's own setup event is caught too.
    observe()
    do {
      let schema = Schema([StoredItem.self])
      let configuration = ModelConfiguration("ExpoKitSwiftData", schema: schema, cloudKitDatabase: .private(containerId))
      store = ItemStore(modelContainer: try ModelContainer(for: schema, configurations: [configuration]))
    } catch {
      update { $0.storeFailed("Couldn't open the store: \(error.localizedDescription)") }
    }
    Task { await refreshAccount() }
  }

  var status: SyncStatus {
    lock.withLock { tracker.status }
  }

  func addListeners(status: @escaping (SyncStatus) -> Void, change: @escaping () -> Void) -> UUID {
    let id = UUID()
    lock.withLock {
      statusListeners[id] = status
      changeListeners[id] = change
    }
    return id
  }

  func removeListeners(_ id: UUID) {
    lock.withLock {
      statusListeners[id] = nil
      changeListeners[id] = nil
    }
  }

  // MARK: - Done flags for importOnce (this device only, never synced)

  func isImportDone(_ id: String) -> Bool {
    defaults.bool(forKey: importKey(id))
  }

  func markImportDone(_ id: String) {
    defaults.set(true, forKey: importKey(id))
  }

  private func importKey(_ id: String) -> String {
    "ExpoKitSwiftData.import.\(containerId).\(id)"
  }

  // MARK: - Sync signals

  private func observe() {
    let center = NotificationCenter.default
    observers.append(center.addObserver(
      forName: NSPersistentCloudKitContainer.eventChangedNotification, object: nil, queue: nil
    ) { [weak self] notification in
      guard let event = notification.userInfo?[NSPersistentCloudKitContainer.eventNotificationUserInfoKey]
        as? NSPersistentCloudKitContainer.Event else { return }
      self?.handle(event)
    })
    // Fires for this device's own saves too, many times per sync. Merged into one change event.
    observers.append(center.addObserver(forName: .NSPersistentStoreRemoteChange, object: nil, queue: nil) { [weak self] _ in
      self?.scheduleChange()
    })
    observers.append(center.addObserver(forName: .CKAccountChanged, object: nil, queue: nil) { [weak self] _ in
      Task { await self?.refreshAccount() }
    })
  }

  private func handle(_ event: NSPersistentCloudKitContainer.Event) {
    let kind: SyncEventKind
    switch event.type {
    case .setup: kind = .setup
    case .import: kind = .import
    case .export: kind = .export
    @unknown default: kind = .other
    }
    let ended = event.endDate != nil
    var firstImport = false
    update {
      firstImport = $0.event(
        id: event.identifier, kind: kind, ended: ended, succeeded: event.succeeded,
        error: event.error?.localizedDescription, at: event.endDate ?? Date()
      )
    }
    if firstImport { defaults.set(true, forKey: firstImportKey) }
    // Two offline devices may have created the same key. Clean up after every download.
    if ended, event.succeeded, kind == .import, let store {
      Task { _ = try? await store.removeDuplicates() }
    }
  }

  private func refreshAccount() async {
    let account: String
    do {
      switch try await CKContainer(identifier: containerId).accountStatus() {
      case .available: account = "available"
      case .noAccount: account = "noAccount"
      case .restricted: account = "restricted"
      case .temporarilyUnavailable: account = "temporarilyUnavailable"
      case .couldNotDetermine: account = "couldNotDetermine"
      @unknown default: account = "unknown"
      }
    } catch {
      account = "couldNotDetermine"
    }
    update { $0.account(account) }
    // Core Data removes or restores the synced data when the account changes.
    scheduleChange()
  }

  /// Changes the tracker and tells every listener if the status changed.
  private func update(_ change: (inout StatusTracker) -> Void) {
    let (before, after, listeners) = lock.withLock { () -> (SyncStatus, SyncStatus, [(SyncStatus) -> Void]) in
      let before = tracker.status
      change(&tracker)
      return (before, tracker.status, Array(statusListeners.values))
    }
    guard before != after else { return }
    listeners.forEach { $0(after) }
  }

  private func scheduleChange() {
    queue.async { [weak self] in
      guard let self else { return }
      self.pendingChange?.cancel()
      let work = DispatchWorkItem { [weak self] in
        guard let self else { return }
        let listeners = self.lock.withLock { Array(self.changeListeners.values) }
        listeners.forEach { $0() }
      }
      self.pendingChange = work
      self.queue.asyncAfter(deadline: .now() + 0.25, execute: work)
    }
  }

  /// A random ID per install, kept across launches. Only breaks ties between duplicate copies.
  private static func loadDeviceId() -> String {
    let key = "ExpoKitSwiftData.deviceId"
    if let id = UserDefaults.standard.string(forKey: key) { return id }
    let id = UUID().uuidString
    UserDefaults.standard.set(id, forKey: key)
    return id
  }
}
