import CloudKit
import Foundation

/// How a conflict between this device and iCloud is settled.
enum ConflictPolicy: String {
  /// The edit with the later `ekModifiedAt` wins. A delete from iCloud wins over a local edit.
  case newest
  /// iCloud's version always wins.
  case server
  /// This device's version always wins, also over a delete from iCloud.
  case device
}

/// What the engine reports to JS.
protocol SyncCoreDelegate: AnyObject {
  func syncCore(_ core: SyncCore, didChangeStatus status: [String: Any])
  func syncCoreHasNewChanges(_ core: SyncCore)
  func syncCore(_ core: SyncCore, didChangeAccount change: [String: Any])
  func syncCore(_ core: SyncCore, didFail error: Error, context: String)
}

/// All sync logic around CKSyncEngine, without Expo types. The Expo shared object wraps it.
///
/// Flow: local changes go to the outbox, then to CKSyncEngine as pending changes.
/// CKSyncEngine asks for records in `nextRecordZoneChangeBatch`, built from the outbox.
/// Changes from iCloud go to the inbox, and the app takes them with `pendingChanges()` + `ack()`.
final class SyncCore: CKSyncEngineDelegate, @unchecked Sendable {
  private enum MetaKey {
    static let engineState = "engineState"
    static let initialFetchDone = "initialFetchDone"
    static let zoneCreated = "zoneCreated"
    static let lastSyncedAt = "lastSyncedAt"
  }

  let mapper: RecordMapper
  let store: LocalStore
  let policy: ConflictPolicy
  weak var delegate: SyncCoreDelegate?

  private let container: CKContainer
  private let zoneID: CKRecordZone.ID
  private let assetsDirectory: URL
  private var engine: CKSyncEngine?
  private let lock = NSRecursiveLock()
  /// Outbox sequence of each record being uploaded right now.
  private var inFlight: [String: Int64] = [:]
  private var fetching = false
  private var sending = false
  private var lastError: String?
  private var accountStatus = "unknown"

  init(container: CKContainer, zoneName: String, schema: SchemaModel, policy: ConflictPolicy, store: LocalStore, assetsDirectory: URL) {
    self.container = container
    self.zoneID = CKRecordZone.ID(zoneName: zoneName, ownerName: CKCurrentUserDefaultName)
    self.mapper = RecordMapper(schema: schema, zoneID: zoneID)
    self.policy = policy
    self.store = store
    self.assetsDirectory = assetsDirectory
  }

  // MARK: Lifecycle

  private var accountObserver: NSObjectProtocol?

  /// Starts CKSyncEngine from the saved state. Downloads first; local changes upload only after that.
  func start() async {
    if accountObserver == nil {
      // CKSyncEngine reports changes while it runs. This also covers signing in after a sign-out,
      // when no engine is running.
      accountObserver = NotificationCenter.default.addObserver(forName: .CKAccountChanged, object: nil, queue: nil) { [weak self] _ in
        guard let self else { return }
        Task { await self.accountDidChange() }
      }
    }
    if withLock({ engine }) != nil {
      await syncNow() // Already running.
      return
    }
    await refreshAccountStatus()
    guard accountStatus == "available" else {
      publishStatus()
      return
    }
    startEngine()
    await syncNow()
  }

  private func startEngine() {
    let saved = (try? store.meta(MetaKey.engineState)).flatMap {
      try? JSONDecoder().decode(CKSyncEngine.State.Serialization.self, from: $0)
    }
    var configuration = CKSyncEngine.Configuration(
      database: container.privateCloudDatabase,
      stateSerialization: saved,
      delegate: self
    )
    configuration.automaticallySync = true
    let engine = CKSyncEngine(configuration)
    withLock { self.engine = engine }

    if (try? store.flag(MetaKey.zoneCreated)) != true {
      engine.state.add(pendingDatabaseChanges: [.saveZone(CKRecordZone(zoneID: zoneID))])
    }
    // Local changes wait in the outbox until the first download has finished,
    // so a fresh install never overwrites what's already in iCloud.
    if (try? store.flag(MetaKey.initialFetchDone)) == true {
      registerOutbox(engine)
    }
  }

  private func accountDidChange() async {
    await refreshAccountStatus()
    if accountStatus == "available", withLock({ engine }) == nil {
      startEngine()
      await syncNow()
    }
    publishStatus()
  }

  deinit {
    if let accountObserver { NotificationCenter.default.removeObserver(accountObserver) }
  }

  func stop() async {
    await detachEngine()?.cancelOperations()
  }

  /// Downloads, then uploads. Safe to call any time, e.g. pull to refresh or app to the front.
  func syncNow() async {
    if withLock({ engine }) == nil {
      await refreshAccountStatus()
      guard accountStatus == "available" else { publishStatus(); return }
      startEngine()
    }
    guard let engine = withLock({ self.engine }) else { return }
    do {
      try await engine.fetchChanges()
      if (try? store.flag(MetaKey.initialFetchDone)) != true {
        try store.setFlag(MetaKey.initialFetchDone, true)
        registerOutbox(engine)
      }
      try await engine.sendChanges()
      try store.setMeta(MetaKey.lastSyncedAt, String(Date().timeIntervalSince1970 * 1000).data(using: .utf8))
      withLock { lastError = nil }
    } catch {
      handle(error, context: "syncNow")
    }
    publishStatus()
  }

  // MARK: Local changes

  func save(type: String, id: String, fields: [String: Any]) throws {
    let normalized = try mapper.normalize(type: type, id: id, fields: fields)
    try store.enqueue(type: type, id: id, operation: .save, fields: normalized, modifiedAt: Date())
    addPending(.saveRecord(recordID(type: type, id: id)))
  }

  func delete(type: String, id: String) throws {
    _ = try mapper.schema.type(type)
    try RecordName.validate(type: type, id: id)
    try store.enqueue(type: type, id: id, operation: .delete, fields: [:], modifiedAt: Date())
    removeAssets(type: type, id: id)
    addPending(.deleteRecord(recordID(type: type, id: id)))
  }

  private func addPending(_ change: CKSyncEngine.PendingRecordZoneChange) {
    guard let engine = withLock({ self.engine }), (try? store.flag(MetaKey.initialFetchDone)) == true else {
      publishStatus()
      return
    }
    engine.state.add(pendingRecordZoneChanges: [change])
    publishStatus()
  }

  private func registerOutbox(_ engine: CKSyncEngine) {
    guard let entries = try? store.outboxEntries(), !entries.isEmpty else { return }
    engine.state.add(pendingRecordZoneChanges: entries.map { entry in
      let id = CKRecord.ID(recordName: entry.recordName, zoneID: zoneID)
      return entry.operation == .save ? .saveRecord(id) : .deleteRecord(id)
    })
  }

  // MARK: Changes for the app

  func pendingChanges(limit: Int) throws -> [[String: Any]] {
    try store.inbox(limit: limit).map { entry in
      [
        "sequence": entry.sequence,
        "type": entry.type,
        "id": entry.id,
        "operation": entry.operation.rawValue,
        "fields": entry.fields as [String: Any],
      ]
    }
  }

  func ack(_ sequences: [Int64]) throws {
    try store.ackInbox(sequences)
    publishStatus()
  }

  // MARK: Status

  func status() -> [String: Any] {
    let counts = (try? store.counts()) ?? (outbox: 0, inbox: 0)
    let lastSyncedAt = (try? store.meta(MetaKey.lastSyncedAt)).flatMap { $0 }.flatMap { Double(String(decoding: $0, as: UTF8.self)) }
    return withLock {
      [
        "account": accountStatus,
        "syncing": fetching || sending,
        "initialSyncDone": (try? store.flag(MetaKey.initialFetchDone)) == true,
        "pendingUploads": counts.outbox,
        "pendingChanges": counts.inbox,
        "lastSyncedAt": lastSyncedAt as Any? ?? NSNull(),
        "error": lastError as Any? ?? NSNull(),
      ]
    }
  }

  private func publishStatus() {
    delegate?.syncCore(self, didChangeStatus: status())
  }

  func refreshAccountStatus() async {
    let status: String
    do {
      switch try await container.accountStatus() {
      case .available: status = "available"
      case .noAccount: status = "noAccount"
      case .restricted: status = "restricted"
      case .temporarilyUnavailable: status = "temporarilyUnavailable"
      case .couldNotDetermine: status = "couldNotDetermine"
      @unknown default: status = "couldNotDetermine"
      }
    } catch {
      status = "couldNotDetermine"
    }
    withLock { accountStatus = status }
  }

  // MARK: CKSyncEngineDelegate

  func handleEvent(_ event: CKSyncEngine.Event, syncEngine: CKSyncEngine) async {
    // An engine that was replaced (account change, iCloud data deleted) must not
    // write its old state over the fresh one.
    guard withLock({ engine }) === syncEngine else { return }
    switch event {
    case .stateUpdate(let update):
      if let data = try? JSONEncoder().encode(update.stateSerialization) {
        try? store.setMeta(MetaKey.engineState, data)
      }

    case .accountChange(let change):
      await handleAccountChange(change)

    case .fetchedDatabaseChanges(let changes):
      if changes.deletions.contains(where: { $0.zoneID == zoneID }) {
        await handleZoneDeleted()
      }

    case .fetchedRecordZoneChanges(let changes):
      handleFetched(changes)

    case .sentDatabaseChanges(let changes):
      if changes.savedZones.contains(where: { $0.zoneID == zoneID }) {
        try? store.setFlag(MetaKey.zoneCreated, true)
      }
      for failure in changes.failedZoneSaves where failure.zone.zoneID == zoneID {
        handle(failure.error, context: "saveZone")
      }

    case .sentRecordZoneChanges(let changes):
      handleSent(changes, engine: syncEngine)

    case .willFetchChanges:
      withLock { fetching = true }
      publishStatus()
    case .didFetchChanges:
      withLock { fetching = false }
      publishStatus()
    case .willSendChanges:
      withLock { sending = true }
      publishStatus()
    case .didSendChanges:
      withLock { sending = false }
      publishStatus()

    case .willFetchRecordZoneChanges, .didFetchRecordZoneChanges:
      break
    @unknown default:
      break
    }
  }

  func nextRecordZoneChangeBatch(_ context: CKSyncEngine.SendChangesContext, syncEngine: CKSyncEngine) async -> CKSyncEngine.RecordZoneChangeBatch? {
    let changes = syncEngine.state.pendingRecordZoneChanges.filter { context.options.scope.contains($0) }
    guard !changes.isEmpty else { return nil }
    return await CKSyncEngine.RecordZoneChangeBatch(pendingChanges: changes) { [weak self] recordID in
      self?.record(for: recordID, engine: syncEngine)
    }
  }

  /// Builds the record to upload from the outbox. Starts from the saved system fields,
  /// so iCloud sees it as an edit of the version it has, not a new record.
  private func record(for recordID: CKRecord.ID, engine: CKSyncEngine) -> CKRecord? {
    guard let entry = try? store.outboxEntry(recordID.recordName), entry.operation == .save else {
      engine.state.remove(pendingRecordZoneChanges: [.saveRecord(recordID)])
      return nil
    }
    let record = existingRecord(recordID) ?? CKRecord(recordType: entry.type, recordID: recordID)
    do {
      try mapper.apply(fields: entry.fields, modifiedAt: entry.modifiedAt, to: record)
    } catch {
      // The data can't be uploaded (e.g. a file is gone). Keep it out of the loop and tell the app.
      engine.state.remove(pendingRecordZoneChanges: [.saveRecord(recordID)])
      try? store.discardOutbox(recordID.recordName)
      handle(error, context: "buildRecord \(recordID.recordName)")
      return nil
    }
    withLock { inFlight[recordID.recordName] = entry.sequence }
    return record
  }

  // MARK: Sent changes

  private func handleSent(_ changes: CKSyncEngine.Event.SentRecordZoneChanges, engine: CKSyncEngine) {
    for record in changes.savedRecords {
      let name = record.recordID.recordName
      saveSystemFields(record)
      let sequence = withLock { inFlight.removeValue(forKey: name) }
      if let sequence, (try? store.removeOutbox(name, sequence: sequence)) == false,
         let newer = try? store.outboxEntry(name) {
        // Changed again while uploading: upload the newer version too.
        engine.state.add(pendingRecordZoneChanges: [newer.operation == .save ? .saveRecord(record.recordID) : .deleteRecord(record.recordID)])
      }
    }

    for recordID in changes.deletedRecordIDs {
      finishDelete(recordID)
    }

    for (recordID, error) in changes.failedRecordDeletes {
      if error.code == .unknownItem {
        finishDelete(recordID) // Already gone in iCloud.
      } else if !isRetried(error) {
        handle(error, context: "delete \(recordID.recordName)")
      }
    }

    for failure in changes.failedRecordSaves {
      let recordID = failure.record.recordID
      let name = recordID.recordName
      withLock { _ = inFlight.removeValue(forKey: name) }
      switch failure.error.code {
      case .serverRecordChanged:
        guard let serverRecord = failure.error.serverRecord else { break }
        resolveConflict(local: try? store.outboxEntry(name), server: serverRecord, engine: engine)
      case .zoneNotFound:
        // The zone is gone (e.g. deleted from another device). Create it again, then retry.
        try? store.setFlag(MetaKey.zoneCreated, false)
        try? store.setSystemFields(name, nil)
        engine.state.add(pendingDatabaseChanges: [.saveZone(CKRecordZone(zoneID: zoneID))])
        engine.state.add(pendingRecordZoneChanges: [.saveRecord(recordID)])
      case .unknownItem:
        // Deleted in iCloud since we last saw it. Upload it as a new record.
        try? store.setSystemFields(name, nil)
        engine.state.add(pendingRecordZoneChanges: [.saveRecord(recordID)])
      case .quotaExceeded:
        handle(failure.error, context: "iCloud storage is full")
      default:
        if !isRetried(failure.error) { handle(failure.error, context: "save \(name)") }
      }
    }
    publishStatus()
  }

  private func finishDelete(_ recordID: CKRecord.ID) {
    let name = recordID.recordName
    try? store.setSystemFields(name, nil)
    if let entry = try? store.outboxEntry(name), entry.operation == .delete {
      _ = try? store.removeOutbox(name, sequence: entry.sequence)
    }
  }

  /// iCloud has a different version than the one this edit started from.
  private func resolveConflict(local: LocalStore.OutboxEntry?, server: CKRecord, engine: CKSyncEngine) {
    let name = server.recordID.recordName
    saveSystemFields(server)
    guard let local, local.operation == .save else {
      if deliver(server) { delegate?.syncCoreHasNewChanges(self) }
      return
    }
    if localWins(local: local, serverModifiedAt: server[RecordMapper.modifiedAtKey] as? Date) {
      // Upload again, now based on the server's version (keeps its unknown fields).
      engine.state.add(pendingRecordZoneChanges: [.saveRecord(server.recordID)])
    } else {
      try? store.discardOutbox(name)
      engine.state.remove(pendingRecordZoneChanges: [.saveRecord(server.recordID)])
      if deliver(server) { delegate?.syncCoreHasNewChanges(self) }
    }
  }

  private func localWins(local: LocalStore.OutboxEntry, serverModifiedAt: Date?) -> Bool {
    switch policy {
    case .device: return true
    case .server: return false
    case .newest:
      guard let serverModifiedAt else { return true }
      return local.modifiedAt >= serverModifiedAt
    }
  }

  // MARK: Fetched changes

  private func handleFetched(_ changes: CKSyncEngine.Event.FetchedRecordZoneChanges) {
    var delivered = false
    for modification in changes.modifications {
      let record = modification.record
      guard record.recordID.zoneID == zoneID else { continue }
      saveSystemFields(record)
      if let local = try? store.outboxEntry(record.recordID.recordName), local.operation == .save {
        // A local edit is waiting for the same record.
        if localWins(local: local, serverModifiedAt: record[RecordMapper.modifiedAtKey] as? Date) { continue }
        try? store.discardOutbox(record.recordID.recordName)
        engine?.state.remove(pendingRecordZoneChanges: [.saveRecord(record.recordID)])
      }
      delivered = deliver(record) || delivered
    }

    for deletion in changes.deletions {
      let recordID = deletion.recordID
      guard recordID.zoneID == zoneID, let name = RecordName.parse(recordID.recordName) else { continue }
      try? store.setSystemFields(recordID.recordName, nil)
      if let local = try? store.outboxEntry(recordID.recordName), local.operation == .save, policy == .device {
        continue // This device's edit wins: it will be uploaded as a new record.
      }
      try? store.discardOutbox(recordID.recordName)
      engine?.state.remove(pendingRecordZoneChanges: [.saveRecord(recordID)])
      guard mapper.schema.types[name.type] != nil else { continue }
      removeAssets(type: name.type, id: name.id)
      do {
        try store.addInbox(type: name.type, id: name.id, operation: .delete, fields: [:])
        delivered = true
      } catch {
        handle(error, context: "inbox delete \(recordID.recordName)")
      }
    }

    if delivered { delegate?.syncCoreHasNewChanges(self) }
    publishStatus()
  }

  /// Puts a record from iCloud in the inbox for the app. Returns false for unknown types.
  @discardableResult
  private func deliver(_ record: CKRecord) -> Bool {
    do {
      guard let read = try mapper.read(record, saveAsset: saveAsset) else { return false }
      try store.addInbox(type: read.type, id: read.id, operation: .save, fields: read.fields)
      return true
    } catch {
      handle(error, context: "inbox save \(record.recordID.recordName)")
      return false
    }
  }

  /// Copies a downloaded file out of CloudKit's cache to a permanent place, keeping its extension.
  private func saveAsset(_ target: RecordMapper.AssetTarget) throws -> String? {
    guard let source = target.asset.fileURL else { return nil }
    let fileManager = FileManager.default
    let directory = assetDirectory(type: target.type, id: target.id)
    try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
    // Remove earlier copies of this field (the extension may have changed).
    for old in (try? fileManager.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)) ?? []
    where old.deletingPathExtension().lastPathComponent == target.field {
      try? fileManager.removeItem(at: old)
    }
    var destination = directory.appendingPathComponent(target.field)
    if !target.fileExtension.isEmpty { destination.appendPathExtension(target.fileExtension) }
    try fileManager.copyItem(at: source, to: destination)
    return destination.absoluteString
  }

  private func assetDirectory(type: String, id: String) -> URL {
    assetsDirectory.appendingPathComponent(type).appendingPathComponent(id)
  }

  /// Downloaded files of a deleted record aren't needed anymore.
  private func removeAssets(type: String, id: String) {
    try? FileManager.default.removeItem(at: assetDirectory(type: type, id: id))
  }

  // MARK: Account and zone

  private func handleAccountChange(_ change: CKSyncEngine.Event.AccountChange) async {
    let kind: String
    switch change.changeType {
    case .signIn: kind = "signIn"
    case .signOut: kind = "signOut"
    case .switchAccounts: kind = "switchAccounts"
    @unknown default: kind = "unknown"
    }
    var replaced: CKSyncEngine?
    if kind == "signOut" || kind == "switchAccounts" {
      // The data in iCloud belongs to another account now. Forget everything about it.
      // The app decides what to do with its local data.
      replaced = detachEngine()
      try? store.reset(keepOutbox: false)
    }
    await refreshAccountStatus()
    delegate?.syncCore(self, didChangeAccount: ["change": kind, "account": accountStatus])
    if let replaced {
      // Restart outside this callback: cancelling an engine from inside its own event can deadlock.
      Task { await self.restart(replacing: replaced) }
    }
    publishStatus()
  }

  /// Takes the engine out of use right away, so none of its later events are handled.
  private func detachEngine() -> CKSyncEngine? {
    withLock {
      let current = engine
      engine = nil
      inFlight.removeAll()
      return current
    }
  }

  /// Cancels the replaced engine (its saved state was cleared) and starts a fresh one if signed in.
  private func restart(replacing old: CKSyncEngine) async {
    await old.cancelOperations()
    await refreshAccountStatus()
    if accountStatus == "available" {
      startEngine()
      await syncNow()
    }
    publishStatus()
  }

  private func handleZoneDeleted() async {
    // The user deleted this app's iCloud data (e.g. in Settings). Start fresh; the app decides
    // whether to upload its local data again with importAll().
    guard let replaced = detachEngine() else { return }
    try? store.reset(keepOutbox: false)
    delegate?.syncCore(self, didChangeAccount: ["change": "cloudDataDeleted", "account": accountStatus])
    Task { await self.restart(replacing: replaced) }
  }

  // MARK: Helpers

  private func recordID(type: String, id: String) -> CKRecord.ID {
    CKRecord.ID(recordName: RecordName.make(type: type, id: id), zoneID: zoneID)
  }

  private func existingRecord(_ recordID: CKRecord.ID) -> CKRecord? {
    guard let data = try? store.systemFields(recordID.recordName),
          let coder = try? NSKeyedUnarchiver(forReadingFrom: data) else { return nil }
    coder.requiresSecureCoding = true
    defer { coder.finishDecoding() }
    return CKRecord(coder: coder)
  }

  private func saveSystemFields(_ record: CKRecord) {
    let coder = NSKeyedArchiver(requiringSecureCoding: true)
    record.encodeSystemFields(with: coder)
    coder.finishEncoding()
    try? store.setSystemFields(record.recordID.recordName, coder.encodedData)
  }

  /// Errors CKSyncEngine retries by itself.
  private func isRetried(_ error: CKError) -> Bool {
    [.networkFailure, .networkUnavailable, .zoneBusy, .serviceUnavailable, .notAuthenticated, .operationCancelled, .requestRateLimited]
      .contains(error.code)
  }

  private func handle(_ error: Error, context: String) {
    withLock { lastError = "\(context): \(error.localizedDescription)" }
    delegate?.syncCore(self, didFail: error, context: context)
  }

  private func withLock<T>(_ body: () -> T) -> T {
    lock.lock()
    defer { lock.unlock() }
    return body()
  }
}
